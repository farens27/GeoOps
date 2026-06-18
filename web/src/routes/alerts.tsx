import { createSignal, onMount, onCleanup } from 'solid-js';
import { AuthGuard, DataTable, StatusBadge } from '~/components';
import { api } from '~/lib/api-client';
import { WebSocketClient } from '~/lib/websocket';

export default function Alerts() {
  const [alerts, setAlerts] = createSignal<any[]>([]);
  const [loading, setLoading] = createSignal(true);
  let wsClient: WebSocketClient | null = null;

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: any[] }>('/api/alerts');
      if (res && res.data) {
        setAlerts(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch alerts', err);
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    fetchAlerts();

    // Fancy real-time alerts
    const wsUrl = import.meta.env.VITE_WS_URL || "ws://localhost:4000/socket/websocket";
    wsClient = new WebSocketClient({
      url: wsUrl,
      onGPSUpdate: () => {}, // Not needed for this page
      onAlert: (newAlert) => {
        // Prepend new alert to the list
        setAlerts(prev => [newAlert, ...prev]);
      },
      onStatusChange: () => {}
    });
  });

  onCleanup(() => {
    if (wsClient) {
      wsClient.disconnect();
    }
  });

  const columns = [
    {
      key: 'detected_at',
      label: 'Detected At',
      render: (row: any) => {
        const val = row.detected_at || row.detectedAt;
        const d = new Date(val);
        return isNaN(d.getTime()) ? '-' : d.toLocaleString();
      }
    },
    { 
      key: 'worker_name', 
      label: 'Worker',
      render: (row: any) => row.worker_name || row.workerName
    },
    { 
      key: 'event_type', 
      label: 'Event',
      render: (row: any) => {
        const val = row.event_type || row.eventType;
        return <StatusBadge status={val as any} />;
      }
    },
    { 
      key: 'geofence_name', 
      label: 'Geofence',
      render: (row: any) => row.geofence_name || row.geofenceName
    }
  ];

  return (
    <AuthGuard>
      <div style={{ padding: "2rem" }}>
        <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "2rem" }}>
          <h1 style={{ "font-size": "2rem", "font-weight": "bold", margin: 0 }}>Recent Alerts</h1>
          <button class="btn btn-primary" onClick={fetchAlerts} disabled={loading()}>
            {loading() ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <DataTable 
          data={alerts()} 
          columns={columns} 
          loading={loading()} 
          emptyMessage="No recent alerts found." 
        />
      </div>
    </AuthGuard>
  );
}
