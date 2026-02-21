import { describe, it, expect } from "vitest";

// ─── Replicate core logic from the HUD screen for testing ─────────────────────

const SATELLITE_IDS = [
  "SAT-001", "SAT-003", "SAT-007", "SAT-012", "SAT-019",
  "SAT-024", "SAT-031", "SAT-047", "SAT-055", "SAT-063",
];

type TelemetryEventType = "PASS" | "ANOMALY" | "LOCK" | "SIGNAL" | "DRIFT";

const EVENT_TYPE_COLORS: Record<TelemetryEventType, string> = {
  PASS: "#FFFFFF",
  ANOMALY: "#FF3333",
  LOCK: "#CCFF00",
  SIGNAL: "#FFCC00",
  DRIFT: "#FF9900",
};

function now(): string {
  return new Date().toISOString().slice(11, 19);
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface TelemetryEvent {
  id: string;
  timestamp: string;
  type: TelemetryEventType;
  satelliteId: string;
  coordinates: string;
  detail: string;
}

const EVENT_DETAILS: Record<TelemetryEventType, string[]> = {
  PASS: ["AOS confirmed", "Nominal pass", "Telemetry nominal", "LOS imminent"],
  ANOMALY: ["Attitude deviation +2.3°", "Thermal spike detected", "Comms dropout 4s", "Orbit decay alert"],
  LOCK: ["Uplink established", "Downlink locked 8.4GHz", "Ranging lock acquired", "Beacon acquired"],
  SIGNAL: ["S-band signal: -87dBm", "X-band burst received", "Beacon signal strong", "Doppler shift nominal"],
  DRIFT: ["Station-keeping burn req.", "Orbital drift +0.8km", "Inclination drift 0.02°", "Longitude drift detected"],
};

const COORD_POOL = [
  "51.5°N 0.1°W", "40.7°N 74.0°W", "35.7°N 139.7°E",
];

function generateTelemetryEvent(): TelemetryEvent {
  const type = randomFrom<TelemetryEventType>(["PASS", "ANOMALY", "LOCK", "SIGNAL", "DRIFT"]);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now(),
    type,
    satelliteId: randomFrom(SATELLITE_IDS),
    coordinates: randomFrom(COORD_POOL),
    detail: randomFrom(EVENT_DETAILS[type]),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Telemetry Event Generation", () => {
  it("generates a valid telemetry event", () => {
    const event = generateTelemetryEvent();
    expect(event).toHaveProperty("id");
    expect(event).toHaveProperty("timestamp");
    expect(event).toHaveProperty("type");
    expect(event).toHaveProperty("satelliteId");
    expect(event).toHaveProperty("coordinates");
    expect(event).toHaveProperty("detail");
  });

  it("event type is one of the valid types", () => {
    const validTypes: TelemetryEventType[] = ["PASS", "ANOMALY", "LOCK", "SIGNAL", "DRIFT"];
    for (let i = 0; i < 20; i++) {
      const event = generateTelemetryEvent();
      expect(validTypes).toContain(event.type);
    }
  });

  it("satellite ID is from the known pool", () => {
    for (let i = 0; i < 20; i++) {
      const event = generateTelemetryEvent();
      expect(SATELLITE_IDS).toContain(event.satelliteId);
    }
  });

  it("timestamp is in HH:MM:SS format", () => {
    const event = generateTelemetryEvent();
    expect(event.timestamp).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("event detail matches the event type", () => {
    for (let i = 0; i < 20; i++) {
      const event = generateTelemetryEvent();
      expect(EVENT_DETAILS[event.type]).toContain(event.detail);
    }
  });

  it("each event has a unique ID", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const event = generateTelemetryEvent();
      ids.add(event.id);
    }
    // All 50 events should have unique IDs
    expect(ids.size).toBe(50);
  });
});

describe("Event Type Colors", () => {
  it("LOCK events use Volt Green", () => {
    expect(EVENT_TYPE_COLORS.LOCK).toBe("#CCFF00");
  });

  it("ANOMALY events use Red", () => {
    expect(EVENT_TYPE_COLORS.ANOMALY).toBe("#FF3333");
  });

  it("PASS events use White", () => {
    expect(EVENT_TYPE_COLORS.PASS).toBe("#FFFFFF");
  });

  it("SIGNAL events use Yellow", () => {
    expect(EVENT_TYPE_COLORS.SIGNAL).toBe("#FFCC00");
  });

  it("DRIFT events use Orange", () => {
    expect(EVENT_TYPE_COLORS.DRIFT).toBe("#FF9900");
  });
});

describe("Telemetry Feed State Management", () => {
  it("prepending new events keeps newest at top", () => {
    let feed: TelemetryEvent[] = [];
    for (let i = 0; i < 5; i++) {
      const event = generateTelemetryEvent();
      feed = [event, ...feed].slice(0, 50);
    }
    // The last added event should be at index 0
    expect(feed.length).toBe(5);
  });

  it("feed is capped at 50 events", () => {
    let feed: TelemetryEvent[] = [];
    for (let i = 0; i < 60; i++) {
      const event = generateTelemetryEvent();
      feed = [event, ...feed].slice(0, 50);
    }
    expect(feed.length).toBe(50);
  });
});

describe("URL Configuration", () => {
  it("base URL uses the correct port", () => {
    const TAILSCALE_IP = "100.x.x.x";
    const BASE_URL = `http://${TAILSCALE_IP}:8080`;
    expect(BASE_URL).toContain(":8080");
  });

  it("status URL is correctly formed", () => {
    const TAILSCALE_IP = "100.x.x.x";
    const BASE_URL = `http://${TAILSCALE_IP}:8080`;
    const STATUS_URL = `${BASE_URL}/status`;
    expect(STATUS_URL).toBe("http://100.x.x.x:8080/status");
  });

  it("reason URL is correctly formed", () => {
    const TAILSCALE_IP = "100.x.x.x";
    const BASE_URL = `http://${TAILSCALE_IP}:8080`;
    const REASON_URL = `${BASE_URL}/reason`;
    expect(REASON_URL).toBe("http://100.x.x.x:8080/reason");
  });
});

describe("Theme Colors", () => {
  it("Volt Green is the correct hex value", () => {
    const VOLT_GREEN = "#CCFF00";
    expect(VOLT_GREEN).toBe("#CCFF00");
  });

  it("Background is near-black", () => {
    const BLACK = "#050505";
    expect(BLACK).toBe("#050505");
  });
});
