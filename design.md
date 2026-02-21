# Project Gauss: Mission HUD — Interface Design

## Brand Identity

- **Theme**: Hard-Sovereign
- **Background**: #050505 (near-black)
- **Accent**: #CCFF00 (Volt Green)
- **Text**: #FFFFFF (White)
- **Secondary Text**: #666666 (Dim)
- **Border/Divider**: #1A1A1A
- **Error**: #FF3333
- **Warning**: #FF9900
- **Surface**: #0D0D0D

No gradients. No rounded corners except large action buttons. High contrast only.

---

## Screen List

### 1. Main HUD Screen (Single Screen App)

The entire app lives on one screen with four vertical zones:

1. **Node Status Header** — Connection indicator for "Judith" (M1 Node)
2. **Orbital Telemetry Feed** — Scrolling mock satellite event log
3. **Actioning Console** — Markdown-rendered reasoning output
4. **Command Input Bar** — Minimalist prompt input

---

## Primary Content and Functionality

### Node Status Header
- App title: `GAUSS // MISSION HUD`
- Node label: `JUDITH · M1`
- Connection status badge: ONLINE / OFFLINE / CONNECTING
- Ping latency display (ms)
- Last health check timestamp

### Orbital Telemetry Feed
- Scrollable FlatList of mock satellite events
- Each event: timestamp, event type (PASS, ANOMALY, LOCK, SIGNAL, DRIFT), satellite ID, coordinates
- Color-coded by event type (ANOMALY = red, LOCK = volt green, PASS = white, SIGNAL = yellow, DRIFT = orange)
- New events auto-prepended (newest at top)
- Max 50 events kept in memory

### Actioning Console
- Displays reasoning output from M1 node
- Renders Markdown (bold, code blocks, lists)
- Shows "AWAITING COMMAND..." when idle
- Shows streaming indicator when processing
- Scrollable, fixed height ~40% of screen

### Command Input Bar
- Single-line text input
- Placeholder: `ENTER COMMAND...`
- Send button with volt green accent
- Keyboard dismiss on send
- Disabled while awaiting response

---

## Key User Flows

1. **App Launch**: Status header shows CONNECTING → pings /status → shows ONLINE/OFFLINE
2. **Health Check Loop**: Every 10 seconds, pings /status, updates header badge and latency
3. **Send Command**: User types in input → taps SEND → input disabled → POST to /reason → response rendered in console
4. **Telemetry Feed**: Mock events auto-generated every 3–8 seconds, prepended to feed

---

## Color Choices

| Element | Color |
|---------|-------|
| Background | #050505 |
| Surface/Cards | #0D0D0D |
| Volt Green Accent | #CCFF00 |
| Primary Text | #FFFFFF |
| Dim Text | #666666 |
| Border | #1A1A1A |
| ONLINE badge | #CCFF00 |
| OFFLINE badge | #FF3333 |
| CONNECTING badge | #FF9900 |
| ANOMALY event | #FF3333 |
| LOCK event | #CCFF00 |
| PASS event | #FFFFFF |
| SIGNAL event | #FFCC00 |
| DRIFT event | #FF9900 |

---

## Typography

- Font: System monospace (Courier New / Menlo)
- Headers: UPPERCASE, letter-spacing wide
- Body: 12–13px monospace
- Console output: 13px monospace

---

## Layout (iPhone 13 Portrait)

```
┌─────────────────────────────┐
│  GAUSS // MISSION HUD       │  ← Header (fixed, ~80px)
│  JUDITH · M1  [ONLINE] 12ms │
├─────────────────────────────┤
│  ORBITAL TELEMETRY          │  ← Section label
│  ┌───────────────────────┐  │
│  │ 14:32:01 LOCK SAT-007 │  │  ← Telemetry Feed (~30% height)
│  │ 14:31:58 PASS SAT-003 │  │
│  │ 14:31:45 ANOMALY ...  │  │
│  └───────────────────────┘  │
├─────────────────────────────┤
│  ACTIONING CONSOLE          │  ← Section label
│  ┌───────────────────────┐  │
│  │ > AWAITING COMMAND... │  │  ← Console (~35% height)
│  │                       │  │
│  └───────────────────────┘  │
├─────────────────────────────┤
│  [ENTER COMMAND...] [SEND]  │  ← Command Input (fixed bottom)
└─────────────────────────────┘
```
