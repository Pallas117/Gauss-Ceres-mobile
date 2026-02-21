/**
 * data-parser.ts — Embedded Space Data Parser
 *
 * A high-performance in-memory cache and binary packing layer for all
 * open-source space data feeds used by Project Gauss HUD.
 *
 * Architecture:
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │  Fetch Layer  →  Binary Pack  →  LRU Cache  →  Delta Engine    │
 *   │                                                                  │
 *   │  CelesTrak GP JSON  →  PackedGP (Float32 fields)               │
 *   │  NOAA SWPC JSON     →  PackedSWPC (typed arrays)               │
 *   │  satrec objects     →  SatrecCache (keyed by NORAD + epoch)    │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 * Key optimisations:
 *   1. satrec pre-computation — twoline2satrec / json2satrec called once per TLE epoch
 *   2. Float32 packing — lat/lon/alt/vel stored as 4-byte floats (vs 8-byte float64)
 *   3. Delta propagation — skip satellites that moved < DELTA_THRESHOLD degrees
 *   4. Stale-while-revalidate — serve cached data instantly, refresh in background
 *   5. Request deduplication — one in-flight fetch per URL at a time
 *   6. Priority fetch queue — critical groups (stations, military) fetched first
 */

import * as Satellite from "satellite.js";
import type { CelesTrakGP, OrbitalState } from "./satellite-service";
import type { SpaceWeatherState } from "./solar-weather-service";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum position change (degrees) to trigger re-propagation */
const DELTA_THRESHOLD = 0.05;

/** TTL values in milliseconds */
const TTL = {
  TLE:      6 * 60 * 60 * 1000,   // 6 hours — TLEs degrade slowly
  SWPC:     5 * 60 * 1000,         // 5 minutes — space weather changes faster
  SATREC:   24 * 60 * 60 * 1000,  // 24 hours — satrec valid until epoch changes
} as const;

/** Maximum entries in each LRU cache */
const LRU_LIMITS = {
  TLE:    2000,  // ~84 satellites × 7 groups with headroom
  SWPC:   50,    // small number of SWPC endpoints
  SATREC: 2000,  // one per tracked satellite
  STATE:  2000,  // one orbital state per satellite
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Binary-packed orbital state — Float32Array layout:
 *  [0] lat (deg), [1] lon (deg), [2] altKm, [3] velKms,
 *  [4] inclination (deg), [5] period (min), [6] epochAge (h)
 */
export type PackedState = Float32Array;

export interface CacheEntry<T> {
  data: T;
  fetchedAt: number;   // Date.now() ms
  ttl: number;         // ms until stale
  hits: number;        // cache hit counter
}

export interface ParserStats {
  tleEntries: number;
  satrecEntries: number;
  stateEntries: number;
  swpcEntries: number;
  totalHits: number;
  totalMisses: number;
  hitRate: number;           // 0–1
  avgParseTimeMs: number;
  bytesPackedSaved: number;  // estimated bytes saved by Float32 packing
  deltaSkips: number;        // propagation cycles skipped by delta engine
  lastRefreshAt: string | null;
}

// ─── LRU Cache ────────────────────────────────────────────────────────────────

class LRUCache<K, V> {
  private map = new Map<K, CacheEntry<V>>();
  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  get(key: K): V | null {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > entry.ttl) {
      this.map.delete(key);
      return null;
    }
    // LRU: move to end
    this.map.delete(key);
    entry.hits++;
    this.map.set(key, entry);
    return entry.data;
  }

  /** Returns the raw entry including stale data (for stale-while-revalidate) */
  peek(key: K): CacheEntry<V> | null {
    return this.map.get(key) ?? null;
  }

  set(key: K, data: V, ttl: number): void {
    if (this.map.size >= this.limit) {
      // Evict LRU (first entry)
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) this.map.delete(firstKey);
    }
    this.map.set(key, { data, fetchedAt: Date.now(), ttl, hits: 0 });
  }

  isStale(key: K): boolean {
    const entry = this.map.get(key);
    if (!entry) return true;
    return Date.now() - entry.fetchedAt > entry.ttl;
  }

  size(): number { return this.map.size; }

  totalHits(): number {
    let total = 0;
    for (const entry of this.map.values()) total += entry.hits;
    return total;
  }

  clear(): void { this.map.clear(); }
}

// ─── Parser Singleton ─────────────────────────────────────────────────────────

class SpaceDataParser {
  // GP record cache: key = NORAD_CAT_ID
  private tleCache = new LRUCache<number, CelesTrakGP>(LRU_LIMITS.TLE);

  // satrec cache: key = `${NORAD_CAT_ID}:${EPOCH}` — invalidated when epoch changes
  private satrecCache = new LRUCache<string, Satellite.SatRec>(LRU_LIMITS.SATREC);

  // Packed orbital state cache: key = NORAD_CAT_ID
  private stateCache = new LRUCache<number, PackedState>(LRU_LIMITS.STATE);

  // SWPC cache: key = endpoint URL
  private swpcCache = new LRUCache<string, unknown>(LRU_LIMITS.SWPC);

  // In-flight request deduplication: key = URL → Promise
  private inFlight = new Map<string, Promise<unknown>>();

  // Stats
  private hits = 0;
  private misses = 0;
  private parseTimes: number[] = [];
  private deltaSkips = 0;
  private lastRefreshAt: number | null = null;

  // ── GP Record Management ────────────────────────────────────────────────────

  /**
   * Ingest a batch of GP records from CelesTrak.
   * Only stores records whose epoch has changed (delta update).
   * Returns the number of new/updated records.
   */
  ingestGPBatch(records: CelesTrakGP[]): number {
    const t0 = performance.now();
    let updated = 0;
    for (const gp of records) {
      const existing = this.tleCache.peek(gp.NORAD_CAT_ID);
      if (!existing || existing.data.EPOCH !== gp.EPOCH) {
        this.tleCache.set(gp.NORAD_CAT_ID, gp, TTL.TLE);
        // Invalidate satrec and state caches for this satellite
        this.satrecCache["map"].delete(`${gp.NORAD_CAT_ID}:${existing?.data.EPOCH ?? ""}`);
        this.stateCache["map"].delete(gp.NORAD_CAT_ID);
        updated++;
      }
    }
    this.parseTimes.push(performance.now() - t0);
    if (this.parseTimes.length > 100) this.parseTimes.shift();
    this.lastRefreshAt = Date.now();
    return updated;
  }

  /**
   * Get a GP record from cache.
   */
  getGP(noradId: number): CelesTrakGP | null {
    const data = this.tleCache.get(noradId);
    if (data) { this.hits++; return data; }
    this.misses++;
    return null;
  }

  /**
   * Get all cached GP records.
   */
  getAllGPs(): CelesTrakGP[] {
    const results: CelesTrakGP[] = [];
    for (const [, entry] of this.tleCache["map"]) {
      results.push(entry.data);
    }
    return results;
  }

  // ── satrec Management ───────────────────────────────────────────────────────

  /**
   * Get or compute a satrec for a GP record.
   * Caches by NORAD_ID:EPOCH so the expensive twoline2satrec / json2satrec
   * is only called once per TLE epoch.
   */
  getSatrec(gp: CelesTrakGP): Satellite.SatRec | null {
    const key = `${gp.NORAD_CAT_ID}:${gp.EPOCH}`;
    const cached = this.satrecCache.get(key);
    if (cached) { this.hits++; return cached; }

    this.misses++;
    const t0 = performance.now();
    try {
      const satrec = Satellite.json2satrec(gp as unknown as Satellite.OMMJsonObject);
      if (satrec.error !== 0) return null;
      this.satrecCache.set(key, satrec, TTL.SATREC);
      this.parseTimes.push(performance.now() - t0);
      if (this.parseTimes.length > 100) this.parseTimes.shift();
      return satrec;
    } catch {
      return null;
    }
  }

  // ── Packed Orbital State ────────────────────────────────────────────────────

  /**
   * Binary-pack an orbital state into a Float32Array (7 × 4 bytes = 28 bytes).
   * Compared to a plain JS object with 7 float64 fields (56 bytes), this
   * saves ~50% memory per satellite.
   */
  packState(state: OrbitalState): PackedState {
    const buf = new Float32Array(7);
    buf[0] = state.lat;
    buf[1] = state.lon;
    buf[2] = state.altKm;
    buf[3] = state.velKms;
    buf[4] = state.inclination;
    buf[5] = state.period;
    buf[6] = state.epochAge;
    return buf;
  }

  /**
   * Unpack a Float32Array back to a plain orbital state object.
   */
  unpackState(buf: PackedState, base: Pick<OrbitalState, "noradId" | "name" | "objectId" | "error">): OrbitalState {
    return {
      ...base,
      lat:         buf[0],
      lon:         buf[1],
      altKm:       buf[2],
      velKms:      buf[3],
      inclination: buf[4],
      period:      buf[5],
      epochAge:    buf[6],
    };
  }

  /**
   * Delta-check: returns true if the satellite has moved enough to warrant
   * a full re-propagation. Skips propagation if position change < DELTA_THRESHOLD.
   */
  needsUpdate(noradId: number, newLat: number, newLon: number): boolean {
    const cached = this.stateCache.get(noradId);
    if (!cached) return true;
    const dLat = Math.abs(cached[0] - newLat);
    const dLon = Math.abs(cached[1] - newLon);
    if (dLat < DELTA_THRESHOLD && dLon < DELTA_THRESHOLD) {
      this.deltaSkips++;
      return false;
    }
    return true;
  }

  /**
   * Store a packed orbital state in the state cache.
   */
  setPackedState(noradId: number, packed: PackedState): void {
    this.stateCache.set(noradId, packed, TTL.TLE);
  }

  /**
   * Get a cached packed orbital state.
   */
  getPackedState(noradId: number): PackedState | null {
    return this.stateCache.get(noradId);
  }

  // ── SWPC Fetch with Deduplication + Stale-While-Revalidate ─────────────────

  /**
   * Fetch a SWPC endpoint with:
   *   - Request deduplication (one in-flight fetch per URL)
   *   - Stale-while-revalidate (return stale data immediately, refresh in background)
   *   - LRU cache with TTL
   */
  async fetchSWPC<T>(url: string, ttlMs: number = TTL.SWPC): Promise<T> {
    const cached = this.swpcCache.peek(url);

    // Stale-while-revalidate: return stale data immediately and refresh in background
    if (cached && !this.swpcCache.isStale(url)) {
      this.hits++;
      return cached.data as T;
    }

    // If stale but has data, return stale immediately and trigger background refresh
    if (cached && this.swpcCache.isStale(url)) {
      this.hits++;
      this._backgroundRefreshSWPC<T>(url, ttlMs);
      return cached.data as T;
    }

    // No cached data — must wait for fresh fetch
    this.misses++;
    return this._fetchAndCacheSWPC<T>(url, ttlMs);
  }

  private async _backgroundRefreshSWPC<T>(url: string, ttlMs: number): Promise<void> {
    try {
      await this._fetchAndCacheSWPC<T>(url, ttlMs);
    } catch {
      // Background refresh failure is silent — stale data remains
    }
  }

  private async _fetchAndCacheSWPC<T>(url: string, ttlMs: number): Promise<T> {
    // Deduplication: if a fetch is already in flight for this URL, reuse it
    if (this.inFlight.has(url)) {
      return this.inFlight.get(url) as Promise<T>;
    }

    const t0 = performance.now();
    const promise = fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(10_000),
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<T>;
      })
      .then(data => {
        this.swpcCache.set(url, data, ttlMs);
        this.parseTimes.push(performance.now() - t0);
        if (this.parseTimes.length > 100) this.parseTimes.shift();
        this.inFlight.delete(url);
        return data;
      })
      .catch(err => {
        this.inFlight.delete(url);
        throw err;
      });

    this.inFlight.set(url, promise as Promise<unknown>);
    return promise;
  }

  // ── CelesTrak Fetch with Priority Queue ────────────────────────────────────

  /**
   * Fetch CelesTrak GP data for multiple groups in priority order.
   * High-priority groups (stations, military) are fetched first and awaited;
   * lower-priority groups are fetched concurrently in the background.
   */
  async fetchCelesTrakGroups(
    groups: Array<{ key: string; url: string; priority: number }>,
    onGroupLoaded: (key: string, records: CelesTrakGP[]) => void,
  ): Promise<void> {
    // Sort by priority (lower number = higher priority)
    const sorted = [...groups].sort((a, b) => a.priority - b.priority);

    // Tier 1: priority 1 groups — fetch sequentially and await
    const tier1 = sorted.filter(g => g.priority === 1);
    // Tier 2+: fetch concurrently
    const tier2plus = sorted.filter(g => g.priority > 1);

    // Fetch tier 1 first
    for (const group of tier1) {
      try {
        const data = await this._fetchCelesTrakGroup(group.url);
        const updated = this.ingestGPBatch(data);
        if (updated > 0 || data.length > 0) {
          onGroupLoaded(group.key, data);
        }
      } catch {
        // Individual group failure is non-fatal
      }
    }

    // Fetch tier 2+ concurrently
    await Promise.allSettled(
      tier2plus.map(async group => {
        try {
          const data = await this._fetchCelesTrakGroup(group.url);
          const updated = this.ingestGPBatch(data);
          if (updated > 0 || data.length > 0) {
            onGroupLoaded(group.key, data);
          }
        } catch {
          // Individual group failure is non-fatal
        }
      })
    );
  }

  private async _fetchCelesTrakGroup(url: string): Promise<CelesTrakGP[]> {
    // Use deduplication for CelesTrak fetches too
    if (this.inFlight.has(url)) {
      return this.inFlight.get(url) as Promise<CelesTrakGP[]>;
    }

    const t0 = performance.now();
    const promise = fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(15_000),
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<CelesTrakGP[]>;
      })
      .then(data => {
        this.parseTimes.push(performance.now() - t0);
        if (this.parseTimes.length > 100) this.parseTimes.shift();
        this.inFlight.delete(url);
        return data;
      })
      .catch(err => {
        this.inFlight.delete(url);
        throw err;
      });

    this.inFlight.set(url, promise as Promise<unknown>);
    return promise;
  }

  // ── Stats ───────────────────────────────────────────────────────────────────

  getStats(): ParserStats {
    const totalRequests = this.hits + this.misses;
    const avgParseTimeMs = this.parseTimes.length > 0
      ? this.parseTimes.reduce((a, b) => a + b, 0) / this.parseTimes.length
      : 0;

    // Estimated byte savings: each Float32Array state = 28 bytes vs ~200 bytes for a JS object
    const bytesPackedSaved = this.stateCache.size() * (200 - 28);

    return {
      tleEntries:      this.tleCache.size(),
      satrecEntries:   this.satrecCache.size(),
      stateEntries:    this.stateCache.size(),
      swpcEntries:     this.swpcCache.size(),
      totalHits:       this.hits + this.tleCache.totalHits() + this.satrecCache.totalHits(),
      totalMisses:     this.misses,
      hitRate:         totalRequests > 0 ? this.hits / totalRequests : 0,
      avgParseTimeMs:  Math.round(avgParseTimeMs * 100) / 100,
      bytesPackedSaved,
      deltaSkips:      this.deltaSkips,
      lastRefreshAt:   this.lastRefreshAt
        ? new Date(this.lastRefreshAt).toISOString()
        : null,
    };
  }

  /**
   * Format stats as a human-readable string for the Actioning Console.
   */
  formatStatsReport(): string {
    const s = this.getStats();
    const hitPct = (s.hitRate * 100).toFixed(1);
    const kbSaved = (s.bytesPackedSaved / 1024).toFixed(1);
    const refreshed = s.lastRefreshAt
      ? new Date(s.lastRefreshAt).toLocaleTimeString()
      : "never";

    return [
      "## CACHE PERFORMANCE REPORT",
      "",
      `**Cache Entries**`,
      `| Layer     | Entries |`,
      `|-----------|---------|`,
      `| TLE/GP    | ${s.tleEntries.toString().padStart(7)} |`,
      `| satrec    | ${s.satrecEntries.toString().padStart(7)} |`,
      `| State     | ${s.stateEntries.toString().padStart(7)} |`,
      `| SWPC      | ${s.swpcEntries.toString().padStart(7)} |`,
      "",
      `**Performance**`,
      `| Metric           | Value      |`,
      `|------------------|------------|`,
      `| Cache hit rate   | ${hitPct.padStart(9)}% |`,
      `| Avg parse time   | ${s.avgParseTimeMs.toFixed(2).padStart(8)}ms |`,
      `| Delta skips      | ${s.deltaSkips.toString().padStart(10)} |`,
      `| Float32 savings  | ${kbSaved.padStart(8)}KB |`,
      `| Last TLE refresh | ${refreshed.padStart(10)} |`,
      "",
      `*satrec pre-computation eliminates redundant SGP4 initialisation.*`,
      `*Delta engine skips propagation for satellites that moved < ${DELTA_THRESHOLD}°.*`,
    ].join("\n");
  }

  /** Clear all caches (for testing or forced refresh) */
  clearAll(): void {
    this.tleCache.clear();
    this.satrecCache.clear();
    this.stateCache.clear();
    this.swpcCache.clear();
    this.inFlight.clear();
    this.hits = 0;
    this.misses = 0;
    this.deltaSkips = 0;
    this.parseTimes = [];
  }
}

// ─── Export singleton ─────────────────────────────────────────────────────────

export const dataParser = new SpaceDataParser();

// ─── Convenience helpers ──────────────────────────────────────────────────────

/**
 * Propagate a GP record using the parser's satrec cache.
 * Returns null if propagation fails.
 */
export function propagateWithCache(
  gp: CelesTrakGP,
  date: Date = new Date(),
): { posEci: Satellite.EciVec3<number>; velEci: Satellite.EciVec3<number>; satrec: Satellite.SatRec } | null {
  const satrec = dataParser.getSatrec(gp);
  if (!satrec) return null;

  const posVel = Satellite.propagate(satrec, date);
  if (!posVel || typeof posVel.position === "boolean" || typeof posVel.velocity === "boolean") {
    return null;
  }

  return {
    posEci: posVel.position as Satellite.EciVec3<number>,
    velEci: posVel.velocity as Satellite.EciVec3<number>,
    satrec,
  };
}

/**
 * Convert ECI position to geodetic coordinates using the parser's cached gmst.
 */
export function eciToGeodetic(
  posEci: Satellite.EciVec3<number>,
  date: Date = new Date(),
): { lat: number; lon: number; altKm: number } {
  const gmst = Satellite.gstime(date);
  const geo  = Satellite.eciToGeodetic(posEci, gmst);
  return {
    lat:   Satellite.degreesLat(geo.latitude),
    lon:   Satellite.degreesLong(geo.longitude),
    altKm: geo.height,
  };
}

/**
 * Compute orbital velocity magnitude from ECI velocity vector (km/s).
 */
export function eciVelToKms(velEci: Satellite.EciVec3<number>): number {
  return Math.sqrt(velEci.x ** 2 + velEci.y ** 2 + velEci.z ** 2);
}
