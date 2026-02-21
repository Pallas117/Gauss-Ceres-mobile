/**
 * offline-store.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Gauss HUD Offline Data Layer
 *
 * Provides:
 *   1. Network connectivity detection via expo-network
 *   2. AsyncStorage persistence of last-known TLE data and space weather
 *   3. Embedded fallback TLE snapshot (190 satellites) for cold-start offline
 *   4. Graceful degradation — continues SGP4 propagation from cached TLEs
 *   5. Auto-resume live fetch when connectivity is restored
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";
import type { CelesTrakGP } from "./satellite-service";
import type { SpaceWeatherState } from "./solar-weather-service";

// ─── Storage Keys ─────────────────────────────────────────────────────────────
const KEYS = {
  CACHED_TLES:       "gauss:cached_tles",
  CACHED_TLE_TIME:   "gauss:cached_tle_time",
  CACHED_WEATHER:    "gauss:cached_weather",
  CACHED_WEATHER_TIME: "gauss:cached_weather_time",
  OFFLINE_SESSIONS:  "gauss:offline_sessions",
} as const;

// ─── Fallback TLE Snapshot ────────────────────────────────────────────────────
// Embedded at build time — 190 real satellites from CelesTrak
// (stations, GPS, BeiDou, science, military)
// Used when: (a) no internet, (b) AsyncStorage cache is empty
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const FALLBACK_TLES: CelesTrakGP[] = require("../assets/fallback-tles.json");
const FALLBACK_SNAPSHOT_DATE = "2026-02-21T10:56:00Z"; // Date of embedded snapshot

// ─── Network State ────────────────────────────────────────────────────────────
export type ConnectivityState = "ONLINE" | "OFFLINE" | "DEGRADED" | "UNKNOWN";

export interface NetworkStatus {
  state: ConnectivityState;
  isConnected: boolean;
  isInternetReachable: boolean;
  type: string;
  checkedAt: Date;
}

/**
 * Check current network connectivity.
 * Returns a NetworkStatus with connection type and reachability.
 */
export async function checkConnectivity(): Promise<NetworkStatus> {
  try {
    const state = await Network.getNetworkStateAsync();
    const isConnected = state.isConnected ?? false;
    const isReachable = state.isInternetReachable ?? false;
    const type = state.type ?? "UNKNOWN";

    let connectivityState: ConnectivityState;
    if (!isConnected) {
      connectivityState = "OFFLINE";
    } else if (!isReachable) {
      connectivityState = "DEGRADED";
    } else {
      connectivityState = "ONLINE";
    }

    return {
      state: connectivityState,
      isConnected,
      isInternetReachable: isReachable,
      type: String(type),
      checkedAt: new Date(),
    };
  } catch {
    return {
      state: "UNKNOWN",
      isConnected: false,
      isInternetReachable: false,
      type: "UNKNOWN",
      checkedAt: new Date(),
    };
  }
}

// ─── TLE Persistence ──────────────────────────────────────────────────────────

/**
 * Save live TLE data to AsyncStorage for offline use.
 */
export async function saveTLEsToCache(tles: CelesTrakGP[]): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [KEYS.CACHED_TLES, JSON.stringify(tles)],
      [KEYS.CACHED_TLE_TIME, new Date().toISOString()],
    ]);
  } catch (e) {
    console.warn("[offline-store] Failed to save TLEs:", e);
  }
}

/**
 * Load TLEs from AsyncStorage cache.
 * Returns null if no cache exists.
 */
export async function loadCachedTLEs(): Promise<{ tles: CelesTrakGP[]; cachedAt: Date } | null> {
  try {
    const [[, tleJson], [, timeStr]] = await AsyncStorage.multiGet([
      KEYS.CACHED_TLES,
      KEYS.CACHED_TLE_TIME,
    ]);
    if (!tleJson || !timeStr) return null;
    return {
      tles: JSON.parse(tleJson) as CelesTrakGP[],
      cachedAt: new Date(timeStr),
    };
  } catch {
    return null;
  }
}

/**
 * Get TLEs for offline use.
 * Priority: AsyncStorage cache → embedded fallback snapshot.
 * Returns the TLEs and the data source label.
 */
export async function getOfflineTLEs(): Promise<{
  tles: CelesTrakGP[];
  source: "cache" | "fallback";
  cachedAt: Date;
  ageHours: number;
}> {
  const cached = await loadCachedTLEs();
  if (cached) {
    const ageHours = (Date.now() - cached.cachedAt.getTime()) / 3_600_000;
    return {
      tles: cached.tles,
      source: "cache",
      cachedAt: cached.cachedAt,
      ageHours,
    };
  }

  // Fall back to embedded snapshot
  const snapshotDate = new Date(FALLBACK_SNAPSHOT_DATE);
  const ageHours = (Date.now() - snapshotDate.getTime()) / 3_600_000;
  return {
    tles: FALLBACK_TLES,
    source: "fallback",
    cachedAt: snapshotDate,
    ageHours,
  };
}

// ─── Space Weather Persistence ────────────────────────────────────────────────

/**
 * Save live space weather to AsyncStorage for offline use.
 */
export async function saveWeatherToCache(weather: SpaceWeatherState): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [KEYS.CACHED_WEATHER, JSON.stringify(weather)],
      [KEYS.CACHED_WEATHER_TIME, new Date().toISOString()],
    ]);
  } catch (e) {
    console.warn("[offline-store] Failed to save weather:", e);
  }
}

/**
 * Load space weather from AsyncStorage cache.
 */
export async function loadCachedWeather(): Promise<{
  weather: SpaceWeatherState;
  cachedAt: Date;
  ageMinutes: number;
} | null> {
  try {
    const [[, weatherJson], [, timeStr]] = await AsyncStorage.multiGet([
      KEYS.CACHED_WEATHER,
      KEYS.CACHED_WEATHER_TIME,
    ]);
    if (!weatherJson || !timeStr) return null;
    const cachedAt = new Date(timeStr);
    const ageMinutes = (Date.now() - cachedAt.getTime()) / 60_000;
    return {
      weather: JSON.parse(weatherJson) as SpaceWeatherState,
      cachedAt,
      ageMinutes,
    };
  } catch {
    return null;
  }
}

// ─── Offline Session Tracking ─────────────────────────────────────────────────

export interface OfflineSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  durationMin?: number;
  tleSource: "cache" | "fallback";
  tleAgeHours: number;
  eventsProcessed: number;
  commandsSent: number;
}

/**
 * Record the start of an offline session.
 */
export async function startOfflineSession(
  tleSource: "cache" | "fallback",
  tleAgeHours: number
): Promise<string> {
  const id = `offline-${Date.now()}`;
  const session: OfflineSession = {
    id,
    startedAt: new Date().toISOString(),
    tleSource,
    tleAgeHours,
    eventsProcessed: 0,
    commandsSent: 0,
  };

  try {
    const existing = await loadOfflineSessions();
    existing.unshift(session);
    const trimmed = existing.slice(0, 50); // Keep last 50 sessions
    await AsyncStorage.setItem(KEYS.OFFLINE_SESSIONS, JSON.stringify(trimmed));
  } catch (e) {
    console.warn("[offline-store] Failed to record offline session:", e);
  }
  return id;
}

/**
 * Update an offline session with final stats.
 */
export async function endOfflineSession(
  id: string,
  eventsProcessed: number,
  commandsSent: number
): Promise<void> {
  try {
    const sessions = await loadOfflineSessions();
    const idx = sessions.findIndex(s => s.id === id);
    if (idx >= 0) {
      const start = new Date(sessions[idx].startedAt);
      sessions[idx] = {
        ...sessions[idx],
        endedAt: new Date().toISOString(),
        durationMin: Math.round((Date.now() - start.getTime()) / 60_000),
        eventsProcessed,
        commandsSent,
      };
      await AsyncStorage.setItem(KEYS.OFFLINE_SESSIONS, JSON.stringify(sessions));
    }
  } catch {
    // non-critical
  }
}

/**
 * Load all recorded offline sessions.
 */
export async function loadOfflineSessions(): Promise<OfflineSession[]> {
  try {
    const json = await AsyncStorage.getItem(KEYS.OFFLINE_SESSIONS);
    if (!json) return [];
    return JSON.parse(json) as OfflineSession[];
  } catch {
    return [];
  }
}

/**
 * Get a summary of offline capability for the console OFFLINE command.
 */
export async function getOfflineSummary(): Promise<string> {
  const cached = await loadCachedTLEs();
  const weather = await loadCachedWeather();
  const sessions = await loadOfflineSessions();

  const tleStatus = cached
    ? `CACHED — ${cached.tles.length} sats · ${((Date.now() - cached.cachedAt.getTime()) / 3_600_000).toFixed(1)}h old`
    : `FALLBACK — ${FALLBACK_TLES.length} sats · embedded snapshot`;

  const weatherStatus = weather
    ? `CACHED — ${weather.weather.activityLevel} · ${weather.ageMinutes.toFixed(0)}min old`
    : "NO CACHE — will use degraded mode";

  const sessionCount = sessions.length;
  const lastSession = sessions[0];

  return [
    "**OFFLINE CAPABILITY REPORT**",
    "",
    `TLE DATA: ${tleStatus}`,
    `SPACE WEATHER: ${weatherStatus}`,
    `FALLBACK SATS: ${FALLBACK_TLES.length} embedded (stations, GPS, BeiDou, science, military)`,
    "",
    `OFFLINE SESSIONS: ${sessionCount} recorded`,
    lastSession
      ? `LAST OFFLINE: ${new Date(lastSession.startedAt).toLocaleString()} · ${lastSession.durationMin ?? "?"}min · ${lastSession.tleSource.toUpperCase()} data`
      : "NO PREVIOUS OFFLINE SESSIONS",
    "",
    "PROPAGATION: SGP4/SDP4 continues offline using last-known TLEs.",
    "Accuracy degrades ~1km/day per day of TLE age.",
  ].join("\n");
}
