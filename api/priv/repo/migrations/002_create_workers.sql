-- Migration: 002_create_workers
-- Description: Create workers table for field workforce tracking
-- Created: 2026-06-17

CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(50),
  team VARCHAR(50),
  phone VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  last_seen TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workers_name ON workers(name);
CREATE INDEX IF NOT EXISTS idx_workers_team ON workers(team);
CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);
