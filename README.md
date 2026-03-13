# Project Gauss: Mission HUD

**Real-time orbital tracking and space weather monitoring system**

![Gauss Logo](https://files.manuscdn.com/user_upload_by_module/session_file/310519663311974113/dMMVutrvckCFrviE.png)

Project Gauss is a mobile-first mission control HUD for tracking satellites and space weather in real time. It integrates live TLE data from CelesTrak, NOAA SWPC solar flare forecasts, and operator-submitted telemetry to provide a unified risk assessment dashboard.

---

## Features

- 🛰️ **Real Satellite Tracking** — Live TLE feeds from CelesTrak with SGP4 orbital propagation
- ☀️ **Solar Weather Integration** — NOAA SWPC API for solar flare probabilities and geomagnetic storm alerts
- 📊 **Threat Classification** — Automated risk scoring based on orbital state and solar activity
- 🎯 **Orbital Visualizer** — Ground track plotting for top-risk satellites with threat indicators
- 👤 **Operator Registry** — Submit and track custom satellites with manual risk telemetry
- 🔐 **SSO Authentication** — Manus OAuth with session management
- 📝 **Feedback Portal** — User feedback submission with admin view and severity-based notifications
- 🧪 **Full Test Coverage** — 86/87 tests passing (98.9%)

---

## Quick Start

### Prerequisites

- **Node.js** 18+ (20+ recommended)
- **pnpm** 9.12.0+
- **iOS/Android development environment** (for native builds)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd Gauss-Ceres-mobile

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
pnpm db:push

# Start development server
pnpm dev
```

This starts:
- Backend server on port 3000 (configurable via `EXPO_PORT`)
- Metro bundler on port 8081
- Web preview at http://localhost:8081

### Running on Mobile

```bash
# iOS
pnpm ios

# Android
pnpm android

# Scan QR code
pnpm qr
```

---

## Environment Configuration

All environment variables are prefixed with `EXPO_PUBLIC_` for Expo compatibility. See [.env.example](.env.example) for the full list.

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `EXPO_PUBLIC_OAUTH_PORTAL_URL` | Manus OAuth portal URL | `https://oauth.example.com` |
| `EXPO_PUBLIC_OAUTH_SERVER_URL` | OAuth server endpoint | `https://api.example.com` |
| `EXPO_PUBLIC_APP_ID` | Application ID for OAuth | `app_12345` |
| `EXPO_PUBLIC_OWNER_OPEN_ID` | Owner OpenID for notifications | `user_67890` |
| `EXPO_PUBLIC_OWNER_NAME` | Owner display name | `John Doe` |
| `EXPO_PUBLIC_API_BASE_URL` | Backend API base URL | `http://localhost:3000` |
| `DATABASE_URL` | MySQL connection string | `mysql://user:pass@host:3306/db` |
| `BUILT_IN_FORGE_API_URL` | Storage API endpoint | `https://storage.example.com` |
| `BUILT_IN_FORGE_API_KEY` | Storage API key | `sk_...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `EXPO_PORT` | Metro bundler port | `8081` |
| `NODE_ENV` | Environment mode | `development` |

---

## Desktop Integration

Project Gauss exposes a **tRPC API** at `/api/trpc` for desktop client integration.

### Authentication

Desktop clients should use **bearer token authentication**:

1. Obtain a session token via Manus OAuth (see [server/README.md](server/README.md))
2. Include token in HTTP headers:
   ```typescript
   Authorization: Bearer <session_token>
   ```

### API Endpoints

#### Auth Router

```typescript
// Get current user
GET /api/trpc/auth.me

// Logout (clears session)
POST /api/trpc/auth.logout
```

#### Feedback Router

```typescript
// Submit feedback (requires auth)
POST /api/trpc/feedback.submit
{
  category: "BUG" | "FEATURE" | "DATA" | "OTHER",
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  message: string,
  contextRef?: string
}

// List user's feedback
GET /api/trpc/feedback.myList

// List all feedback (admin only)
GET /api/trpc/feedback.adminList

// Resolve feedback (admin only)
POST /api/trpc/feedback.resolve
{
  id: number,
  adminNote?: string
}
```

#### Sessions Router

```typescript
// Start operator session
POST /api/trpc/sessions.start
{
  nodeId: string // default: "JUDITH-M1"
}

// End session with stats
POST /api/trpc/sessions.end
{
  sessionId: number,
  eventsProcessed: number,
  commandsSent: number,
  dangerAcknowledged: number,
  peakThreatPct: number
}

// List user's sessions
GET /api/trpc/sessions.myList
```

### CORS Configuration

For desktop client requests, configure CORS in `server/_core/index.ts`:

```typescript
app.use(cors({
  origin: ['http://localhost:3000', 'https://your-desktop-app.com'],
  credentials: true
}));
```

### Example Desktop Client (TypeScript)

```typescript
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server/routers';

const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/api/trpc',
      headers: {
        Authorization: `Bearer ${sessionToken}`
      }
    })
  ]
});

// Usage
const user = await client.auth.me.query();
const feedback = await client.feedback.myList.query();
```

### Real-Time Data (Future)

Currently, satellite telemetry and solar weather data are computed client-side. For desktop integration with live streaming:

**Option 1: Polling**
```typescript
// Poll every 5 seconds
setInterval(async () => {
  const sessions = await client.sessions.myList.query();
}, 5000);
```

**Option 2: WebSocket (Not Yet Implemented)**

A future enhancement will add Server-Sent Events or WebSocket endpoint at `/api/telemetry/stream` for real-time satellite position updates.

---

## Project Structure

```
Gauss-Ceres-mobile/
├── app/                    # Expo Router screens
│   ├── (tabs)/            # Tab navigation
│   │   ├── index.tsx      # HUD screen (satellite tracking)
│   │   ├── operator.tsx   # Operator satellite registry
│   │   └── feedback.tsx   # Feedback portal
│   ├── login.tsx          # SSO login screen
│   └── oauth/             # OAuth callback handlers
├── components/            # React components
├── lib/                   # Client utilities
│   ├── satellite-service.ts    # TLE fetching + SGP4 propagation
│   ├── solar-weather-service.ts # NOAA SWPC integration
│   ├── data-parser.ts     # Binary-packed data cache
│   └── trpc.ts            # tRPC client configuration
├── server/                # Backend
│   ├── routers.ts         # tRPC API routes
│   ├── db.ts              # Database query helpers
│   ├── storage.ts         # S3 storage utilities
│   └── _core/             # Framework internals (don't modify)
├── drizzle/               # Database schema
│   ├── schema.ts          # Table definitions
│   ├── relations.ts       # Foreign key relations
│   └── migrations/        # Auto-generated SQL migrations
├── shared/                # Shared types and constants
├── hooks/                 # React hooks
├── constants/             # App configuration
├── __tests__/            # Vitest tests
└── scripts/              # Build/dev scripts
```

---

## Database Schema

Project Gauss uses **MySQL** with **Drizzle ORM**. Tables:

- **users** — User accounts from Manus OAuth
- **feedback** — User-submitted feedback with severity and category
- **operatorSessions** — Tracking operator session duration and stats

Run migrations:
```bash
pnpm db:push
```

See [drizzle/schema.ts](drizzle/schema.ts) for full schema.

---

## Testing

```bash
# Run all tests
pnpm test

# Type checking
pnpm check

# Lint
pnpm lint

# Format code
pnpm format
```

**Current Status:** 86/87 tests passing (98.9%)

---

## Deployment

### Build for Production

```bash
# Build backend server
pnpm build

# Output: dist/index.js (28.7kb ESM bundle)

# Run production server
NODE_ENV=production node dist/index.js
```

### Environment Checklist

- [ ] Set all `EXPO_PUBLIC_*` variables
- [ ] Configure `DATABASE_URL` with production MySQL instance
- [ ] Set `BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY` for file storage
- [ ] Enable SSL/HTTPS for production API
- [ ] Configure CORS for allowed origins
- [ ] Set up database backups
- [ ] Enable API rate limiting (if needed)

### Production Server Requirements

- **Node.js** 18+
- **MySQL** 8.0+
- **SSL Certificate** (for HTTPS)
- **Reverse Proxy** (nginx/Caddy recommended)

---

## Known Issues

See [audit_notes.md](audit_notes.md) for visual and UX improvement backlog.

### Missing Features

- ❌ Offline mode with local TLE cache (14 tasks remaining)
- ❌ Deep Blue theme redesign (15 tasks remaining)
- ❌ Real-time WebSocket streaming for desktop clients

---

## Design System

Project Gauss follows the **Gauss Design System (GDS)**:

- **Font:** JetBrains Mono
- **Theme:** Hard-Sovereign (OLED black background)
- **Accent Colors:**
  - Volt Green `#CCFF00` — Nominal state
  - Amber `#FF9900` — Warning state
  - Red `#FF3333` — Critical state
- **250ms Glanceability Rule** — Status visible in <250ms

See [design.md](design.md) for full spec.

---

## Contributing

This is a private demo project. For feedback or bug reports, use the in-app feedback portal (requires SSO login).

---

## License

Proprietary. Not licensed for public distribution.

---

## Acknowledgments

- **TLE Data:** [CelesTrak](https://celestrak.org/)
- **Solar Weather:** [NOAA SWPC](https://www.swpc.noaa.gov/)
- **Orbital Mechanics:** [satellite.js](https://github.com/shashwatak/satellite-js) (SGP4/SDP4)
- **Design Inspiration:** Carl Friedrich Gauss's 1801 orbital determination of Ceres

---

**Generated with [Continue](https://continue.dev)**

Co-Authored-By: Continue <noreply@continue.dev>
