/**
 * Gauss Design System (GDS) — Theme Configuration
 *
 * OLED-First Architecture: true black (#000000) background turns off pixels
 * on OLED screens, extending mission battery life by up to 30%.
 *
 * Color Semantics:
 *   Volt Green (#CCFF00) = NOMINAL / ONLINE / SUCCESS
 *   Amber (#FFAA00)      = WARNING / ELEVATED
 *   Red (#FF2222)        = CRISIS / CRITICAL / OFFLINE
 *   White (#FFFFFF)      = PRIMARY TEXT / COMMANDS
 */

/** @type {const} */
const themeColors = {
  // ── Core GDS Palette ──────────────────────────────────────────────────────
  primary:    { light: "#CCFF00", dark: "#CCFF00" },   // Volt Green — nominal state
  background: { light: "#000000", dark: "#000000" },   // True OLED black
  surface:    { light: "#0A0A0A", dark: "#0A0A0A" },   // Bento card background
  surface2:   { light: "#111111", dark: "#111111" },   // Elevated surface
  foreground: { light: "#FFFFFF", dark: "#FFFFFF" },   // Primary text
  muted:      { light: "#666666", dark: "#666666" },   // Secondary text
  border:     { light: "#1A1A1A", dark: "#1A1A1A" },   // Subtle dividers
  border2:    { light: "#2A2A2A", dark: "#2A2A2A" },   // Visible dividers

  // ── Status Colors ─────────────────────────────────────────────────────────
  nominal:    { light: "#CCFF00", dark: "#CCFF00" },   // Volt Green
  warning:    { light: "#FFAA00", dark: "#FFAA00" },   // Amber
  crisis:     { light: "#FF2222", dark: "#FF2222" },   // Crisis Red

  // ── Standard semantic aliases ─────────────────────────────────────────────
  success:    { light: "#CCFF00", dark: "#CCFF00" },
  error:      { light: "#FF2222", dark: "#FF2222" },
  tint:       { light: "#CCFF00", dark: "#CCFF00" },

  // ── Telemetry event type colors ───────────────────────────────────────────
  pass:       { light: "#CCFF00", dark: "#CCFF00" },   // PASS — Volt Green
  lock:       { light: "#00CCFF", dark: "#00CCFF" },   // LOCK — Cyan
  signal:     { light: "#FFFFFF", dark: "#FFFFFF" },   // SIGNAL — White
  drift:      { light: "#FFAA00", dark: "#FFAA00" },   // DRIFT — Amber
  anomaly:    { light: "#FF6600", dark: "#FF6600" },   // ANOMALY — Orange
  critical:   { light: "#FF2222", dark: "#FF2222" },   // CRITICAL — Red
};

module.exports = { themeColors };
