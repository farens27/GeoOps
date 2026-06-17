-- Migration: 001_create_users
-- Description: Enable PostGIS and create users table for admin accounts
-- Created: 2026-06-17

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Users table (admin accounts)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'DISPATCHER', 'VIEWER')),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
