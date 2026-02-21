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
