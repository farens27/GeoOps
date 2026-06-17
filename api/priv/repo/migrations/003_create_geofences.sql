-- Migration: 003_create_geofences
-- Description: Create geofences table with PostGIS polygon geometry
-- Created: 2026-06-17

CREATE TABLE IF NOT EXISTS geofences (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  zone_type VARCHAR(20) NOT NULL CHECK (zone_type IN ('RESTRICTED', 'WORK_ZONE', 'SAFETY', 'CUSTOM')),
  polygon_coords JSONB NOT NULL,
  color VARCHAR(7) DEFAULT '#ef4444',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- CREATE INDEX IF NOT EXISTS idx_geofences_polygon ON geofences USING GIST(polygon_coords);
CREATE INDEX IF NOT EXISTS idx_geofences_active ON geofences(is_active);
CREATE INDEX IF NOT EXISTS idx_geofences_zone_type ON geofences(zone_type);
