import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  Modal,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeepAwake } from "expo-keep-awake";
import * as Haptics from "expo-haptics";

import {
  fetchGroupTLEs,
  propagateGP,
  classifyEvent,
  formatCoords,
  formatSatName,
  SATELLITE_GROUPS,
  type CelesTrakGP,
  type OrbitalState,
  type RealEventType,
} from "@/lib/satellite-service";

// ─── Configuration ────────────────────────────────────────────────────────────
const TAILSCALE_IP = "100.x.x.x";
const BASE_URL = `http://${TAILSCALE_IP}:8080`;
const STATUS_URL = `${BASE_URL}/status`;
const REASON_URL = `${BASE_URL}/reason`;
const HEALTH_CHECK_INTERVAL = 10_000;
const TLE_REFRESH_INTERVAL  = 6 * 60 * 60 * 1000; // 6 hours
const PROPAGATION_INTERVAL  = 5_000;               // update positions every 5s
const DANGER_THRESHOLD      = 75;
const MAX_TELEMETRY_EVENTS  = 60;
const MAX_SATS_PER_GROUP    = 12; // limit per group to keep feed manageable

// ─── Theme ────────────────────────────────────────────────────────────────────
const C = {
  volt:    "#CCFF00",
  black:   "#050505",
  surface: "#0D0D0D",
  surface2:"#111111",
  white:   "#FFFFFF",
  dim:     "#555555",
  dim2:    "#333333",
  border:  "#1C1C1C",
  red:     "#FF2222",
  redDim:  "#3A0000",
  orange:  "#FF9900",
  yellow:  "#FFCC00",
  blue:    "#00CCFF",
  green:   "#00FF88",
};

// ─── Types ────────────────────────────────────────────────────────────────────
type NodeStatus = "ONLINE" | "OFFLINE" | "CONNECTING";

interface TelemetryEvent {
  id: string;
  timestamp: string;
  type: RealEventType;
  satName: string;
  noradId: number;
  coordinates: string;
  detail: string;
  threatPct: number;
  altKm: number;
  velKms: number;
  isReal: true;
}

interface ConsoleEntry {
  id: string;
  timestamp: string;
  role: "system" | "user" | "response" | "alert" | "control";
  text: string;
}

// ─── Urgent Controls ──────────────────────────────────────────────────────────
const URGENT_CONTROLS = [
  { id: "abort",    label: "ABORT",    color: C.red,    bg: C.redDim,  command: "ABORT — halt all active operations immediately" },
  { id: "isolate",  label: "ISOLATE",  color: C.orange, bg: "#2A1500", command: "ISOLATE — sever uplink to compromised satellite" },
  { id: "override", label: "OVERRIDE", color: C.yellow, bg: "#2A2000", command: "OVERRIDE — force manual control of node systems" },
  { id: "lockdown", label: "LOCKDOWN", color: C.white,  bg: "#1A1A1A", command: "LOCKDOWN — engage full system security protocol" },
] as const;

// ─── Event type colors ────────────────────────────────────────────────────────
const EVENT_TYPE_COLORS: Record<RealEventType, string> = {
  PASS:     C.white,
  ANOMALY:  C.orange,
  LOCK:     C.volt,
  SIGNAL:   C.yellow,
  DRIFT:    "#FF7700",
  CRITICAL: C.red,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function nowTime(): string {
  return new Date().toISOString().slice(11, 19);
}
function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
function eventFromState(state: OrbitalState): TelemetryEvent {
  const { type, detail, threatPct } = classifyEvent(state);
  return {
    id: uid(),
    timestamp: nowTime(),
    type,
    satName: formatSatName(state.name),
    noradId: state.noradId,
    coordinates: formatCoords(state.lat, state.lon),
    detail,
    threatPct,
    altKm: state.altKm,
    velKms: state.velKms,
    isReal: true,
  };
}

// ─── Animated Blinking Dot ────────────────────────────────────────────────────
function BlinkDot({ color }: { color: string }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.15, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(opacity, { toValue: 1,    duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return <Animated.View style={[styles.statusDot, { backgroundColor: color, opacity }]} />;
}

// ─── Scan-line Overlay ────────────────────────────────────────────────────────
function ScanLines() {
  const { height } = Dimensions.get("window");
  const lines = Math.ceil(height / 4);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: lines }).map((_, i) => (
        <View key={i} style={[styles.scanLine, { top: i * 4 }]} />
      ))}
    </View>
  );
}

// ─── Threat Bar ───────────────────────────────────────────────────────────────
function ThreatBar({ pct }: { pct: number }) {
  const color = pct >= DANGER_THRESHOLD ? C.red : pct >= 40 ? C.orange : C.dim2;
  return (
    <View style={styles.threatBarBg}>
      <View style={[styles.threatBarFill, { width: `${pct}%` as any, backgroundColor: color }]} />
    </View>
  );
}

// ─── Simple Markdown Renderer ─────────────────────────────────────────────────
function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <View>
      {lines.map((line, i) => {
        if (line.startsWith("# "))
          return <Text key={i} style={styles.mdH1}>{line.slice(2).toUpperCase()}</Text>;
        if (line.startsWith("## "))
          return <Text key={i} style={styles.mdH2}>{line.slice(3).toUpperCase()}</Text>;
        if (line.startsWith("- ") || line.startsWith("* "))
          return <Text key={i} style={styles.mdList}>{"›  "}{renderInline(line.slice(2))}</Text>;
        if (line.startsWith("    ") || line.startsWith("\t"))
          return <Text key={i} style={styles.mdCodeLine}>{line.trimStart()}</Text>;
        if (line.trim() === "")
          return <View key={i} style={{ height: 5 }} />;
        return <Text key={i} style={styles.mdParagraph}>{renderInline(line)}</Text>;
      })}
    </View>
  );
}
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**"))
      return <Text key={i} style={styles.mdBold}>{p.slice(2, -2)}</Text>;
    if (p.startsWith("`") && p.endsWith("`"))
      return <Text key={i} style={styles.mdCode}>{p.slice(1, -1)}</Text>;
    return p;
  });
}

// ─── Console Entry ────────────────────────────────────────────────────────────
function ConsoleEntryRow({ entry }: { entry: ConsoleEntry }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 200, useNativeDriver: true,
      easing: Easing.out(Easing.ease),
    }).start();
  }, [fadeAnim]);

  const prefixColor =
    entry.role === "user"    ? C.volt :
    entry.role === "alert"   ? C.red :
    entry.role === "control" ? C.orange :
    entry.role === "system"  ? C.dim :
    C.white;

  const prefix =
    entry.role === "user"    ? `[${entry.timestamp}] > ` :
    entry.role === "alert"   ? `[${entry.timestamp}] !! ` :
    entry.role === "control" ? `[${entry.timestamp}] >> ` :
    entry.role === "system"  ? `[${entry.timestamp}] -- ` :
    `[${entry.timestamp}]    `;

  return (
    <Animated.View style={[styles.consoleRow, { opacity: fadeAnim }]}>
      <Text style={[styles.consolePrefix, { color: prefixColor }]}>{prefix}</Text>
      <View style={styles.consoleBody}>
        <MarkdownText text={entry.text} />
      </View>
    </Animated.View>
  );
}

// ─── Danger Flash Overlay ─────────────────────────────────────────────────────
function DangerFlash({
  event,
  onAcknowledge,
}: {
  event: TelemetryEvent;
  onAcknowledge: () => void;
}) {
  const strobeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim  = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    const strobe = Animated.loop(
      Animated.sequence([
        Animated.timing(strobeAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(strobeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.timing(strobeAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(strobeAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
      { iterations: 4 }
    );
    const entrance = Animated.spring(scaleAnim, {
      toValue: 1, tension: 200, friction: 15, useNativeDriver: true,
    });
    strobe.start();
    entrance.start();
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    return () => { strobe.stop(); };
  }, [strobeAnim, scaleAnim]);

  const bgOpacity     = strobeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 0.97] });
  const borderOpacity = strobeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

  return (
    <Modal transparent animationType="fade" statusBarTranslucent>
      <Animated.View style={[styles.dangerOverlay, { opacity: bgOpacity }]}>
        <Animated.View style={[styles.dangerCard, { transform: [{ scale: scaleAnim }] }]}>
          <Animated.View style={[styles.dangerTopBar, { opacity: borderOpacity }]} />

          <View style={styles.dangerHeader}>
            <Text style={styles.dangerLabel}>⚠ THREAT DETECTED</Text>
            <Text style={styles.dangerThreatPct}>{event.threatPct}%</Text>
          </View>

          <View style={styles.dangerInfoGrid}>
            <View style={styles.dangerInfoCell}>
              <Text style={styles.dangerInfoLabel}>TYPE</Text>
              <Text style={[styles.dangerInfoValue, { color: EVENT_TYPE_COLORS[event.type] }]}>
                {event.type}
              </Text>
            </View>
            <View style={styles.dangerInfoCell}>
              <Text style={styles.dangerInfoLabel}>ASSET</Text>
              <Text style={styles.dangerInfoValue}>{event.satName}</Text>
            </View>
            <View style={styles.dangerInfoCell}>
              <Text style={styles.dangerInfoLabel}>NORAD ID</Text>
              <Text style={styles.dangerInfoValue}>{event.noradId}</Text>
            </View>
            <View style={styles.dangerInfoCell}>
              <Text style={styles.dangerInfoLabel}>POSITION</Text>
              <Text style={styles.dangerInfoValue}>{event.coordinates}</Text>
            </View>
            {event.altKm > 0 && (
              <View style={styles.dangerInfoCell}>
                <Text style={styles.dangerInfoLabel}>ALTITUDE</Text>
                <Text style={styles.dangerInfoValue}>{event.altKm.toFixed(0)} km</Text>
              </View>
            )}
            {event.velKms > 0 && (
              <View style={styles.dangerInfoCell}>
                <Text style={styles.dangerInfoLabel}>VELOCITY</Text>
                <Text style={styles.dangerInfoValue}>{event.velKms.toFixed(2)} km/s</Text>
              </View>
            )}
          </View>

          <View style={styles.dangerDetail}>
            <Text style={styles.dangerDetailText}>{event.detail}</Text>
          </View>

          <View style={styles.dangerThreatSection}>
            <Text style={styles.dangerInfoLabel}>THREAT PROBABILITY</Text>
            <View style={styles.dangerThreatBarBg}>
              <Animated.View
                style={[styles.dangerThreatBarFill, { width: `${event.threatPct}%` as any, opacity: borderOpacity }]}
              />
            </View>
            <Text style={styles.dangerThreatPctLabel}>{event.threatPct}% CONFIDENCE · NORAD #{event.noradId}</Text>
          </View>

          <View style={styles.dangerControls}>
            {URGENT_CONTROLS.map(ctrl => (
              <Pressable
                key={ctrl.id}
                style={({ pressed }) => [
                  styles.dangerCtrlBtn,
                  { borderColor: ctrl.color, backgroundColor: pressed ? ctrl.color + "33" : ctrl.bg },
                ]}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                  onAcknowledge();
                }}
              >
                <Text style={[styles.dangerCtrlText, { color: ctrl.color }]}>{ctrl.label}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [styles.dangerAckBtn, pressed && { opacity: 0.7 }]}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onAcknowledge();
            }}
          >
            <Text style={styles.dangerAckText}>ACKNOWLEDGE & DISMISS</Text>
          </Pressable>

          <Animated.View style={[styles.dangerTopBar, { opacity: borderOpacity }]} />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ─── Telemetry Row ────────────────────────────────────────────────────────────
const TelemetryRow = React.memo(function TelemetryRow({ item }: { item: TelemetryEvent }) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isHighThreat = item.threatPct >= DANGER_THRESHOLD;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 250, useNativeDriver: true,
      easing: Easing.out(Easing.ease),
    }).start();
    if (isHighThreat) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 400, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,   duration: 400, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [fadeAnim, pulseAnim, isHighThreat]);

  const typeColor = EVENT_TYPE_COLORS[item.type];

  return (
    <Animated.View style={[styles.telemetryRow, isHighThreat && styles.telemetryRowDanger, { opacity: fadeAnim }]}>
      {isHighThreat && <Animated.View style={[styles.telemetryDangerBorder, { opacity: pulseAnim }]} />}
      <Text style={styles.telemetryTime}>{item.timestamp}</Text>
      <Text style={[styles.telemetryType, { color: typeColor }]}>{item.type.padEnd(8)}</Text>
      <Text style={styles.telemetrySat} numberOfLines={1}>{item.satName}</Text>
      <View style={styles.telemetryRight}>
        <Text style={styles.telemetryDetail} numberOfLines={1}>{item.detail}</Text>
        <ThreatBar pct={item.threatPct} />
      </View>
    </Animated.View>
  );
});

// ─── Blinking Cursor ──────────────────────────────────────────────────────────
function BlinkingCursor() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return <Animated.View style={[styles.cursor, { opacity }]} />;
}

// ─── Main HUD Screen ──────────────────────────────────────────────────────────
export default function HUDScreen() {
  useKeepAwake();
  const insets = useSafeAreaInsets();

  // Node status
  const [nodeStatus, setNodeStatus]   = useState<NodeStatus>("CONNECTING");
  const [latencyMs, setLatencyMs]     = useState<number | null>(null);
  const [lastChecked, setLastChecked] = useState("--:--:--");
  const [pingCount, setPingCount]     = useState(0);

  // Satellite data
  const [gpData, setGpData]           = useState<CelesTrakGP[]>([]);
  const [tleLoading, setTleLoading]   = useState(true);
  const [tleError, setTleError]       = useState<string | null>(null);
  const [lastTleRefresh, setLastTleRefresh] = useState<Date | null>(null);
  const [activeGroup, setActiveGroup] = useState(0);
  const [satCount, setSatCount]       = useState(0);

  // Telemetry feed
  const [telemetry, setTelemetry]     = useState<TelemetryEvent[]>([]);

  // Console
  const [consoleLog, setConsoleLog]   = useState<ConsoleEntry[]>([
    { id: uid(), timestamp: nowTime(), role: "system", text: "GAUSS MISSION HUD ONLINE. JUDITH M1 NODE INITIALIZING..." },
    { id: uid(), timestamp: nowTime(), role: "system", text: "Fetching live TLE data from CelesTrak..." },
  ]);
  const [command, setCommand]         = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [dangerEvent, setDangerEvent] = useState<TelemetryEvent | null>(null);
  const [acknowledgedIds]             = useState(new Set<string>());

  const consoleScrollRef  = useRef<ScrollView>(null);
  const healthIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tleIntervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const propIntervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const gpDataRef         = useRef<CelesTrakGP[]>([]);
  const headerFlashAnim   = useRef(new Animated.Value(0)).current;
  const inputRef          = useRef<TextInput>(null);

  // ── Header flash ─────────────────────────────────────────────────────────────
  const flashHeader = useCallback(() => {
    Animated.sequence([
      Animated.timing(headerFlashAnim, { toValue: 1, duration: 80,  useNativeDriver: true }),
      Animated.timing(headerFlashAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [headerFlashAnim]);

  // ── Append to console ─────────────────────────────────────────────────────────
  const appendConsole = useCallback((role: ConsoleEntry["role"], text: string) => {
    setConsoleLog(prev => [...prev, { id: uid(), timestamp: nowTime(), role, text }]);
  }, []);

  // ── Health Check ──────────────────────────────────────────────────────────────
  const runHealthCheck = useCallback(async () => {
    const start = Date.now();
    try {
      const res = await fetch(STATUS_URL, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      const latency = Date.now() - start;
      setNodeStatus(res.ok ? "ONLINE" : "OFFLINE");
      setLatencyMs(res.ok ? latency : null);
    } catch {
      setNodeStatus("OFFLINE");
      setLatencyMs(null);
    }
    setLastChecked(nowTime());
    setPingCount(c => c + 1);
    flashHeader();
  }, [flashHeader]);

  // ── Fetch TLE data from CelesTrak ─────────────────────────────────────────────
  const fetchTLEData = useCallback(async () => {
    setTleLoading(true);
    setTleError(null);
    const allGP: CelesTrakGP[] = [];
    let successCount = 0;

    for (const group of SATELLITE_GROUPS) {
      try {
        const data = await fetchGroupTLEs(group.key, AbortSignal.timeout(15000));
        // Take a representative sample from each group
        const sample = data.slice(0, MAX_SATS_PER_GROUP);
        allGP.push(...sample);
        successCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown";
        appendConsole("alert", `TLE fetch failed for ${group.label}: ${msg}`);
      }
    }

    if (allGP.length > 0) {
      setGpData(allGP);
      gpDataRef.current = allGP;
      setSatCount(allGP.length);
      setLastTleRefresh(new Date());
      setTleLoading(false);
      appendConsole("system",
        `TLE data loaded: **${allGP.length} satellites** across ${successCount}/${SATELLITE_GROUPS.length} groups.\n` +
        `Source: CelesTrak (celestrak.org) · Dr. T.S. Kelso\n` +
        `Propagation: SGP4/SDP4 via satellite.js v6`
      );
      // Generate initial telemetry from first batch of satellites
      const initialEvents = allGP.slice(0, 20).map(gp => {
        const state = propagateGP(gp);
        return eventFromState(state);
      });
      setTelemetry(initialEvents);
    } else {
      setTleError("All TLE fetches failed. Check network connectivity.");
      setTleLoading(false);
      appendConsole("alert", "CELESTRAK FETCH FAILED — No TLE data available. Operating in degraded mode.");
    }
  }, [appendConsole]);

  // ── Propagation loop — update positions every 5s ──────────────────────────────
  const runPropagation = useCallback(() => {
    const gps = gpDataRef.current;
    if (gps.length === 0) return;

    // Pick a random satellite from the pool and propagate it
    const gp = gps[Math.floor(Math.random() * gps.length)];
    const state = propagateGP(gp, new Date());
    if (state.error) return;

    const event = eventFromState(state);
    setTelemetry(prev => [event, ...prev].slice(0, MAX_TELEMETRY_EVENTS));

    // Trigger danger flash for high-threat events
    if (event.threatPct >= DANGER_THRESHOLD && !acknowledgedIds.has(event.id)) {
      setDangerEvent(event);
    }
  }, [acknowledgedIds]);

  // ── Effects ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Start health check
    runHealthCheck();
    healthIntervalRef.current = setInterval(runHealthCheck, HEALTH_CHECK_INTERVAL);

    // Fetch TLE data immediately
    fetchTLEData();

    // Refresh TLEs every 6 hours
    tleIntervalRef.current = setInterval(fetchTLEData, TLE_REFRESH_INTERVAL);

    return () => {
      if (healthIntervalRef.current) clearInterval(healthIntervalRef.current);
      if (tleIntervalRef.current)    clearInterval(tleIntervalRef.current);
      if (propIntervalRef.current)   clearInterval(propIntervalRef.current);
    };
  }, [runHealthCheck, fetchTLEData]);

  // Start propagation loop once TLE data is loaded
  useEffect(() => {
    if (gpData.length === 0) return;
    if (propIntervalRef.current) clearInterval(propIntervalRef.current);
    propIntervalRef.current = setInterval(runPropagation, PROPAGATION_INTERVAL);
    return () => {
      if (propIntervalRef.current) clearInterval(propIntervalRef.current);
    };
  }, [gpData.length, runPropagation]);

  // Auto-scroll console
  useEffect(() => {
    const t = setTimeout(() => consoleScrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [consoleLog]);

  // ── Send Command ──────────────────────────────────────────────────────────────
  const sendCommand = useCallback(async (cmdOverride?: string) => {
    const trimmed = (cmdOverride ?? command).trim();
    if (!trimmed || isProcessing) return;
    if (!cmdOverride) setCommand("");

    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (trimmed.toUpperCase() === "CLEAR") {
      setConsoleLog([{ id: uid(), timestamp: nowTime(), role: "system", text: "Console cleared." }]);
      return;
    }
    if (trimmed.toUpperCase() === "SATS") {
      appendConsole("system",
        `**${satCount} satellites** tracked across ${SATELLITE_GROUPS.length} groups.\n` +
        `Last TLE refresh: ${lastTleRefresh ? lastTleRefresh.toISOString().slice(0, 19) + "Z" : "pending"}\n` +
        `Groups: ${SATELLITE_GROUPS.map(g => g.label).join(", ")}`
      );
      return;
    }

    appendConsole("user", trimmed);
    setIsProcessing(true);
    appendConsole("system", "Processing...");

    try {
      const res = await fetch(REASON_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
        signal: AbortSignal.timeout(30000),
      });
      setConsoleLog(prev => prev.filter(e => e.text !== "Processing..."));
      if (res.ok) {
        const data = await res.json();
        const output = data.response ?? data.output ?? data.result ?? JSON.stringify(data, null, 2);
        appendConsole("response", output);
      } else {
        appendConsole("alert", `HTTP ${res.status} — ${res.statusText}`);
      }
    } catch (err: unknown) {
      setConsoleLog(prev => prev.filter(e => e.text !== "Processing..."));
      const msg = err instanceof Error ? err.message : "Unknown error";
      appendConsole("alert", `CONNECTION FAILED — ${msg}\n\nEnsure Tailscale is active and JUDITH node is reachable:\n${REASON_URL}`);
    } finally {
      setIsProcessing(false);
    }
  }, [command, isProcessing, appendConsole, satCount, lastTleRefresh]);

  // ── Urgent Control Handler ────────────────────────────────────────────────────
  const handleUrgentControl = useCallback((ctrl: typeof URGENT_CONTROLS[number]) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    appendConsole("control", `URGENT: ${ctrl.command}`);
    sendCommand(ctrl.command);
  }, [appendConsole, sendCommand]);

  // ── Danger Acknowledge ────────────────────────────────────────────────────────
  const acknowledgeDanger = useCallback(() => {
    if (dangerEvent) {
      acknowledgedIds.add(dangerEvent.id);
      appendConsole("alert",
        `ACKNOWLEDGED: ${dangerEvent.type} — ${dangerEvent.satName} (NORAD #${dangerEvent.noradId})\n` +
        `Position: ${dangerEvent.coordinates} · Alt: ${dangerEvent.altKm.toFixed(0)}km\n` +
        `Threat: ${dangerEvent.threatPct}% · ${dangerEvent.detail}`
      );
    }
    setDangerEvent(null);
  }, [dangerEvent, acknowledgedIds, appendConsole]);

  // ── Derived ───────────────────────────────────────────────────────────────────
  const statusColor = useMemo(() =>
    nodeStatus === "ONLINE" ? C.volt : nodeStatus === "OFFLINE" ? C.red : C.orange,
    [nodeStatus]
  );

  const headerFlashBg = headerFlashAnim.interpolate({
    inputRange: [0, 1], outputRange: ["#050505", "#0D1A00"],
  });

  const renderTelemetryItem = useCallback(
    ({ item }: { item: TelemetryEvent }) => <TelemetryRow item={item} />,
    []
  );
  const keyExtractor = useCallback((item: TelemetryEvent) => item.id, []);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.black} />
      <ScanLines />

      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          {/* ── NODE STATUS HEADER ───────────────────────────────────────── */}
          <Animated.View style={[styles.header, { backgroundColor: headerFlashBg }]}>
            <View style={styles.headerAccentLine} />
            <View style={styles.headerInner}>
              <View style={styles.headerRow}>
                <Text style={styles.appTitle}>GAUSS // MISSION HUD</Text>
                <View style={[styles.statusBadge, { borderColor: statusColor }]}>
                  <BlinkDot color={statusColor} />
                  <Text style={[styles.statusText, { color: statusColor }]}>{nodeStatus}</Text>
                </View>
              </View>
              <View style={styles.headerRow}>
                <Text style={styles.nodeName}>JUDITH · M1 NODE</Text>
                <View style={styles.headerMeta}>
                  {latencyMs !== null && (
                    <Text style={styles.latency}>{latencyMs}ms</Text>
                  )}
                  <Text style={styles.lastChecked}>#{pingCount} · {lastChecked}</Text>
                </View>
              </View>
              {/* TLE data status bar */}
              <View style={styles.tleStatusRow}>
                {tleLoading ? (
                  <View style={styles.tleLoadingRow}>
                    <ActivityIndicator size="small" color={C.volt} style={{ transform: [{ scale: 0.6 }] }} />
                    <Text style={styles.tleStatusText}>FETCHING TLE DATA FROM CELESTRAK...</Text>
                  </View>
                ) : tleError ? (
                  <Text style={[styles.tleStatusText, { color: C.red }]}>⚠ {tleError}</Text>
                ) : (
                  <Text style={styles.tleStatusText}>
                    ✓ {satCount} SATS · CELESTRAK · {lastTleRefresh?.toISOString().slice(11, 19)}Z
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.divider} />
          </Animated.View>

          {/* ── ORBITAL TELEMETRY FEED ───────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>ORBITAL TELEMETRY · LIVE</Text>
              <Text style={styles.sectionMeta}>{telemetry.length} EVENTS</Text>
            </View>
            <View style={styles.telemetryContainer}>
              <View style={styles.telemetryColHeaders}>
                <Text style={[styles.colHdr, { width: 58 }]}>TIME</Text>
                <Text style={[styles.colHdr, { width: 68 }]}>TYPE</Text>
                <Text style={[styles.colHdr, { width: 82 }]}>SATELLITE</Text>
                <Text style={[styles.colHdr, { flex: 1 }]}>DETAIL / THREAT</Text>
              </View>
              {tleLoading && telemetry.length === 0 ? (
                <View style={styles.telemetryLoading}>
                  <ActivityIndicator color={C.volt} />
                  <Text style={styles.telemetryLoadingText}>ACQUIRING ORBITAL DATA...</Text>
                </View>
              ) : (
                <FlatList
                  data={telemetry}
                  keyExtractor={keyExtractor}
                  renderItem={renderTelemetryItem}
                  style={styles.telemetryList}
                  showsVerticalScrollIndicator={false}
                  initialNumToRender={10}
                  maxToRenderPerBatch={5}
                  removeClippedSubviews
                />
              )}
            </View>
          </View>

          {/* ── ACTIONING CONSOLE ────────────────────────────────────────── */}
          <View style={[styles.section, styles.consoleFlex]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>ACTIONING CONSOLE</Text>
              {isProcessing && (
                <View style={styles.processingRow}>
                  <Text style={styles.processingDots}>···</Text>
                  <Text style={styles.processingLabel}>PROCESSING</Text>
                </View>
              )}
            </View>
            <View style={styles.consoleContainer}>
              <ScrollView
                ref={consoleScrollRef}
                style={styles.consoleScroll}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.consoleContent}
              >
                {consoleLog.map(entry => (
                  <ConsoleEntryRow key={entry.id} entry={entry} />
                ))}
                {!isProcessing && <BlinkingCursor />}
              </ScrollView>
            </View>
          </View>

          {/* ── URGENT CONTROLS ──────────────────────────────────────────── */}
          <View style={styles.urgentBar}>
            <Text style={styles.urgentLabel}>URGENT</Text>
            {URGENT_CONTROLS.map(ctrl => (
              <Pressable
                key={ctrl.id}
                style={({ pressed }) => [
                  styles.urgentBtn,
                  { borderColor: ctrl.color, backgroundColor: pressed ? ctrl.color + "44" : ctrl.bg },
                ]}
                onPress={() => handleUrgentControl(ctrl)}
              >
                <Text style={[styles.urgentBtnText, { color: ctrl.color }]}>{ctrl.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* ── COMMAND INPUT ─────────────────────────────────────────────── */}
          <View style={[styles.commandBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <View style={styles.commandInputWrapper}>
              <Text style={styles.commandPrompt}>{">"}</Text>
              <TextInput
                ref={inputRef}
                style={styles.commandInput}
                value={command}
                onChangeText={setCommand}
                placeholder="ENTER COMMAND... (try: SATS)"
                placeholderTextColor={C.dim}
                onSubmitEditing={() => sendCommand()}
                returnKeyType="send"
                editable={!isProcessing}
                autoCapitalize="characters"
                autoCorrect={false}
                selectionColor={C.volt}
              />
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.sendBtn,
                (isProcessing || !command.trim()) && styles.sendBtnDisabled,
                pressed && !isProcessing && command.trim() && styles.sendBtnPressed,
              ]}
              onPress={() => sendCommand()}
              disabled={isProcessing || !command.trim()}
            >
              <Text style={[
                styles.sendBtnText,
                (isProcessing || !command.trim()) && styles.sendBtnTextDisabled,
              ]}>
                {isProcessing ? "WAIT" : "SEND"}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* ── DANGER FLASH OVERLAY ─────────────────────────────────────────── */}
      {dangerEvent && (
        <DangerFlash event={dangerEvent} onAcknowledge={acknowledgeDanger} />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.black },
  safeArea:{ flex: 1, backgroundColor: C.black },
  flex:    { flex: 1 },

  scanLine: {
    position: "absolute", left: 0, right: 0, height: 1,
    backgroundColor: "rgba(0,0,0,0.18)",
  },

  // Header
  header:          { backgroundColor: C.black },
  headerAccentLine:{ height: 2, backgroundColor: C.volt },
  headerInner:     { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6 },
  headerRow:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  appTitle:        { fontFamily: MONO, fontSize: 14, fontWeight: "700", color: C.volt, letterSpacing: 2.5 },
  statusBadge:     { flexDirection: "row", alignItems: "center", borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3, gap: 5 },
  statusDot:       { width: 6, height: 6 },
  statusText:      { fontFamily: MONO, fontSize: 10, fontWeight: "700", letterSpacing: 1.5 },
  nodeName:        { fontFamily: MONO, fontSize: 11, color: C.white, letterSpacing: 1.5, fontWeight: "600" },
  headerMeta:      { flexDirection: "row", alignItems: "center", gap: 8 },
  latency:         { fontFamily: MONO, fontSize: 10, color: C.volt, letterSpacing: 1 },
  lastChecked:     { fontFamily: MONO, fontSize: 10, color: C.dim, letterSpacing: 0.5 },
  tleStatusRow:    { marginTop: 3 },
  tleLoadingRow:   { flexDirection: "row", alignItems: "center", gap: 6 },
  tleStatusText:   { fontFamily: MONO, fontSize: 9, color: C.dim, letterSpacing: 0.8 },
  divider:         { height: 1, backgroundColor: C.border },

  // Sections
  section:       { paddingHorizontal: 12, paddingTop: 8 },
  consoleFlex:   { flex: 1 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 5 },
  sectionLabel:  { fontFamily: MONO, fontSize: 8, color: C.dim, letterSpacing: 3, fontWeight: "700" },
  sectionMeta:   { fontFamily: MONO, fontSize: 8, color: C.dim, letterSpacing: 1 },

  // Telemetry
  telemetryContainer:  { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, height: 200 },
  telemetryColHeaders: { flexDirection: "row", paddingHorizontal: 8, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.black },
  colHdr:              { fontFamily: MONO, fontSize: 8, color: C.dim, letterSpacing: 1.5, fontWeight: "700" },
  telemetryList:       { flex: 1 },
  telemetryLoading:    { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  telemetryLoadingText:{ fontFamily: MONO, fontSize: 10, color: C.dim, letterSpacing: 2 },
  telemetryRow:        { flexDirection: "row", paddingHorizontal: 8, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: "#0F0F0F", alignItems: "center", position: "relative" },
  telemetryRowDanger:  { backgroundColor: "#1A0000" },
  telemetryDangerBorder:{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, backgroundColor: C.red },
  telemetryTime:       { fontFamily: MONO, fontSize: 10, color: C.dim,   width: 58, letterSpacing: 0.3 },
  telemetryType:       { fontFamily: MONO, fontSize: 10, fontWeight: "700", width: 68, letterSpacing: 0.3 },
  telemetrySat:        { fontFamily: MONO, fontSize: 10, color: C.white, width: 82, letterSpacing: 0.3 },
  telemetryRight:      { flex: 1, gap: 2 },
  telemetryDetail:     { fontFamily: MONO, fontSize: 10, color: C.dim, letterSpacing: 0.2 },
  threatBarBg:         { height: 2, backgroundColor: C.dim2, overflow: "hidden" },
  threatBarFill:       { height: 2 },

  // Console
  consoleContainer: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  consoleScroll:    { flex: 1 },
  consoleContent:   { padding: 10, paddingBottom: 16 },
  consoleRow:       { flexDirection: "row", marginBottom: 8, flexWrap: "nowrap" },
  consolePrefix:    { fontFamily: MONO, fontSize: 10, letterSpacing: 0.3, lineHeight: 16, flexShrink: 0 },
  consoleBody:      { flex: 1, flexShrink: 1 },
  cursor:           { width: 8, height: 13, backgroundColor: C.volt, marginTop: 2 },

  // Markdown
  mdParagraph: { fontFamily: MONO, fontSize: 12, color: C.white, lineHeight: 17, letterSpacing: 0.2 },
  mdH1:        { fontFamily: MONO, fontSize: 12, fontWeight: "700", color: C.volt, letterSpacing: 2, marginTop: 6, marginBottom: 3 },
  mdH2:        { fontFamily: MONO, fontSize: 11, fontWeight: "700", color: C.volt, letterSpacing: 1.5, marginTop: 4, marginBottom: 2 },
  mdList:      { fontFamily: MONO, fontSize: 12, color: C.white, lineHeight: 17, paddingLeft: 4 },
  mdBold:      { fontWeight: "700", color: C.volt },
  mdCode:      { fontFamily: MONO, fontSize: 11, color: C.volt, backgroundColor: "#0A0A0A" },
  mdCodeLine:  { fontFamily: MONO, fontSize: 11, color: C.volt, lineHeight: 16, backgroundColor: "#0A0A0A", paddingHorizontal: 4 },

  // Processing
  processingRow:   { flexDirection: "row", alignItems: "center", gap: 5 },
  processingDots:  { fontFamily: MONO, fontSize: 14, color: C.volt, letterSpacing: 3 },
  processingLabel: { fontFamily: MONO, fontSize: 8, color: C.volt, letterSpacing: 2 },

  // Urgent Controls
  urgentBar:     { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.black, gap: 6 },
  urgentLabel:   { fontFamily: MONO, fontSize: 7, color: C.dim, letterSpacing: 2, fontWeight: "700", marginRight: 2 },
  urgentBtn:     { flex: 1, borderWidth: 1, paddingVertical: 7, alignItems: "center", justifyContent: "center" },
  urgentBtnText: { fontFamily: MONO, fontSize: 10, fontWeight: "700", letterSpacing: 1 },

  // Command Bar
  commandBar:           { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.volt, backgroundColor: C.black, gap: 8 },
  commandInputWrapper:  { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 9, gap: 8 },
  commandPrompt:        { fontFamily: MONO, fontSize: 14, color: C.volt, fontWeight: "700" },
  commandInput:         { flex: 1, fontFamily: MONO, fontSize: 13, color: C.white, letterSpacing: 0.5, padding: 0, margin: 0 },
  sendBtn:              { backgroundColor: C.volt, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 4, minWidth: 66, alignItems: "center" },
  sendBtnDisabled:      { backgroundColor: "#1A1A00", borderWidth: 1, borderColor: C.border },
  sendBtnPressed:       { backgroundColor: "#AADD00", transform: [{ scale: 0.96 }] },
  sendBtnText:          { fontFamily: MONO, fontSize: 11, fontWeight: "700", color: C.black, letterSpacing: 2 },
  sendBtnTextDisabled:  { color: C.dim },

  // Danger Flash
  dangerOverlay:      { flex: 1, backgroundColor: "#1A0000", justifyContent: "center", alignItems: "center", paddingHorizontal: 16 },
  dangerCard:         { width: "100%", maxWidth: 420, backgroundColor: "#0A0000", borderWidth: 1, borderColor: C.red, overflow: "hidden" },
  dangerTopBar:       { height: 3, backgroundColor: C.red },
  dangerHeader:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#330000" },
  dangerLabel:        { fontFamily: MONO, fontSize: 15, fontWeight: "700", color: C.red, letterSpacing: 2 },
  dangerThreatPct:    { fontFamily: MONO, fontSize: 32, fontWeight: "700", color: C.red, letterSpacing: 1 },
  dangerInfoGrid:     { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#330000", gap: 12 },
  dangerInfoCell:     { width: "47%" },
  dangerInfoLabel:    { fontFamily: MONO, fontSize: 8, color: C.dim, letterSpacing: 2, marginBottom: 2 },
  dangerInfoValue:    { fontFamily: MONO, fontSize: 13, color: C.white, fontWeight: "700", letterSpacing: 0.5 },
  dangerDetail:       { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#330000" },
  dangerDetailText:   { fontFamily: MONO, fontSize: 12, color: C.orange, letterSpacing: 0.5, lineHeight: 18 },
  dangerThreatSection:{ paddingHorizontal: 16, paddingVertical: 10 },
  dangerThreatBarBg:  { height: 6, backgroundColor: "#330000", marginVertical: 6, overflow: "hidden" },
  dangerThreatBarFill:{ height: 6, backgroundColor: C.red },
  dangerThreatPctLabel:{ fontFamily: MONO, fontSize: 9, color: C.red, letterSpacing: 2 },
  dangerControls:     { flexDirection: "row", paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  dangerCtrlBtn:      { flex: 1, borderWidth: 1, paddingVertical: 9, alignItems: "center" },
  dangerCtrlText:     { fontFamily: MONO, fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  dangerAckBtn:       { marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: C.dim, paddingVertical: 10, alignItems: "center" },
  dangerAckText:      { fontFamily: MONO, fontSize: 11, color: C.dim, letterSpacing: 2 },
});
