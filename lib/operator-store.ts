/**
 * operator-store.ts
 *
 * Persistent store for operator-registered satellites and custom risk telemetry.
 * Uses AsyncStorage for local persistence across sessions.
 *
 * Schema:
 *   OperatorSatellite — a satellite registered by a human operator
 *   OperatorRiskEvent — a risk telemetry event submitted by an operator
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Storage Keys ─────────────────────────────────────────────────────────────
const SATS_KEY   = "@gauss:operator_satellites";
const EVENTS_KEY = "@gauss:operator_events";

// ─── Risk Level ───────────────────────────────────────────────────────────────
export type RiskLevel = "NOMINAL" | "ELEVATED" | "HIGH" | "CRITICAL";

export const RISK_LEVELS: RiskLevel[] = ["NOMINAL", "ELEVATED", "HIGH", "CRITICAL"];

export const RISK_LEVEL_THREAT: Record<RiskLevel, number> = {
  NOMINAL:  10,
  ELEVATED: 40,
  HIGH:     70,
  CRITICAL: 90,
};

export const RISK_LEVEL_COLORS: Record<RiskLevel, string> = {
  NOMINAL:  "#CCFF00",
  ELEVATED: "#FFCC00",
  HIGH:     "#FF9900",
  CRITICAL: "#FF2222",
};

// ─── Event Type ───────────────────────────────────────────────────────────────
export type OperatorEventType =
  | "COLLISION_RISK"
  | "DEBRIS_FIELD"
  | "SIGNAL_ANOMALY"
  | "ATTITUDE_FAULT"
  | "POWER_DEGRADATION"
  | "THERMAL_ANOMALY"
  | "ORBIT_DECAY"
  | "COMMS_LOSS"
  | "CUSTOM";

export const OPERATOR_EVENT_TYPES: OperatorEventType[] = [
  "COLLISION_RISK",
  "DEBRIS_FIELD",
  "SIGNAL_ANOMALY",
  "ATTITUDE_FAULT",
  "POWER_DEGRADATION",
  "THERMAL_ANOMALY",
  "ORBIT_DECAY",
  "COMMS_LOSS",
  "CUSTOM",
];

export const EVENT_TYPE_LABELS: Record<OperatorEventType, string> = {
  COLLISION_RISK:    "Collision Risk",
  DEBRIS_FIELD:      "Debris Field",
  SIGNAL_ANOMALY:    "Signal Anomaly",
  ATTITUDE_FAULT:    "Attitude Fault",
  POWER_DEGRADATION: "Power Degradation",
  THERMAL_ANOMALY:   "Thermal Anomaly",
  ORBIT_DECAY:       "Orbit Decay",
  COMMS_LOSS:        "Comms Loss",
  CUSTOM:            "Custom Event",
};

// ─── Operator Satellite Schema ────────────────────────────────────────────────
export interface OperatorSatellite {
  id: string;                    // UUID
  registeredAt: string;          // ISO timestamp
  updatedAt: string;             // ISO timestamp

  // Identity
  name: string;                  // e.g. "SENTINEL-6A"
  noradId: string;               // NORAD catalog number (optional, string for flexibility)
  cosparId: string;              // COSPAR/INTDES e.g. "2020-086A"
  operator: string;              // Organisation name
  country: string;               // Country/agency code e.g. "ESA", "NASA", "JAXA"

  // Orbital parameters (operator-provided, not computed)
  altitudeKm: string;            // Approximate altitude in km
  inclination: string;           // Orbital inclination in degrees
  orbitType: "LEO" | "MEO" | "GEO" | "HEO" | "SSO" | "OTHER";

  // Risk profile
  baseRiskLevel: RiskLevel;
  notes: string;                 // Free-text notes from operator

  // Status
  isActive: boolean;
}

// ─── Operator Risk Event Schema ───────────────────────────────────────────────
export interface OperatorRiskEvent {
  id: string;
  satelliteId: string;           // FK to OperatorSatellite.id
  satelliteName: string;         // Denormalised for display
  submittedAt: string;           // ISO timestamp
  submittedBy: string;           // Operator name/callsign

  eventType: OperatorEventType;
  riskLevel: RiskLevel;
  threatPct: number;             // 0–100, operator-assessed probability

  // Location (optional, operator-provided)
  latitude: string;
  longitude: string;

  // Details
  description: string;           // Free-text description
  affectedSystems: string;       // Comma-separated systems affected
  mitigationStatus: "NONE" | "MONITORING" | "MITIGATING" | "RESOLVED";

  // Metadata
  isAcknowledged: boolean;
  acknowledgedAt: string | null;
}

// ─── Blank templates ──────────────────────────────────────────────────────────
export function blankSatellite(): Omit<OperatorSatellite, "id" | "registeredAt" | "updatedAt"> {
  return {
    name: "",
    noradId: "",
    cosparId: "",
    operator: "",
    country: "",
    altitudeKm: "",
    inclination: "",
    orbitType: "LEO",
    baseRiskLevel: "NOMINAL",
    notes: "",
    isActive: true,
  };
}

export function blankRiskEvent(sat?: OperatorSatellite): Omit<OperatorRiskEvent, "id" | "submittedAt"> {
  return {
    satelliteId: sat?.id ?? "",
    satelliteName: sat?.name ?? "",
    submittedBy: "",
    eventType: "CUSTOM",
    riskLevel: "ELEVATED",
    threatPct: 40,
    latitude: "",
    longitude: "",
    description: "",
    affectedSystems: "",
    mitigationStatus: "NONE",
    isAcknowledged: false,
    acknowledgedAt: null,
  };
}

// ─── UUID generator ───────────────────────────────────────────────────────────
function genId(): string {
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Satellite CRUD ───────────────────────────────────────────────────────────
export async function loadSatellites(): Promise<OperatorSatellite[]> {
  try {
    const raw = await AsyncStorage.getItem(SATS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveSatellite(
  data: Omit<OperatorSatellite, "id" | "registeredAt" | "updatedAt">
): Promise<OperatorSatellite> {
  const now = new Date().toISOString();
  const sat: OperatorSatellite = { ...data, id: genId(), registeredAt: now, updatedAt: now };
  const existing = await loadSatellites();
  await AsyncStorage.setItem(SATS_KEY, JSON.stringify([...existing, sat]));
  return sat;
}

export async function updateSatellite(
  id: string,
  data: Partial<Omit<OperatorSatellite, "id" | "registeredAt">>
): Promise<OperatorSatellite | null> {
  const existing = await loadSatellites();
  const idx = existing.findIndex(s => s.id === id);
  if (idx === -1) return null;
  const updated = { ...existing[idx], ...data, updatedAt: new Date().toISOString() };
  existing[idx] = updated;
  await AsyncStorage.setItem(SATS_KEY, JSON.stringify(existing));
  return updated;
}

export async function deleteSatellite(id: string): Promise<void> {
  const existing = await loadSatellites();
  await AsyncStorage.setItem(SATS_KEY, JSON.stringify(existing.filter(s => s.id !== id)));
  // Also remove associated events
  const events = await loadRiskEvents();
  await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(events.filter(e => e.satelliteId !== id)));
}

// ─── Risk Event CRUD ──────────────────────────────────────────────────────────
export async function loadRiskEvents(): Promise<OperatorRiskEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(EVENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function submitRiskEvent(
  data: Omit<OperatorRiskEvent, "id" | "submittedAt">
): Promise<OperatorRiskEvent> {
  const event: OperatorRiskEvent = {
    ...data,
    id: genId(),
    submittedAt: new Date().toISOString(),
  };
  const existing = await loadRiskEvents();
  // Keep last 200 events
  const trimmed = [event, ...existing].slice(0, 200);
  await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(trimmed));
  return event;
}

export async function acknowledgeRiskEvent(id: string): Promise<void> {
  const events = await loadRiskEvents();
  const updated = events.map(e =>
    e.id === id
      ? { ...e, isAcknowledged: true, acknowledgedAt: new Date().toISOString() }
      : e
  );
  await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(updated));
}

export async function deleteRiskEvent(id: string): Promise<void> {
  const events = await loadRiskEvents();
  await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(events.filter(e => e.id !== id)));
}

// ─── Convert operator event → telemetry feed format ──────────────────────────
export function operatorEventToTelemetry(event: OperatorRiskEvent) {
  const coords =
    event.latitude && event.longitude
      ? `${Math.abs(parseFloat(event.latitude)).toFixed(1)}°${parseFloat(event.latitude) >= 0 ? "N" : "S"} ` +
        `${Math.abs(parseFloat(event.longitude)).toFixed(1)}°${parseFloat(event.longitude) >= 0 ? "E" : "W"}`
      : "COORDS UNKNOWN";

  const typeMap: Record<OperatorEventType, string> = {
    COLLISION_RISK:    "CRITICAL",
    DEBRIS_FIELD:      "ANOMALY",
    SIGNAL_ANOMALY:    "SIGNAL",
    ATTITUDE_FAULT:    "ANOMALY",
    POWER_DEGRADATION: "DRIFT",
    THERMAL_ANOMALY:   "ANOMALY",
    ORBIT_DECAY:       "CRITICAL",
    COMMS_LOSS:        "SIGNAL",
    CUSTOM:            "ANOMALY",
  };

  return {
    id: event.id,
    timestamp: event.submittedAt.slice(11, 19),
    type: typeMap[event.eventType] as "PASS" | "ANOMALY" | "LOCK" | "SIGNAL" | "DRIFT" | "CRITICAL",
    satName: `[OP] ${event.satelliteName.slice(0, 10)}`,
    noradId: 0,
    coordinates: coords,
    detail: event.description || EVENT_TYPE_LABELS[event.eventType],
    threatPct: event.threatPct,
    altKm: 0,
    velKms: 0,
    isReal: true as const,
    isOperator: true,
    mitigationStatus: event.mitigationStatus,
  };
}
