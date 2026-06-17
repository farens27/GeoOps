# GeoOps — Field Operations Command Center

## Task Breakdown Specification

---

## Overview

**GeoOps** is a real-time field workforce management web application. Operations teams can track field workers on a live map, define geofence zones (restricted areas, work zones, safety perimeters), and receive automatic alerts when workers enter or exit zones.

This project is inspired by an Employee Leave Management System spec — it follows the same structural pattern (authentication, dashboard, CRUD modules, status workflows) but replaces leave requests with geo-spatial features: live GPS tracking, geofence polygon management, point-in-polygon detection, and real-time map visualization.

### What Makes This Unique

- **Lua backend** via OpenResty + Lapis (used by Cloudflare and GitHub internally, almost never seen in portfolio projects)
- **Redis Lua scripting** for real-time geofencing calculations
- **CockroachDB + PostGIS** for distributed SQL with spatial extensions
- **SolidStart** (Solid.js) frontend — reactive without virtual DOM, rare meta-framework
- **Leaflet + OpenStreetMap** — free, no API keys needed
- **Built-in GPS simulator** — test everything from your desk without real devices

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | OpenResty (Nginx + LuaJIT) | High-performance web server with embedded Lua |
| Backend Framework | Lapis | Lua web framework for OpenResty |
| Real-time Engine | Redis | Pub/sub for live GPS streaming, GEO commands for spatial ops |
| Geofence Logic | Lua scripts in Redis | Point-in-polygon checks, proximity alerts |
| Database | CockroachDB Serverless | Distributed SQL (PostgreSQL-compatible) |
| Spatial Extension | PostGIS | Polygon storage, spatial indexes, intersection queries |
| Frontend | SolidStart (Solid.js) | Reactive UI without virtual DOM |
| Map Engine | Leaflet + Leaflet.Draw | Interactive maps, markers, polygon drawing, layers |
| Map Tiles | OpenStreetMap | Free map tiles, no API key required |
| Styling | Panda CSS | Type-safe design tokens, zero-runtime |
| Authentication | JWT (custom Lua middleware) | Stateless auth with httpOnly cookies |
| Database Driver | lua-resty-postgres | PostgreSQL driver for OpenResty |
| Deployment | Alwaysdata | Native Lua hosting, 1 GB free, no credit card |
| Database Hosting | CockroachDB Cloud | Managed distributed SQL (free tier) |

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

## Data Model

### Users Table

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() |
| username | VARCHAR(50) | NOT NULL, UNIQUE |
| password_hash | VARCHAR(255) | NOT NULL |
| role | VARCHAR(20) | NOT NULL, DEFAULT 'ADMIN' |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

### Workers Table

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() |
| name | VARCHAR(100) | NOT NULL |
| role | VARCHAR(100) | NOT NULL |
| team | VARCHAR(100) | NOT NULL |
| phone | VARCHAR(20) | |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'ACTIVE', CHECK (IN ('ACTIVE','INACTIVE')) |
| latitude | DOUBLE PRECISION | |
| longitude | DOUBLE PRECISION | |
| last_seen | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

### Geofences Table

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() |
| name | VARCHAR(100) | NOT NULL |
| description | TEXT | |
| zone_type | VARCHAR(20) | NOT NULL, CHECK (IN ('RESTRICTED','WORK_ZONE','SAFETY','CUSTOM')) |
| polygon | GEOMETRY(POLYGON, 4326) | NOT NULL |
| color | VARCHAR(7) | DEFAULT '#ff0000' |
| is_active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

### Geo Events Table (Geofence breach log)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() |
| worker_id | UUID | NOT NULL, REFERENCES workers(id) |
| geofence_id | UUID | NOT NULL, REFERENCES geofences(id) |
| event_type | VARCHAR(20) | NOT NULL, CHECK (IN ('ENTERED','EXITED','BREACH')) |
| latitude | DOUBLE PRECISION | NOT NULL |
| longitude | DOUBLE PRECISION | NOT NULL |
| detected_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

---

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | Login with username + password, returns JWT |
| POST | /api/auth/logout | Clear session |
| GET | /api/auth/me | Get current authenticated user (protected) |

### Workers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/workers | List all workers (?search=, ?status=, ?team=) |
| GET | /api/workers/:id | Get single worker |
| POST | /api/workers | Create worker |
| PUT | /api/workers/:id | Update worker |
| DELETE | /api/workers/:id | Delete worker |
| PATCH | /api/workers/:id/status | Toggle active/inactive |

### Geofences

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/geofences | List all geofences (?active=) |
| GET | /api/geofences/:id | Get single geofence with polygon |
| POST | /api/geofences | Create geofence (polygon coords in body) |
| PUT | /api/geofences/:id | Update geofence |
| DELETE | /api/geofences/:id | Delete geofence |
| PATCH | /api/geofences/:id/toggle | Activate/deactivate geofence |

### GPS & Real-time

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/gps/report | Ingest GPS position (worker_id, lat, lng) |
| WS | /ws/tracker | WebSocket for live GPS position stream |

### Geo Events (Alerts)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/events | List geo events (?worker_id=, ?geofence_id=, ?type=, ?from=, ?to=) |
| GET | /api/events/stats | Aggregated event counts (for dashboard) |

### Dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/dashboard | Aggregate stats (total workers, active, total geofences, breach count) |

---

## Frontend Routes

| Route | Page | Description |
|-------|------|-------------|
| /login | Login | Username + password form |
| /dashboard | Dashboard | Stat cards + mini live map + recent alerts |
| /map | Live Map | Full-screen Leaflet map with all workers and geofences |
| /workers | Worker List | Searchable table of all workers |
| /workers/new | Create Worker | Form: name, role, team, phone |
| /workers/:id/edit | Edit Worker | Pre-filled form |
| /geofences | Geofence List | Table of all geofence zones |
| /geofences/new | Create Geofence | Draw polygon on map + name + type |
| /geofences/:id/edit | Edit Geofence | Modify polygon or properties |
| /alerts | Alert History | Filterable list of all geofence events |
| /simulate | GPS Simulator | Click-to-place, random walk, GPX import |

---

## Folder Structure

```
geoops/
├── api/                              # Lua Lapis backend
│   ├── app.lua                       # Lapis application entry point
│   ├── config.lua                    # Environment configuration
│   ├── models/
│   │   ├── user.lua                  # User model (DB queries)
│   │   ├── worker.lua                # Worker model (DB queries)
│   │   ├── geofence.lua              # Geofence model (PostGIS queries)
│   │   └── geo_event.lua             # Geo event model (DB queries)
│   ├── routes/
│   │   ├── auth.lua                  # Auth endpoints (login/logout/me)
│   │   ├── workers.lua               # Worker CRUD endpoints
│   │   ├── geofences.lua             # Geofence CRUD endpoints
│   │   ├── gps.lua                   # GPS ingestion endpoint
│   │   ├── events.lua                # Geo event endpoints
│   │   └── dashboard.lua             # Dashboard stats endpoint
│   ├── middleware/
│   │   └── auth.lua                  # JWT verification middleware
│   ├── websocket/
│   │   └── tracker.lua              # WebSocket handler for GPS streaming
│   ├── lib/
│   │   ├── db.lua                    # CockroachDB connection (lua-resty-postgres)
│   │   ├── redis.lua                 # Redis connection
│   │   ├── jwt.lua                   # JWT encode/decode utilities
│   │   ├── bcrypt.lua               # Password hashing
│   │   └── geo.lua                   # Geofence logic (Lua scripts for Redis GEO)
│   ├── migrations/
│   │   ├── 001_create_users.sql
│   │   ├── 002_create_workers.sql
│   │   ├── 003_create_geofences.sql
│   │   └── 004_create_geo_events.sql
│   ├── nginx.conf                    # OpenResty/Nginx configuration
│   ├── mime.types                    # MIME types for static serving
│   └── package.json                  # LuaRocks dependencies
│
├── web/                              # SolidStart frontend
│   ├── src/
│   │   ├── app.tsx                   # Root component
│   │   ├── routes/
│   │   │   ├── login.tsx
│   │   │   ├── dashboard.tsx
│   │   │   ├── map.tsx
│   │   │   ├── workers/
│   │   │   │   ├── index.tsx
│   │   │   │   ├── new.tsx
│   │   │   │   └── [id]/
│   │   │   │       └── edit.tsx
│   │   │   ├── geofences/
│   │   │   │   ├── index.tsx
│   │   │   │   ├── new.tsx
│   │   │   │   └── [id]/
│   │   │   │       └── edit.tsx
│   │   │   ├── alerts.tsx
│   │   │   └── simulate.tsx
│   │   ├── components/
│   │   │   ├── navbar.tsx            # Sidebar navigation
│   │   │   ├── auth-guard.tsx        # Route protection
│   │   │   ├── live-map.tsx          # Reusable Leaflet map component
│   │   │   ├── geofence-drawer.tsx   # Polygon drawing wrapper
│   │   │   ├── worker-marker.tsx     # Custom map marker for workers
│   │   │   ├── data-table.tsx        # Reusable table component
│   │   │   ├── form-field.tsx        # Type-safe form input
│   │   │   ├── status-badge.tsx      # Colored badge (ACTIVE/INACTIVE/BREACH)
│   │   │   ├── confirm-dialog.tsx    # Delete confirmation modal
│   │   │   ├── toast.tsx             # Notification toasts
│   │   │   ├── stat-card.tsx         # Dashboard stat card
│   │   │   └── alert-panel.tsx       # Real-time alert feed
│   │   ├── lib/
│   │   │   ├── api-client.ts         # Typed fetch wrapper
│   │   │   ├── auth.ts              # Token management (login/logout/getMe)
│   │   │   ├── websocket.ts          # WebSocket client for GPS stream
│   │   │   └── geo-utils.ts         # GeoJSON helpers, distance calc
│   │   └── styles/
│   │       └── global.css           # Panda CSS entry point
│   ├── app.config.ts
│   ├── package.json
│   └── tsconfig.json
│
├── shared/                           # Shared config & constants
│   ├── constants.lua                 # Shared enums/statuses (Lua)
│   └── constants.ts                 # Shared enums/statuses (TypeScript)
│
├── scripts/
│   ├── seed.lua                      # Seed admin user + sample data
│   └── seed-geo.lua                  # Seed workers + geofences + events
│
├── docker/
│   └── Dockerfile                    # Multi-stage: build frontend + OpenResty
│
├── .alwaysdata/                     # Alwaysdata deployment config (optional)
├── .env.example                      # Environment variable template
├── docker-compose.yml                 # Local dev: OpenResty + Redis + CockroachDB
├── turbo.json                        # Turborepo config (optional)
└── README.md                         # Setup guide, architecture overview
```

---

## Task Breakdown

---

# Module 1 — Project Setup

---

### Task 1.1: Initialize Monorepo Structure

**Description:** Create the monorepo directory structure with `api/`, `web/`, `shared/`, `scripts/`, and `docker/` folders. Initialize version control with a `.gitignore`.

**Acceptance Criteria:**
- [ ] All directories exist as defined in the folder structure
- [ ] `.gitignore` covers node_modules, .env, build artifacts, LuaRocks
- [ ] `README.md` exists with project title and brief description

**Files to create:**
- `geoops/` root directory
- `api/`, `web/`, `shared/`, `scripts/`, `docker/`
- `.gitignore`
- `README.md`

**Dependencies:** None

---

### Task 1.2: Set Up OpenResty + Lapis Backend

**Description:** Install OpenResty (or use a Docker image), set up the Lapis framework, configure the basic application shell with health check endpoint.

**Acceptance Criteria:**
- [ ] OpenResty runs locally (via Docker or native install)
- [ ] Lapis responds to `GET /api/health` with `{ status: "ok" }`
- [ ] LuaRocks dependencies are defined in a config file
- [ ] Hot-reload works in development mode

**Files to create:**
- `api/app.lua` (Lapis entry point)
- `api/config.lua` (environment config: dev/test/prod)
- `api/nginx.conf` (OpenResty config with WebSocket support)
- `api/package.json` or `api/rockspec` (LuaRocks dependencies: lapis, lua-resty-postgres, lua-resty-redis, luajwt, bcrypt)

**Dependencies:** None

---

### Task 1.3: Set Up SolidStart Frontend

**Description:** Initialize SolidStart project in the `web/` directory. Configure Panda CSS, install Leaflet dependencies. Set up proxy configuration to forward `/api` and `/ws` requests to the Lapis backend.

**Acceptance Criteria:**
- [ ] `pnpm dev` (or `npm run dev`) starts the SolidStart dev server
- [ ] `/` renders a basic page with the app title "GeoOps"
- [ ] Panda CSS is configured and generates type-safe styles
- [ ] API proxy forwards `/api/*` and `/ws/*` to `http://localhost:8080`
- [ ] Leaflet renders a basic map on a test page

**Files to create:**
- `web/` (SolidStart project via `npx solid-cli init`)
- `web/src/app.tsx`
- `web/src/styles/global.css` (Panda CSS entry)
- `web/app.config.ts` (SolidStart config with API proxy)
- `web/package.json` (dependencies: solid-start, leaflet, leaflet-draw, panda-css)

**Dependencies:** None (can run in parallel with Task 1.2)

---

### Task 1.4: Create CockroachDB Cluster + PostGIS Extension

**Description:** Set up a CockroachDB Serverless cluster on CockroachDB Cloud (free tier). Enable the PostGIS extension. Create the initial database `geoops`. Save connection details to `.env`.

**Acceptance Criteria:**
- [ ] CockroachDB Serverless cluster is running on CockroachDB Cloud
- [ ] PostGIS extension is enabled: `CREATE EXTENSION IF NOT EXISTS postgis;`
- [ ] Database `geoops` exists
- [ ] Connection string works from local machine
- [ ] `.env.example` documents all required environment variables
- [ ] `.env` is created locally with actual credentials (gitignored)

**Files to create:**
- `.env.example`
- `.env` (local, gitignored)

**Dependencies:** None

---

### Task 1.5: Set Up Redis + Database Connection Libraries

**Description:** Set up a local Redis instance (via Docker). Write the connection wrapper libraries for both Redis and CockroachDB in Lua. Verify connections work end-to-end.

**Acceptance Criteria:**
- [ ] Redis runs locally via Docker
- [ ] `api/lib/db.lua` can connect to CockroachDB and execute a test query
- [ ] `api/lib/redis.lua` can connect to Redis and execute SET/GET
- [ ] `docker-compose.yml` starts both Redis and a local CockroachDB (for dev without cloud)
- [ ] Connection pool configuration (min/max connections) is in `config.lua`

**Files to create:**
- `api/lib/db.lua` (CockroachDB connection via lua-resty-postgres)
- `api/lib/redis.lua` (Redis connection via lua-resty-redis)
- `docker-compose.yml` (Redis + local CockroachDB services)

**Dependencies:** Task 1.2, Task 1.4

---

# Module 2 — Authentication

---

### Task 2.1: Create Users Table + Seed Admin User

**Description:** Create the `users` table migration. Write a seed script that creates the default admin user with a bcrypt-hashed password.

**Acceptance Criteria:**
- [ ] `users` table exists with columns: id, username, password_hash, role, created_at
- [ ] Migration `001_create_users.sql` is idempotent
- [ ] Seed script creates admin user: username=`admin`, password=`admin123`
- [ ] Password is bcrypt hashed (not plaintext)
- [ ] Script can be run with: `lua scripts/seed.lua`

**Files to create:**
- `api/migrations/001_create_users.sql`
- `scripts/seed.lua`
- `api/lib/bcrypt.lua` (bcrypt wrapper or library config)

**Dependencies:** Task 1.5

---

### Task 2.2: Implement JWT Login/Logout API (Lua)

**Description:** Build the authentication endpoints: `POST /api/auth/login` validates credentials, generates a JWT, and sets it in an httpOnly cookie. `POST /api/auth/logout` clears the cookie. `GET /api/auth/me` returns the current user from the JWT.

**Acceptance Criteria:**
- [ ] `POST /api/auth/login` with valid credentials returns 200 with user data and sets JWT cookie
- [ ] `POST /api/auth/login` with invalid credentials returns 401
- [ ] `POST /api/auth/logout` returns 200 and clears the cookie
- [ ] `GET /api/auth/me` returns 200 with current user data when valid JWT is present
- [ ] `GET /api/auth/me` returns 401 when no JWT or expired JWT
- [ ] JWT contains: user_id, username, role
- [ ] JWT expires in 24 hours
- [ ] Cookie is httpOnly and secure (in production)

**Files to create:**
- `api/routes/auth.lua`
- `api/lib/jwt.lua` (JWT encode/decode using luajwt or similar)

**Dependencies:** Task 2.1

---

### Task 2.3: Implement Auth Middleware (Lua)

**Description:** Create a reusable OpenResty middleware that intercepts requests to protected routes, extracts the JWT from the cookie, validates it, and attaches the user info to the request context. If invalid, return 401.

**Acceptance Criteria:**
- [ ] Middleware reads JWT from httpOnly cookie
- [ ] Valid token → request continues with `ngx.ctx.user` populated
- [ ] Invalid/missing/expired token → returns 401 JSON response
- [ ] Middleware can be applied per-route (not global)
- [ ] Exempt routes: `/api/auth/login`, `/api/health`, `/ws/*`

**Files to create:**
- `api/middleware/auth.lua`

**Dependencies:** Task 2.2

---

### Task 2.4: Build Login Page (SolidStart)

**Description:** Create the login page at `/login` with username and password fields. On successful login, redirect to `/dashboard`. On failure, show an error message. If already authenticated, redirect to `/dashboard`.

**Acceptance Criteria:**
- [ ] `/login` renders a centered login form with username and password fields
- [ ] Submitting valid credentials redirects to `/dashboard`
- [ ] Submitting invalid credentials shows "Invalid username or password" error
- [ ] Password field is type="password"
- [ ] If user is already logged in (has valid JWT), redirect to `/dashboard`
- [ ] Form has basic validation (both fields required)
- [ ] Page is styled with Panda CSS (clean, modern look)

**Files to create:**
- `web/src/routes/login.tsx`
- `web/src/lib/auth.ts` (login, logout, getToken, getMe functions)
- `web/src/lib/api-client.ts` (typed fetch wrapper)

**Dependencies:** Task 2.2, Task 1.3

---

# Module 3 — Worker Management

---

### Task 3.1: Create Workers Table

**Description:** Create the `workers` table migration with all columns including latitude/longitude for GPS positions and last_seen timestamp.

**Acceptance Criteria:**
- [ ] `workers` table exists with columns: id, name, role, team, phone, status, latitude, longitude, last_seen, created_at, updated_at
- [ ] `status` column has CHECK constraint: only 'ACTIVE' or 'INACTIVE'
- [ ] Migration `002_create_workers.sql` is idempotent
- [ ] Index on `name` for search performance
- [ ] Index on `team` for filtering

**Files to create:**
- `api/migrations/002_create_workers.sql`

**Dependencies:** Task 1.5

---

### Task 3.2: Worker CRUD API Endpoints

**Description:** Implement all worker REST API endpoints: list (with search, status, team filters), get by ID, create, update, delete, and toggle status.

**Acceptance Criteria:**
- [ ] `GET /api/workers` returns all workers (supports `?search=`, `?status=`, `?team=` query params)
- [ ] `GET /api/workers/:id` returns a single worker or 404
- [ ] `POST /api/workers` creates a worker with validation (name required, min 3 chars)
- [ ] `PUT /api/workers/:id` updates worker fields
- [ ] `DELETE /api/workers/:id` soft-deletes or hard-deletes (returns 204)
- [ ] `PATCH /api/workers/:id/status` toggles ACTIVE/INACTIVE
- [ ] All endpoints (except list/get) are protected by auth middleware
- [ ] Input validation: name (required, min 3 chars), role (required), team (required)
- [ ] Error responses are consistent JSON format: `{ error: "message" }`

**Files to create:**
- `api/models/worker.lua`
- `api/routes/workers.lua`

**Dependencies:** Task 3.1, Task 2.3

---

### Task 3.3: Worker List Page

**Description:** Build the worker list page at `/workers` with a searchable, filterable data table. Show name, role, team, status, and last known location. Include actions: edit, delete, toggle status.

**Acceptance Criteria:**
- [ ] `/workers` displays a table of all workers
- [ ] Search input filters workers by name (debounced, 300ms)
- [ ] Dropdown filter by team
- [ ] Dropdown filter by status (All / Active / Inactive)
- [ ] Each row has: name, role, team, status badge, last seen, actions
- [ ] Actions: Edit (link), Delete (with confirmation dialog), Status toggle
- [ ] "Add Worker" button links to `/workers/new`
- [ ] Empty state message when no workers found
- [ ] Responsive: table scrolls horizontally on mobile

**Files to create:**
- `web/src/routes/workers/index.tsx`
- `web/src/components/data-table.tsx`
- `web/src/components/status-badge.tsx`
- `web/src/components/confirm-dialog.tsx`

**Dependencies:** Task 3.2, Task 2.4

---

### Task 3.4: Create & Edit Worker Forms

**Description:** Build the create worker page (`/workers/new`) and edit worker page (`/workers/:id/edit`). Both share a common form component with fields: name, role, team, phone. Edit page pre-fills existing data.

**Acceptance Criteria:**
- [ ] `/workers/new` renders a form with fields: name, role, team, phone
- [ ] Name field has min-length validation (3 characters)
- [ ] Role and team are required
- [ ] Phone is optional
- [ ] Submit creates a worker and redirects to `/workers`
- [ ] Validation errors display inline below each field
- [ ] `/workers/:id/edit` loads existing worker data and pre-fills the form
- [ ] Submit on edit updates the worker and redirects to `/workers`
- [ ] Cancel button returns to `/workers` without saving
- [ ] Loading state while fetching worker data (edit page)
- [ ] Success toast on create/update

**Files to create:**
- `web/src/routes/workers/new.tsx`
- `web/src/routes/workers/[id]/edit.tsx`
- `web/src/components/form-field.tsx`
- `web/src/components/toast.tsx`

**Dependencies:** Task 3.3

---

### Task 3.5: Worker Status Toggle

**Description:** Add a quick status toggle button on the worker list page. Clicking it calls the toggle API and updates the UI optimistically.

**Acceptance Criteria:**
- [ ] Status badge on worker list is clickable
- [ ] Clicking toggles between ACTIVE (green) and INACTIVE (gray)
- [ ] UI updates optimistically (no waiting for API response)
- [ ] If API fails, reverts to previous status with error toast
- [ ] Toggle is protected (only authenticated admins can toggle)

**Files to modify:**
- `web/src/routes/workers/index.tsx` (add toggle handler)
- `web/src/components/status-badge.tsx` (make clickable)

**Dependencies:** Task 3.3

---

# Module 4 — Live Map & GPS Tracking

---

### Task 4.1: WebSocket Server (Lua + OpenResty)

**Description:** Implement a WebSocket server endpoint at `/ws/tracker` using OpenResty's `lua-resty-websocket`. Connected clients receive real-time GPS position updates for all active workers via Redis pub/sub.

**Acceptance Criteria:**
- [ ] Clients can connect to `ws://localhost:8080/ws/tracker`
- [ ] Server subscribes to Redis channel `geoops:gps` on connect
- [ ] When a GPS update is published to Redis, all connected WebSocket clients receive it
- [ ] Message format: `{ workerId, name, latitude, longitude, timestamp }`
- [ ] Server handles client disconnect gracefully (unsubscribes from Redis)
- [ ] Multiple clients can connect simultaneously

**Files to create:**
- `api/websocket/tracker.lua`
- `nginx.conf` update (WebSocket upgrade configuration)

**Dependencies:** Task 1.5, Task 3.1

---

### Task 4.2: GPS Position Ingestion Endpoint

**Description:** Build the `POST /api/gps/report` endpoint that accepts a worker's GPS coordinates, stores the latest position in the workers table, publishes to Redis for WebSocket broadcast, and checks for geofence boundary crossings.

**Acceptance Criteria:**
- [ ] `POST /api/gps/report` accepts JSON: `{ workerId, latitude, longitude }`
- [ ] Updates the worker's `latitude`, `longitude`, `last_seen` in the database
- [ ] Publishes position to Redis channel `geoops:gps`
- [ ] Returns 200 with the stored position
- [ ] Validates: latitude (-90 to 90), longitude (-180 to 180), workerId exists
- [ ] Returns 404 if worker not found
- [ ] Protected by auth middleware
- [ ] Processes in under 50ms (benchmarked)

**Files to create:**
- `api/routes/gps.lua`

**Dependencies:** Task 4.1, Task 3.1

---

### Task 4.3: Live Map Page (Leaflet)

**Description:** Build the full-screen live map page at `/map`. Display all active workers as markers on the map. Markers update in real-time via WebSocket. Include worker popups with name, role, team, and last seen time.

**Acceptance Criteria:**
- [ ] `/map` renders a full-screen Leaflet map (fills viewport below navbar)
- [ ] All active workers appear as colored markers on the map
- [ ] Each marker has a popup: worker name, role, team, last seen time
- [ ] Markers move smoothly when position updates arrive via WebSocket
- [ ] Map auto-fits to show all workers on initial load
- [ ] Clicking a marker highlights it and shows details
- [ ] OpenStreetMap tiles load correctly (no API key needed)
- [ ] Map controls: zoom in/out, layer toggle (street/satellite)
- [ ] Workers with no GPS position show a "No location" state

**Files to create:**
- `web/src/routes/map.tsx`
- `web/src/components/live-map.tsx`
- `web/src/components/worker-marker.tsx`
- `web/src/lib/websocket.ts`

**Dependencies:** Task 4.2, Task 3.3

---

### Task 4.4: Worker Location Real-time Updates

**Description:** Connect the WebSocket client to the SolidStart frontend. When GPS positions arrive, update the map markers and the workers' last_seen timestamps across the application without page refresh.

**Acceptance Criteria:**
- [ ] WebSocket connects on app initialization (after auth)
- [ ] Reconnects automatically on disconnect (exponential backoff: 1s, 2s, 4s, max 30s)
- [ ] Incoming GPS updates update map markers in real-time
- [ ] Worker list page shows updated "last seen" without refresh
- [ ] Dashboard stats reflect current active worker count
- [ ] Connection status indicator (green dot = connected, red = disconnected)
- [ ] No memory leaks (old positions cleaned up after 24h)

**Files to modify:**
- `web/src/lib/websocket.ts` (add reconnect logic)
- `web/src/components/live-map.tsx` (integrate WebSocket)
- `web/src/components/navbar.tsx` (add connection indicator)

**Dependencies:** Task 4.3

---

### Task 4.5: Map Controls & Layers

**Description:** Add map layer controls, a worker filter panel, and a geofence overlay toggle to the live map page. Users can filter which workers appear and toggle geofence zone visibility.

**Acceptance Criteria:**
- [ ] Layer control to switch between OpenStreetMap and satellite view
- [ ] Geofence zones render as semi-transparent polygons on the map (from geofences API)
- [ ] Toggle to show/hide geofence overlays
- [ ] Worker filter: show all / filter by team / filter by status
- [ ] Click on a geofence polygon shows its name and type
- [ ] Different colors for different geofence types (RESTRICTED=red, WORK_ZONE=blue, SAFETY=yellow, CUSTOM=purple)
- [ ] Map legend in corner showing marker/zone colors

**Files to modify:**
- `web/src/routes/map.tsx` (add layer controls)
- `web/src/components/live-map.tsx` (add geofence overlay + filters)
- `web/src/components/geofence-drawer.tsx` (geofence overlay logic)

**Dependencies:** Task 4.3, Task 5.3

---

# Module 5 — Geofence Management

---

### Task 5.1: Create Geofences Table (PostGIS)

**Description:** Create the `geofences` table with a PostGIS polygon column and spatial index. Also create the `geo_events` table for logging geofence breach events.

**Acceptance Criteria:**
- [ ] `geofences` table exists with columns: id, name, description, zone_type, polygon (GEOMETRY), color, is_active, created_at, updated_at
- [ ] `zone_type` CHECK constraint: RESTRICTED, WORK_ZONE, SAFETY, CUSTOM
- [ ] PostGIS spatial index on `polygon` column: `CREATE INDEX idx_geofences_polygon ON geofences USING GIST(polygon);`
- [ ] `geo_events` table exists with columns: id, worker_id, geofence_id, event_type, latitude, longitude, detected_at
- [ ] `event_type` CHECK constraint: ENTERED, EXITED, BREACH
- [ ] Foreign keys: worker_id → workers(id), geofence_id → geofences(id)
- [ ] Migrations are idempotent

**Files to create:**
- `api/migrations/003_create_geofences.sql`
- `api/migrations/004_create_geo_events.sql`

**Dependencies:** Task 1.5, Task 1.4 (PostGIS enabled)

---

### Task 5.2: Geofence CRUD API

**Description:** Implement geofence REST API endpoints. Create and update accept polygon coordinates as arrays of `[lat, lng]` pairs which are converted to PostGIS polygons.

**Acceptance Criteria:**
- [ ] `GET /api/geofences` returns all geofences with polygon GeoJSON
- [ ] `GET /api/geofences/:id` returns single geofence with full polygon data
- [ ] `POST /api/geofences` accepts: name, description, zone_type, coordinates (array of [lat,lng]), color
- [ ] `POST /api/geofences` converts coordinates array to PostGIS POLYGON using `ST_GeomFromText`
- [ ] `PUT /api/geofences/:id` updates all fields including polygon
- [ ] `DELETE /api/geofences/:id` removes geofence and its events
- [ ] `PATCH /api/geofences/:id/toggle` activates/deactivates a geofence
- [ ] Validation: polygon must have at least 3 points, name required, zone_type required
- [ ] All endpoints protected by auth middleware

**Files to create:**
- `api/models/geofence.lua`
- `api/routes/geofences.lua`

**Dependencies:** Task 5.1, Task 2.3

---

### Task 5.3: Polygon Drawing on Map (Leaflet.Draw)

**Description:** Build the geofence creation page at `/geofences/new` with a Leaflet map that includes Leaflet.Draw tools. User draws a polygon on the map, fills in the geofence details, and submits.

**Acceptance Criteria:**
- [ ] `/geofences/new` renders a map taking up most of the page
- [ ] Leaflet.Draw toolbar is visible on the map (polygon drawing tool)
- [ ] User can draw a polygon by clicking points on the map
- [ ] Polygon is displayed with a colored fill based on selected zone_type
- [ ] Form fields: name (required), description, zone_type (dropdown), color picker
- [ ] Zone_type color mapping: RESTRICTED=red, WORK_ZONE=blue, SAFETY=yellow, CUSTOM=purple
- [ ] Submit button sends polygon coordinates + form data to API
- [ ] Cancel button returns to `/geofences`
- [ ] Validation: polygon must be drawn before submit, name required
- [ ] Error messages display inline

**Files to create:**
- `web/src/routes/geofences/new.tsx`
- `web/src/components/geofence-drawer.tsx`

**Dependencies:** Task 5.2, Task 4.3

---

### Task 5.4: Point-in-Polygon Geofence Detection

**Description:** Implement geofence boundary crossing detection. When a GPS position is reported, check if the worker has entered or exited any active geofence using PostGIS `ST_Contains` or `ST_Intersects`. Create geo_events for each crossing.

**Acceptance Criteria:**
- [ ] Every `POST /api/gps/report` triggers a geofence check for the worker
- [ ] Query uses PostGIS: `SELECT * FROM geofences WHERE is_active = true AND ST_Contains(polygon, ST_Point(lat, lng))`
- [ ] Worker's previous geofence state is tracked (which zones they were inside)
- [ ] ENTERED event: worker was outside zone, now inside
- [ ] EXITED event: worker was inside zone, now outside
- [ ] BREACH event: worker entered a RESTRICTED zone (auto-generated from ENTERED + RESTRICTED type)
- [ ] Event is written to `geo_events` table with worker_id, geofence_id, event_type, coordinates, timestamp
- [ ] Event is published to Redis channel `geoops:alerts` for real-time notification
- [ ] Performance: geofence check adds less than 20ms to GPS ingestion

**Files to create/modify:**
- `api/lib/geo.lua` (geofence detection logic)
- `api/models/geo_event.lua`
- `api/routes/gps.lua` (integrate geofence check after position update)

**Dependencies:** Task 5.1, Task 4.2

---

### Task 5.5: Geofence List & Edit Pages

**Description:** Build the geofence list page at `/geofences` showing all zones in a table with a mini map preview. Build the edit page at `/geofences/:id/edit` to modify polygon or properties.

**Acceptance Criteria:**
- [ ] `/geofences` displays a table: name, type, color, status, created date, actions
- [ ] Each row has a small preview thumbnail of the polygon
- [ ] Filter by zone_type and active/inactive status
- [ ] Actions: Edit, Delete (with confirmation), Toggle active
- [ ] "Create Geofence" button links to `/geofences/new`
- [ ] `/geofences/:id/edit` loads the geofence and shows polygon on a map
- [ ] Polygon can be redrawn or edited vertex-by-vertex
- [ ] Properties (name, type, color) can be modified
- [ ] Save updates the geofence and redirects to `/geofences`
- [ ] Delete removes geofence and all associated events

**Files to create:**
- `web/src/routes/geofences/index.tsx`
- `web/src/routes/geofences/[id]/edit.tsx`

**Dependencies:** Task 5.2, Task 5.3

---

# Module 6 — Dashboard & Alerts

---

### Task 6.1: Dashboard API (Aggregate Stats)

**Description:** Build the `GET /api/dashboard` endpoint that returns aggregate statistics: total workers, active workers, total geofences, breach count in last 24h, recent geo events.

**Acceptance Criteria:**
- [ ] `GET /api/dashboard` returns:
  ```json
  {
    "totalWorkers": 50,
    "activeWorkers": 42,
    "inactiveWorkers": 8,
    "totalGeofences": 12,
    "activeGeofences": 10,
    "breaches24h": 3,
    "recentEvents": [...]
  }
  ```
- [ ] `recentEvents` contains the last 10 geo_events with worker name and geofence name joined
- [ ] Stats are computed via SQL aggregation queries (not fetched and counted in Lua)
- [ ] Protected by auth middleware

**Files to create:**
- `api/routes/dashboard.lua`

**Dependencies:** Task 3.2, Task 5.2, Task 5.4

---

### Task 6.2: Dashboard Page

**Description:** Build the dashboard page at `/dashboard` with stat cards, a mini live map showing worker density, and a recent alerts feed.

**Acceptance Criteria:**
- [ ] `/dashboard` displays 6 stat cards in a responsive grid:
  - Total Workers (with icon)
  - Active Workers (with icon)
  - Inactive Workers (with icon)
  - Total Geofences (with icon)
  - Active Geofences (with icon)
  - Breaches (Last 24h) (with icon, red if > 0)
- [ ] Each stat card shows the count with a label and icon
- [ ] Mini map (not full screen) showing worker positions as a cluster
- [ ] Recent alerts feed below stat cards (last 10 geo events)
- [ ] Each alert shows: worker name, geofence name, event type badge, time ago
- [ ] "View All Alerts" button links to `/alerts`
- [ ] Responsive: cards stack on mobile, 3 per row on desktop
- [ ] Data refreshes every 30 seconds (polling) + real-time via WebSocket

**Files to create:**
- `web/src/routes/dashboard.tsx`
- `web/src/components/stat-card.tsx`
- `web/src/components/alert-panel.tsx`

**Dependencies:** Task 6.1, Task 4.4

---

### Task 6.3: Geofence Breach Detection & Alert Creation

**Description:** When a RESTRICTED geofence breach is detected (Task 5.4), create a high-priority alert. Publish the alert to the WebSocket channel so all connected admin clients receive it in real-time.

**Acceptance Criteria:**
- [ ] RESTRICTED zone entry automatically creates a geo_event with type `BREACH`
- [ ] Breach event is published to Redis channel `geoops:alerts`
- [ ] WebSocket handler also subscribes to `geoops:alerts` and forwards to clients
- [ ] Frontend alert panel receives breach alerts in real-time (no refresh)
- [ ] Breach events appear with a red/highlighted style in the alert feed
- [ ] Dashboard breach counter updates in real-time when new breach detected

**Files to modify:**
- `api/lib/geo.lua` (add breach logic)
- `api/websocket/tracker.lua` (subscribe to alerts channel)
- `web/src/components/alert-panel.tsx` (real-time breach display)

**Dependencies:** Task 5.4, Task 6.2

---

### Task 6.4: Alert History Page

**Description:** Build the alert history page at `/alerts` showing all geo events (geofence crossings) with filtering. Allow exporting events as CSV.

**Acceptance Criteria:**
- [ ] `/alerts` displays a table of all geo_events
- [ ] Columns: worker name, geofence name, event type (badge), coordinates, detected at
- [ ] Filters: by worker, by geofence, by event type, by date range
- [ ] Sort by detected_at (newest first by default)
- [ ] Pagination: 20 events per page
- [ ] "Export CSV" button downloads filtered events as CSV file
- [ ] Event type badges: ENTERED=green, EXITED=blue, BREACH=red
- [ ] Responsive table (horizontal scroll on mobile)

**Files to create:**
- `web/src/routes/alerts.tsx`
- `api/routes/events.lua` (GET /api/events with filters + GET /api/events/export for CSV)

**Dependencies:** Task 5.4, Task 3.3

---

# Module 7 — GPS Simulation & Testing

---

### Task 7.1: GPS Simulator Panel (Click-to-Place)

**Description:** Build the simulation page at `/simulate` with a map where admins can click to place workers at specific positions. This simulates GPS reports without real devices.

**Acceptance Criteria:**
- [ ] `/simulate` renders a map with all workers listed in a sidebar panel
- [ ] Admin selects a worker from the sidebar
- [ ] Clicking on the map places the selected worker at that position
- [ ] Click triggers `POST /api/gps/report` for the selected worker
- [ ] Worker marker appears/moves on the map immediately
- [ ] Geofence zones are displayed as overlays
- [ ] If click is inside a geofence, an ENTERED/BREACH event is triggered
- [ ] If click moves worker outside a geofence they were in, EXITED event triggers
- [ ] "Clear All Positions" button resets all workers to no position

**Files to create:**
- `web/src/routes/simulate.tsx`

**Dependencies:** Task 4.3, Task 5.3

---

### Task 7.2: Random Walk Simulation Mode

**Description:** Add a "Random Walk" toggle per worker. When enabled, the worker automatically moves in random directions within a configurable speed and interval, simulating real movement.

**Acceptance Criteria:**
- [ ] Each worker in the simulator panel has a "Simulate" toggle button
- [ ] When toggled on, the worker starts moving randomly:
  - Every 2 seconds (configurable), a small random GPS offset is applied
  - Movement is bounded (stays within the current map view)
  - Default step size: ~0.0001 degrees (~11 meters)
- [ ] Speed slider: slow (5s interval), normal (2s), fast (0.5s)
- [ ] Geofence events fire in real-time as the simulated worker crosses boundaries
- [ ] Multiple workers can simulate simultaneously
- [ ] Toggle off stops the worker's movement
- [ ] Movement is visualized on the map with animated marker transitions

**Files to modify:**
- `web/src/routes/simulate.tsx` (add random walk logic)

**Dependencies:** Task 7.1

---

### Task 7.3: GPX File Import + Path Replay

**Description:** Allow admins to upload a GPX (GPS Exchange) file and assign it to a worker. The worker then follows the recorded path on the map at a configurable speed.

**Acceptance Criteria:**
- [ ] File upload input accepts `.gpx` files
- [ ] GPX parser extracts track points (latitude, longitude, elevation, timestamp)
- [ ] Admin selects which worker to assign the path to
- [ ] "Play" button starts the worker moving along the path
- [ ] Speed control: 1x (real-time), 10x, 50x, 100x
- [ ] Worker marker moves along the path on the map
- [ ] Path is drawn as a line on the map
- [ ] Pause/Resume/Stop controls
- [ ] Geofence events fire as the worker crosses zones during replay
- [ ] "Upload New" button clears the current path and allows new upload

**Files to modify:**
- `web/src/routes/simulate.tsx` (add GPX import + replay UI)
- `web/src/lib/geo-utils.ts` (add GPX parser)

**Dependencies:** Task 7.1

---

### Task 7.4: Seed Data Script

**Description:** Write a comprehensive seed script that populates the database with realistic sample data for development and demo purposes. Includes workers with positions, geofence zones, and historical geo events.

**Acceptance Criteria:**
- [ ] Script creates 50 workers with varied teams (Alpha, Bravo, Charlie, Delta)
- [ ] Script creates 10 geofence zones:
  - 3 RESTRICTED zones (e.g., "Construction Zone A", "Hazardous Area")
  - 4 WORK_ZONE zones (e.g., "Warehouse 1", "Office Campus")
  - 2 SAFETY zones (e.g., "First Aid Station", "Assembly Point")
  - 1 CUSTOM zone
- [ ] 20 workers have GPS positions (spread around the geofence areas)
- [ ] 100 historical geo_events spanning the last 7 days
- [ ] Script is idempotent (safe to run multiple times)
- [ ] Script can be run with: `lua scripts/seed-geo.lua`
- [ ] All polygons use realistic coordinates (not 0,0)

**Files to create:**
- `scripts/seed-geo.lua`

**Dependencies:** Task 5.1, Task 3.1

---

# Module 8 — Deployment

---

### Task 8.1: Dockerfile (OpenResty + Static Build)

**Description:** Create a multi-stage Dockerfile for local development and as a fallback deployment option. Note: Alwaysdata supports native Lua, so Docker is primarily for local `docker-compose` dev and for any container-based deployment platform. The Dockerfile builds the SolidStart frontend and packages it with OpenResty.

**Acceptance Criteria:**
- [ ] Stage 1: Node.js builds the SolidStart app (`pnpm build` → static HTML/CSS/JS in `web/dist/`)
- [ ] Stage 2: OpenResty image copies the static build to `/usr/local/openresty/nginx/html/`
- [ ] OpenResty serves static files on `/` and API/WebSocket on `/api` and `/ws`
- [ ] Final image size is under 150MB
- [ ] Container starts with `openresty` and serves the app on port 8080
- [ ] Environment variables: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`
- [ ] `docker-compose.yml` works for full local dev (OpenResty + Redis + CockroachDB)

**Files to create:**
- `docker/Dockerfile`

**Dependencies:** All previous modules complete

---

### Task 8.2: Deploy to Alwaysdata

**Description:** Deploy the application to Alwaysdata — a hosting platform that natively supports Lua (no Docker needed for the backend), PostgreSQL, and WebSocket. Free tier offers 1 GB storage, SSH access, and requires no credit card. The Lua backend runs natively; the SolidStart frontend is built and served as static files.

**Acceptance Criteria:**
- [ ] Alwaysdata account created (free tier, no credit card required)
- [ ] Lua application uploaded via SSH/SFTP to the Alwaysdata account
- [ ] OpenResty/Lapis application runs natively (Alwaysdata supports Lua officially)
- [ ] PostgreSQL database provisioned on Alwaysdata (with PostGIS extension enabled if available; otherwise connect to CockroachDB Cloud)
- [ ] SolidStart frontend built locally (`pnpm build`) and static files uploaded to Alwaysdata's web root
- [ ] Application is accessible at `https://<account>.alwaysdata.net`
- [ ] WebSocket connections work through Alwaysdata's proxy
- [ ] Environment variables configured via Alwaysdata dashboard or `.env` file (DATABASE_URL, REDIS_URL, JWT_SECRET)
- [ ] Redis runs as external service (Upstash free tier — no CC) or replaced with Alwaysdata's RabbitMQ
- [ ] Health check endpoint (`GET /api/health`) responds

**Files to create:**
- `.alwaysdata/deploy.sh` (deployment script: build frontend, sync via SSH/rsync)
- `.alwaysdata/app.ini` or Alwaysdata dashboard config (site type: Lua/custom)

**Dependencies:** Task 8.1

**Dependencies:** Task 8.1

---

### Task 8.3: README & Environment Documentation

**Description:** Write a comprehensive README with setup instructions, architecture overview, tech stack explanation, and deployment guide.

**Acceptance Criteria:**
- [ ] README.md includes:
  - Project overview and screenshots
  - Tech stack with explanation of why each technology was chosen
  - Prerequisites (Docker, Lua, Node.js, etc.)
  - Local development setup (step-by-step)
  - Environment variables table
  - Database migration instructions
  - Seed data instructions
  - Deployment instructions (Alwaysdata)
  - API endpoint reference
  - Architecture diagram
  - License
- [ ] `.env.example` lists all required environment variables with descriptions
- [ ] All commands are copy-paste ready

**Files to create/modify:**
- `README.md` (update)
- `.env.example` (update)

**Dependencies:** Task 8.2

---

## Summary

| Module | Tasks | Description |
|--------|-------|-------------|
| Module 1 — Project Setup | 1.1 to 1.5 | Monorepo, OpenResty, SolidStart, CockroachDB, Redis |
| Module 2 — Authentication | 2.1 to 2.4 | Users table, JWT login, middleware, login page |
| Module 3 — Worker Management | 3.1 to 3.5 | Workers CRUD, list page, forms, status toggle |
| Module 4 — Live Map & GPS | 4.1 to 4.5 | WebSocket, GPS ingest, live map, real-time updates |
| Module 5 — Geofence Management | 5.1 to 5.5 | PostGIS tables, CRUD, polygon draw, detection, edit |
| Module 6 — Dashboard & Alerts | 6.1 to 6.4 | Stats API, dashboard page, breach alerts, alert history |
| Module 7 — Simulation & Testing | 7.1 to 7.4 | Click-to-place, random walk, GPX replay, seed data |
| Module 8 — Deployment | 8.1 to 8.3 | Dockerfile, Alwaysdata deploy, README |
| **Total** | **35 tasks** | |

---

## Dependency Graph

```
Module 1 (Setup)
  ├── Module 2 (Auth)
  │     └── Module 3 (Workers)
  │           ├── Module 4 (Live Map)
  │           │     └── Module 6 (Dashboard) ← also depends on Module 5
  │           └── Module 7 (Simulation) ← also depends on Module 5
  ├── Module 5 (Geofences)
  │     └── Module 6 (Dashboard)
  └── Module 8 (Deploy) ← depends on ALL modules
```

**Recommended build order:**
1. Module 1 → 2 → 3 (sequential — foundation)
2. Module 5 (parallel with 4, since geofences don't depend on live map)
3. Module 4 → 6 → 7 (sequential — features build on each other)
4. Module 8 (last — deployment)

---

## Acceptance Criteria (Full Application)

The application must:

- [ ] Run successfully via `docker-compose up` (local) or Alwaysdata deploy (production)
- [ ] Admin can log in and access all protected routes
- [ ] Workers can be created, listed, searched, edited, and deleted
- [ ] Live map displays all active workers with real-time position updates
- [ ] Geofence zones can be drawn on the map, saved, and managed
- [ ] Geofence boundary crossings (enter/exit) are detected automatically
- [ ] RESTRICTED zone breaches generate real-time alerts
- [ ] Dashboard shows aggregate statistics with recent alerts
- [ ] Alert history is searchable and exportable as CSV
- [ ] GPS simulation allows testing all features without real devices
- [ ] Application is responsive (desktop + mobile)
- [ ] All data persists in CockroachDB (not Local Storage)
- [ ] WebSocket connections remain stable under normal usage

---

## Comparison: Original Leave System → GeoOps

| Original Spec | GeoOps Equivalent |
|---------------|-------------------|
| Login page (/login) | Login page (/login) |
| Dashboard with 4 stat cards | Dashboard with 6 stat cards + mini map |
| Employee CRUD | Worker CRUD (with GPS fields) |
| Employee list with search | Worker list with search + team filter |
| Leave request CRUD | Geofence zone CRUD (with PostGIS polygons) |
| Leave status: PENDING/APPROVED/REJECTED | Geo event type: ENTERED/EXITED/BREACH |
| Approve/Reject workflow | Automatic detection workflow (PostGIS) |
| Filter leave by status | Filter events by type, worker, geofence, date range |
| Local Storage | CockroachDB (distributed SQL) |
| Next.js + Tailwind + ShadCN | Lua + Lapis + SolidStart + Panda CSS + Leaflet |
| — | Live GPS tracking (WebSocket + Redis) |
| — | Geofence polygon drawing (Leaflet.Draw) |
| — | Real-time breach alerts |
| — | GPS simulation (click-to-place, random walk, GPX replay) |
| — | CSV export of alert history |
| — | PostGIS spatial queries |
| — | Docker + Alwaysdata deployment |
