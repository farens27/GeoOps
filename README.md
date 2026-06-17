# GeoOps — Field Operations Command Center

Real-time GPS tracking, geofence management, and breach alerts for field
workforce operations. Built for dispatchers who need live visibility and
instant notifications when workers enter, exit, or breach restricted zones.

---

## Tech Stack

| Layer            | Technology                      | Hosting            |
| ---------------- | ------------------------------- | ------------------ |
| **Backend API**  | Elixir + Phoenix                | Gigalixir          |
| **Frontend**     | SolidStart + Solid.js           | Cloudflare Pages   |
| **Database**     | CockroachDB Cloud (PostGIS)     | CockroachDB Cloud  |
| **Real-time**    | Phoenix.PubSub + ETS            | (in-process)       |
| **Maps**         | Leaflet + OpenStreetMap          | (client-side)      |
| **Auth**         | JWT via Guardian                | (in-process)       |
| **IDs**          | ULID                           | (generated)        |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Pages                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  SolidStart SPA                                       │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  │  │
│  │  │  Dashboard   │  │  Leaflet Map │  │  Alerts UI  │  │  │
│  │  └─────────────┘  └──────────────┘  └─────────────┘  │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │ WebSocket + REST              │
└─────────────────────────────┼───────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────┐
│                    Gigalixir                                 │
│  ┌──────────────────────────┴────────────────────────────┐  │
│  │  Phoenix API                                          │  │
│  │  ┌──────────┐  ┌───────────┐  ┌────────────────────┐  │  │
│  │  │ Channels │  │ PubSub    │  │ GPS Pipeline       │  │  │
│  │  │ (WS)     │  │ (Erlang)  │  │ Kalman → Geofence  │  │  │
│  │  └──────────┘  └───────────┘  │ → Batch Write      │  │  │
│  │                               └────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  ETS Tables                                      │  │  │
│  │  │  • positions (GPS cache, flush every 60s)        │  │  │
│  │  │  • geofences (refresh from DB every 5 min)       │  │  │
│  │  │  • worker_zones (current zone state per worker)  │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              │                              │
└──────────────────────────────┼──────────────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────┐
│              CockroachDB Cloud (PostGIS)                    │
│  ┌───────────┐ ┌───────────┐ ┌──────────┐ ┌─────────────┐  │
│  │  workers  │ │  zones    │ │ reports  │ │ zone_events │  │
│  └───────────┘ └───────────┘ └──────────┘ └─────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
GeoOps/
├── api/                  # Elixir / Phoenix backend
│   ├── lib/
│   │   ├── geoops/       # Business logic (contexts)
│   │   └── geoops_web/   # HTTP + WebSocket layer
│   └── priv/
│       └── repo/
│           └── migrations/
├── web/                  # SolidStart / Solid.js frontend
├── shared/               # Shared constants & types
├── scripts/              # Dev & deployment scripts
├── docker/               # Docker / Compose configs
└── docs/                 # Documentation & specs
    └── specs/            # Feature specifications
```

---

## Prerequisites

> **TODO** — Fill in exact version requirements after initial setup.

- Elixir ≥ 1.16 + OTP ≥ 26
- Node.js ≥ 20 LTS
- PostgreSQL client tools (for CockroachDB migrations)
- Git

---

## Local Development

> **TODO** — Add step-by-step instructions once both `api/` and `web/` are
> initialized.

```bash
# 1. Clone
git clone <repo-url> && cd GeoOps

# 2. Environment
cp .env.example .env   # then fill in real values

# 3. Backend
cd api
mix deps.get
mix ecto.setup
mix phx.server          # → http://localhost:4000

# 4. Frontend
cd ../web
npm install
npm run dev             # → http://localhost:3000
```

---

## Environment Variables

See [`.env.example`](.env.example) for the full list. Key variables:

| Variable           | Purpose                              |
| ------------------ | ------------------------------------ |
| `DATABASE_URL`     | CockroachDB connection string        |
| `JWT_SECRET`       | HMAC key for Guardian JWT signing    |
| `PHX_HOST`         | Public hostname (Gigalixir)          |
| `SECRET_KEY_BASE`  | Phoenix cookie/session encryption    |
| `FRONTEND_URL`     | Allowed CORS origin (Cloudflare)     |

---

## Deployment

> **TODO** — Add CI/CD pipeline details.

### Backend → Gigalixir

```bash
# TODO: Add Gigalixir deployment steps
```

### Frontend → Cloudflare Pages

```bash
# TODO: Add Cloudflare Pages deployment steps
```

---

## License

MIT — see [LICENSE](LICENSE) for details.
