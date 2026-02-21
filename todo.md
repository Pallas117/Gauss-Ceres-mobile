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
