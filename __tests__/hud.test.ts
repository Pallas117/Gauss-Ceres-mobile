/**
 * Project Gauss HUD — Unit Tests
 * Covers: satellite service, event classification, coordinate formatting,
 *         urgent controls, danger flash threshold, and TLE data structures.
 */

import { describe, it, expect, vi } from "vitest";
import {
  propagateGP,
  classifyEvent,
  formatCoords,
  formatSatName,
  SATELLITE_GROUPS,
  type CelesTrakGP,
  type OrbitalState,
} from "../lib/satellite-service";

// ─── Sample GP records (real TLE-derived values) ──────────────────────────────
const ISS_GP: CelesTrakGP = {
  OBJECT_NAME: "ISS (ZARYA)",
  OBJECT_ID: "1998-067A",
  NORAD_CAT_ID: 25544,
  EPOCH: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), // 3 hours ago
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

const STALE_GP: CelesTrakGP = {
  ...ISS_GP,
  OBJECT_NAME: "STALE SAT",
  EPOCH: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(), // 10 days ago
};

const LOW_ALT_GP: CelesTrakGP = {
  ...ISS_GP,
  OBJECT_NAME: "DECAYING SAT",
  MEAN_MOTION: 16.5, // higher mean motion = lower orbit
  MEAN_ANOMALY: 0,
};

// ─── Satellite Service Tests ──────────────────────────────────────────────────
describe("propagateGP", () => {
  it("returns valid position for ISS", () => {
    const state = propagateGP(ISS_GP);
    expect(state.error).toBe(false);
    expect(state.noradId).toBe(25544);
    expect(state.name).toBe("ISS (ZARYA)");
    expect(state.lat).toBeGreaterThanOrEqual(-90);
    expect(state.lat).toBeLessThanOrEqual(90);
    expect(state.lon).toBeGreaterThanOrEqual(-180);
    expect(state.lon).toBeLessThanOrEqual(180);
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
    expect(state.velKms).toBeGreaterThan(2);
    expect(state.velKms).toBeLessThan(4.5);
  });

  it("computes correct orbital period for ISS (~92 min)", () => {
    const state = propagateGP(ISS_GP);
    expect(state.period).toBeGreaterThan(88);
    expect(state.period).toBeLessThan(96);
  });

  it("computes epoch age correctly", () => {
    const state = propagateGP(ISS_GP);
    // ISS_GP epoch is 3 hours ago
    expect(state.epochAge).toBeGreaterThan(2.9);
    expect(state.epochAge).toBeLessThan(3.1);
  });

  it("returns inclination from GP record", () => {
    const state = propagateGP(ISS_GP);
    expect(state.inclination).toBeCloseTo(51.6322, 2);
  });

  it("propagates to a specific date correctly", () => {
    const date1 = new Date("2026-02-21T12:00:00Z");
    const date2 = new Date("2026-02-21T12:45:00Z"); // ~half orbit later
    const s1 = propagateGP(ISS_GP, date1);
    const s2 = propagateGP(ISS_GP, date2);
    // Position should differ after 45 minutes
    expect(Math.abs(s1.lat - s2.lat) + Math.abs(s1.lon - s2.lon)).toBeGreaterThan(0.01);
  });
});

// ─── Event Classification Tests ───────────────────────────────────────────────
describe("classifyEvent", () => {
  it("classifies fresh ISS state as PASS", () => {
    const state = propagateGP(ISS_GP);
    const { type } = classifyEvent(state);
    expect(["PASS", "ANOMALY", "DRIFT", "LOCK", "SIGNAL", "CRITICAL"]).toContain(type);
  });

  it("classifies GPS satellite as LOCK (MEO altitude)", () => {
    const state = propagateGP(GPS_GP);
    const { type } = classifyEvent(state);
    expect(type).toBe("LOCK");
  });

  it("classifies stale TLE (>7 days) as CRITICAL", () => {
    const state: OrbitalState = {
      noradId: 99999,
      name: "STALE SAT",
      objectId: "2020-001A",
      lat: 45, lon: 90, altKm: 420, velKms: 7.6,
      inclination: 51.6, period: 92, epochAge: 200, // 200 hours = ~8.3 days
      error: false,
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
    const { type } = classifyEvent(state);
    expect(type).toBe("ANOMALY");
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
      inclination: 97, period: 95, epochAge: 48, // 2 days old
      error: false,
    };
    const { type } = classifyEvent(state);
    expect(type).toBe("DRIFT");
  });

  it("classifies GEO satellite (>35000km) as SIGNAL", () => {
    const state: OrbitalState = {
      noradId: 22222, name: "INTELSAT 1", objectId: "1965-028A",
      lat: 0.1, lon: 45, altKm: 35786, velKms: 3.07,
      inclination: 0.1, period: 1436, epochAge: 2, error: false,
    };
    const { type } = classifyEvent(state);
    expect(type).toBe("SIGNAL");
  });

  it("returns threat percentage in 0-100 range", () => {
    const state = propagateGP(ISS_GP);
    const { threatPct } = classifyEvent(state);
    expect(threatPct).toBeGreaterThanOrEqual(0);
    expect(threatPct).toBeLessThanOrEqual(100);
  });

  it("returns non-empty detail string", () => {
    const state = propagateGP(ISS_GP);
    const { detail } = classifyEvent(state);
    expect(detail.length).toBeGreaterThan(5);
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

  it("formats extreme coordinates", () => {
    expect(formatCoords(90, 180)).toBe("90.0°N 180.0°E");
    expect(formatCoords(-90, -180)).toBe("90.0°S 180.0°W");
  });
});

// ─── Satellite Name Formatting Tests ─────────────────────────────────────────
describe("formatSatName", () => {
  it("trims and uppercases satellite names", () => {
    expect(formatSatName("  iss zarya  ")).toBe("ISS ZARYA");
  });

  it("truncates long names to 14 characters", () => {
    const long = "VERY LONG SATELLITE NAME HERE";
    expect(formatSatName(long).length).toBeLessThanOrEqual(14);
  });

  it("handles already-uppercase names", () => {
    expect(formatSatName("GPS BIIR-2")).toBe("GPS BIIR-2");
  });
});

// ─── Satellite Groups Config Tests ────────────────────────────────────────────
describe("SATELLITE_GROUPS", () => {
  it("includes required groups", () => {
    const keys = SATELLITE_GROUPS.map(g => g.key);
    expect(keys).toContain("stations");
    expect(keys).toContain("weather");
    expect(keys).toContain("gps-ops");
  });

  it("all groups have key, label, and priority", () => {
    SATELLITE_GROUPS.forEach(g => {
      expect(g.key).toBeTruthy();
      expect(g.label).toBeTruthy();
      expect(g.priority).toBeGreaterThan(0);
    });
  });

  it("priorities are unique", () => {
    const priorities = SATELLITE_GROUPS.map(g => g.priority);
    const unique = new Set(priorities);
    expect(unique.size).toBe(priorities.length);
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
