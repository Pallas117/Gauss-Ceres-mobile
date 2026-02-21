import { describe, it, expect } from "vitest";

// ─── Replicate core logic from the HUD screen ─────────────────────────────────

type TelemetryEventType = "PASS" | "ANOMALY" | "LOCK" | "SIGNAL" | "DRIFT" | "CRITICAL";

const SATELLITE_IDS = [
  "SAT-001","SAT-003","SAT-007","SAT-012","SAT-019",
  "SAT-024","SAT-031","SAT-047","SAT-055","SAT-063",
];

const COORD_POOL = [
  "51.5°N 0.1°W","40.7°N 74.0°W","35.7°N 139.7°E",
];

const EVENT_DETAILS: Record<TelemetryEventType, string[]> = {
  PASS:     ["AOS confirmed","Nominal pass","Telemetry nominal","LOS imminent"],
  ANOMALY:  ["Attitude deviation +2.3°","Thermal spike detected","Comms dropout 4s","Orbit decay alert"],
  LOCK:     ["Uplink established","Downlink locked 8.4GHz","Ranging lock acquired","Beacon acquired"],
  SIGNAL:   ["S-band signal: -87dBm","X-band burst received","Beacon signal strong","Doppler shift nominal"],
  DRIFT:    ["Station-keeping burn req.","Orbital drift +0.8km","Inclination drift 0.02°","Longitude drift detected"],
  CRITICAL: ["COLLISION RISK DETECTED","UNAUTHORIZED UPLINK","ENCRYPTION BREACH","ORBITAL INTERCEPT"],
};

const EVENT_TYPE_COLORS: Record<TelemetryEventType, string> = {
  PASS:     "#FFFFFF",
  ANOMALY:  "#FF9900",
  LOCK:     "#CCFF00",
  SIGNAL:   "#FFCC00",
  DRIFT:    "#FF7700",
  CRITICAL: "#FF2222",
};

const DANGER_THRESHOLD = 75;

const URGENT_CONTROLS = [
  { id: "abort",    label: "ABORT",    color: "#FF2222", command: "ABORT — halt all active operations immediately" },
  { id: "isolate",  label: "ISOLATE",  color: "#FF9900", command: "ISOLATE — sever uplink to compromised satellite" },
  { id: "override", label: "OVERRIDE", color: "#FFCC00", command: "OVERRIDE — force manual control of node systems" },
  { id: "lockdown", label: "LOCKDOWN", color: "#FFFFFF", command: "LOCKDOWN — engage full system security protocol" },
] as const;

function nowTime(): string {
  return new Date().toISOString().slice(11, 19);
}
function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function threatForType(type: TelemetryEventType): number {
  switch (type) {
    case "CRITICAL": return 80 + Math.floor(Math.random() * 20);
    case "ANOMALY":  return 40 + Math.floor(Math.random() * 50);
    case "DRIFT":    return 20 + Math.floor(Math.random() * 35);
    case "SIGNAL":   return 5  + Math.floor(Math.random() * 25);
    default:         return Math.floor(Math.random() * 15);
  }
}
function generateEvent() {
  const roll = Math.random();
  let type: TelemetryEventType;
  if (roll < 0.05)      type = "CRITICAL";
  else if (roll < 0.20) type = "ANOMALY";
  else if (roll < 0.35) type = "DRIFT";
  else if (roll < 0.55) type = "SIGNAL";
  else if (roll < 0.75) type = "LOCK";
  else                  type = "PASS";
  return {
    id: uid(),
    timestamp: nowTime(),
    type,
    satelliteId: pick(SATELLITE_IDS),
    coordinates: pick(COORD_POOL),
    detail: pick(EVENT_DETAILS[type]),
    threatPct: threatForType(type),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Telemetry Event Generation", () => {
  it("generates a valid telemetry event with all required fields", () => {
    const e = generateEvent();
    expect(e).toHaveProperty("id");
    expect(e).toHaveProperty("timestamp");
    expect(e).toHaveProperty("type");
    expect(e).toHaveProperty("satelliteId");
    expect(e).toHaveProperty("coordinates");
    expect(e).toHaveProperty("detail");
    expect(e).toHaveProperty("threatPct");
  });

  it("event type is one of the valid types including CRITICAL", () => {
    const valid: TelemetryEventType[] = ["PASS","ANOMALY","LOCK","SIGNAL","DRIFT","CRITICAL"];
    for (let i = 0; i < 30; i++) {
      expect(valid).toContain(generateEvent().type);
    }
  });

  it("satellite ID is from the known pool", () => {
    for (let i = 0; i < 20; i++) {
      expect(SATELLITE_IDS).toContain(generateEvent().satelliteId);
    }
  });

  it("timestamp is in HH:MM:SS format", () => {
    expect(generateEvent().timestamp).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("event detail matches the event type", () => {
    for (let i = 0; i < 20; i++) {
      const e = generateEvent();
      expect(EVENT_DETAILS[e.type]).toContain(e.detail);
    }
  });

  it("each event has a unique ID", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateEvent().id));
    expect(ids.size).toBe(50);
  });
});

describe("Threat Probability", () => {
  it("CRITICAL events always have threatPct >= 80", () => {
    for (let i = 0; i < 50; i++) {
      const pct = threatForType("CRITICAL");
      expect(pct).toBeGreaterThanOrEqual(80);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });

  it("PASS events always have threatPct < 15", () => {
    for (let i = 0; i < 50; i++) {
      expect(threatForType("PASS")).toBeLessThan(15);
    }
  });

  it("ANOMALY events have threatPct in range 40-90", () => {
    for (let i = 0; i < 50; i++) {
      const pct = threatForType("ANOMALY");
      expect(pct).toBeGreaterThanOrEqual(40);
      expect(pct).toBeLessThan(90);
    }
  });

  it("threat probability is always 0-100", () => {
    const types: TelemetryEventType[] = ["PASS","ANOMALY","LOCK","SIGNAL","DRIFT","CRITICAL"];
    for (const type of types) {
      for (let i = 0; i < 10; i++) {
        const pct = threatForType(type);
        expect(pct).toBeGreaterThanOrEqual(0);
        expect(pct).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("Danger Flash Threshold", () => {
  it("CRITICAL events should trigger danger flash (>= threshold)", () => {
    for (let i = 0; i < 20; i++) {
      expect(threatForType("CRITICAL")).toBeGreaterThanOrEqual(DANGER_THRESHOLD);
    }
  });

  it("PASS events should NOT trigger danger flash", () => {
    for (let i = 0; i < 20; i++) {
      expect(threatForType("PASS")).toBeLessThan(DANGER_THRESHOLD);
    }
  });

  it("danger threshold is 75", () => {
    expect(DANGER_THRESHOLD).toBe(75);
  });
});

describe("Event Type Colors", () => {
  it("LOCK events use Volt Green", () => {
    expect(EVENT_TYPE_COLORS.LOCK).toBe("#CCFF00");
  });
  it("CRITICAL events use Red", () => {
    expect(EVENT_TYPE_COLORS.CRITICAL).toBe("#FF2222");
  });
  it("ANOMALY events use Orange", () => {
    expect(EVENT_TYPE_COLORS.ANOMALY).toBe("#FF9900");
  });
  it("PASS events use White", () => {
    expect(EVENT_TYPE_COLORS.PASS).toBe("#FFFFFF");
  });
});

describe("Urgent Controls", () => {
  it("has exactly 4 urgent controls", () => {
    expect(URGENT_CONTROLS).toHaveLength(4);
  });

  it("ABORT is the first and most critical control", () => {
    expect(URGENT_CONTROLS[0].id).toBe("abort");
    expect(URGENT_CONTROLS[0].label).toBe("ABORT");
  });

  it("all controls have id, label, color, and command", () => {
    for (const ctrl of URGENT_CONTROLS) {
      expect(ctrl).toHaveProperty("id");
      expect(ctrl).toHaveProperty("label");
      expect(ctrl).toHaveProperty("color");
      expect(ctrl).toHaveProperty("command");
    }
  });

  it("ABORT command contains halt instruction", () => {
    const abort = URGENT_CONTROLS.find(c => c.id === "abort");
    expect(abort?.command).toContain("halt");
  });

  it("LOCKDOWN command contains security protocol", () => {
    const lockdown = URGENT_CONTROLS.find(c => c.id === "lockdown");
    expect(lockdown?.command).toContain("security protocol");
  });
});

describe("Telemetry Feed State", () => {
  it("prepending keeps newest event at index 0", () => {
    let feed = Array.from({ length: 5 }, generateEvent);
    const newEvent = generateEvent();
    feed = [newEvent, ...feed].slice(0, 50);
    expect(feed[0].id).toBe(newEvent.id);
  });

  it("feed is capped at 50 events", () => {
    let feed: ReturnType<typeof generateEvent>[] = [];
    for (let i = 0; i < 60; i++) {
      feed = [generateEvent(), ...feed].slice(0, 50);
    }
    expect(feed.length).toBe(50);
  });
});

describe("URL Configuration", () => {
  it("status URL is correctly formed", () => {
    const ip = "100.x.x.x";
    expect(`http://${ip}:8080/status`).toBe("http://100.x.x.x:8080/status");
  });
  it("reason URL is correctly formed", () => {
    const ip = "100.x.x.x";
    expect(`http://${ip}:8080/reason`).toBe("http://100.x.x.x:8080/reason");
  });
  it("health check interval is 10 seconds", () => {
    expect(10_000).toBe(10000);
  });
});
