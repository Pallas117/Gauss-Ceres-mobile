export const themeColors: {
  background:   { light: string; dark: string };
  surface:      { light: string; dark: string };
  surfaceAlt:   { light: string; dark: string };
  border:       { light: string; dark: string };
  borderBright: { light: string; dark: string };
  foreground:   { light: string; dark: string };
  muted:        { light: string; dark: string };
  dim:          { light: string; dark: string };
  primary:      { light: string; dark: string };
  tint:         { light: string; dark: string };
  glow:         { light: string; dark: string };
  volt:         { light: string; dark: string };
  voltDim:      { light: string; dark: string };
  amber:        { light: string; dark: string };
  amberDim:     { light: string; dark: string };
  error:        { light: string; dark: string };
  errorDim:     { light: string; dark: string };
  success:      { light: string; dark: string };
  warning:      { light: string; dark: string };
  orbitRed:     { light: string; dark: string };
  orbitAmber:   { light: string; dark: string };
  orbitVolt:    { light: string; dark: string };
  orbitBlue:    { light: string; dark: string };
  earthBlue:    { light: string; dark: string };
  earthGlow:    { light: string; dark: string };
};

declare const themeConfig: {
  themeColors: typeof themeColors;
};

export default themeConfig;
