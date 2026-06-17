import { createSignal, onMount, onCleanup, createEffect, For, Show } from 'solid-js';
import { AuthGuard } from '~/components';
import { api } from '~/lib/api-client';
import { pointInPolygon } from '~/lib/geo-utils';

export default function Simulate() {
  const [workers, setWorkers] = createSignal<any[]>([]);
  const [geofences, setGeofences] = createSignal<any[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [logs, setLogs] = createSignal<string[]>([]);
  
  const [selectedWorkerId, setSelectedWorkerId] = createSignal('');
  const [selectedGeofenceId, setSelectedGeofenceId] = createSignal('');
  
  const [simulating, setSimulating] = createSignal(false);
  
  let mapRef: HTMLDivElement;
  let L: any;
  let mapInstance: any;
  let polygonLayer: any;
  let markerLayer: any;
  let simInterval: number | null = null;
  
  onMount(async () => {
    try {
      const [wRes, gRes] = await Promise.all([
        api.get<{ data: any[] }>('/api/workers'),
        api.get<{ data: any[] }>('/api/geofences')
      ]);
      setWorkers(wRes?.data || []);
      setGeofences(gRes?.data || []);
      
      // Load Leaflet dynamically to avoid SSR issues
      const leaflet = await import('leaflet');
      L = leaflet.default || leaflet;
      
      // Initialize map
      mapInstance = L.map(mapRef).setView([0, 0], 2);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(mapInstance);
      
    } catch (err) {
      console.error('Failed to load data', err);
    } finally {
      setLoading(false);
    }
  });
  
  onCleanup(() => {
    if (simInterval) clearInterval(simInterval);
    if (mapInstance) mapInstance.remove();
  });
  
  const getPoints = (gf: any): {lat: number, lng: number}[] => {
    if (!gf || !gf.polygon_coords) return [];
    return gf.polygon_coords.map((p: any) => {
      if (Array.isArray(p)) return { lat: p[1], lng: p[0] };
      return { lat: p.lat, lng: p.lng };
    });
  };
  
  // Effect to update map when geofence changes
  createEffect(() => {
    const gfId = selectedGeofenceId();
    if (!gfId || !L || !mapInstance) return;
    
    const gf = geofences().find(g => g.id === gfId);
    if (!gf) return;
    
    const points = getPoints(gf);
    if (points.length === 0) return;
    
    if (polygonLayer) {
      mapInstance.removeLayer(polygonLayer);
    }
    
    const latlngs = points.map(p => [p.lat, p.lng]);
    polygonLayer = L.polygon(latlngs, { color: gf.color || '#3b82f6' }).addTo(mapInstance);
    mapInstance.fitBounds(polygonLayer.getBounds());
  });
  
  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  };
  
  const startSimulation = () => {
    if (!selectedWorkerId() || !selectedGeofenceId()) return;
    const worker = workers().find(w => w.id === selectedWorkerId());
    const gf = geofences().find(g => g.id === selectedGeofenceId());
    if (!worker || !gf) return;
    
    const points = getPoints(gf);
    if (points.length < 2) {
      addLog("Geofence needs at least 2 points to simulate.");
      return;
    }
    
    setSimulating(true);
    addLog(`Started simulation for ${worker.name} on ${gf.name}`);
    
    let currentPointIdx = 0;
    let nextPointIdx = 1;
    let fraction = 0; // 0 to 1 between current and next
    
    simInterval = window.setInterval(async () => {
      const p1 = points[currentPointIdx];
      const p2 = points[nextPointIdx];
      
      const lat = p1.lat + (p2.lat - p1.lat) * fraction;
      const lng = p1.lng + (p2.lng - p1.lng) * fraction;
      
      // Update marker on map
      if (!markerLayer) {
        markerLayer = L.circleMarker([lat, lng], { radius: 8, color: 'red', fillOpacity: 1 }).addTo(mapInstance);
      } else {
        markerLayer.setLatLng([lat, lng]);
      }
      
      // Move fraction
      fraction += 0.1;
      if (fraction >= 1) {
        fraction = 0;
        currentPointIdx = nextPointIdx;
        nextPointIdx = (nextPointIdx + 1) % points.length;
      }
      
      const timestamp = new Date().toISOString();
      const payload = {
        lat,
        lng,
        timestamp
      };
      
      try {
        await api.post(`/api/workers/${worker.id}/gps`, payload);
        addLog(`POST /api/workers/${worker.id}/gps -> [${lat.toFixed(5)}, ${lng.toFixed(5)}]`);
      } catch (err: any) {
        addLog(`ERROR: ${err.message}`);
      }
      
    }, 1000);
  };
  
  const stopSimulation = () => {
    if (simInterval) {
      clearInterval(simInterval);
      simInterval = null;
    }
    setSimulating(false);
    addLog("Stopped simulation.");
  };

  return (
    <AuthGuard>
      <div style={{ padding: "2rem", height: "100%", display: "flex", "flex-direction": "column" }}>
        <h1 style={{ "font-size": "2rem", "font-weight": "bold", "margin-bottom": "2rem" }}>GPS Simulator</h1>
        
        <div style={{ display: "flex", gap: "2rem", flex: 1, "min-height": "500px" }}>
          {/* Left side: Controls and Logs */}
          <div style={{ flex: 1, display: "flex", "flex-direction": "column", gap: "1.5rem" }}>
            <Show when={!loading()} fallback={<div>Loading data...</div>}>
              <div class="card bg-glass border-glass" style={{ padding: "1.5rem" }}>
                <h2 style={{ "margin-bottom": "1rem", "font-weight": "bold" }}>Configuration</h2>
                
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
                
                <div class="form-group" style={{ "margin-bottom": "1.5rem" }}>
                  <label>Select Geofence</label>
                  <select 
                    class="form-input" 
                    value={selectedGeofenceId()} 
                    onChange={e => setSelectedGeofenceId(e.currentTarget.value)}
                    disabled={simulating()}
                  >
                    <option value="">-- Choose a Geofence --</option>
                    <For each={geofences()}>
                      {g => <option value={g.id}>{g.name}</option>}
                    </For>
                  </select>
                </div>
                
                <div style={{ display: "flex", gap: "1rem" }}>
                  <Show when={!simulating()}>
                    <button 
                      class="btn btn-primary" 
                      style={{ flex: 1 }} 
                      disabled={!selectedWorkerId() || !selectedGeofenceId()}
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
            </Show>
            
            <div class="card bg-glass border-glass" style={{ flex: 1, padding: "1.5rem", display: "flex", "flex-direction": "column" }}>
              <h2 style={{ "margin-bottom": "1rem", "font-weight": "bold" }}>Logs</h2>
              <div style={{ 
                flex: 1, 
                background: "var(--bg-tertiary)", 
                "border-radius": "8px", 
                padding: "1rem", 
                "overflow-y": "auto",
                "font-family": "monospace",
                "font-size": "0.85rem",
                "max-height": "400px"
              }}>
                <Show when={logs().length === 0}>
                  <div style={{ color: "var(--text-tertiary)" }}>No logs yet.</div>
                </Show>
                <For each={logs()}>
                  {log => <div style={{ "margin-bottom": "0.25rem", color: "var(--text-secondary)" }}>{log}</div>}
                </For>
              </div>
            </div>
          </div>
          
          {/* Right side: Map */}
          <div style={{ flex: 2, "border-radius": "12px", overflow: "hidden", border: "1px solid var(--border-glass)" }}>
            <div ref={el => mapRef = el} style={{ width: "100%", height: "100%", "min-height": "500px" }}></div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
