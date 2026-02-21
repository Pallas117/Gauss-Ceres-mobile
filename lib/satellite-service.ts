/**
 * satellite-service.ts
 *
 * Fetches live TLE/GP data from CelesTrak (open-source, public domain)
 * and computes real orbital state using satellite.js SGP4 propagation.
 *
 * Data source: https://celestrak.org — Dr. T.S. Kelso
 * Propagation: satellite.js v6 (SGP4/SDP4)
 */

import * as satellite from "satellite.js";
import type { OMMJsonObject } from "satellite.js";

// ─── CelesTrak GP JSON record ─────────────────────────────────────────────────
export interface CelesTrakGP {
  OBJECT_NAME: string;
  OBJECT_ID: string;
  NORAD_CAT_ID: number;
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
  EPHEMERIS_TYPE: number;
  CLASSIFICATION_TYPE: string;
  ELEMENT_SET_NO: number;
  REV_AT_EPOCH: number;
  BSTAR: number;
  MEAN_MOTION_DOT: number;
  MEAN_MOTION_DDOT: number;
}

// ─── Computed orbital state ───────────────────────────────────────────────────
export interface OrbitalState {
  noradId: number;
  name: string;
  objectId: string;
  lat: number;       // degrees
  lon: number;       // degrees
  altKm: number;     // km above WGS84 ellipsoid
  velKms: number;    // km/s
  inclination: number;
  period: number;    // minutes
  epochAge: number;  // hours since TLE epoch
  error: boolean;
}

// ─── Satellite groups to fetch from CelesTrak ─────────────────────────────────
// These are the GROUP= query values supported by CelesTrak
export const SATELLITE_GROUPS = [
  { key: "stations",    label: "Space Stations",     priority: 1 },
  { key: "weather",     label: "Weather",            priority: 2 },
  { key: "gps-ops",     label: "GPS Operational",    priority: 3 },
  { key: "galileo",     label: "Galileo",            priority: 4 },
  { key: "beidou",      label: "BeiDou",             priority: 5 },
  { key: "science",     label: "Space & Earth Sci",  priority: 6 },
  { key: "military",    label: "Misc Military",      priority: 7 },
] as const;

export type SatGroupKey = typeof SATELLITE_GROUPS[number]["key"];

// ─── CelesTrak API base ───────────────────────────────────────────────────────
const CELESTRAK_BASE = "https://celestrak.org/NORAD/elements/gp.php";

// ─── Fetch GP data for a group ────────────────────────────────────────────────
export async function fetchGroupTLEs(
  group: SatGroupKey,
  signal?: AbortSignal
): Promise<CelesTrakGP[]> {
  const url = `${CELESTRAK_BASE}?GROUP=${group}&FORMAT=JSON`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`CelesTrak HTTP ${res.status} for group=${group}`);
  const data: CelesTrakGP[] = await res.json();
  return data;
}

// ─── Fetch GP data for specific NORAD IDs ────────────────────────────────────
export async function fetchSatelliteByNorad(
  noradId: number,
  signal?: AbortSignal
): Promise<CelesTrakGP | null> {
  const url = `${CELESTRAK_BASE}?CATNR=${noradId}&FORMAT=JSON`;
  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const data: CelesTrakGP[] = await res.json();
  return data[0] ?? null;
}

// ─── Propagate a GP record to current position ───────────────────────────────
export function propagateGP(gp: CelesTrakGP, date: Date = new Date()): OrbitalState {
  try {
    const satrec = satellite.json2satrec(gp as unknown as OMMJsonObject);
    const posVel = satellite.propagate(satrec, date);

    if (!posVel || !posVel.position || typeof posVel.position === "boolean") {
      return errorState(gp);
    }

    const pos = posVel.position as satellite.EciVec3<number>;
    const gmst = satellite.gstime(date);
    const geo = satellite.eciToGeodetic(pos, gmst);

    const lat = satellite.degreesLat(geo.latitude);
    const lon = satellite.degreesLong(geo.longitude);
    const altKm = geo.height;

    if (!posVel.velocity || typeof posVel.velocity === "boolean") {
      return errorState(gp);
    }
    const vel = posVel.velocity as satellite.EciVec3<number>;
    const velKms = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);

    // TLE epoch age in hours
    const epochDate = new Date(gp.EPOCH);
    const epochAge = (date.getTime() - epochDate.getTime()) / 3_600_000;

    // Orbital period in minutes = 1440 / mean_motion (rev/day)
    const period = 1440 / gp.MEAN_MOTION;

    return {
      noradId: gp.NORAD_CAT_ID,
      name: gp.OBJECT_NAME.trim(),
      objectId: gp.OBJECT_ID,
      lat,
      lon,
      altKm,
      velKms,
      inclination: gp.INCLINATION,
      period,
      epochAge,
      error: false,
    };
  } catch {
    return errorState(gp);
  }
}

function errorState(gp: CelesTrakGP): OrbitalState {
  return {
    noradId: gp.NORAD_CAT_ID,
    name: gp.OBJECT_NAME.trim(),
    objectId: gp.OBJECT_ID,
    lat: 0, lon: 0, altKm: 0, velKms: 0,
    inclination: gp.INCLINATION,
    period: 0, epochAge: 0,
    error: true,
  };
}

// ─── Classify event type from orbital state ───────────────────────────────────
export type RealEventType = "PASS" | "ANOMALY" | "LOCK" | "SIGNAL" | "DRIFT" | "CRITICAL";

export function classifyEvent(state: OrbitalState): {
  type: RealEventType;
  detail: string;
  threatPct: number;
} {
  if (state.error) {
    return { type: "ANOMALY", detail: "Propagation error — TLE may be stale", threatPct: 55 };
  }

  // Stale TLE (>7 days) is a data integrity issue
  if (state.epochAge > 168) {
    return {
      type: "CRITICAL",
      detail: `TLE epoch ${Math.floor(state.epochAge / 24)}d old — position unreliable`,
      threatPct: 82,
    };
  }

  // Very high inclination + low altitude = potential decay risk
  if (state.altKm < 200 && state.altKm > 0) {
    return {
      type: "CRITICAL",
      detail: `Critical altitude ${state.altKm.toFixed(0)}km — decay imminent`,
      threatPct: 88,
    };
  }

  // Low altitude warning
  if (state.altKm < 350 && state.altKm > 0) {
    return {
      type: "ANOMALY",
      detail: `Low orbit ${state.altKm.toFixed(0)}km — station-keeping required`,
      threatPct: 45 + Math.floor(Math.random() * 20),
    };
  }

  // Slightly stale TLE (1-7 days)
  if (state.epochAge > 24) {
    return {
      type: "DRIFT",
      detail: `TLE ${Math.floor(state.epochAge)}h old — position drift possible`,
      threatPct: 20 + Math.floor(Math.random() * 25),
    };
  }

  // GPS / navigation satellites — signal lock
  if (state.altKm > 18000 && state.altKm < 25000) {
    return {
      type: "LOCK",
      detail: `MEO ${state.altKm.toFixed(0)}km · ${state.velKms.toFixed(2)}km/s · ${formatCoords(state.lat, state.lon)}`,
      threatPct: Math.floor(Math.random() * 10),
    };
  }

  // GEO satellites
  if (state.altKm > 35000) {
    return {
      type: "SIGNAL",
      detail: `GEO ${state.altKm.toFixed(0)}km · ${formatCoords(state.lat, state.lon)}`,
      threatPct: Math.floor(Math.random() * 8),
    };
  }

  // Normal LEO pass
  const details = [
    `LEO ${state.altKm.toFixed(0)}km · ${state.velKms.toFixed(2)}km/s · ${formatCoords(state.lat, state.lon)}`,
    `Pass ${formatCoords(state.lat, state.lon)} · Alt ${state.altKm.toFixed(0)}km`,
    `Telemetry nominal · ${state.altKm.toFixed(0)}km · ${state.period.toFixed(1)}min orbit`,
    `AOS ${formatCoords(state.lat, state.lon)} · ${state.velKms.toFixed(2)}km/s`,
  ];

  return {
    type: "PASS",
    detail: details[Math.floor(Math.random() * details.length)],
    threatPct: Math.floor(Math.random() * 12),
  };
}

// ─── Format lat/lon as compact string ────────────────────────────────────────
export function formatCoords(lat: number, lon: number): string {
  const latStr = `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"}`;
  const lonStr = `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`;
  return `${latStr} ${lonStr}`;
}

// ─── Format satellite name for display (trim, uppercase, max 12 chars) ────────
export function formatSatName(name: string): string {
  return name.trim().toUpperCase().slice(0, 14);
}

// ─── TelemetryEvent — unified feed event type ─────────────────────────────────
export interface TelemetryEvent {
  id: string;
  timestamp: string;        // HH:MM:SS
  type: RealEventType;
  satName: string;          // Formatted satellite name
  noradId: number;
  coordinates: string;      // "45.1°N 90.2°E"
  detail: string;           // Human-readable detail string
  threatPct: number;        // 0–100
  altKm: number;
  velKms: number;
  isReal: true;
  isOperator?: boolean;
}

// ─── Fetch all satellite groups in parallel ───────────────────────────────────
export async function fetchAllSatellites(): Promise<CelesTrakGP[]> {
  const results = await Promise.allSettled(
    SATELLITE_GROUPS.map(g => fetchGroupTLEs(g.key))
  );
  const all: CelesTrakGP[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      all.push(...result.value);
    }
  }
  // Deduplicate by NORAD_CAT_ID
  const seen = new Set<number>();
  return all.filter(gp => {
    if (seen.has(gp.NORAD_CAT_ID)) return false;
    seen.add(gp.NORAD_CAT_ID);
    return true;
  });
}
