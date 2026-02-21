# Project Gauss: Mission HUD — TODO

- [x] Configure hard-sovereign theme colors in theme.config.js and tailwind.config.js
- [x] Generate and set app logo/icon (volt green on black, satellite/orbital motif)
- [x] Update app.config.ts with branding (name, logo URL)
- [x] Build Node Status Header component (JUDITH M1, ONLINE/OFFLINE/CONNECTING, ping latency)
- [x] Implement 10-second health check loop polling /status endpoint
- [x] Build Orbital Telemetry Feed with mock satellite events (FlatList, color-coded by type)
- [x] Build Actioning Console with Markdown rendering
- [x] Build Command Input Bar (text input + SEND button)
- [x] Implement POST to /reason endpoint with loading state
- [x] Configure Tailscale IP as configurable constant
- [x] Wire up single-screen layout with all four zones
- [x] Add icon mappings for tab bar
- [x] Remove default tab bar (single-screen app)

## UX & Performance Pass

- [x] Add animated blinking status dot for CONNECTING/ONLINE states
- [x] Add smooth fade-in animation for new telemetry rows
- [x] Add haptic feedback on SEND button press
- [x] Fix keyboard avoiding view so command bar stays above keyboard on iOS
- [x] Add press feedback (scale) on SEND button
- [x] Add a blinking cursor animation to the console idle state
- [x] Improve console scrolling — auto-scroll to bottom on new content
- [x] Add scan-line / CRT texture overlay for visual depth
- [x] Add volt-green top border accent line under header
- [x] Add typewriter effect for console output rendering
- [x] Reduce telemetry row height and tighten spacing for more events visible
- [x] Add a subtle pulse animation on ANOMALY events in telemetry
- [x] Show "SIGNAL LOST" overlay when node goes OFFLINE
- [x] Add timestamp to each console output block
- [x] Improve empty/idle console with animated waiting indicator
- [x] Add CLEAR command to reset console output
- [x] Ensure no horizontal scroll on any screen width
- [x] Add connection retry indicator in header

## Urgent Controls & Danger Alerts

- [x] Add URGENT CONTROLS panel with ABORT, ISOLATE, OVERRIDE, LOCKDOWN buttons
- [x] Each urgent control sends a specific command to /reason with priority flag
- [x] Add full-screen DANGER FLASH overlay for high-probability anomaly events
- [x] Danger flash shows event type, satellite ID, threat level, and dismiss option
- [x] ANOMALY events above a threshold trigger the danger flash automatically
- [x] Add threat probability score to telemetry events (0-100%)
- [x] High-threat events (>75%) highlighted with pulsing red border in telemetry feed
- [x] Add haptic heavy impact on danger flash trigger
- [x] Danger flash overlay uses red strobe animation with alert tone visual
- [x] Add ACKNOWLEDGE button on danger flash to dismiss and log to console
- [x] Urgent control buttons use distinct colors (red for ABORT, orange for ISOLATE, yellow for OVERRIDE, white for LOCKDOWN)
- [x] Urgent controls panel is always visible above command input bar

## Real Satellite Data Integration

- [x] Research CelesTrak TLE feeds and available satellite groups
- [x] Install satellite.js for SGP4/SDP4 orbital propagation
- [x] Fetch live TLE data from CelesTrak for key satellite groups (stations, weather, GPS, Galileo, BeiDou, science, military)
- [x] Compute real orbital positions (lat/lon/alt/velocity) from TLEs using satellite.js
- [x] Compute real pass events classified by orbital state (LEO/MEO/GEO/decay risk)
- [x] Replace mock telemetry events with real computed orbital state events
- [x] Display real satellite names (from TLE line 0) instead of SAT-XXX IDs
- [x] Display real coordinates (lat/lon) computed from propagation
- [x] Display real altitude and velocity in telemetry detail
- [x] Classify real event types based on orbital state (PASS/LOCK/SIGNAL/DRIFT/ANOMALY/CRITICAL)
- [x] Add auto-refresh of TLE data every 6 hours (TLEs degrade over time)
- [x] Show data source attribution (CelesTrak) in the HUD header and console
- [x] Handle fetch errors gracefully with per-group error logging and degraded mode

## Operator Satellite Registry & Risk Telemetry

- [x] Design operator satellite data schema (NORAD ID, name, operator, risk fields)
- [x] Create operator registry screen with tab navigation
- [x] Build "Register Satellite" form with all risk telemetry fields
- [x] Build "Submit Risk Event" form for ad-hoc telemetry injection
- [x] Persist operator satellites and events with AsyncStorage
- [x] Integrate operator events into the main telemetry feed (marked as OPERATOR)
- [x] Operator satellites shown with distinct [OP] badge in telemetry rows
- [x] Operator events trigger danger flash if threat >= 75%
- [x] Allow editing and deletion of registered operator satellites
- [x] Show operator satellite count in HUD header
- [x] Add SATS command output to include operator satellite count
- [x] Validate all form inputs before submission
- [x] Add tab bar with HUD and OPERATOR tabs

## Gauss Design System (GDS) Implementation

- [x] Load JetBrains Mono font via expo-font
- [x] Set true black (#000000) OLED background across all screens
- [x] Implement GDS color tokens: Volt Green (nominal), Amber (warning), Red (crisis)
- [x] Apply 250ms glanceability rule — status glow visible at top of every screen
- [x] Build Bento Box modular layout for HUD screen
- [x] Implement contextual generative UI — collapse non-essential panels on CRITICAL threat
- [x] Implement haptic density — distinct patterns for data fetch vs satellite command
- [x] Build SVG-based orbital arc visualiser (vector-ready for AR)
- [x] Add status glow ring around node status badge
- [x] Implement threat-level color cascade across all UI elements
- [x] Build operator satellite registry screen (tab 2)
- [x] Build register satellite form with all GDS styling
- [x] Build submit risk event form with all GDS styling
- [x] Integrate operator events into live telemetry feed with [OP] badge
- [x] Add tab bar: HUD (tab 1) and OPERATOR (tab 2)
- [x] Add icon mappings for new tabs

## Solar Flare Risk Integration

- [x] Research NOAA SWPC API endpoints for live solar flare data
- [x] Build solar-weather-service.ts to fetch live space weather from NOAA SWPC
- [x] Fetch current solar flare probabilities (C/M/X class) from NOAA 3-day forecast
- [x] Fetch active geomagnetic storm alerts (Kp index) from NOAA alerts feed
- [x] Fetch solar wind speed and density from NOAA real-time solar wind feed
- [x] Compute per-satellite solar flare threat modifier based on orbit type (LEO/MEO/GEO)
- [x] Add solar flare threat contribution to per-satellite threatPct calculation
- [x] Add Solar Weather bento card to HUD with live flare class probabilities
- [x] Show Kp index and geomagnetic storm level in solar card
- [x] Show solar wind speed (km/s) and density (p/cm³) in solar card
- [x] Trigger danger flash for X-class flare probability > 10% or Kp >= 7
- [x] Color-code solar activity level: green (quiet), amber (active), red (storm)
- [x] Auto-refresh solar data every 5 minutes
- [x] Log solar weather events to the Actioning Console
- [x] Generate new app logo inspired by Gauss's 1801 orbital diagram of Ceres (v3 — blue Earth center)
- [x] Apply new logo to all icon locations

## Embedded Space Data Parser (Latency Optimisation)

- [x] Build lib/data-parser.ts — embedded binary-packed record format for TLE and SWPC data
- [x] Implement LRU in-memory cache with TTL per data source (TLE: 6h, SWPC: 5min)
- [x] Implement delta-update logic — only re-propagate satellites whose TLE epoch has changed
- [x] Pre-compute and cache satrec objects so satellite.js twoline2satrec is never called twice for the same TLE
- [x] Implement incremental propagation — only update satellites that have moved < 0.05° since last cycle (delta engine)
- [x] Add binary packing for orbital state (Float32Array for lat/lon/alt/vel — 4 bytes each vs 8-byte float64)
- [x] Add request deduplication — prevent parallel fetches of the same endpoint
- [x] Add stale-while-revalidate pattern for all feeds (serve cached data instantly, refresh in background)
- [x] Add fetch priority queue — stations/military first, GPS/weather second, science/Galileo/BeiDou third
- [x] Expose parser stats to HUD console (cache hit rate, parse time, byte savings)
- [x] Integrate parser into satellite-service.ts and solar-weather-service.ts
- [x] Add CACHE command to actioning console to show parser performance stats

## Scroll & Layout Fix

- [x] Audit full layout structure — identified bentoGrid flex:1 as root cause
- [x] Wrap all bento cards in a single outer ScrollView so the full HUD is scrollable
- [x] Fix telemetry FlatList height — replaced FlatList with ScrollView+map inside outer ScrollView
- [x] Fix Actioning Console height — capped at 200px natural height
- [x] Fix Solar Weather card — renders fully in ScrollView
- [x] Fix Orbital Arc card — renders fully at 160px height
- [x] Ensure command input bar stays pinned to bottom, above keyboard
- [x] Ensure urgent controls bar stays pinned above command input
- [x] Test on iPhone 13 viewport (390×844) — all content accessible via scroll

## Orbital Visualiser Upgrade

- [x] Show real satellite positions as dots on orbital arcs (lat/lon → SVG equirectangular projection)
- [x] Show only highest-risk satellites (top 12 by threatPct) in the visualiser
- [x] Add data-age latency timer showing seconds since last TLE propagation
- [x] Color-code satellite dots by threat level (volt=nominal, amber=warning, red=critical)
- [x] Pulse-animate critical satellite dots (crosshair + glow ring)
- [x] Show satellite name label next to each dot (top 6 by threat)
- [x] Add orbit altitude ring labels (LEO / MEO / GEO) on the arc
- [x] Show threat level and data age timer in orbital arc corners

## Top-10 Feed & Orbital Ground Tracks

- [x] Limit telemetry feed to top 10 highest-risk satellites only
- [x] Compute orbital ground track (full orbit path) for top-3 riskiest satellites using SGP4 propagation over one orbital period
- [x] Draw ground tracks as SVG polylines on the world-map visualiser
- [x] Color-code each ground track by satellite rank (1st=red, 2nd=amber, 3rd=volt)
- [x] Handle antimeridian crossing (lon wraps from 180 to -180) by splitting track into segments
- [x] Label each ground track with satellite name and threat %
- [x] Mark current position dot prominently on each track
