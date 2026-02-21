export const themeColors: {
  primary:    { light: string; dark: string };
  background: { light: string; dark: string };
  surface:    { light: string; dark: string };
  surface2:   { light: string; dark: string };
  foreground: { light: string; dark: string };
  muted:      { light: string; dark: string };
  border:     { light: string; dark: string };
  border2:    { light: string; dark: string };
  nominal:    { light: string; dark: string };
  warning:    { light: string; dark: string };
  crisis:     { light: string; dark: string };
  success:    { light: string; dark: string };
  error:      { light: string; dark: string };
  tint:       { light: string; dark: string };
  pass:       { light: string; dark: string };
  lock:       { light: string; dark: string };
  signal:     { light: string; dark: string };
  drift:      { light: string; dark: string };
  anomaly:    { light: string; dark: string };
  critical:   { light: string; dark: string };
};

declare const themeConfig: {
  themeColors: typeof themeColors;
};

export default themeConfig;
