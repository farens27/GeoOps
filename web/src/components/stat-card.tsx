/**
 * StatCard — Dashboard Statistics Card
 *
 * Displays a single KPI metric: icon, large value, label below,
 * and an optional trend arrow. Colored left border indicates category.
 *
 * Usage:
 *   <StatCard
 *     title="Active Workers"
 *     value={42}
 *     icon="👷"
 *     color="var(--color-green)"
 *     trend="up"
 *   />
 */

import { Show } from "solid-js";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface StatCardProps {
  /** Metric label shown below the value */
  title: string;
  /** The main number or text to display prominently */
  value: number | string;
  /** Emoji/unicode icon rendered at the top */
  icon: string;
  /** CSS color for the left border accent (use design token vars) */
  color: string;
  /** Optional trend indicator arrow */
  trend?: "up" | "down";
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export default function StatCard(props: StatCardProps) {
  /** Map trend direction to arrow and CSS class */
  const trendIcon = () => (props.trend === "up" ? "↑" : "↓");
  const trendClass = () =>
    props.trend === "up" ? "stat-card-trend--up" : "stat-card-trend--down";

  return (
    <div
      class="card stat-card"
      style={{ "border-left": `3px solid ${props.color}` }}
    >
      <div class="stat-card-header">
        <span class="stat-card-icon">{props.icon}</span>
        <Show when={props.trend}>
          <span class={`stat-card-trend ${trendClass()}`}>
            {trendIcon()}
          </span>
        </Show>
      </div>

      <div class="stat-card-value">{props.value}</div>
      <div class="stat-card-title">{props.title}</div>
    </div>
  );
}
