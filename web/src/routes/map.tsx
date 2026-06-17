import { onMount, onCleanup, createSignal } from 'solid-js';
import { AuthGuard, showToast } from '~/components';
import { WebSocketClient, type GPSUpdate, type AlertUpdate, type ConnectionStatus } from '~/lib/websocket';
import { api } from '~/lib/api-client';

export default function LiveMap() {
  let mapContainer: HTMLDivElement | undefined;
  let mapInstance: any;
  const [workerMarkers, setWorkerMarkers] = createSignal<Map<string, any>>(new Map());
  const [geofencePolygons, setGeofencePolygons] = createSignal<Map<string, any>>(new Map());
  const [wsClient, setWsClient] = createSignal<WebSocketClient | null>(null);
  const [connectionStatus, setConnectionStatus] = createSignal<ConnectionStatus>('disconnected');
  const [activeWorkerCount, setActiveWorkerCount] = createSignal(0);

  onMount(async () => {
    // Dynamically import Leaflet so it doesn't crash on SSR
    const L = (await import('leaflet')).default || await import('leaflet');

    if (!mapContainer) return;

    // Initialize Map
    mapInstance = L.map(mapContainer, {
      zoomControl: false // Move zoom control to bottom right to avoid overlapping our panel
    }).setView([37.7749, -122.4194], 13);

    L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);

    // Dark Mode Tile Layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>'
    }).addTo(mapInstance);

    // Fetch and draw geofences
    try {
      const res = await api.get<{ data: any[] }>('/api/geofences');
      if (res && res.data) {
        const bounds: any[] = [];
        res.data.forEach(gf => {
          if (!gf.polygon_coords || !Array.isArray(gf.polygon_coords)) return;
          const latLngs = gf.polygon_coords.map((c: [number, number]) => [c[1], c[0]]);
          bounds.push(...latLngs);

          const polygon = L.polygon(latLngs, {
            color: gf.color || '#3b82f6',
            fillColor: gf.color || '#3b82f6',
            fillOpacity: 0.2,
            weight: 2
          }).addTo(mapInstance);

          polygon.bindTooltip(gf.name || 'Geofence');

          setGeofencePolygons(prev => {
            const next = new Map(prev);
            next.set(gf.id, polygon);
            return next;
          });
        });

        // Fit map to geofences if there are any
        if (bounds.length > 0) {
          mapInstance.fitBounds(L.latLngBounds(bounds));
        }
      }
    } catch (err) {
      console.error("Failed to load geofences", err);
      showToast("Failed to load geofences", "error");
    }

    // Initialize WebSocket
    const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";
    const WS_URL = API_BASE.replace(/^http/, "ws") + "/socket/websocket?vsn=2.0.0";

    const client = new WebSocketClient({
      url: WS_URL,
      onGPSUpdate: (update: GPSUpdate) => {
        const latlng: [number, number] = [update.latitude, update.longitude];
        
        let currentMarkers = workerMarkers();
        let marker = currentMarkers.get(update.workerId);

        if (marker) {
          marker.setLatLng(latlng);
        } else {
          const iconHTML = `
            <div style="
              width: 24px; 
              height: 24px; 
              background: rgba(59, 130, 246, 0.4); 
              border: 2px solid rgba(255, 255, 255, 0.8); 
              border-radius: 50%; 
              backdrop-filter: blur(4px); 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              box-shadow: 0 0 10px rgba(59, 130, 246, 0.6);
            ">
              <div style="width: 8px; height: 8px; background: white; border-radius: 50%;"></div>
            </div>
          `;

          const icon = L.divIcon({
             className: 'custom-worker-marker',
             html: iconHTML,
             iconSize: [24, 24],
             iconAnchor: [12, 12]
          });

          marker = L.marker(latlng, { icon }).addTo(mapInstance);
          marker.bindTooltip(update.name || update.workerId);

          setWorkerMarkers(prev => {
            const next = new Map(prev);
            next.set(update.workerId, marker);
            setActiveWorkerCount(next.size);
            return next;
          });
        }
      },
      onAlert: (alert: AlertUpdate) => {
        // Show toast
        const typeStr = alert.eventType.toLowerCase();
        let toastVariant: any = "warning";
        if (alert.eventType === "BREACH") toastVariant = "error";
        else if (alert.eventType === "ENTERED") toastVariant = "success";
        else if (alert.eventType === "EXITED") toastVariant = "info";

        showToast(`${alert.workerName} ${typeStr} ${alert.geofenceName}`, toastVariant);

        // Optional: Pulse marker
        const m = workerMarkers().get(alert.workerId);
        if (m && m.getElement()) {
          const el = m.getElement();
          el.style.transition = "transform 0.2s";
          el.style.transform += " scale(1.5)";
          setTimeout(() => {
            if (el) el.style.transform = el.style.transform.replace(" scale(1.5)", "");
          }, 1000);
        }
      },
      onStatusChange: (status: ConnectionStatus) => {
        setConnectionStatus(status);
        
        // When connected, send the current viewport bounds
        if (status === 'connected' && mapInstance) {
          updateViewport();
        }
      }
    });

    setWsClient(client);

    const updateViewport = () => {
      if (mapInstance && client.isConnected()) {
        const newBounds = mapInstance.getBounds();
        client.setViewport({
          north: newBounds.getNorth(),
          south: newBounds.getSouth(),
          east: newBounds.getEast(),
          west: newBounds.getWest()
        });
      }
    };

    // Update viewport on move end
    mapInstance.on('moveend', updateViewport);
  });

  onCleanup(() => {
    const ws = wsClient();
    if (ws) {
      ws.disconnect();
    }
    if (mapInstance) {
      mapInstance.remove();
    }
  });

  return (
    <AuthGuard>
      <div style={{ position: "relative", width: "100%", height: "calc(100vh - 56px)" }}>
        {/* Floating Panel */}
        <div style={{
          position: "absolute",
          top: "16px",
          left: "16px",
          "z-index": 1000,
          background: "rgba(26, 26, 46, 0.75)",
          "backdrop-filter": "blur(12px)",
          border: "1px solid rgba(42, 42, 68, 0.8)",
          "border-radius": "8px",
          padding: "16px",
          color: "white",
          "box-shadow": "0 4px 6px rgba(0,0,0,0.3)",
          "min-width": "200px"
        }}>
          <h2 style={{ "font-size": "1.25rem", margin: "0 0 12px 0", "font-weight": "600", color: "#e4e4ed" }}>Live Map</h2>
          
          <div style={{ display: "flex", "align-items": "center", gap: "8px", "margin-bottom": "8px" }}>
            <div style={{
              width: "10px",
              height: "10px",
              "border-radius": "50%",
              background: connectionStatus() === 'connected' ? '#22c55e' : 
                          connectionStatus() === 'connecting' || connectionStatus() === 'reconnecting' ? '#eab308' : '#ef4444',
              "box-shadow": connectionStatus() === 'connected' ? '0 0 8px rgba(34, 197, 94, 0.5)' : 'none'
            }}></div>
            <span style={{ "font-size": "0.875rem", color: "#e4e4ed", "text-transform": "capitalize" }}>
              {connectionStatus()}
            </span>
          </div>
          
          <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
            <span style={{ "font-size": "0.875rem", color: "#9494b8" }}>
              Active Workers:
            </span>
            <span style={{ "font-size": "1rem", "font-weight": "600", color: "#e4e4ed" }}>
              {activeWorkerCount()}
            </span>
          </div>
        </div>

        <div 
          ref={mapContainer} 
          class="map-container" 
          style={{ 
            height: "100%", 
            "border-radius": "0",
            "z-index": 1
          }}
        ></div>
      </div>
    </AuthGuard>
  );
}
