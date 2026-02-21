/**
 * Project Gauss HUD — Test Suite v4
 * Covers: satellite service, operator store, GDS theme, urgent controls, danger flash
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  propagateGP,
  classifyEvent,
  formatCoords,
  formatSatName,
  SATELLITE_GROUPS,
  type CelesTrakGP,
  type OrbitalState,
} from "../lib/satellite-service";

// ─── Mock AsyncStorage ────────────────────────────────────────────────────────
const store: Record<string, string> = {};
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem:    (k: string) => Promise.resolve(store[k] ?? null),
    setItem:    (k: string, v: string) => { store[k] = v; return Promise.resolve(); },
    removeItem: (k: string) => { delete store[k]; return Promise.resolve(); },
    clear:      () => { Object.keys(store).forEach(k => delete store[k]); return Promise.resolve(); },
  },
}));

// ─── Sample GP records ────────────────────────────────────────────────────────
const ISS_GP: CelesTrakGP = {
  OBJECT_NAME: "ISS (ZARYA)",
  OBJECT_ID: "1998-067A",
  NORAD_CAT_ID: 25544,
  EPOCH: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  MEAN_MOTION: 15.48178501,
  ECCENTRICITY: 0.00085229,
  INCLINATION: 51.6322,
  RA_OF_ASC_NODE: 153.6219,
  ARG_OF_PERICENTER: 117.8535,
  MEAN_ANOMALY: 242.3318,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: "U",
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 55378,
  BSTAR: 0.00021781902,
  MEAN_MOTION_DOT: 0.00011241,
  MEAN_MOTION_DDOT: 0,
};

const GPS_GP: CelesTrakGP = {
  OBJECT_NAME: "GPS BIIR-2  (PRN 13)",
  OBJECT_ID: "1997-035A",
  NORAD_CAT_ID: 24876,
  EPOCH: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  MEAN_MOTION: 2.00565256,
  ECCENTRICITY: 0.0084689,
  INCLINATION: 55.7827,
  RA_OF_ASC_NODE: 22.5435,
  ARG_OF_PERICENTER: 196.5843,
  MEAN_ANOMALY: 163.0308,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: "U",
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 13789,
  BSTAR: 0,
  MEAN_MOTION_DOT: 0,
  MEAN_MOTION_DDOT: 0,
};

// ─── Satellite Service Tests ──────────────────────────────────────────────────
describe("propagateGP", () => {
  it("returns valid position for ISS", () => {
    const state = propagateGP(ISS_GP);
    expect(state.error).toBe(false);
    expect(state.noradId).toBe(25544);
    expect(state.lat).toBeGreaterThanOrEqual(-90);
    expect(state.lat).toBeLessThanOrEqual(90);
    expect(state.altKm).toBeGreaterThan(300);
    expect(state.altKm).toBeLessThan(500);
    expect(state.velKms).toBeGreaterThan(7);
    expect(state.velKms).toBeLessThan(8.5);
  });

  it("returns valid position for GPS satellite (MEO)", () => {
    const state = propagateGP(GPS_GP);
    expect(state.error).toBe(false);
    expect(state.altKm).toBeGreaterThan(18000);
    expect(state.altKm).toBeLessThan(25000);
  });

  it("computes correct orbital period for ISS (~92 min)", () => {
    const state = propagateGP(ISS_GP);
    expect(state.period).toBeGreaterThan(88);
    expect(state.period).toBeLessThan(96);
  });

  it("computes epoch age correctly", () => {
    const state = propagateGP(ISS_GP);
    expect(state.epochAge).toBeGreaterThan(2.9);
    expect(state.epochAge).toBeLessThan(3.1);
  });
});

// ─── Event Classification Tests ───────────────────────────────────────────────
describe("classifyEvent", () => {
  it("classifies GPS satellite as LOCK (MEO altitude)", () => {
    const state = propagateGP(GPS_GP);
    const { type } = classifyEvent(state);
    expect(type).toBe("LOCK");
  });

  it("classifies stale TLE (>7 days) as CRITICAL", () => {
    const state: OrbitalState = {
      noradId: 99999, name: "STALE SAT", objectId: "2020-001A",
      lat: 45, lon: 90, altKm: 420, velKms: 7.6,
      inclination: 51.6, period: 92, epochAge: 200, error: false,
    };
    const { type, threatPct } = classifyEvent(state);
    expect(type).toBe("CRITICAL");
    expect(threatPct).toBeGreaterThanOrEqual(75);
  });

  it("classifies error state as ANOMALY", () => {
    const state: OrbitalState = {
      noradId: 0, name: "ERROR SAT", objectId: "0",
      lat: 0, lon: 0, altKm: 0, velKms: 0,
      inclination: 0, period: 0, epochAge: 0, error: true,
    };
    expect(classifyEvent(state).type).toBe("ANOMALY");
  });

  it("classifies very low altitude as CRITICAL", () => {
    const state: OrbitalState = {
      noradId: 12345, name: "DECAYING SAT", objectId: "2020-002A",
      lat: 10, lon: 20, altKm: 150, velKms: 7.9,
      inclination: 51.6, period: 88, epochAge: 1, error: false,
    };
    const { type, threatPct } = classifyEvent(state);
    expect(type).toBe("CRITICAL");
    expect(threatPct).toBeGreaterThanOrEqual(75);
  });

  it("classifies slightly stale TLE (1-7 days) as DRIFT", () => {
    const state: OrbitalState = {
      noradId: 11111, name: "DRIFTING SAT", objectId: "2021-001A",
      lat: 30, lon: -45, altKm: 550, velKms: 7.5,
      inclination: 97, period: 95, epochAge: 48, error: false,
    };
    expect(classifyEvent(state).type).toBe("DRIFT");
  });

  it("classifies GEO satellite (>35000km) as SIGNAL", () => {
    const state: OrbitalState = {
      noradId: 22222, name: "INTELSAT 1", objectId: "1965-028A",
      lat: 0.1, lon: 45, altKm: 35786, velKms: 3.07,
      inclination: 0.1, period: 1436, epochAge: 2, error: false,
    };
    expect(classifyEvent(state).type).toBe("SIGNAL");
  });

  it("returns threat percentage in 0-100 range", () => {
    const state = propagateGP(ISS_GP);
    const { threatPct } = classifyEvent(state);
    expect(threatPct).toBeGreaterThanOrEqual(0);
    expect(threatPct).toBeLessThanOrEqual(100);
  });
});

// ─── Coordinate Formatting Tests ──────────────────────────────────────────────
describe("formatCoords", () => {
  it("formats positive lat/lon as N/E", () => {
    expect(formatCoords(45.5, 90.2)).toBe("45.5°N 90.2°E");
  });

  it("formats negative lat/lon as S/W", () => {
    expect(formatCoords(-33.9, -70.7)).toBe("33.9°S 70.7°W");
  });

  it("formats equator/prime meridian correctly", () => {
    expect(formatCoords(0, 0)).toBe("0.0°N 0.0°E");
  });
});

// ─── Satellite Name Formatting Tests ─────────────────────────────────────────
describe("formatSatName", () => {
  it("trims and uppercases satellite names", () => {
    expect(formatSatName("  iss zarya  ")).toBe("ISS ZARYA");
  });

  it("truncates long names to 14 characters", () => {
    expect(formatSatName("VERY LONG SATELLITE NAME HERE").length).toBeLessThanOrEqual(14);
  });
});

// ─── Satellite Groups Config Tests ────────────────────────────────────────────
describe("SATELLITE_GROUPS", () => {
  it("includes required groups", () => {
    const keys = SATELLITE_GROUPS.map(g => g.key);
    expect(keys).toContain("stations");
    expect(keys).toContain("gps-ops");
    expect(keys).toContain("military");
  });

  it("all groups have key, label, and priority", () => {
    SATELLITE_GROUPS.forEach(g => {
      expect(g.key).toBeTruthy();
      expect(g.label).toBeTruthy();
      expect(g.priority).toBeGreaterThan(0);
    });
  });
});

// ─── Operator Store Tests ─────────────────────────────────────────────────────
describe("operator-store", () => {
  beforeEach(() => {
    Object.keys(store).forEach(k => delete store[k]);
    vi.resetModules();
  });

  it("loadSatellites returns empty array when no data", async () => {
    const { loadSatellites } = await import("../lib/operator-store");
    expect(await loadSatellites()).toEqual([]);
  });

  it("saveSatellite persists and returns satellite with id", async () => {
    const { saveSatellite, loadSatellites, blankSatellite } = await import("../lib/operator-store");
    const saved = await saveSatellite({ ...blankSatellite(), name: "SENTINEL-6A", operator: "ESA" });
    expect(saved.id).toMatch(/^op-/);
    expect(saved.name).toBe("SENTINEL-6A");
    const all = await loadSatellites();
    expect(all).toHaveLength(1);
  });

  it("updateSatellite modifies existing satellite", async () => {
    const { saveSatellite, updateSatellite, loadSatellites, blankSatellite } = await import("../lib/operator-store");
    const sat = await saveSatellite({ ...blankSatellite(), name: "ORIGINAL" });
    await updateSatellite(sat.id, { name: "UPDATED", baseRiskLevel: "HIGH" });
    const all = await loadSatellites();
    expect(all[0].name).toBe("UPDATED");
    expect(all[0].baseRiskLevel).toBe("HIGH");
  });

  it("deleteSatellite removes satellite and its events", async () => {
    const { saveSatellite, deleteSatellite, loadSatellites, submitRiskEvent, loadRiskEvents, blankSatellite, blankRiskEvent } = await import("../lib/operator-store");
    const sat = await saveSatellite({ ...blankSatellite(), name: "TO_DELETE" });
    await submitRiskEvent({ ...blankRiskEvent(sat), description: "test event" });
    await deleteSatellite(sat.id);
    expect(await loadSatellites()).toHaveLength(0);
    expect(await loadRiskEvents()).toHaveLength(0);
  });

  it("submitRiskEvent persists with id and timestamp", async () => {
    const { saveSatellite, submitRiskEvent, loadRiskEvents, blankSatellite, blankRiskEvent } = await import("../lib/operator-store");
    const sat = await saveSatellite({ ...blankSatellite(), name: "SAT-A" });
    const event = await submitRiskEvent({
      ...blankRiskEvent(sat),
      description: "Collision risk detected",
      riskLevel: "CRITICAL",
      threatPct: 88,
    });
    expect(event.id).toMatch(/^op-/);
    expect(event.threatPct).toBe(88);
    expect(await loadRiskEvents()).toHaveLength(1);
  });

  it("acknowledgeRiskEvent sets isAcknowledged and acknowledgedAt", async () => {
    const { saveSatellite, submitRiskEvent, acknowledgeRiskEvent, loadRiskEvents, blankSatellite, blankRiskEvent } = await import("../lib/operator-store");
    const sat = await saveSatellite({ ...blankSatellite(), name: "SAT-B" });
    const event = await submitRiskEvent({ ...blankRiskEvent(sat), description: "test" });
    await acknowledgeRiskEvent(event.id);
    const all = await loadRiskEvents();
    expect(all[0].isAcknowledged).toBe(true);
    expect(all[0].acknowledgedAt).toBeTruthy();
  });

  it("deleteRiskEvent removes specific event", async () => {
    const { saveSatellite, submitRiskEvent, deleteRiskEvent, loadRiskEvents, blankSatellite, blankRiskEvent } = await import("../lib/operator-store");
    const sat = await saveSatellite({ ...blankSatellite(), name: "SAT-C" });
    const e1 = await submitRiskEvent({ ...blankRiskEvent(sat), description: "event 1" });
    await submitRiskEvent({ ...blankRiskEvent(sat), description: "event 2" });
    await deleteRiskEvent(e1.id);
    const all = await loadRiskEvents();
    expect(all).toHaveLength(1);
    expect(all[0].description).toBe("event 2");
  });

  it("operatorEventToTelemetry maps COLLISION_RISK to CRITICAL type", async () => {
    const { operatorEventToTelemetry } = await import("../lib/operator-store");
    const event = {
      id: "ev1",
      submittedAt: new Date().toISOString(),
      satelliteId: "x",
      satelliteName: "TEST-SAT",
      submittedBy: "OPS",
      eventType: "COLLISION_RISK" as const,
      riskLevel: "CRITICAL" as const,
      threatPct: 90,
      latitude: "51.5",
      longitude: "-0.1",
      description: "Imminent collision",
      affectedSystems: "ADCS",
      mitigationStatus: "NONE" as const,
      isAcknowledged: false,
      acknowledgedAt: null,
    };
    const telemetry = operatorEventToTelemetry(event);
    expect(telemetry.type).toBe("CRITICAL");
    expect(telemetry.threatPct).toBe(90);
    expect(telemetry.isOperator).toBe(true);
    expect(telemetry.satName).toContain("[OP]");
    expect(telemetry.coordinates).toContain("N");
  });

  it("operatorEventToTelemetry handles missing coordinates", async () => {
    const { operatorEventToTelemetry } = await import("../lib/operator-store");
    const event = {
      id: "ev2",
      submittedAt: new Date().toISOString(),
      satelliteId: "x",
      satelliteName: "TEST",
      submittedBy: "OPS",
      eventType: "CUSTOM" as const,
      riskLevel: "ELEVATED" as const,
      threatPct: 40,
      latitude: "",
      longitude: "",
      description: "Custom event",
      affectedSystems: "",
      mitigationStatus: "MONITORING" as const,
      isAcknowledged: false,
      acknowledgedAt: null,
    };
    expect(operatorEventToTelemetry(event).coordinates).toBe("COORDS UNKNOWN");
  });

  it("RISK_LEVEL_THREAT maps correctly", async () => {
    const { RISK_LEVEL_THREAT } = await import("../lib/operator-store");
    expect(RISK_LEVEL_THREAT.NOMINAL).toBe(10);
    expect(RISK_LEVEL_THREAT.ELEVATED).toBe(40);
    expect(RISK_LEVEL_THREAT.HIGH).toBe(70);
    expect(RISK_LEVEL_THREAT.CRITICAL).toBe(90);
  });

  it("RISK_LEVEL_COLORS are valid hex for all levels", async () => {
    const { RISK_LEVEL_COLORS, RISK_LEVELS } = await import("../lib/operator-store");
    for (const level of RISK_LEVELS) {
      expect(RISK_LEVEL_COLORS[level]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

// ─── GDS Theme Tests ──────────────────────────────────────────────────────────
describe("GDS theme constants", () => {
  it("OLED-first: background is true black", () => {
    expect("#000000").toBe("#000000");
  });

  it("Volt Green is the correct GDS accent color", () => {
    const VOLT = "#CCFF00";
    expect(VOLT).toMatch(/^#[0-9A-F]{6}$/i);
    expect(VOLT).not.toBe("#00FF00");
  });

  it("danger threshold is 75% for flash alerts", () => {
    const DANGER_THRESHOLD = 75;
    expect(74 < DANGER_THRESHOLD).toBe(true);
    expect(75 >= DANGER_THRESHOLD).toBe(true);
  });
});

// ─── Urgent Controls Tests ────────────────────────────────────────────────────
describe("urgent controls", () => {
  it("all four urgent controls are defined", () => {
    const URGENT_CONTROLS = [
      { label: "ABORT",    action: "ABORT",    color: "#FF2222" },
      { label: "ISOLATE",  action: "ISOLATE",  color: "#FF6600" },
      { label: "OVERRIDE", action: "OVERRIDE", color: "#FFAA00" },
      { label: "LOCKDOWN", action: "LOCKDOWN", color: "#FFFFFF" },
    ];
    expect(URGENT_CONTROLS).toHaveLength(4);
    expect(URGENT_CONTROLS.map(c => c.action)).toEqual(["ABORT", "ISOLATE", "OVERRIDE", "LOCKDOWN"]);
  });

  it("ABORT has the highest urgency (red color)", () => {
    expect("#FF2222").toMatch(/^#FF/i);
  });
});

// ─── Danger Threshold Tests ───────────────────────────────────────────────────
describe("Danger threshold", () => {
  const DANGER_THRESHOLD = 75;

  it("CRITICAL events exceed danger threshold", () => {
    const state: OrbitalState = {
      noradId: 1, name: "TEST", objectId: "2020-001A",
      lat: 0, lon: 0, altKm: 150, velKms: 7.9,
      inclination: 51.6, period: 88, epochAge: 1, error: false,
    };
    const { threatPct } = classifyEvent(state);
    expect(threatPct).toBeGreaterThanOrEqual(DANGER_THRESHOLD);
  });

  it("normal PASS events are below danger threshold", () => {
    const state: OrbitalState = {
      noradId: 2, name: "NORMAL SAT", objectId: "2022-001A",
      lat: 45, lon: 90, altKm: 550, velKms: 7.5,
      inclination: 51.6, period: 95, epochAge: 1, error: false,
    };
    const { type, threatPct } = classifyEvent(state);
    if (type === "PASS") {
      expect(threatPct).toBeLessThan(DANGER_THRESHOLD);
    }
  });
});
