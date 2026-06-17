# GeoOps — Field Operations Command Center

## Design Document

**Date:** 2026-06-17
**Status:** Approved
**Source Spec:** Mini_Project_Specification_Employee_Leave_System.md

---

## Problem Statement

Companies with field workers (construction, delivery, logistics, security, utilities) need a way to track their workforce on a live map, define safe/approved work zones, and receive automatic alerts when workers enter dangerous areas or leave their assigned zones.

Existing solutions are expensive SaaS products (GPSWOX, Fleetio, Samsara). This project builds a self-hosted, open-source alternative using a genuinely rare and technically interesting tech stack.

---

## Design Goals

1. **Unique tech stack** — Every layer uses something rarely seen in portfolio projects (Lua, OpenResty, CockroachDB, SolidStart, PostGIS)
2. **Real-time** — Live GPS tracking via WebSocket, not polling
3. **Geo-spatial** — Polygon geofences with PostGIS spatial queries, not simple radius checks
4. **Self-contained testing** — Built-in GPS simulator (click-to-place, random walk, GPX replay) — no real devices needed
5. **Deploy anywhere** — Native Lua hosting on Alwaysdata (free, no credit card), CockroachDB free tier

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│              SolidStart Frontend (Browser)                │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │ Live Map │ │Dashboard │ │ Workers  │ │ Geofences  │ │
│  │ (Leaflet)│ │ (Stats)  │ │  (CRUD)  │ │ (Draw/Mgmt)│ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬──────┘ │
│       │            │            │             │          │
│       ▼            ▼            ▼             ▼          │
│  WebSocket      REST API     REST API      REST API     │
│  (GPS stream)   (stats)     (CRUD)        (CRUD)       │
└──────────┬──────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│         Lua Lapis Backend (OpenResty / LuaJIT)          │
│                                                          │
│  ┌───────────┐ ┌───────────┐ ┌────────────────────────┐│
│  │ WebSocket  │ │ REST API  │ │ Lua Geofence Script    ││
│  │ Handler    │ │ Routes    │ │ (point-in-polygon via   ││
│  │ (GPS push) │ │ (CRUD)    │ │  Redis GEO + PostGIS)  ││
│  └─────┬─────┘ └─────┬─────┘ └───────────┬────────────┘│
│        │             │                   │              │
└────────┼─────────────┼───────────────────┼──────────────┘
         │             │                   │
         ▼             ▼                   ▼
┌─────────────┐ ┌─────────────┐   ┌─────────────────────┐
│    Redis     │ │ CockroachDB │   │ CockroachDB         │
│              │ │             │   │                     │
│ • Live GPS   │ │ • users     │   │ • geofences         │
│   positions  │ │ • workers   │   │   (polygon GEOM)   │
│ • Pub/Sub    │ │ • sessions  │   │ • geo_events        │
│ • GEO radius │ │             │   │   (breach log)      │
│ • Lua scripts│ │             │   │ PostGIS spatial     │
└─────────────┘ └─────────────┘   │ indexes             │
                                  └─────────────────────┘
```

---

## Technology Stack & Rationale

| Layer | Technology | Why This Choice |
|-------|-----------|-----------------|
| Web Server | OpenResty (Nginx + LuaJIT) | Used by Cloudflare, GitHub, and Wikimedia for high-concurrency serving. Handles 10K+ WebSocket connections per worker. Rarely used in greenfield projects. |
| Backend Framework | Lapis | The most mature Lua web framework. Targets OpenResty natively. Has routing, CSRF, and active record built in. Almost nobody has this on their resume. |
| Frontend | SolidStart (Solid.js) | Solid.js compiles away the virtual DOM — pure reactive signals, 2-3x faster than React. SolidStart is its meta-framework (like Next.js for React). Niche but production-ready. |
| Styling | Panda CSS | Type-safe CSS-in-JS alternative to Tailwind. Generates only the CSS you actually use. Zero runtime. Rare and modern. |
| Map Engine | Leaflet + Leaflet.Draw | Open-source, no API key, no cost. Leaflet.Draw adds polygon drawing directly on the map. Battle-tested by thousands of projects. |
| Map Tiles | OpenStreetMap | Free global map tiles. No Google Maps API key, no billing, no quotas. |
| Database | CockroachDB Serverless | Distributed SQL database. PostgreSQL wire-compatible. Free tier: 10 GiB storage, 50M request units/month. Survives node failures. |
| Spatial Extension | PostGIS | The gold standard for geospatial data. Polygon storage, spatial indexes (GiST), intersection queries (ST_Contains, ST_Intersects). CockroachDB supports it. |
| Real-time Pub/Sub | Redis | In-memory data store. GEO commands for spatial proximity. Pub/Sub for WebSocket fan-out. Lua scripting for custom geofence logic. |
| Authentication | Custom JWT in Lua | No heavy auth library. Compact JWT encode/decode in Lua. Stateless, httpOnly cookies, 24-hour expiry. |
| Deployment | Alwaysdata | Hosting platform with **native Lua support** (no Docker needed for backend). Free tier: 1 GB storage, SSH/SFTP access, PostgreSQL, no credit card required. One of the few platforms that runs Lua officially. |

---

## Data Model

### users
Stores admin accounts for authentication.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| username | VARCHAR(50) | UNIQUE |
| password_hash | VARCHAR(255) | bcrypt |
| role | VARCHAR(20) | ADMIN only for now |
| created_at | TIMESTAMPTZ | |

### workers
Field workers being tracked. GPS position is the latest reported location.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| name | VARCHAR(100) | |
| role | VARCHAR(100) | Job title (e.g., "Technician") |
| team | VARCHAR(100) | Team assignment (e.g., "Alpha") |
| phone | VARCHAR(20) | Optional |
| status | VARCHAR(20) | ACTIVE or INACTIVE |
| latitude | DOUBLE PRECISION | Latest GPS lat |
| longitude | DOUBLE PRECISION | Latest GPS lng |
| last_seen | TIMESTAMPTZ | Last GPS report time |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### geofences
Defined geographic zones with polygon boundaries. Stored as PostGIS geometry.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| name | VARCHAR(100) | |
| description | TEXT | Optional |
| zone_type | VARCHAR(20) | RESTRICTED, WORK_ZONE, SAFETY, CUSTOM |
| polygon | GEOMETRY(POLYGON, 4326) | PostGIS polygon with spatial index |
| color | VARCHAR(7) | Hex color for map rendering |
| is_active | BOOLEAN | Can toggle on/off |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### geo_events
Log of all geofence crossing events (enter, exit, breach).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| worker_id | UUID | FK → workers |
| geofence_id | UUID | FK → geofences |
| event_type | VARCHAR(20) | ENTERED, EXITED, BREACH |
| latitude | DOUBLE PRECISION | Position at detection |
| longitude | DOUBLE PRECISION | Position at detection |
| detected_at | TIMESTAMPTZ | Auto-generated |

---

## Key Workflows

### 1. GPS Position Report & Geofence Detection

```
Worker device ──POST /api/gps/report──▶ Lua API
                                         │
                                         ├── UPDATE workers SET lat, lng, last_seen
                                         ├── PUBLISH to Redis "geoops:gps"
                                         └── CHECK geofences:
                                               │
                                               ├── SELECT geofences WHERE
                                               │   is_active = true
                                               │   AND ST_Contains(polygon, Point(lat,lng))
                                               │
                                               ├── Compare with previous state:
                                               │   Was inside? Now outside? → EXITED event
                                               │   Was outside? Now inside? → ENTERED event
                                               │   Now inside RESTRICTED?   → BREACH event
                                               │
                                               └── INSERT into geo_events
                                                   PUBLISH to Redis "geoops:alerts"
```

### 2. Real-time WebSocket Streaming

```
Browser ◀───WebSocket──▶ OpenResty
                              │
                              ├── Subscribes to Redis "geoops:gps"
                              ├── Subscribes to Redis "geoops:alerts"
                              └── Forwards messages to all connected clients
```

### 3. Geofence Creation (Polygon Drawing)

```
Browser (Leaflet.Draw) ──POST /api/geofences──▶ Lua API
  { name, zone_type,                                │
    coordinates: [[lat,lng], [lat,lng], ...] }      │
                                                     ▼
                              ST_GeomFromText('POLYGON((...))', 4326)
                              → INSERT INTO geofences
```

---

## Geofence Detection Algorithm

The core geofence check runs on every GPS report:

1. **Fetch previous state**: Redis stores which geofences each worker is currently inside (key: `worker:{id}:geofences`, value: set of geofence IDs)
2. **Query current geofences**: `SELECT id FROM geofences WHERE is_active AND ST_Contains(polygon, ST_SetSRID(ST_Point(lng, lat), 4326))`
3. **Compare**:
   - In Redis but not in query result → worker EXITED those geofences → create EXITED events
   - In query result but not in Redis → worker ENTERED those geofences → create ENTERED events
   - If ENTERED a RESTRICTED zone → also create BREACH event
4. **Update Redis** with new geofence set

This ensures:
- O(n) spatial query per GPS report (n = active geofences, typically < 50)
- No double-events (compares previous vs current state)
- Redis provides instant previous-state lookup

---

## GPS Simulation Design

Three simulation modes, all built into the `/simulate` page:

### Click-to-Place
- Admin selects a worker from sidebar
- Clicks anywhere on the map
- That position is sent as `POST /api/gps/report`
- Geofence detection runs immediately

### Random Walk
- Per-worker toggle
- Timer fires every N seconds (configurable speed)
- Each tick: add random offset to current position (±0.0001° ≈ ±11m)
- Boundary check: clamp to map view bounds
- Each tick triggers GPS report → geofence check

### GPX Replay
- Upload `.gpx` file (XML format)
- Parse `<trkpt lat="..." lon="...">` elements
- Assign to a worker
- Play button starts replay at configurable speed (1x/10x/50x/100x)
- Each point in the track is sent as a GPS report at the replay interval

---

## Deployment Architecture

### Local Development
```
docker-compose.yml
  ├── openresty (port 8080)     → Lua Lapis backend + static frontend
  ├── redis (port 6379)          → Real-time pub/sub
  └── cockroachdb (ports 26257)  → Local PostGIS database (or connect to cloud)
```

### Production (Alwaysdata)
```
Alwaysdata account (free tier, no credit card)
  └── Native Lua runtime (no Docker needed):
        OpenResty/Lapis serves the Lua API + WebSocket + static SolidStart build
        ├── connects to: CockroachDB Cloud (managed, free tier, PostGIS)
        └── connects to: Redis via Upstash (free, no CC) OR Alwaysdata's RabbitMQ
        Accessible at: https://<account>.alwaysdata.net
```

---

## Security Considerations

1. **JWT in httpOnly cookies** — not localStorage (prevents XSS token theft)
2. **bcrypt password hashing** — not plaintext (admin seed uses bcrypt)
3. **Auth middleware on all endpoints** — except login and health check
4. **Input validation** — all API inputs validated (coordinates range, required fields, polygon validity)
5. **SQL parameterized queries** — lua-resty-postgres uses parameterized queries, preventing SQL injection
6. **CORS** — in production, restrict to the deployed domain
7. **Environment variables** — JWT_SECRET, DATABASE_URL, REDIS_URL never committed to git

---

## Performance Targets

| Metric | Target | How |
|--------|--------|-----|
| GPS report latency | < 50ms | OpenResty async I/O + Redis pub/sub |
| Geofence check overhead | < 20ms | PostGIS GiST spatial index |
| WebSocket message delivery | < 100ms | Redis pub/sub fan-out |
| Dashboard page load | < 2s | SolidStart static build + SQL aggregation |
| Live map initial render | < 3s | Leaflet tile loading (OpenStreetMap CDN) |
| Simultaneous WebSocket clients | 100+ | OpenResty handles 10K+ connections per worker |

---

## Future Enhancements (Out of Scope)

- Mobile app (React Native or native) for real worker GPS reporting
- Push notifications (email/SMS) for RESTRICTED zone breaches
- Historical route playback (store all GPS positions, not just latest)
- Multi-admin roles (super admin, team lead, viewer)
- Analytics dashboard (time-in-zone reports, worker coverage heatmaps)
- Integration with external APIs (weather alerts affecting safety zones)
