/**
 * DataTable — Reusable Generic Data Table
 *
 * Typed data table that renders rows from a `data` array based on
 * column definitions. Supports custom cell renderers, loading skeleton,
 * empty state, and responsive horizontal scrolling.
 *
 * Usage:
 *   <DataTable
 *     data={workers()}
 *     columns={[
 *       { key: "name",   label: "Name" },
 *       { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
 *     ]}
 *     onRowClick={(row) => navigate(`/workers/${row.id}`)}
 *     emptyMessage="No workers found."
 *     loading={loading()}
 *   />
 */

import { Show, For } from "solid-js";
import type { JSX } from "solid-js";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

/** Definition for a single table column */
export interface Column<T> {
  /** Property key on T to read. Used as default cell value. */
  key: string;
  /** Column header label */
  label: string;
  /**
   * Optional custom renderer for the cell.
   * When provided, the return value replaces the default text.
   */
  render?: (row: T, index: number) => JSX.Element;
}

export interface DataTableProps<T> {
  /** Array of data objects to display as rows */
  data: T[];
  /** Column definitions controlling headers and cell rendering */
  columns: Column<T>[];
  /** Callback when a row is clicked (makes rows interactive) */
  onRowClick?: (row: T) => void;
  /** Message shown when data array is empty */
  emptyMessage?: string;
  /** When true, displays a skeleton loading state */
  loading?: boolean;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/**
 * Safely read a nested key from an object.
 * Supports dot-notation paths like "location.lat".
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** Number of skeleton rows to show in loading state */
const SKELETON_ROWS = 5;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export default function DataTable<T extends Record<string, unknown>>(
  props: DataTableProps<T>
) {
  const isClickable = () => typeof props.onRowClick === "function";

  return (
    <div class="data-table-wrapper">
      <table class="data-table">
        {/* ---- Header ---- */}
        <thead>
          <tr>
            <For each={props.columns}>
              {(col) => <th>{col.label}</th>}
            </For>
          </tr>
        </thead>

        {/* ---- Body ---- */}
        <tbody>
          {/* Loading skeleton */}
          <Show when={props.loading}>
            <For each={Array.from({ length: SKELETON_ROWS })}>
              {() => (
                <tr class="data-table-skeleton-row">
                  <For each={props.columns}>
                    {() => (
                      <td>
                        <div class="data-table-skeleton" />
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </Show>

          {/* Empty state */}
          <Show when={!props.loading && props.data.length === 0}>
            <tr>
              <td
                colSpan={props.columns.length}
                class="data-table-empty"
              >
                {props.emptyMessage ?? "No data available."}
              </td>
            </tr>
          </Show>

          {/* Data rows */}
          <Show when={!props.loading && props.data.length > 0}>
            <For each={props.data}>
              {(row, index) => (
                <tr
                  class={`data-table-row ${isClickable() ? "data-table-row--clickable" : ""}`}
                  onClick={() => isClickable() && props.onRowClick!(row)}
                >
                  <For each={props.columns}>
                    {(col) => (
                      <td>
                        {col.render
                          ? col.render(row, index())
                          : String(getNestedValue(row, col.key) ?? "—")}
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </Show>
        </tbody>
      </table>
    </div>
  );
}
