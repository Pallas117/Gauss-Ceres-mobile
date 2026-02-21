/**
 * solar-weather-service.ts
 *
 * Fetches live space weather data from NOAA Space Weather Prediction Center (SWPC).
 * Computes per-satellite solar flare risk modifiers based on orbit type and current
 * solar activity levels.
 *
 * Data sources (all public, no API key required):
 *   - GOES X-ray flux (6-hour):      https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json
 *   - Solar flare events (7-day):    https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json
 *   - Solar wind plasma (1-day):     https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json
 *   - Solar wind Bz (1-day):         https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json
 *   - Kp index forecast:             https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json
 *   - Active alerts:                 https://services.swpc.noaa.gov/products/alerts.json
 *   - 3-day geomag predictions:      https://services.swpc.noaa.gov/text/3-day-solar-geomag-predictions.txt
 *   - Solar regions:                 https://services.swpc.noaa.gov/json/solar_regions.json
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type FlareClass = "A" | "B" | "C" | "M" | "X";
export type GeoStormLevel = "G0" | "G1" | "G2" | "G3" | "G4" | "G5";
export type SolarActivityLevel = "QUIET" | "ACTIVE" | "STORM" | "SEVERE";

export interface SolarFlareEvent {
  timeTag: string;
  beginTime: string;
  maxTime: string;
  endTime: string;
  maxClass: string;          // e.g. "M2.3", "X1.1", "C4.5"
  flareClass: FlareClass;
  flareIntensity: number;    // numeric part, e.g. 2.3 for M2.3
}

export interface SolarWindState {
  timestamp: string;
  speedKms: number;          // solar wind speed km/s
  densityPcm3: number;       // proton density p/cm³
  temperature: number;       // proton temperature K
  bzGsm: number;             // Bz component (southward = negative = geoeffective)
  btTotal: number;           // total field magnitude nT
}

export interface KpForecast {
  timeTag: string;
  kp: number;
  observed: "observed" | "predicted" | "estimated";
  noaaScale: GeoStormLevel | null;
}

export interface FlareProbabilities {
  issuedAt: string;
  mClassPct: number;         // % probability of M-class flare today
  xClassPct: number;         // % probability of X-class flare today
  protonPct: number;         // % probability of proton event today
  mClassTomorrow: number;
  xClassTomorrow: number;
}

export interface SolarAlert {
  productId: string;
  issueTime: string;
  message: string;
  isActive: boolean;
  severity: "INFO" | "WATCH" | "WARNING" | "ALERT";
}

export interface SolarRegion {
  observedDate: string;
  region: number;
  location: string;
  magClass: string | null;
  cEvents: number;
  mEvents: number;
  xEvents: number;
}

export interface SpaceWeatherState {
  fetchedAt: string;
  activityLevel: SolarActivityLevel;
  currentXrayFlux: number;       // W/m² current GOES X-ray flux
  currentFlareClass: FlareClass; // derived from flux
  latestFlares: SolarFlareEvent[];
  solarWind: SolarWindState | null;
  kpCurrent: number;
  kpForecast: KpForecast[];
  geoStormLevel: GeoStormLevel;
  flareProbabilities: FlareProbabilities | null;
  activeAlerts: SolarAlert[];
  activeRegions: SolarRegion[];
  error: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SWPC_BASE = "https://services.swpc.noaa.gov";

// X-ray flux thresholds for flare classification (W/m²)
const FLUX_THRESHOLDS: Record<FlareClass, number> = {
  A: 1e-8,
  B: 1e-7,
  C: 1e-6,
  M: 1e-5,
  X: 1e-4,
};

// Kp → G-scale storm level
const KP_TO_GSCALE: Record<number, GeoStormLevel> = {
  5: "G1", 6: "G2", 7: "G3", 8: "G4", 9: "G5",
};

// Per-orbit-type solar vulnerability multipliers
// LEO satellites are most exposed to energetic particle events and atmospheric drag
// MEO (GPS) are in the heart of the radiation belts — very vulnerable
// GEO satellites face full solar wind but are above the radiation belts
// HEO/SSO have variable exposure
export const ORBIT_SOLAR_MULTIPLIER: Record<string, number> = {
  LEO:   1.0,   // moderate — atmosphere provides some shielding, but drag increases
  MEO:   1.8,   // high — radiation belt amplification during storms
  GEO:   1.3,   // elevated — direct solar wind exposure, surface charging
  HEO:   1.5,   // high — passes through radiation belts
  SSO:   1.1,   // slightly elevated — polar regions more exposed
  OTHER: 1.0,
};

// ─── Flux → Flare Class ───────────────────────────────────────────────────────

export function fluxToClass(flux: number): FlareClass {
  if (flux >= FLUX_THRESHOLDS.X) return "X";
  if (flux >= FLUX_THRESHOLDS.M) return "M";
  if (flux >= FLUX_THRESHOLDS.C) return "C";
  if (flux >= FLUX_THRESHOLDS.B) return "B";
  return "A";
}

export function parseFlareClass(classStr: string): { cls: FlareClass; intensity: number } {
  const match = classStr.match(/^([ABCMX])(\d+\.?\d*)/i);
  if (!match) return { cls: "A", intensity: 0 };
  return {
    cls: match[1].toUpperCase() as FlareClass,
    intensity: parseFloat(match[2]),
  };
}

// ─── Solar Threat Score ───────────────────────────────────────────────────────
/**
 * Compute a 0–100 solar threat score for a satellite based on current space weather.
 * This is added as a modifier to the satellite's base orbital threat score.
 *
 * Factors:
 *   - Current X-ray flux / flare class
 *   - M/X class flare probability
 *   - Kp index (geomagnetic storm level)
 *   - Solar wind speed and Bz orientation
 *   - Orbit type multiplier
 */
export function computeSolarThreat(
  weather: SpaceWeatherState,
  orbitType: string = "LEO",
  altKm: number = 500,
): number {
  if (weather.error && !weather.flareProbabilities) return 0;

  let score = 0;

  // 1. Current flare class contribution (0–30 pts)
  const flareScore: Record<FlareClass, number> = {
    A: 0, B: 2, C: 8, M: 20, X: 30,
  };
  score += flareScore[weather.currentFlareClass] ?? 0;

  // 2. Flare probability contribution (0–25 pts)
  if (weather.flareProbabilities) {
    const { mClassPct, xClassPct } = weather.flareProbabilities;
    score += Math.min(15, mClassPct * 0.5);   // M-class: up to 15 pts
    score += Math.min(10, xClassPct * 2.0);   // X-class: up to 10 pts
  }

  // 3. Geomagnetic storm contribution (0–25 pts)
  const kp = weather.kpCurrent;
  if (kp >= 9)      score += 25;
  else if (kp >= 7) score += 18;
  else if (kp >= 5) score += 10;
  else if (kp >= 4) score += 5;
  else if (kp >= 3) score += 2;

  // 4. Solar wind speed contribution (0–10 pts)
  if (weather.solarWind) {
    const speed = weather.solarWind.speedKms;
    if (speed > 700)      score += 10;
    else if (speed > 600) score += 7;
    else if (speed > 500) score += 4;
    else if (speed > 400) score += 2;

    // Southward Bz is geoeffective (drives magnetic reconnection)
    const bz = weather.solarWind.bzGsm;
    if (bz < -20)      score += 10;
    else if (bz < -10) score += 6;
    else if (bz < -5)  score += 3;
  }

  // Apply orbit-type multiplier
  const multiplier = ORBIT_SOLAR_MULTIPLIER[orbitType] ?? 1.0;
  score = score * multiplier;

  // MEO satellites in radiation belts get extra penalty during storms
  if (orbitType === "MEO" && kp >= 5) {
    score += 10; // radiation belt injection
  }

  // Very low LEO satellites face increased drag during solar storms
  if (orbitType === "LEO" && altKm < 400 && weather.currentFlareClass !== "A") {
    score += 5; // atmospheric drag increase
  }

  return Math.min(100, Math.round(score));
}

// ─── Activity Level Classifier ────────────────────────────────────────────────

export function classifyActivityLevel(weather: SpaceWeatherState): SolarActivityLevel {
  const { currentFlareClass, kpCurrent, flareProbabilities } = weather;

  if (
    currentFlareClass === "X" ||
    kpCurrent >= 7 ||
    (flareProbabilities?.xClassPct ?? 0) >= 10
  ) return "SEVERE";

  if (
    currentFlareClass === "M" ||
    kpCurrent >= 5 ||
    (flareProbabilities?.mClassPct ?? 0) >= 30
  ) return "STORM";

  if (
    currentFlareClass === "C" ||
    kpCurrent >= 3 ||
    (flareProbabilities?.mClassPct ?? 0) >= 10
  ) return "ACTIVE";

  return "QUIET";
}

// ─── Text Parser for 3-day Predictions ───────────────────────────────────────

export function parse3DayPredictions(text: string): FlareProbabilities | null {
  try {
    const lines = text.split("\n");
    let mClass = [0, 0, 0];
    let xClass = [0, 0, 0];
    let proton = [0, 0, 0];
    let issuedAt = "";

    for (const line of lines) {
      if (line.startsWith(":Issued:")) {
        issuedAt = line.replace(":Issued:", "").trim();
      }
      if (line.startsWith("Class_M")) {
        const nums = line.replace("Class_M", "").trim().split(/\s+/).map(Number);
        mClass = nums.length >= 3 ? nums : mClass;
      }
      if (line.startsWith("Class_X")) {
        const nums = line.replace("Class_X", "").trim().split(/\s+/).map(Number);
        xClass = nums.length >= 3 ? nums : xClass;
      }
      if (line.startsWith("Proton")) {
        const nums = line.replace("Proton", "").trim().split(/\s+/).map(Number);
        proton = nums.length >= 3 ? nums : proton;
      }
    }

    return {
      issuedAt,
      mClassPct: mClass[0],
      xClassPct: xClass[0],
      protonPct: proton[0],
      mClassTomorrow: mClass[1],
      xClassTomorrow: xClass[1],
    };
  } catch {
    return null;
  }
}

// ─── Alert Severity Classifier ────────────────────────────────────────────────

function classifyAlertSeverity(message: string): SolarAlert["severity"] {
  const upper = message.toUpperCase();
  if (upper.includes("ALERT:") || upper.includes("WATA")) return "ALERT";
  if (upper.includes("WARNING:") || upper.includes("WATW")) return "WARNING";
  if (upper.includes("WATCH:") || upper.includes("WATA")) return "WATCH";
  return "INFO";
}

// ─── Main Fetch Function ──────────────────────────────────────────────────────
// All SWPC endpoints route through the data parser's fetchSWPC:
//   - Stale-while-revalidate: returns cached data instantly, refreshes in background
//   - Request deduplication: one in-flight fetch per URL
//   - LRU cache with 5-minute TTL per endpoint

import { dataParser } from "./data-parser";

const SWPC_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchSpaceWeather(): Promise<SpaceWeatherState> {
  const fetchedAt = new Date().toISOString();

  const defaults: SpaceWeatherState = {
    fetchedAt,
    activityLevel: "QUIET",
    currentXrayFlux: 0,
    currentFlareClass: "A",
    latestFlares: [],
    solarWind: null,
    kpCurrent: 0,
    kpForecast: [],
    geoStormLevel: "G0",
    flareProbabilities: null,
    activeAlerts: [],
    activeRegions: [],
    error: null,
  };

  const results = await Promise.allSettled([
    // 1. Current X-ray flux — via parser cache (stale-while-revalidate)
    dataParser.fetchSWPC<unknown[]>(`${SWPC_BASE}/json/goes/primary/xrays-6-hour.json`, SWPC_TTL),
    // 2. Recent flare events (7-day)
    dataParser.fetchSWPC<unknown[]>(`${SWPC_BASE}/json/goes/primary/xray-flares-7-day.json`, SWPC_TTL),
    // 3. Solar wind plasma
    dataParser.fetchSWPC<unknown[]>(`${SWPC_BASE}/products/solar-wind/plasma-1-day.json`, SWPC_TTL),
    // 4. Solar wind Bz
    dataParser.fetchSWPC<unknown[]>(`${SWPC_BASE}/products/solar-wind/mag-1-day.json`, SWPC_TTL),
    // 5. Kp index forecast
    dataParser.fetchSWPC<unknown[]>(`${SWPC_BASE}/products/noaa-planetary-k-index-forecast.json`, SWPC_TTL),
    // 6. Active alerts
    dataParser.fetchSWPC<unknown[]>(`${SWPC_BASE}/products/alerts.json`, SWPC_TTL),
    // 7. 3-day predictions (text format) — fetched directly as text
    fetch(`${SWPC_BASE}/text/3-day-solar-geomag-predictions.txt`, {
      signal: AbortSignal.timeout(10_000),
    }).then(r => r.text()),
    // 8. Solar regions
    dataParser.fetchSWPC<unknown[]>(`${SWPC_BASE}/json/solar_regions.json`, SWPC_TTL),
  ]);

  const state = { ...defaults };
  const errors: string[] = [];

  // 1. Current X-ray flux
  if (results[0].status === "fulfilled") {
    try {
      const xrayData = results[0].value as Array<{
        time_tag: string; flux: number; energy: string;
      }>;
      // Filter for 0.1-0.8nm channel (standard GOES X-ray)
      const longChannel = xrayData.filter(d => d.energy === "0.1-0.8nm");
      if (longChannel.length > 0) {
        const latest = longChannel[longChannel.length - 1];
        state.currentXrayFlux = latest.flux;
        state.currentFlareClass = fluxToClass(latest.flux);
      }
    } catch { errors.push("xray-flux"); }
  } else { errors.push("xray-flux"); }

  // 2. Recent flare events
  if (results[1].status === "fulfilled") {
    try {
      const flareData = results[1].value as Array<{
        time_tag: string; begin_time: string; max_time: string;
        end_time: string; max_class: string;
      }>;
      state.latestFlares = flareData
        .filter(f => f.max_class && f.max_class.match(/^[ABCMX]/i))
        .slice(-10)
        .map(f => {
          const { cls, intensity } = parseFlareClass(f.max_class);
          return {
            timeTag: f.time_tag,
            beginTime: f.begin_time,
            maxTime: f.max_time,
            endTime: f.end_time,
            maxClass: f.max_class,
            flareClass: cls,
            flareIntensity: intensity,
          };
        })
        .reverse(); // most recent first
    } catch { errors.push("flare-events"); }
  } else { errors.push("flare-events"); }

  // 3 & 4. Solar wind (plasma + mag field)
  const plasmaOk = results[2].status === "fulfilled";
  const magOk    = results[3].status === "fulfilled";
  if (plasmaOk) {
    try {
      const plasma = (results[2] as PromiseFulfilledResult<Array<[string, string, string, string]>>).value;
      const latest = plasma[plasma.length - 1];
      const density  = parseFloat(latest[1]);
      const speed    = parseFloat(latest[2]);
      const temp     = parseFloat(latest[3]);

      let bzGsm = 0;
      let btTotal = 0;
      if (magOk) {
        const mag = (results[3] as PromiseFulfilledResult<Array<[string, string, string, string, string, string, string]>>).value;
        const latestMag = mag[mag.length - 1];
        bzGsm   = parseFloat(latestMag[3]);
        btTotal = parseFloat(latestMag[6]);
      }

      state.solarWind = {
        timestamp: latest[0],
        speedKms:    isNaN(speed)   ? 0 : speed,
        densityPcm3: isNaN(density) ? 0 : density,
        temperature: isNaN(temp)    ? 0 : temp,
        bzGsm:       isNaN(bzGsm)   ? 0 : bzGsm,
        btTotal:     isNaN(btTotal) ? 0 : btTotal,
      };
    } catch { errors.push("solar-wind"); }
  } else { errors.push("solar-wind"); }

  // 5. Kp forecast
  if (results[4].status === "fulfilled") {
    try {
      const kpData = results[4].value as Array<[string, string, string, string | null]>;
      // Skip header row
      const rows = kpData.slice(1);
      const forecasts: KpForecast[] = rows.map(row => ({
        timeTag: row[0],
        kp: parseFloat(row[1]),
        observed: row[2] as "observed" | "predicted" | "estimated",
        noaaScale: (row[3] as GeoStormLevel | null),
      }));

      state.kpForecast = forecasts;

      // Current Kp = latest observed value
      const observed = forecasts.filter(f => f.observed === "observed");
      if (observed.length > 0) {
        state.kpCurrent = observed[observed.length - 1].kp;
      }

      // Determine current G-scale
      const kpInt = Math.floor(state.kpCurrent);
      state.geoStormLevel = (KP_TO_GSCALE[kpInt] ?? "G0") as GeoStormLevel;
    } catch { errors.push("kp-forecast"); }
  } else { errors.push("kp-forecast"); }

  // 6. Active alerts
  if (results[5].status === "fulfilled") {
    try {
      const alertData = results[5].value as Array<{
        product_id: string; issue_datetime: string; message: string;
      }>;
      // Only show alerts from last 24 hours
      const cutoff = Date.now() - 24 * 3600 * 1000;
      state.activeAlerts = alertData
        .filter(a => new Date(a.issue_datetime).getTime() > cutoff)
        .slice(0, 5)
        .map(a => ({
          productId: a.product_id,
          issueTime: a.issue_datetime,
          message: a.message,
          isActive: true,
          severity: classifyAlertSeverity(a.message),
        }));
    } catch { errors.push("alerts"); }
  } else { errors.push("alerts"); }

  // 7. 3-day flare probabilities (text)
  if (results[6].status === "fulfilled") {
    try {
      const r6 = results[6] as PromiseFulfilledResult<string>;
      state.flareProbabilities = parse3DayPredictions(r6.value);
    } catch { errors.push("flare-probs"); }
  } else { errors.push("flare-probs"); }

  // 8. Solar regions
  if (results[7].status === "fulfilled") {
    try {
      const r7 = results[7] as PromiseFulfilledResult<Array<{
        observed_date: string; region: number; location: string;
        mag_class: string | null; c_xray_events: number;
        m_xray_events: number; x_xray_events: number;
      }>>;
      const regionData = r7.value as Array<{
        observed_date: string; region: number; location: string;
        mag_class: string | null; c_xray_events: number;
        m_xray_events: number; x_xray_events: number;
      }>;
      state.activeRegions = regionData
        .filter(r => r.m_xray_events > 0 || r.x_xray_events > 0 || r.c_xray_events > 2)
        .slice(0, 5)
        .map(r => ({
          observedDate: r.observed_date,
          region: r.region,
          location: r.location,
          magClass: r.mag_class,
          cEvents: r.c_xray_events,
          mEvents: r.m_xray_events,
          xEvents: r.x_xray_events,
        }));
    } catch { errors.push("solar-regions"); }
  } else { errors.push("solar-regions"); }

  if (errors.length > 0) {
    state.error = `Partial data: ${errors.join(", ")} unavailable`;
  }

  // Classify overall activity level
  state.activityLevel = classifyActivityLevel(state);

  return state;
}

// ─── Formatting Helpers ───────────────────────────────────────────────────────

export function formatFlux(flux: number): string {
  if (flux === 0) return "N/A";
  const exp = Math.floor(Math.log10(flux));
  const mantissa = (flux / Math.pow(10, exp)).toFixed(1);
  return `${mantissa}×10⁻${Math.abs(exp)} W/m²`;
}

export function formatKp(kp: number): string {
  return kp.toFixed(1);
}

export function activityColor(level: SolarActivityLevel): string {
  switch (level) {
    case "QUIET":  return "#CCFF00"; // volt green
    case "ACTIVE": return "#FFAA00"; // amber
    case "STORM":  return "#FF6600"; // orange
    case "SEVERE": return "#FF2222"; // red
  }
}

export function gStormColor(level: GeoStormLevel): string {
  switch (level) {
    case "G0": return "#CCFF00";
    case "G1": return "#FFEE00";
    case "G2": return "#FFAA00";
    case "G3": return "#FF6600";
    case "G4": return "#FF3300";
    case "G5": return "#FF2222";
  }
}

export function flareClassColor(cls: FlareClass): string {
  switch (cls) {
    case "A": return "#444444";
    case "B": return "#CCFF00";
    case "C": return "#FFEE00";
    case "M": return "#FF9900";
    case "X": return "#FF2222";
  }
}
