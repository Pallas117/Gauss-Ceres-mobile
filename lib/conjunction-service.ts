/**
 * Privateer Crow's Nest Conjunction Service
 *
 * Fetches live collision risk data from Privateer's publicly accessible
 * Wayfinder platform: https://wayfinder.privateer.com/data/conjunctions.json
 *
 * Data is generated daily and contains ~100 highest-risk conjunction events
 * with 3D collision probabilities (HALL-2021) and ECI state vectors.
 *
 * No API key required — this is Privateer's free public SSA service.
 */

export interface ConjunctionEvent {
  id: string;
  targetDateTime: string;         // ISO UTC time of closest approach
  targetMillis: number;           // Unix ms of TCA
  speed: number;                  // Relative speed at TCA (m/s)
  distance: number;               // Miss distance at TCA (m)
  objId1: string;                 // NORAD ID object 1
  objId2: string;                 // NORAD ID object 2
  obj1Name: string;               // Satellite name 1
  obj2Name: string;               // Satellite name 2
  obj1Type: string;               // "Satellite" | "Debris" etc
  obj2Type: string;
  collisionProbability2D: number; // ELROD-2019 method
  collisionProbability3D: number; // HALL-2021 method (preferred)
  cdmName: string;                // CDM file reference
  generatedDate: string;          // When this prediction was generated
  // ECI state vectors at TCA (metres, m/s)
  obj1PX: number; obj1PY: number; obj1PZ: number;
  obj1VX: number; obj1VY: number; obj1VZ: number;
  obj2PX: number; obj2PY: number; obj2PZ: number;
  obj2VX: number; obj2VY: number; obj2VZ: number;
}

export interface ConjunctionState {
  events: ConjunctionEvent[];
  fetchedAt: Date;
  source: "privateer-crowsnest";
  totalCount: number;
  highRiskCount: number; // P(collision) > 1e-4
}

const CONJUNCTION_URL = "https://wayfinder.privateer.com/data/conjunctions.json";
const HIGH_RISK_THRESHOLD = 1e-4; // 1 in 10,000 — Privateer's own threshold
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours (data refreshes daily)

let _cache: ConjunctionState | null = null;
let _fetchPromise: Promise<ConjunctionState> | null = null;

/**
 * Fetch and cache Privateer Crow's Nest conjunction data.
 * Returns cached data if fresh (< 6h old).
 */
export async function fetchConjunctions(forceRefresh = false): Promise<ConjunctionState> {
  // Return cache if fresh
  if (!forceRefresh && _cache && (Date.now() - _cache.fetchedAt.getTime()) < CACHE_TTL_MS) {
    return _cache;
  }

  // Deduplicate concurrent requests
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = (async () => {
    try {
      const res = await fetch(CONJUNCTION_URL, {
        signal: AbortSignal.timeout(15_000),
        headers: { "Accept": "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw: ConjunctionEvent[] = await res.json();

      // Sort by collision probability descending
      const sorted = [...raw].sort(
        (a, b) => b.collisionProbability3D - a.collisionProbability3D
      );

      const state: ConjunctionState = {
        events: sorted,
        fetchedAt: new Date(),
        source: "privateer-crowsnest",
        totalCount: sorted.length,
        highRiskCount: sorted.filter(e => e.collisionProbability3D >= HIGH_RISK_THRESHOLD).length,
      };

      _cache = state;
      return state;
    } finally {
      _fetchPromise = null;
    }
  })();

  return _fetchPromise;
}

/**
 * Get cached conjunction data without fetching.
 */
export function getCachedConjunctions(): ConjunctionState | null {
  return _cache;
}

/**
 * Parse a raw conjunction event array into a ConjunctionState.
 * Exported for testing without requiring a network fetch.
 */
export function parseConjunctionData(raw: ConjunctionEvent[]): ConjunctionState {
  const sorted = [...raw].sort(
    (a, b) => b.collisionProbability3D - a.collisionProbability3D
  );
  return {
    events: sorted,
    fetchedAt: new Date(),
    source: "privateer-crowsnest",
    totalCount: sorted.length,
    highRiskCount: sorted.filter(e => e.collisionProbability3D >= HIGH_RISK_THRESHOLD).length,
  };
}

/**
 * Look up conjunction events involving a specific NORAD ID.
 */
export function getConjunctionsForSatellite(
  noradId: string,
  conjunctions: ConjunctionEvent[]
): ConjunctionEvent[] {
  return conjunctions.filter(
    e => e.objId1 === noradId || e.objId2 === noradId
  );
}

/**
 * Convert collision probability to a threat boost percentage (0–40).
 * Adds on top of existing orbital threat score.
 *
 * Scale:
 *   P < 1e-6  → +0%
 *   P = 1e-4  → +15% (high risk threshold)
 *   P = 1e-3  → +25%
 *   P ≥ 1e-2  → +40% (extreme)
 */
export function conjunctionThreatBoost(prob3D: number): number {
  if (prob3D < 1e-6) return 0;
  if (prob3D < 1e-4) return Math.round(5 + (prob3D / 1e-4) * 10);
  if (prob3D < 1e-3) return Math.round(15 + ((prob3D - 1e-4) / 9e-4) * 10);
  if (prob3D < 1e-2) return Math.round(25 + ((prob3D - 1e-3) / 9e-3) * 15);
  return 40;
}

/**
 * Format collision probability for display.
 * e.g. 0.003277 → "3.28×10⁻³"
 */
export function formatProbability(p: number): string {
  if (p === 0) return "0.0×10⁰";
  const exp = Math.floor(Math.log10(p));
  const mantissa = p / Math.pow(10, exp);
  const superscripts: Record<string, string> = {
    "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³",
    "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  };
  const expStr = String(exp).split("").map(c => superscripts[c] ?? c).join("");
  return `${mantissa.toFixed(2)}×10${expStr}`;
}

/**
 * Format miss distance for display.
 * e.g. 138.8 → "138.8m" or 1500 → "1.5km"
 */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${metres.toFixed(0)}m`;
  return `${(metres / 1000).toFixed(1)}km`;
}

/**
 * Format relative speed for display.
 * e.g. 8607 → "8.6km/s"
 */
export function formatSpeed(mps: number): string {
  return `${(mps / 1000).toFixed(1)}km/s`;
}

/**
 * Hours until closest approach.
 */
export function hoursUntilTCA(targetMillis: number): number {
  return (targetMillis - Date.now()) / (1000 * 3600);
}
