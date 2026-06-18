-- Migration: 004_create_geo_events
-- Description: Create geo_events table for geofence enter/exit/breach events
-- Created: 2026-06-17

CREATE TABLE IF NOT EXISTS geo_events (
  id UUID PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES workers(id),
  geofence_id UUID REFERENCES geofences(id),
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('PERIODIC', 'ENTERED', 'EXITED', 'BREACH')),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  detected_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geo_events_worker ON geo_events(worker_id);
CREATE INDEX IF NOT EXISTS idx_geo_events_geofence ON geo_events(geofence_id);
CREATE INDEX IF NOT EXISTS idx_geo_events_time ON geo_events(detected_at);
CREATE INDEX IF NOT EXISTS idx_geo_events_type ON geo_events(event_type);
