/**
 * GeoOps WebSocket Client
 *
 * Connects to the Phoenix backend over WebSockets to receive
 * real-time GPS position updates and geofence alert events.
 *
 * Features:
 *  - Exponential backoff reconnect (1s → 30s cap)
 *  - Connection status tracking
 *  - Viewport-based filtering (only stream workers in view)
 *  - Separate handlers for GPS updates and geofence alerts
 *  - Clean shutdown with listener cleanup
 */

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** A single GPS position report from a field worker. */
export type GPSUpdate = {
  workerId: string;
  name: string;
  latitude: number;
  longitude: number;
  timestamp: string;
};

/** A geofence event (enter / exit / breach). */
export type AlertUpdate = {
  id: string;
  workerId: string;
  workerName: string;
  geofenceId: string;
  geofenceName: string;
  eventType: "ENTERED" | "EXITED" | "BREACH";
  latitude: number;
  longitude: number;
  detectedAt: string;
};

/** Current state of the WebSocket connection. */
export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting";

/** Bounding box the client is currently viewing on the map. */
export type ViewportBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

/** Options passed when constructing the client. */
export type WebSocketClientOptions = {
  /** Full ws:// or wss:// URL to the Phoenix endpoint. */
  url: string;
  /** Called for every GPS position broadcast. */
  onGPSUpdate: (update: GPSUpdate) => void;
  /** Called for every geofence alert broadcast. */
  onAlert: (alert: AlertUpdate) => void;
  /** Called whenever the connection status changes. */
  onStatusChange: (status: ConnectionStatus) => void;
};

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** Initial delay before first reconnect attempt (ms). */
const INITIAL_RECONNECT_DELAY = 1_000;

/** Maximum delay between reconnect attempts (ms). */
const MAX_RECONNECT_DELAY = 30_000;

/** Multiplier applied to delay after each failed attempt. */
const BACKOFF_FACTOR = 2;

/* ------------------------------------------------------------------ */
/*  Message discrimination                                            */
/* ------------------------------------------------------------------ */

/**
 * Phoenix sends a JSON envelope: `{ event, payload }`.
 * We route on the `event` field.
 */
type PhoenixMessage = {
  event: string;
  payload: unknown;
};

/* ------------------------------------------------------------------ */
/*  Client implementation                                             */
/* ------------------------------------------------------------------ */

export class WebSocketClient {
  /* -- internal state -- */
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = "disconnected";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = INITIAL_RECONNECT_DELAY;
  private intentionalClose = false;
  private viewport: ViewportBounds | null = null;

  /* -- callbacks -- */
  private readonly url: string;
  private readonly onGPSUpdate: (update: GPSUpdate) => void;
  private readonly onAlert: (alert: AlertUpdate) => void;
  private readonly onStatusChange: (status: ConnectionStatus) => void;

  /* -- bound listeners (for clean removal) -- */
  private readonly handleOpen: () => void;
  private readonly handleClose: () => void;
  private readonly handleError: (e: Event) => void;
  private readonly handleMessage: (e: MessageEvent) => void;

  constructor(options: WebSocketClientOptions) {
    this.url = options.url;
    this.onGPSUpdate = options.onGPSUpdate;
    this.onAlert = options.onAlert;
    this.onStatusChange = options.onStatusChange;

    // Pre-bind event handlers so we can add & remove them by reference.
    this.handleOpen = this._onOpen.bind(this);
    this.handleClose = this._onClose.bind(this);
    this.handleError = this._onError.bind(this);
    this.handleMessage = this._onMessage.bind(this);

    // Auto-connect on creation.
    this.connect();
  }

  /* ---------------------------------------------------------------- */
  /*  Public API                                                      */
  /* ---------------------------------------------------------------- */

  /** Open (or re-open) the WebSocket connection. */
  connect(): void {
    // Don't double-connect.
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    this.intentionalClose = false;
    this.setStatus("connecting");

    // Append the auth token as a query param so Phoenix can
    // authenticate the socket on connect.
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("geoops_token")
        : null;
    
    // Use URL parser to handle query params cleanly
    try {
      // If url is relative, we'd need window.location, but we assume absolute WS_URL is passed
      const parsedUrl = new URL(this.url.replace(/^http/, "ws"));
      if (parsedUrl.pathname.endsWith("/socket")) {
        parsedUrl.pathname += "/websocket";
      }
      parsedUrl.searchParams.set("vsn", "2.0.0");
      if (token) {
        parsedUrl.searchParams.set("token", token);
      }
      
      console.log("[GeoOps WS] Attempting to connect to:", parsedUrl.toString());
      this.ws = new WebSocket(parsedUrl.toString());
    } catch (e) {
      console.error("[GeoOps WS] Invalid WebSocket URL:", this.url);
      return;
    }
    this.ws.addEventListener("open", this.handleOpen);
    this.ws.addEventListener("close", this.handleClose);
    this.ws.addEventListener("error", this.handleError);
    this.ws.addEventListener("message", this.handleMessage);
  }

  /** Gracefully close the connection. Prevents automatic reconnection. */
  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    this.clearHeartbeatTimer();

    if (this.ws) {
      this.ws.removeEventListener("open", this.handleOpen);
      this.ws.removeEventListener("close", this.handleClose);
      this.ws.removeEventListener("error", this.handleError);
      this.ws.removeEventListener("message", this.handleMessage);
      this.ws.close();
      this.ws = null;
    }

    this.setStatus("disconnected");
  }

  /** Returns `true` when the socket is open and ready. */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Tell the server which map viewport the client is looking at so it
   * only streams GPS updates for workers inside that bounding box.
   */
  setViewport(bounds: ViewportBounds): void {
    this.viewport = bounds;
    this.sendPhoenixEvent("set_viewport", bounds);
  }

  /* ---------------------------------------------------------------- */
  /*  Internal helpers                                                */
  /* ---------------------------------------------------------------- */

  /** Safely send a Phoenix Channel v2 message to the server. */
  private sendPhoenixEvent(event: string, payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Phoenix v2 array format: [join_ref, msg_ref, topic, event, payload]
      this.ws.send(JSON.stringify([null, null, "gps:lobby", event, payload]));
    }
  }
  
  private startHeartbeat(): void {
    this.clearHeartbeatTimer();
    // Phoenix requires a heartbeat every ~30 seconds to keep the connection alive
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify([null, "heartbeat", "phoenix", "heartbeat", {}]));
      }
    }, 30000);
  }

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Update connection status and notify the consumer. */
  private setStatus(next: ConnectionStatus): void {
    if (next === this.status) return;
    this.status = next;
    this.onStatusChange(next);
  }

  /* ---------------------------------------------------------------- */
  /*  WebSocket event handlers                                        */
  /* ---------------------------------------------------------------- */

  private _onOpen(): void {
    this.setStatus("connected");
    this.reconnectDelay = INITIAL_RECONNECT_DELAY;
    
    this.startHeartbeat();

    // Join the gps:lobby channel!
    // Format: [join_ref, msg_ref, topic, event, payload]
    if (this.ws) {
      this.ws.send(JSON.stringify(["1", "1", "gps:lobby", "phx_join", {}]));
    }

    // Re-send viewport bounds so the server resumes filtering from
    // where the user left off (important after reconnect).
    if (this.viewport) {
      this.sendPhoenixEvent("set_viewport", this.viewport);
    }
  }

  private _onClose(): void {
    this.clearHeartbeatTimer();
    if (this.intentionalClose) {
      this.setStatus("disconnected");
      return;
    }

    // Unexpected close → schedule reconnect.
    this.setStatus("reconnecting");
    this.scheduleReconnect();
  }

  private _onError(_e: Event): void {
    // The browser fires `close` right after `error`, so we don't
    // change status here — `_onClose` handles transition.
    console.error("[GeoOps WS] Connection error");
  }

  private _onMessage(e: MessageEvent): void {
    try {
      // Parse Phoenix v2 array format: [join_ref, msg_ref, topic, event, payload]
      const msg = JSON.parse(e.data as string);
      if (!Array.isArray(msg) || msg.length !== 5) return;
      
      const [_join_ref, _msg_ref, topic, event, payload] = msg;
      
      if (topic !== "gps:lobby") return;

      switch (event) {
        case "gps_update":
          this.onGPSUpdate(payload as GPSUpdate);
          break;

        case "alert":
          this.onAlert(payload as AlertUpdate);
          break;

        default:
          break;
      }
    } catch {
      console.warn("[GeoOps WS] Non-JSON message ignored:", e.data);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Reconnection with exponential backoff                           */
  /* ---------------------------------------------------------------- */

  /** Schedule a reconnect attempt with exponential backoff. */
  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    console.info(
      `[GeoOps WS] Reconnecting in ${this.reconnectDelay / 1_000}s …`
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect();
      // Increase delay for next failure, capped at MAX.
      this.reconnectDelay = Math.min(
        this.reconnectDelay * BACKOFF_FACTOR,
        MAX_RECONNECT_DELAY
      );
    }, this.reconnectDelay);
  }

  /** Cancel any pending reconnect timer. */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
