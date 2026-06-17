// ============================================================
// GeoOps — Shared Constants
// ============================================================
// Shared constants between frontend and documentation.
// Keep in sync with Elixir-side module: Geoops.Constants
// ============================================================

/** Worker online/offline status */
export const WORKER_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

/** Geofence zone classification */
export const ZONE_TYPES = {
  RESTRICTED: 'RESTRICTED',
  WORK_ZONE: 'WORK_ZONE',
  SAFETY: 'SAFETY',
  CUSTOM: 'CUSTOM',
} as const;

/** Geofence crossing event types */
export const EVENT_TYPES = {
  ENTERED: 'ENTERED',
  EXITED: 'EXITED',
  BREACH: 'BREACH',
} as const;

/** Map color per zone type (hex) */
export const ZONE_COLORS = {
  RESTRICTED: '#ef4444',
  WORK_ZONE: '#3b82f6',
  SAFETY: '#eab308',
  CUSTOM: '#a855f7',
} as const;

/** GPS pipeline tuning knobs */
export const GPS_CONFIG = {
  /** Ignore movement below this threshold (meters) */
  MIN_MOVEMENT_METERS: 15,
  /** Batch DB write interval (ms) — positions buffered in ETS */
  BATCH_SYNC_INTERVAL_MS: 60_000,
  /** How often the in-memory geofence cache refreshes from DB (ms) */
  GEOFENCE_CACHE_REFRESH_MS: 300_000,
  /** Kalman noise-gate minimum (meters) — reject jitter below this */
  NOISE_GATE_MIN_METERS: 3,
  /** Kalman noise-gate maximum (meters) — reject teleports above this */
  NOISE_GATE_MAX_METERS: 1_000,
} as const;
