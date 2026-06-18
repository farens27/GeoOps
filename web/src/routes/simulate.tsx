import { createSignal, onMount, onCleanup, createEffect, For, Show } from 'solid-js';
import { AuthGuard, showToast } from '~/components';
import { api } from '~/lib/api-client';
import { WebSocketClient, type AlertUpdate, type ConnectionStatus } from '~/lib/websocket';
import { haversineDistance, pointInGeoJSONPolygon } from '~/lib/geo-utils';

interface LogEntry {
  id: string;
  time: string;
  type: 'api' | 'entered' | 'exited' | 'breach' | 'system' | 'error';
  text: string;
}

export default function Simulate() {
  const [workers, setWorkers] = createSignal<any[]>([]);
  const [geofences, setGeofences] = createSignal<any[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [logs, setLogs] = createSignal<LogEntry[]>([]);
  
  // Evacuation Drill state
  const [drillActive, setDrillActive] = createSignal(false);
  const [drillStatus, setDrillStatus] = createSignal<'idle' | 'unaccounted' | 'safe'>('idle');
  const [distanceToSafety, setDistanceToSafety] = createSignal<number | null>(null);
  
  const [selectedWorkerId, setSelectedWorkerId] = createSignal('');
  const [selectedGeofenceId, setSelectedGeofenceId] = createSignal('');
  
  const [simulating, setSimulating] = createSignal(false);
  const [controlMode, setControlMode] = createSignal<'auto' | 'manual'>('auto');
  const [followWorker, setFollowWorker] = createSignal(true);
  const [speed, setSpeed] = createSignal(1);
  const [manualCoords, setManualCoords] = createSignal<{ lat: number, lng: number } | null>(null);
  
  // Reactive mapInstance signal
  const [mapInstance, setMapInstance] = createSignal<any>(null);
  const [websocketStatus, setWebsocketStatus] = createSignal<ConnectionStatus>('disconnected');
  
  // Joystick UI State
  const [joystickPosition, setJoystickPosition] = createSignal({ x: 0, y: 0 });
  
  let mapRef: HTMLDivElement | undefined;
  let joystickRef: HTMLDivElement | undefined;
  
  let L: any;
  let markerLayer: any;
  let leafletGeofenceLayers = new Map<string, any>();
  let simInterval: number | null = null;
  let websocketClient: WebSocketClient | null = null;
  
  // Movement keys state
  const keysPressed: Record<string, boolean> = {};
  
  // Joystick movement vector
  let joystickVector = { x: 0, y: 0 };
  let joystickActive = false;
  let joystickCenter = { x: 0, y: 0 };

  const addLog = (type: LogEntry['type'], text: string) => {
    const time = new Date().toLocaleTimeString();
    const id = Math.random().toString(36).substring(2, 9);
    setLogs(prev => [{ id, time, type, text }, ...prev].slice(0, 100));
  };

  const getPoints = (gf: any): {lat: number, lng: number}[] => {
    if (!gf || !gf.polygon_coords) return [];
    return gf.polygon_coords.map((p: any) => {
      if (Array.isArray(p)) return { lat: p[1], lng: p[0] };
      return { lat: p.lat, lng: p.lng };
    });
  };

  // Safe callback ref to initialize map when element is attached to DOM
  const mapRefCallback = (el: HTMLDivElement) => {
    mapRef = el;
    if (el) {
      initializeMap(el);
    }
  };

  const initializeMap = async (container: HTMLDivElement) => {
    if (mapInstance()) return; // Avoid double initialization
    
    try {
      // Load Leaflet dynamically to avoid SSR issues
      const leaflet = await import('leaflet');
      L = leaflet.default || leaflet;
      
      // Initialize map with a dark UI theme
      const map = L.map(container, { zoomControl: false }).setView([0, 0], 2);
      
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>'
      }).addTo(map);

      L.control.zoom({ position: 'bottomright' }).addTo(map);
      
      // Store the initialized map instance in our reactive signal
      setMapInstance(map);
      
      // Draw geofences immediately if they were fetched first
      const currentGeofences = geofences();
      if (currentGeofences.length > 0) {
        drawGeofences(map, currentGeofences);
      }
    } catch (err: any) {
      console.error('Failed to initialize map', err);
      addLog('error', `Map initialization failed: ${err.message || err}`);
    }
  };

  const drawGeofences = (map: any, list: any[]) => {
    if (!L || !map) return;

    // Clear previous polygon layers
    leafletGeofenceLayers.forEach(layer => map.removeLayer(layer));
    leafletGeofenceLayers.clear();
    
    const bounds: any[] = [];

    const typePriority: Record<string, number> = {
      'WORK_ZONE': 1,
      'CUSTOM': 2,
      'SAFETY': 3,
      'RESTRICTED': 4
    };
    
    const sortedList = [...list].sort((a, b) => {
      const pA = typePriority[a.zone_type] || 0;
      const pB = typePriority[b.zone_type] || 0;
      return pA - pB;
    });

    sortedList.forEach(gf => {
      if (!gf.polygon_coords || !Array.isArray(gf.polygon_coords)) return;
      const points = getPoints(gf);
      if (points.length === 0) return;

      const latlngs = points.map(p => [p.lat, p.lng]);
      latlngs.forEach(coord => bounds.push(coord));

      const isSelected = gf.id === selectedGeofenceId();
      const isRestricted = gf.zone_type === 'RESTRICTED';
      
      const polygon = L.polygon(latlngs, {
        color: isSelected ? '#a855f7' : (gf.color || (isRestricted ? '#ef4444' : '#3b82f6')),
        fillColor: gf.color || (isRestricted ? '#ef4444' : '#3b82f6'),
        fillOpacity: isSelected ? 0.35 : 0.15,
        weight: isSelected ? 4 : 2,
        dashArray: isRestricted ? '5, 8' : undefined
      }).addTo(map);

      polygon.bindTooltip(`${gf.name} (${gf.zone_type || 'WORK_AREA'})`, { sticky: true });
      leafletGeofenceLayers.set(gf.id, polygon);
      
      if (isSelected && !simulating()) {
        map.fitBounds(polygon.getBounds());
      }
    });

    // Fit map view if geofences drawn and map isn't zoomed by selection
    if (bounds.length > 0 && !selectedGeofenceId() && !simulating()) {
      map.fitBounds(L.latLngBounds(bounds));
    }
  };

  onMount(async () => {
    try {
      const [wRes, gRes] = await Promise.all([
        api.get<{ data: any[] }>('/api/workers'),
        api.get<{ data: any[] }>('/api/geofences')
      ]);
      setWorkers(wRes?.data || []);
      setGeofences(gRes?.data || []);
      
      // Setup WebSocket client to receive live geofence events
      const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";
      const WS_URL = API_BASE.replace(/^http/, "ws") + "/socket/websocket?vsn=2.0.0";
      
      websocketClient = new WebSocketClient({
        url: WS_URL,
        onGPSUpdate: () => {}, // Handled locally during active simulation
        onAlert: (alert: AlertUpdate) => {
          const isMyWorker = alert.workerId === selectedWorkerId();
          const prefix = isMyWorker ? `★ [MY SIMULATOR] ` : ``;
          
          let type: LogEntry['type'] = 'entered';
          let toastVariant: 'success' | 'warning' | 'error' | 'info' = 'info';
          
          const eventType = alert.eventType || "ENTERED";
          
          if (eventType === 'BREACH') {
            type = 'breach';
            toastVariant = 'error';
          } else if (eventType === 'EXITED') {
            type = 'exited';
            toastVariant = 'warning';
          } else {
            type = 'entered';
            toastVariant = 'success';
          }
          
          const workerName = alert.workerName || "Unknown";
          const geofenceName = alert.geofenceName || "Unknown";
          
          addLog(type, `${prefix}${workerName} ${eventType.toLowerCase()} geofence '${geofenceName}'`);
          showToast(`${workerName} ${eventType.toLowerCase()} ${geofenceName}`, toastVariant);
        },
        onStatusChange: (status: ConnectionStatus) => {
          setWebsocketStatus(status);
          addLog('system', `WebSocket Status: ${status}`);
        }
      });

      // Bind key event listeners
      if (typeof window !== 'undefined') {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
      }
      
    } catch (err: any) {
      console.error('Failed to load simulator data', err);
      addLog('error', `Initialization failed: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  });
  
  onCleanup(() => {
    if (simInterval) clearInterval(simInterval);
    const map = mapInstance();
    if (map) map.remove();
    if (websocketClient) websocketClient.disconnect();
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    }
  });
  
  // Effect to draw and update geofences reactively
  createEffect(() => {
    const map = mapInstance();
    const list = geofences();
    selectedGeofenceId(); // Add as dependency to re-run on selection change
    
    if (map && list.length > 0) {
      drawGeofences(map, list);
    }
  });

  // Key handlers
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!simulating()) return;
    const handledKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (controlMode() === 'manual' && handledKeys.includes(e.code)) {
      keysPressed[e.code] = true;
      e.preventDefault();
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    keysPressed[e.code] = false;
  };

  // Joystick Drag Implementation
  const startJoystickDrag = (e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    joystickActive = true;
    
    if (joystickRef) {
      const rect = joystickRef.getBoundingClientRect();
      joystickCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
    }
    
    window.addEventListener('mousemove', handleJoystickMove);
    window.addEventListener('mouseup', handleJoystickUp);
    window.addEventListener('touchmove', handleJoystickMove, { passive: false });
    window.addEventListener('touchend', handleJoystickUp);
  };

  const handleJoystickMove = (e: MouseEvent | TouchEvent) => {
    if (!joystickActive) return;
    
    let clientX = 0;
    let clientY = 0;
    
    if ('touches' in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
      e.preventDefault();
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const dx = clientX - joystickCenter.x;
    const dy = clientY - joystickCenter.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxRadius = 35; // Clamp boundary
    
    if (distance <= maxRadius) {
      setJoystickPosition({ x: dx, y: dy });
      joystickVector = { x: dx / maxRadius, y: -dy / maxRadius };
    } else {
      const angle = Math.atan2(dy, dx);
      const clampX = Math.cos(angle) * maxRadius;
      const clampY = Math.sin(angle) * maxRadius;
      setJoystickPosition({ x: clampX, y: clampY });
      joystickVector = { x: clampX / maxRadius, y: -clampY / maxRadius };
    }
  };

  const handleJoystickUp = () => {
    joystickActive = false;
    setJoystickPosition({ x: 0, y: 0 });
    joystickVector = { x: 0, y: 0 };
    
    window.removeEventListener('mousemove', handleJoystickMove);
    window.removeEventListener('mouseup', handleJoystickUp);
    window.removeEventListener('touchmove', handleJoystickMove);
    window.removeEventListener('touchend', handleJoystickUp);
  };
  
  const startSimulation = () => {
    if (!selectedWorkerId()) return;
    const worker = workers().find(w => w.id === selectedWorkerId());
    if (!worker) return;

    const map = mapInstance();
    if (!map) {
      showToast("Map is not initialized yet.", "warning");
      return;
    }

    let startLat = 37.7749;
    let startLng = -122.4194;
    let points: {lat: number, lng: number}[] = [];

    // Resolve starting position based on selected geofence
    if (selectedGeofenceId()) {
      const gf = geofences().find(g => g.id === selectedGeofenceId());
      if (gf) {
        points = getPoints(gf);
        if (points.length > 0) {
          startLat = points[0].lat;
          startLng = points[0].lng;
        }
      }
    } else if (geofences().length > 0) {
      const pointsFirst = getPoints(geofences()[0]);
      if (pointsFirst.length > 0) {
        startLat = pointsFirst[0].lat;
        startLng = pointsFirst[0].lng;
      }
    }

    if (controlMode() === 'auto' && points.length < 2) {
      addLog('error', "Geofence needs at least 2 vertices for Automated Walk.");
      showToast("Select a valid geofence for Auto mode", "warning");
      return;
    }
    
    setSimulating(true);
    addLog('system', `Simulation started for ${worker.name} in ${controlMode().toUpperCase()} mode.`);
    
    let currentPointIdx = 0;
    let nextPointIdx = (currentPointIdx + 1) % (points.length || 1);
    let fraction = 0;
    
    let currentLat = startLat;
    let currentLng = startLng;
    setManualCoords({ lat: currentLat, lng: currentLng });
    
    map.setView([currentLat, currentLng], 16);
    
    // Create pulsing worker marker
    if (markerLayer) {
      map.removeLayer(markerLayer);
    }
    
    const iconHTML = `
      <div style="
        width: 24px; 
        height: 24px; 
        background: rgba(236, 72, 153, 0.4); 
        border: 2px solid rgba(255, 255, 255, 0.9); 
        border-radius: 50%; 
        backdrop-filter: blur(4px); 
        display: flex; 
        justify-content: center; 
        align-items: center; 
        box-shadow: 0 0 12px rgba(236, 72, 153, 0.8);
      ">
        <div style="width: 8px; height: 8px; background: #db2777; border-radius: 50%;"></div>
      </div>
    `;

    const markerIcon = L.divIcon({
      className: 'simulated-worker-marker',
      html: iconHTML,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    markerLayer = L.marker([currentLat, currentLng], { icon: markerIcon }).addTo(map);
    markerLayer.bindTooltip(worker.name, { permanent: true, direction: 'top', offset: [0, -10] });
    
    let lastPostTime = 0;
    let lastDrillCheckTime = 0;
    let lastDrillReminderTime = 0;
    let positionChangedSincePost = true; // Send initial ping immediately

    // Main animation & update tick (20 FPS / 50ms)
    simInterval = window.setInterval(async () => {
      if (controlMode() === 'auto') {
        if (points.length < 2) return;
        const p1 = points[currentPointIdx];
        const p2 = points[nextPointIdx];
        
        currentLat = p1.lat + (p2.lat - p1.lat) * fraction;
        currentLng = p1.lng + (p2.lng - p1.lng) * fraction;
        
        // Advance walk fraction
        fraction += 0.005 * speed();
        if (fraction >= 1) {
          fraction = 0;
          currentPointIdx = nextPointIdx;
          nextPointIdx = (nextPointIdx + 1) % points.length;
        }
        positionChangedSincePost = true;
      } else {
        // Manual mode: keyboard & joystick inputs
        let dLat = 0;
        let dLng = 0;
        const baseStep = 0.000015;
        const step = baseStep * speed();

        if (keysPressed['KeyW'] || keysPressed['ArrowUp']) dLat += step;
        if (keysPressed['KeyS'] || keysPressed['ArrowDown']) dLat -= step;
        if (keysPressed['KeyA'] || keysPressed['ArrowLeft']) dLng -= step;
        if (keysPressed['KeyD'] || keysPressed['ArrowRight']) dLng += step;

        // Add virtual joystick components
        dLat += joystickVector.y * step * 1.5;
        dLng += joystickVector.x * step * 1.5;

        if (dLat !== 0 || dLng !== 0) {
          currentLat += dLat;
          currentLng += dLng;
          positionChangedSincePost = true;
          setManualCoords({ lat: currentLat, lng: currentLng });
        }
      }
      
      // Update Leaflet marker location
      if (markerLayer) {
        markerLayer.setLatLng([currentLat, currentLng]);
      }
      
      // Adjust view to keep worker in focus
      const currentMap = mapInstance();
      if (followWorker() && currentMap) {
        currentMap.panTo([currentLat, currentLng], { animate: true, duration: 0.1 });
      }
      
      // Throttle API REST reports to once per second (1000ms)
      const now = Date.now();
      if (positionChangedSincePost && (now - lastPostTime >= 1000)) {
        lastPostTime = now;
        positionChangedSincePost = false;
        
        const timestamp = new Date().toISOString();
        const payload = {
          latitude: currentLat,
          longitude: currentLng,
          timestamp
        };
        
        try {
          await api.post(`/api/workers/${worker.id}/gps`, payload);
          addLog('api', `POST /api/workers/${worker.id}/gps -> [${currentLat.toFixed(6)}, ${currentLng.toFixed(6)}]`);
        } catch (err: any) {
          addLog('error', `POST failed: ${err.message || 'Unknown error'}`);
        }
      }

      // Evacuation drill telemetry check (runs every 1s when active, regardless of movement)
      if (drillActive() && (now - lastDrillCheckTime >= 1000)) {
        lastDrillCheckTime = now;
        
        const workerLatLng = { lat: currentLat, lng: currentLng };
        
        // 1. Calculate distance to nearest safety zone
        const safetyGfs = geofences().filter(g => g.zone_type === 'SAFETY');
        if (safetyGfs.length > 0) {
          let minDistance = Infinity;
          safetyGfs.forEach(gf => {
            const pts = getPoints(gf);
            if (pts.length === 0) return;
            let sumLat = 0;
            let sumLng = 0;
            pts.forEach(p => {
              sumLat += p.lat;
              sumLng += p.lng;
            });
            const center = { lat: sumLat / pts.length, lng: sumLng / pts.length };
            const dist = haversineDistance(workerLatLng, center);
            if (dist < minDistance) {
              minDistance = dist;
            }
          });
          setDistanceToSafety(minDistance);
        }

        // 2. Check if inside any safety zone
        const insideSafety = geofences().some(gf => {
          if (gf.zone_type !== 'SAFETY' || !gf.polygon_coords) return false;
          return pointInGeoJSONPolygon(workerLatLng, gf.polygon_coords);
        });
        
        if (insideSafety && drillStatus() !== 'safe') {
          setDrillStatus('safe');
          addLog('entered', `✅ [SAFE] ${worker.name} successfully reached Safety Assembly Area.`);
          showToast(`${worker.name} is SAFE in assembly area`, 'success');
        } else if (!insideSafety && drillStatus() === 'safe') {
          setDrillStatus('unaccounted');
          addLog('breach', `🚨 [DRILL COMPLIANCE] ${worker.name} left the Safety Assembly Area during active drill!`);
          showToast(`${worker.name} left safety area!`, 'error');
        }

        // 3. Periodic warning if unaccounted
        if (drillStatus() === 'unaccounted') {
          if (now - lastDrillReminderTime >= 5000) {
            lastDrillReminderTime = now;
            addLog('breach', `⚠️ [DRILL COMPLIANCE] ${worker.name} is still UNACCOUNTED FOR! Proceed to Safety Assembly Area.`);
          }
        }
      }
    }, 50);
  };
  
  const stopSimulation = () => {
    if (simInterval) {
      clearInterval(simInterval);
      simInterval = null;
    }
    setSimulating(false);
    setManualCoords(null);
    addLog('system', "Simulation stopped.");
  };

  const triggerDrill = () => {
    setDrillActive(true);
    setDrillStatus('unaccounted');
    addLog('system', "🚨 [EMERGENCY ALARM] Site evacuation drill initiated! Proceed to Safety Assembly Area immediately.");
    showToast("🚨 Site Evacuation Alarm Triggered!", "error");
  };

  const resetDrill = () => {
    setDrillActive(false);
    setDrillStatus('idle');
    setDistanceToSafety(null);
    addLog('system', "🟢 [DRILL ENDED] Evacuation alarm reset. Personnel may return to standard duties.");
    showToast("Evacuation drill reset", "info");
  };

  const distanceText = () => {
    const dist = distanceToSafety();
    if (dist === null) return "";
    if (dist >= 1000) return `${(dist / 1000).toFixed(2)} km`;
    return `${Math.round(dist)} m`;
  };

  const joystickContainerStyle = {
    position: 'absolute' as const,
    bottom: '24px',
    left: '24px',
    width: '110px',
    height: '110px',
    background: 'rgba(15, 23, 42, 0.85)',
    'backdrop-filter': 'blur(8px)',
    border: '2px solid rgba(59, 130, 246, 0.6)',
    'border-radius': '50%',
    'z-index': 1000,
    display: 'flex',
    'justify-content': 'center',
    'align-items': 'center',
    'box-shadow': '0 0 20px rgba(59, 130, 246, 0.25), inset 0 0 12px rgba(59, 130, 246, 0.15)',
    'touch-action': 'none',
  };

  const joystickKnobStyle = (pos: { x: number; y: number }) => ({
    width: '44px',
    height: '44px',
    background: 'radial-gradient(circle, #60a5fa 0%, #1d4ed8 100%)',
    'border-radius': '50%',
    border: '2px solid rgba(255, 255, 255, 0.8)',
    cursor: 'grab',
    transform: `translate(${pos.x}px, ${pos.y}px)`,
    transition: 'transform 0.03s ease-out',
    'box-shadow': '0 4px 12px rgba(59, 130, 246, 0.6)',
  });

  return (
    <AuthGuard>
      <div style={{ padding: "1.5rem", height: "calc(100vh - 56px)", display: "flex", "flex-direction": "column", "box-sizing": "border-box" }}>
        
        {/* Header */}
        <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "1rem" }}>
          <h1 style={{ "font-size": "1.75rem", "font-weight": "bold", margin: 0 }}>GPS Simulator Console</h1>
          <div style={{ display: "flex", "align-items": "center", gap: "0.5rem" }}>
            <span style={{ "font-size": "0.85rem", color: "var(--text-tertiary)" }}>WebSocket:</span>
            <span style={{
              "font-size": "0.85rem",
              "font-weight": "600",
              color: websocketStatus() === 'connected' ? '#22c55e' : '#ef4444'
            }}>
              ● {websocketStatus().toUpperCase()}
            </span>
          </div>
        </div>

        {/* 3-Column Workspace */}
        <div style={{ display: "flex", gap: "1.5rem", flex: 1, "min-height": 0, "overflow": "hidden" }}>
          
          {/* Column 1: Config (Width: 320px) */}
          <div style={{ width: "320px", display: "flex", "flex-direction": "column", gap: "1rem", "flex-shrink": 0, "overflow-y": "auto" }}>
            <Show when={!loading()} fallback={<div>Loading configuration...</div>}>
              <div class="card bg-glass border-glass" style={{ padding: "1.25rem" }}>
                <h2 style={{ "margin-bottom": "1rem", "font-weight": "bold", "font-size": "1.1rem" }}>Configuration</h2>
                
                <div class="form-group" style={{ "margin-bottom": "1rem" }}>
                  <label>Select Worker</label>
                  <select 
                    class="form-input" 
                    value={selectedWorkerId()} 
                    onChange={e => setSelectedWorkerId(e.currentTarget.value)}
                    disabled={simulating()}
                  >
                    <option value="">-- Choose a Worker --</option>
                    <For each={workers()}>
                      {w => <option value={w.id}>{w.name}</option>}
                    </For>
                  </select>
                </div>
                
                <div class="form-group" style={{ "margin-bottom": "1rem" }}>
                  <label>Select Spawn Location / Path</label>
                  <select 
                    class="form-input" 
                    value={selectedGeofenceId()} 
                    onChange={e => setSelectedGeofenceId(e.currentTarget.value)}
                    disabled={simulating()}
                  >
                    <option value="">-- Choose a Geofence --</option>
                    <For each={geofences()}>
                      {g => <option value={g.id}>{g.name} ({g.zone_type || 'WORK_AREA'})</option>}
                    </For>
                  </select>
                </div>

                <div class="form-group" style={{ "margin-bottom": "1.25rem" }}>
                  <label>Control Mode</label>
                  <div style={{ display: "flex", gap: "1.5rem", "margin-top": "0.5rem" }}>
                    <label style={{ display: "flex", "align-items": "center", gap: "0.5rem", cursor: "pointer", "font-size": "0.85rem" }}>
                      <input 
                        type="radio" 
                        name="controlMode" 
                        value="auto" 
                        checked={controlMode() === 'auto'}
                        onChange={() => setControlMode('auto')}
                        disabled={simulating()}
                      />
                      Auto (Walk Path)
                    </label>
                    <label style={{ display: "flex", "align-items": "center", gap: "0.5rem", cursor: "pointer", "font-size": "0.85rem" }}>
                      <input 
                        type="radio" 
                        name="controlMode" 
                        value="manual" 
                        checked={controlMode() === 'manual'}
                        onChange={() => setControlMode('manual')}
                        disabled={simulating()}
                      />
                      Manual (WASD/Keys)
                    </label>
                  </div>
                </div>

                {/* Shared Sim Config Options */}
                <div style={{ display: "flex", "flex-direction": "column", gap: "0.75rem", "margin-bottom": "1.5rem", background: "rgba(255, 255, 255, 0.03)", padding: "0.85rem", "border-radius": "8px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                  <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", gap: "1rem" }}>
                    <label style={{ margin: 0, "font-size": "0.85rem", display: "flex", "align-items": "center", gap: "0.5rem", cursor: "pointer" }}>
                      <input 
                        type="checkbox" 
                        checked={followWorker()}
                        onChange={e => setFollowWorker(e.currentTarget.checked)}
                      />
                      Auto-center camera
                    </label>
                    
                    <div style={{ display: "flex", "align-items": "center", gap: "0.5rem" }}>
                      <span style={{ "font-size": "0.85rem" }}>Speed:</span>
                      <select 
                        class="form-input" 
                        style={{ width: "auto", padding: "0.25rem 0.5rem", "font-size": "0.85rem" }}
                        value={speed()} 
                        onChange={e => setSpeed(Number(e.currentTarget.value))}
                      >
                        <option value="1">1x (Walk)</option>
                        <option value="3">3x (Run)</option>
                        <option value="10">10x (Drive)</option>
                        <option value="25">25x (Sprint)</option>
                      </select>
                    </div>
                  </div>
                  
                  <Show when={simulating() && manualCoords()}>
                    <div style={{ "font-size": "0.75rem", "font-family": "monospace", color: "var(--text-tertiary)", "border-top": "1px solid rgba(255,255,255,0.05)", "padding-top": "0.5rem" }}>
                      Coordinates: Lat {manualCoords()?.lat.toFixed(6)}, Lng {manualCoords()?.lng.toFixed(6)}
                    </div>
                  </Show>
                </div>
                
                <div style={{ display: "flex", gap: "1rem" }}>
                  <Show when={!simulating()}>
                    <button 
                      class="btn btn-primary" 
                      style={{ flex: 1 }} 
                      disabled={!selectedWorkerId()}
                      onClick={startSimulation}
                    >
                      Start Simulation
                    </button>
                  </Show>
                  <Show when={simulating()}>
                    <button class="btn btn-danger" style={{ flex: 1 }} onClick={stopSimulation}>
                      Stop Simulation
                    </button>
                  </Show>
                </div>
              </div>

              {/* Emergency Drill Card */}
              <div class="card bg-glass border-glass" style={{ padding: "1.25rem" }}>
                <h2 style={{ "margin-bottom": "1rem", "font-weight": "bold", "font-size": "1.1rem", color: drillActive() ? "#f87171" : "inherit", display: "flex", "align-items": "center", gap: "0.5rem" }}>
                  <span>🚨</span> Emergency Drill Control
                </h2>
                
                <Show when={!drillActive()}>
                  <p style={{ "font-size": "0.8rem", color: "var(--text-secondary)", "margin-top": 0, "margin-bottom": "1rem" }}>
                    Simulate a site-wide fire alarm. Workers will be instructed to evacuate to the designated Safety Assembly Area.
                  </p>
                  <button 
                    class="btn btn-danger" 
                    style={{ width: "100%", background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)", border: "none" }}
                    onClick={triggerDrill}
                  >
                    Trigger Evacuation Alarm
                  </button>
                </Show>
                
                <Show when={drillActive()}>
                  <div style={{ display: "flex", "flex-direction": "column", gap: "0.85rem", "margin-bottom": "1rem" }}>
                    <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between" }}>
                      <span style={{ "font-size": "0.8rem", color: "var(--text-secondary)" }}>Drill Status:</span>
                      <span class="pulse" style={{ 
                        "font-size": "0.8rem", 
                        "font-weight": "bold", 
                        color: "#ef4444",
                        animation: "pulse 1.5s infinite"
                      }}>
                        🔴 ACTIVE DRILL
                      </span>
                    </div>
                    
                    <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", background: "rgba(255, 255, 255, 0.03)", padding: "0.6rem 0.8rem", "border-radius": "6px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <span style={{ "font-size": "0.8rem", color: "var(--text-secondary)" }}>Worker Compliance:</span>
                      <Show when={drillStatus() === 'unaccounted'}>
                        <span style={{ "font-weight": "bold", color: "#f87171", "font-size": "0.8rem" }}>❌ UNACCOUNTED</span>
                      </Show>
                      <Show when={drillStatus() === 'safe'}>
                        <span style={{ "font-weight": "bold", color: "#4ade80", "font-size": "0.8rem" }}>✅ SAFE</span>
                      </Show>
                    </div>

                    <Show when={simulating() && drillStatus() === 'unaccounted'}>
                      <div style={{ "font-size": "0.75rem", color: "var(--text-tertiary)", display: "flex", "justify-content": "space-between" }}>
                        <span>Distance to Safety:</span>
                        <span style={{ color: "#e2e8f0", "font-weight": "600" }}>{distanceText() || "Calculating..."}</span>
                      </div>
                    </Show>
                  </div>
                  
                  <button 
                    class="btn btn-success" 
                    style={{ width: "100%", background: "linear-gradient(135deg, #10b981 0%, #047857 100%)", border: "none" }}
                    onClick={resetDrill}
                  >
                    Reset & Stop Alarm
                  </button>
                </Show>
              </div>
            </Show>
          </div>
          
          {/* Column 2: Map (Flex: 1) */}
          <div style={{ flex: 1, "border-radius": "12px", overflow: "hidden", border: "1px solid var(--border-glass)", position: "relative" }}>
            <div ref={mapRefCallback} style={{ width: "100%", height: "100%", "min-height": "500px" }}></div>
            
            {/* Virtual Joystick UI */}
            <Show when={simulating() && controlMode() === 'manual'}>
              <div 
                ref={el => joystickRef = el}
                style={joystickContainerStyle}
                onTouchStart={startJoystickDrag}
                onMouseDown={startJoystickDrag}
              >
                {/* Decorative guides for clarity */}
                <div style={{ position: "absolute", width: "100%", height: "1px", background: "rgba(59, 130, 246, 0.25)" }}></div>
                <div style={{ position: "absolute", width: "1px", height: "100%", background: "rgba(59, 130, 246, 0.25)" }}></div>
                <div style={{ position: "absolute", width: "70%", height: "70%", border: "1px dashed rgba(59, 130, 246, 0.2)", "border-radius": "50%" }}></div>
                
                {/* Label above joystick */}
                <span style={{ position: "absolute", top: "-20px", "font-size": "0.65rem", "font-weight": "bold", color: "#60a5fa", "text-transform": "uppercase", "letter-spacing": "0.06em", "text-shadow": "0 0 8px rgba(59,130,246,0.3)" }}>
                  Joystick
                </span>

                <div 
                  style={joystickKnobStyle(joystickPosition())}
                />
              </div>
              
              {/* Keyboard Help Overlay - Moved to top-right to avoid Leaflet controls at bottom-right */}
              <div style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "rgba(15, 23, 42, 0.9)",
                "backdrop-filter": "blur(10px)",
                border: "1px solid rgba(59, 130, 246, 0.35)",
                padding: "12px 16px",
                "border-radius": "10px",
                color: "#e4e4ed",
                "font-size": "0.75rem",
                "z-index": 1000,
                "pointer-events": "none",
                display: "flex",
                "flex-direction": "column",
                gap: "8px",
                "box-shadow": "0 8px 32px rgba(0,0,0,0.5), 0 0 15px rgba(59, 130, 246, 0.15)"
              }}>
                <div style={{ "font-weight": "bold", color: "#60a5fa", "font-size": "0.8rem", "display": "flex", "align-items": "center", gap: "6px" }}>
                  <span>🎮</span> Manual Controller Active
                </div>
                <div style={{ display: "flex", "align-items": "center", gap: "10px" }}>
                  <span style={{ color: "#9494b8", "font-size": "0.7rem", "min-width": "68px" }}>Move Keys:</span> 
                  <span>
                    <kbd style={{ background: "rgba(59, 130, 246, 0.25)", border: "1px solid rgba(59, 130, 246, 0.4)", color: "#93c5fd", padding: "2px 5px", "border-radius": "4px", "font-family": "monospace", "font-weight": "bold", "font-size": "0.75rem" }}>W</kbd> 
                    <kbd style={{ background: "rgba(59, 130, 246, 0.25)", border: "1px solid rgba(59, 130, 246, 0.4)", color: "#93c5fd", padding: "2px 5px", "border-radius": "4px", "font-family": "monospace", "font-weight": "bold", "font-size": "0.75rem", "margin-left": "4px" }}>A</kbd> 
                    <kbd style={{ background: "rgba(59, 130, 246, 0.25)", border: "1px solid rgba(59, 130, 246, 0.4)", color: "#93c5fd", padding: "2px 5px", "border-radius": "4px", "font-family": "monospace", "font-weight": "bold", "font-size": "0.75rem", "margin-left": "4px" }}>S</kbd> 
                    <kbd style={{ background: "rgba(59, 130, 246, 0.25)", border: "1px solid rgba(59, 130, 246, 0.4)", color: "#93c5fd", padding: "2px 5px", "border-radius": "4px", "font-family": "monospace", "font-weight": "bold", "font-size": "0.75rem", "margin-left": "4px" }}>D</kbd>
                  </span>
                </div>
                <div style={{ display: "flex", "align-items": "center", gap: "10px" }}>
                  <span style={{ color: "#9494b8", "font-size": "0.7rem", "min-width": "68px" }}>Alternate:</span>
                  <span style={{ color: "#cbd5e1" }}>Arrow Keys (↑ ↓ ← →)</span>
                </div>
                <div style={{ display: "flex", "align-items": "center", gap: "10px", "border-top": "1px solid rgba(255,255,255,0.06)", "padding-top": "6px", "margin-top": "2px" }}>
                  <span style={{ color: "#9494b8", "font-size": "0.7rem", "min-width": "68px" }}>Touch/Mouse:</span>
                  <span style={{ color: "#cbd5e1" }}>Drag Glowing Joystick</span>
                </div>
              </div>
            </Show>
          </div>

          {/* Column 3: Dedicated Logs Console (Width: 360px) */}
          <div class="card bg-glass border-glass" style={{ width: "360px", display: "flex", "flex-direction": "column", "flex-shrink": 0, padding: "1.25rem", "min-height": 0 }}>
            <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "1rem" }}>
              <h2 style={{ margin: 0, "font-size": "1.1rem", "font-weight": "bold", color: "#e4e4ed" }}>System Logs</h2>
              <button 
                class="btn btn-ghost" 
                style={{ padding: "2px 8px", "font-size": "0.75rem", height: "auto" }} 
                onClick={() => setLogs([])}
              >
                Clear
              </button>
            </div>

            <div style={{ 
              flex: 1, 
              background: "rgba(10, 10, 18, 0.6)", 
              "border-radius": "8px", 
              padding: "0.85rem", 
              "overflow-y": "auto",
              "border": "1px solid rgba(255, 255, 255, 0.05)",
              "display": "flex",
              "flex-direction": "column",
              "gap": "0.5rem"
            }}>
              <Show when={logs().length === 0}>
                <div style={{ color: "var(--text-tertiary)", "text-align": "center", "margin-top": "2rem", "font-size": "0.85rem" }}>
                  Console empty. Live telemetry and geofence alerts will appear here.
                </div>
              </Show>
              <For each={logs()}>
                {log => {
                  let color = "var(--text-secondary)";
                  let bg = "rgba(255, 255, 255, 0.02)";
                  let border = "rgba(255, 255, 255, 0.04)";
                  let weight = "normal";
                  let prefixSymbol = "";
                  
                  if (log.type === 'breach') {
                    color = "#f87171"; // Light red
                    bg = "rgba(239, 68, 68, 0.15)";
                    border = "rgba(239, 68, 68, 0.25)";
                    weight = "bold";
                    prefixSymbol = "🚨 [BREACH] ";
                  } else if (log.type === 'entered') {
                    color = "#4ade80"; // Bright green
                    bg = "rgba(34, 197, 94, 0.12)";
                    border = "rgba(34, 197, 94, 0.22)";
                    weight = "600";
                    prefixSymbol = "✅ [ENTERED] ";
                  } else if (log.type === 'exited') {
                    color = "#fbbf24"; // Bright yellow
                    bg = "rgba(234, 197, 8, 0.08)";
                    border = "rgba(234, 197, 8, 0.18)";
                    weight = "600";
                    prefixSymbol = "⚠️ [LEFT ZONE] ";
                  } else if (log.type === 'api') {
                    color = "#cbd5e1";
                    bg = "rgba(148, 163, 184, 0.06)";
                    border = "rgba(148, 163, 184, 0.1)";
                    prefixSymbol = "📡 ";
                  } else if (log.type === 'system') {
                    color = "#60a5fa";
                    bg = "rgba(59, 130, 246, 0.1)";
                    border = "rgba(59, 130, 246, 0.18)";
                    prefixSymbol = "⚙️ ";
                  } else if (log.type === 'error') {
                    color = "#fca5a5";
                    bg = "rgba(248, 113, 113, 0.12)";
                    border = "rgba(248, 113, 113, 0.22)";
                    prefixSymbol = "❌ [ERROR] ";
                  }
                  
                  return (
                    <div style={{ 
                      "padding": "0.6rem 0.85rem",
                      "background": bg,
                      "border": `1px solid ${border}`,
                      "border-radius": "6px",
                      "font-size": "0.75rem",
                      "line-height": "1.45",
                      "color": color,
                      "font-weight": weight,
                      "display": "flex",
                      "flex-direction": "column",
                      "gap": "3px",
                      "box-sizing": "border-box"
                    }}>
                      <div style={{ "display": "flex", "justify-content": "space-between", "font-size": "0.65rem", "color": "rgba(255,255,255,0.35)", "margin-bottom": "2px" }}>
                        <span>{prefixSymbol ? prefixSymbol.trim() : "LOG"}</span>
                        <span>{log.time}</span>
                      </div>
                      <div style={{ "word-break": "break-word", "font-family": "monospace" }}>
                        {log.text}
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>

        </div>
      </div>
    </AuthGuard>
  );
}
