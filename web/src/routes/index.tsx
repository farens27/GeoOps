import { createSignal, onMount, Show } from 'solid-js';
import { AuthGuard, StatCard } from '~/components';
import { api } from '~/lib/api-client';

type DashboardStats = {
  total_workers: number;
  active_workers: number;
  total_geofences: number;
  recent_breaches: number;
};

export default function Dashboard() {
  const [stats, setStats] = createSignal<DashboardStats | null>(null);
  const [loading, setLoading] = createSignal(true);

  onMount(async () => {
    try {
      const data = await api.get<{ data: DashboardStats }>('/api/dashboard/stats');
      if (data && data.data) {
        setStats(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard stats', err);
    } finally {
      setLoading(false);
    }
  });

  return (
    <AuthGuard>
      <div style={{ padding: "2rem" }}>
        <h1 style={{ "margin-bottom": "2rem", "font-size": "2rem", "font-weight": "bold" }}>Dashboard</h1>

        <Show when={!loading()} fallback={<div>Loading stats...</div>}>
          <div style={{
            display: "grid",
            "grid-template-columns": "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "1.5rem",
            "margin-bottom": "3rem"
          }}>
            <StatCard
              title="Total Workers"
              value={stats()?.total_workers ?? 0}
              icon="👷"
              color="#3b82f6" // blue-500
            />
            <StatCard
              title="Active Workers"
              value={stats()?.active_workers ?? 0}
              icon="🟢"
              color="#22c55e" // green-500
            />
            <StatCard
              title="Total Geofences"
              value={stats()?.total_geofences ?? 0}
              icon="⬡"
              color="#a855f7" // purple-500
            />
            <StatCard
              title="Recent Breaches (24h)"
              value={stats()?.recent_breaches ?? 0}
              icon="🚨"
              color="#ef4444" // red-500
              trend={stats()?.recent_breaches && stats()!.recent_breaches > 0 ? "up" : undefined}
            />
          </div>
        </Show>

        <div class="card bg-glass border-glass" style={{ padding: "1.5rem" }}>
          <h2 style={{ "margin-bottom": "1rem", "font-size": "1.25rem", "font-weight": "bold" }}>Recent Alerts</h2>
          <p style={{ color: "var(--text-secondary)" }}>Recent alerts will be displayed here.</p>
          {/* We will embed the alerts table here later or just link to it */}
        </div>
      </div>
    </AuthGuard>
  );
}
