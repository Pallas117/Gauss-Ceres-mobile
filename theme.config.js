/** @type {const} */
const themeColors = {
  // ── Base ──────────────────────────────────────────────────────────────────
  // Deep blue OLED-first architecture — true dark with blue tint
  background:  { light: '#020B18', dark: '#020B18' }, // Deep space blue (OLED)
  surface:     { light: '#071428', dark: '#071428' }, // Navy card surface
  surfaceAlt:  { light: '#0A1E3A', dark: '#0A1E3A' }, // Slightly lighter card
  border:      { light: '#0F2A4A', dark: '#0F2A4A' }, // Navy border
  borderBright:{ light: '#1A3F6F', dark: '#1A3F6F' }, // Bright border for focus

  // ── Text ──────────────────────────────────────────────────────────────────
  foreground:  { light: '#E8F4FF', dark: '#E8F4FF' }, // Ice white text
  muted:       { light: '#4A7FA8', dark: '#4A7FA8' }, // Steel blue muted text
  dim:         { light: '#1E3A5A', dark: '#1E3A5A' }, // Very dim text / labels

  // ── Accent / Primary ──────────────────────────────────────────────────────
  primary:     { light: '#1E90FF', dark: '#1E90FF' }, // Electric blue (primary accent)
  tint:        { light: '#1E90FF', dark: '#1E90FF' }, // Tab bar tint
  glow:        { light: '#0A4A8A', dark: '#0A4A8A' }, // Blue glow / shadow

  // ── Status / Alert ────────────────────────────────────────────────────────
  // Volt green kept for NOMINAL / ONLINE — high contrast against deep blue
  volt:        { light: '#CCFF00', dark: '#CCFF00' }, // Volt green — NOMINAL
  voltDim:     { light: '#4A5C00', dark: '#4A5C00' }, // Dim volt for backgrounds
  amber:       { light: '#FFB300', dark: '#FFB300' }, // Amber — WARNING
  amberDim:    { light: '#4A3300', dark: '#4A3300' }, // Dim amber
  error:       { light: '#FF2222', dark: '#FF2222' }, // Red — CRITICAL/DANGER
  errorDim:    { light: '#4A0808', dark: '#4A0808' }, // Dim red
  success:     { light: '#00E676', dark: '#00E676' }, // Green — SUCCESS
  warning:     { light: '#FFB300', dark: '#FFB300' }, // Warning alias

  // ── Orbital ring colours ───────────────────────────────────────────────────
  orbitRed:    { light: '#FF3A3A', dark: '#FF3A3A' }, // Rank 1 orbit
  orbitAmber:  { light: '#FFB300', dark: '#FFB300' }, // Rank 2 orbit
  orbitVolt:   { light: '#CCFF00', dark: '#CCFF00' }, // Rank 3 orbit
  orbitBlue:   { light: '#1E90FF', dark: '#1E90FF' }, // Reference rings
  earthBlue:   { light: '#0D3B6E', dark: '#0D3B6E' }, // Earth sphere fill
  earthGlow:   { light: '#1565C0', dark: '#1565C0' }, // Earth atmosphere glow
};

module.exports = { themeColors };
