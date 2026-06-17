-- =============================================================================
-- GeoOps — Combined Migration Runner
-- =============================================================================
-- Run all migrations in order against CockroachDB.
-- All statements are idempotent (IF NOT EXISTS) so this script is safe to
-- re-run at any time.
--
-- Usage:
--   cockroach sql --url "$DATABASE_URL" < scripts/migrate.sql
-- =============================================================================


-- =============================================================================
-- 001: Enable PostGIS & Create Users
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(26) PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'ADMIN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);


-- =============================================================================
-- 002: Create Workers
-- =============================================================================

CREATE TABLE IF NOT EXISTS workers (
  id VARCHAR(26) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(100) NOT NULL,
  team VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workers_name ON workers(name);
CREATE INDEX IF NOT EXISTS idx_workers_team ON workers(team);
CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);


-- =============================================================================
-- 003: Create Geofences
-- =============================================================================

CREATE TABLE IF NOT EXISTS geofences (
  id VARCHAR(26) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  zone_type VARCHAR(20) NOT NULL CHECK (zone_type IN ('RESTRICTED', 'WORK_ZONE', 'SAFETY', 'CUSTOM')),
  polygon GEOMETRY(POLYGON, 4326) NOT NULL,
  color VARCHAR(7) DEFAULT '#ef4444',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geofences_polygon ON geofences USING GIST(polygon);
CREATE INDEX IF NOT EXISTS idx_geofences_active ON geofences(is_active);
CREATE INDEX IF NOT EXISTS idx_geofences_zone_type ON geofences(zone_type);


-- =============================================================================
-- 004: Create Geo Events
-- =============================================================================

CREATE TABLE IF NOT EXISTS geo_events (
  id VARCHAR(26) PRIMARY KEY,
  worker_id VARCHAR(26) NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  geofence_id VARCHAR(26) NOT NULL REFERENCES geofences(id) ON DELETE CASCADE,
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('ENTERED', 'EXITED', 'BREACH')),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geo_events_worker ON geo_events(worker_id);
CREATE INDEX IF NOT EXISTS idx_geo_events_geofence ON geo_events(geofence_id);
CREATE INDEX IF NOT EXISTS idx_geo_events_type ON geo_events(event_type);
CREATE INDEX IF NOT EXISTS idx_geo_events_detected ON geo_events(detected_at DESC);


-- =============================================================================
-- Migration complete ✓
-- =============================================================================
