# Desktop Integration Guide

This document provides detailed instructions for integrating a desktop application with Project Gauss HUD.

---

## Overview

Project Gauss exposes a **tRPC-based REST API** that desktop clients can use to:

- Authenticate users via Manus OAuth
- Submit and retrieve feedback
- Track operator sessions
- Access telemetry data (future enhancement)

**Base URL:** `http://localhost:3000/api/trpc` (development)

---

## Authentication

### OAuth Flow for Desktop Clients

Desktop applications should implement the following OAuth flow:

#### 1. Initiate OAuth Login

```typescript
const loginUrl = new URL('https://oauth.example.com/app-auth');
loginUrl.searchParams.set('appId', 'your_app_id');
loginUrl.searchParams.set('redirectUri', 'http://localhost:8080/oauth/callback');
loginUrl.searchParams.set('state', btoa('http://localhost:8080/oauth/callback'));
loginUrl.searchParams.set('type', 'signIn');

// Open system browser
window.open(loginUrl.toString());
```

#### 2. Handle OAuth Callback

Your desktop app should listen for the callback at `/oauth/callback`:

```typescript
// Express server example
app.get('/oauth/callback', async (req, res) => {
  const { code } = req.query;
  
  // Exchange code for token
  const tokenResponse = await fetch('https://api.example.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      appId: 'your_app_id',
      redirectUri: 'http://localhost:8080/oauth/callback'
    })
  });
  
  const { access_token } = await tokenResponse.json();
  
  // Store token securely
  storeSessionToken(access_token);
  
  res.redirect('/dashboard');
});
```

#### 3. Use Bearer Token for API Requests

Include the token in all API requests:

```typescript
const headers = {
  'Authorization': `Bearer ${access_token}`
};
```

---

## API Reference

### Base URL

All tRPC endpoints are prefixed with `/api/trpc`.

**Format:** `POST /api/trpc/<router>.<procedure>`

**Content-Type:** `application/json`

---

## Auth Router

### `auth.me`

Get the currently authenticated user.

**Type:** Query  
**Auth:** Optional (returns `null` if not authenticated)

**Request:**
```http
GET /api/trpc/auth.me
Authorization: Bearer <token>
```

**Response:**
```json
{
  "result": {
    "data": {
      "id": 1,
      "openId": "user_abc123",
      "name": "John Doe",
      "email": "john@example.com",
      "loginMethod": "oauth",
      "role": "user",
      "lastSignedIn": "2026-03-13T12:00:00Z"
    }
  }
}
```

### `auth.logout`

Logout the current user (clears session cookie).

**Type:** Mutation  
**Auth:** Optional

**Request:**
```http
POST /api/trpc/auth.logout
Authorization: Bearer <token>
```

**Response:**
```json
{
  "result": {
    "data": {
      "success": true
    }
  }
}
```

---

## Feedback Router

### `feedback.submit`

Submit user feedback.

**Type:** Mutation  
**Auth:** Required

**Input:**
```typescript
{
  category: "BUG" | "FEATURE" | "DATA" | "OTHER",
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  message: string, // 10-2000 characters
  contextRef?: string // max 128 characters
}
```

**Request:**
```http
POST /api/trpc/feedback.submit
Authorization: Bearer <token>
Content-Type: application/json

{
  "category": "BUG",
  "severity": "HIGH",
  "message": "Satellite position calculation incorrect for ISS",
  "contextRef": "SAT-ISS-001"
}
```

**Response:**
```json
{
  "result": {
    "data": {
      "id": 42,
      "success": true
    }
  }
}
```

**Note:** HIGH and CRITICAL severity feedback triggers an email notification to the app owner.

### `feedback.myList`

List the authenticated user's feedback submissions.

**Type:** Query  
**Auth:** Required

**Request:**
```http
GET /api/trpc/feedback.myList
Authorization: Bearer <token>
```

**Response:**
```json
{
  "result": {
    "data": [
      {
        "id": 42,
        "userId": 1,
        "category": "BUG",
        "severity": "HIGH",
        "message": "Satellite position calculation incorrect for ISS",
        "contextRef": "SAT-ISS-001",
        "resolved": false,
        "adminNote": null,
        "createdAt": "2026-03-13T12:00:00Z"
      }
    ]
  }
}
```

### `feedback.adminList`

List all feedback (admin only).

**Type:** Query  
**Auth:** Required (role: admin)

**Request:**
```http
GET /api/trpc/feedback.adminList
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "result": {
    "data": [
      {
        "id": 42,
        "userId": 1,
        "userName": "John Doe",
        "category": "BUG",
        "severity": "HIGH",
        "message": "Satellite position calculation incorrect for ISS",
        "resolved": false,
        "createdAt": "2026-03-13T12:00:00Z"
      }
    ]
  }
}
```

### `feedback.resolve`

Mark feedback as resolved (admin only).

**Type:** Mutation  
**Auth:** Required (role: admin)

**Input:**
```typescript
{
  id: number,
  adminNote?: string // max 500 characters
}
```

**Request:**
```http
POST /api/trpc/feedback.resolve
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "id": 42,
  "adminNote": "Fixed in v1.2.0 — SGP4 propagation bug resolved"
}
```

**Response:**
```json
{
  "result": {
    "data": {
      "success": true
    }
  }
}
```

---

## Sessions Router

### `sessions.start`

Start a new operator session.

**Type:** Mutation  
**Auth:** Required

**Input:**
```typescript
{
  nodeId?: string // default: "JUDITH-M1"
}
```

**Request:**
```http
POST /api/trpc/sessions.start
Authorization: Bearer <token>
Content-Type: application/json

{
  "nodeId": "DESKTOP-CLIENT-001"
}
```

**Response:**
```json
{
  "result": {
    "data": {
      "sessionId": 123
    }
  }
}
```

### `sessions.end`

End an operator session with final statistics.

**Type:** Mutation  
**Auth:** Required

**Input:**
```typescript
{
  sessionId: number,
  eventsProcessed: number, // min: 0
  commandsSent: number, // min: 0
  dangerAcknowledged: number, // min: 0
  peakThreatPct: number // 0-100
}
```

**Request:**
```http
POST /api/trpc/sessions.end
Authorization: Bearer <token>
Content-Type: application/json

{
  "sessionId": 123,
  "eventsProcessed": 45,
  "commandsSent": 12,
  "dangerAcknowledged": 3,
  "peakThreatPct": 87
}
```

**Response:**
```json
{
  "result": {
    "data": {
      "success": true
    }
  }
}
```

### `sessions.myList`

List the authenticated user's recent sessions.

**Type:** Query  
**Auth:** Required

**Request:**
```http
GET /api/trpc/sessions.myList
Authorization: Bearer <token>
```

**Response:**
```json
{
  "result": {
    "data": [
      {
        "id": 123,
        "userId": 1,
        "nodeId": "DESKTOP-CLIENT-001",
        "startedAt": "2026-03-13T12:00:00Z",
        "endedAt": "2026-03-13T13:30:00Z",
        "eventsProcessed": 45,
        "commandsSent": 12,
        "dangerAcknowledged": 3,
        "peakThreatPct": 87
      }
    ]
  }
}
```

---

## CORS Configuration

To allow desktop client requests, configure CORS in your backend:

### Development

Edit `server/_core/index.ts`:

```typescript
import cors from 'cors';

app.use(cors({
  origin: ['http://localhost:8080', 'http://localhost:3000'],
  credentials: true
}));
```

### Production

```typescript
app.use(cors({
  origin: ['https://desktop.yourapp.com', 'https://app.yourproject.com'],
  credentials: true
}));
```

---

## Example: TypeScript Desktop Client

### Install Dependencies

```bash
npm install @trpc/client axios
```

### Create tRPC Client

```typescript
// lib/trpc-client.ts
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './types'; // Import from backend

const sessionToken = getStoredToken(); // Implement your token storage

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/api/trpc',
      async headers() {
        return {
          Authorization: `Bearer ${sessionToken}`
        };
      }
    })
  ]
});
```

### Usage Examples

```typescript
// Get current user
const user = await trpc.auth.me.query();
console.log('Logged in as:', user?.name);

// Submit feedback
const result = await trpc.feedback.submit.mutate({
  category: 'BUG',
  severity: 'HIGH',
  message: 'Desktop client integration test'
});
console.log('Feedback ID:', result.id);

// Start session
const session = await trpc.sessions.start.mutate({
  nodeId: 'DESKTOP-CLIENT-001'
});
const sessionId = session.sessionId;

// End session after work
await trpc.sessions.end.mutate({
  sessionId,
  eventsProcessed: 100,
  commandsSent: 25,
  dangerAcknowledged: 5,
  peakThreatPct: 92
});

// List user's sessions
const sessions = await trpc.sessions.myList.query();
console.log('Recent sessions:', sessions);
```

---

## Error Handling

All tRPC errors follow this format:

```json
{
  "error": {
    "message": "Forbidden: admin only",
    "code": "FORBIDDEN",
    "data": {
      "code": "FORBIDDEN",
      "httpStatus": 403
    }
  }
}
```

**Common Error Codes:**

- `UNAUTHORIZED` (401) — Missing or invalid authentication token
- `FORBIDDEN` (403) — Insufficient permissions (e.g., non-admin accessing admin routes)
- `BAD_REQUEST` (400) — Invalid input (validation error)
- `NOT_FOUND` (404) — Resource not found
- `INTERNAL_SERVER_ERROR` (500) — Server error

### Example Error Handling

```typescript
try {
  await trpc.feedback.submit.mutate({ ... });
} catch (error) {
  if (error.data?.code === 'UNAUTHORIZED') {
    // Redirect to login
    window.location.href = '/login';
  } else if (error.data?.code === 'BAD_REQUEST') {
    // Show validation error
    alert(error.message);
  } else {
    // Generic error
    console.error('API Error:', error);
  }
}
```

---

## Real-Time Data Streaming (Future)

**Status:** Not yet implemented

### Planned Features

1. **WebSocket Endpoint** — `/api/telemetry/stream`
   - Live satellite position updates
   - Solar weather alerts
   - Operator events

2. **Server-Sent Events (SSE)** — `/api/events`
   - Lightweight alternative to WebSocket
   - One-way server → client streaming

### Polling Alternative (Current)

Until real-time streaming is implemented, use polling:

```typescript
async function pollSessions() {
  setInterval(async () => {
    const sessions = await trpc.sessions.myList.query();
    updateUI(sessions);
  }, 5000); // Poll every 5 seconds
}
```

---

## Rate Limiting

**Status:** Not yet implemented

Future versions will implement rate limiting:

- **Authenticated users:** 100 requests/minute
- **Admin users:** 500 requests/minute
- **Public endpoints:** 20 requests/minute

---

## Security Best Practices

1. **Never hardcode tokens** — Use environment variables or secure storage
2. **Use HTTPS in production** — Never send tokens over HTTP
3. **Rotate tokens regularly** — Implement token refresh logic
4. **Validate all inputs** — tRPC handles validation, but double-check on desktop client
5. **Log API errors** — Track failed requests for debugging

---

## Troubleshooting

### Issue: CORS errors in browser-based desktop apps (Electron, Tauri)

**Solution:** Configure CORS in `server/_core/index.ts` to allow your desktop app's origin:

```typescript
app.use(cors({
  origin: ['capacitor://localhost', 'http://localhost:8080'],
  credentials: true
}));
```

### Issue: "Unauthorized" errors after login

**Solution:** Ensure the token is stored and sent correctly:

```typescript
// Store token
localStorage.setItem('session_token', access_token);

// Retrieve token
const token = localStorage.getItem('session_token');

// Send in headers
headers: {
  Authorization: `Bearer ${token}`
}
```

### Issue: "Cannot find module 'AppRouter'"

**Solution:** Export types from backend:

```typescript
// server/routers.ts
export type AppRouter = typeof appRouter;

// Desktop client
import type { AppRouter } from '@/server/routers';
```

---

## Support

For technical issues:

1. Check [README.md](README.md) for general setup
2. Review [server/README.md](server/README.md) for backend details
3. Submit feedback via the in-app feedback portal
4. Contact: jzwnathan@lightbound.uk

---

**Generated with [Continue](https://continue.dev)**

Co-Authored-By: Continue <noreply@continue.dev>
