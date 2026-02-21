/**
 * Project Gauss — Mission HUD
 * Gauss Design System (GDS) v1.0
 *
 * OLED-First · JetBrains Mono · Bento Box Layout · Contextual Generative UI
 * 250ms Glanceability · Haptic Density · SVG Vector Architecture
 */

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  StyleSheet,
  Dimensions,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Svg, { Circle, Path, Line, Ellipse, Rect, Text as SvgText } from "react-native-svg";
import {
  fetchAllSatellites,
  propagateGP,
  propagateGPDelta,
  classifyEvent,
  formatCoords,
  formatSatName,
  type TelemetryEvent,
  type CelesTrakGP,
} from "@/lib/satellite-service";
import {
  loadRiskEvents,
  operatorEventToTelemetry,
  type OperatorRiskEvent,
} from "@/lib/operator-store";
import {
  fetchSpaceWeather,
  computeSolarThreat,
  activityColor,
  gStormColor,
  flareClassColor,
  formatFlux,
  formatKp,
  type SpaceWeatherState,
  type SolarActivityLevel,
} from "@/lib/solar-weather-service";
import { dataParser } from "@/lib/data-parser";

// ─── Configuration ────────────────────────────────────────────────────────────
const TAILSCALE_IP = "100.x.x.x"; // Replace with your Tailscale IP
const BASE_URL     = `http://${TAILSCALE_IP}:8080`;
const HEALTH_URL   = `${BASE_URL}/status`;
const REASON_URL   = `${BASE_URL}/reason`;

// ─── GDS Color Palette ────────────────────────────────────────────────────────
const C = {
  BLACK:    "#000000",
  SURFACE:  "#0A0A0A",
  SURFACE2: "#111111",
  BORDER:   "#1A1A1A",
  BORDER2:  "#2A2A2A",
  WHITE:    "#FFFFFF",
  MUTED:    "#666666",
  MUTED2:   "#444444",
  VOLT:     "#CCFF00",   // Nominal
  AMBER:    "#FFAA00",   // Warning
  RED:      "#FF2222",   // Crisis
  CYAN:     "#00CCFF",   // Lock
  ORANGE:   "#FF6600",   // Anomaly
} as const;

// ─── GDS Typography ───────────────────────────────────────────────────────────
const FONT = {
  regular: "JetBrainsMono_400Regular",
  medium:  "JetBrainsMono_500Medium",
  bold:    "JetBrainsMono_700Bold",
} as const;

// ─── Event type colors ────────────────────────────────────────────────────────
const EVENT_COLORS: Record<string, string> = {
  PASS:     C.VOLT,
  LOCK:     C.CYAN,
  SIGNAL:   C.WHITE,
  DRIFT:    C.AMBER,
  ANOMALY:  C.ORANGE,
  CRITICAL: C.RED,
};

const DANGER_THRESHOLD = 75;
const { width: SCREEN_W } = Dimensions.get("window");

// ─── Types ────────────────────────────────────────────────────────────────────
type NodeStatus = "ONLINE" | "OFFLINE" | "CONNECTING";

interface ConsoleEntry {
  id: string;
  time: string;
  text: string;
  color?: string;
  isBold?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function nowTime() {
  return new Date().toISOString().slice(11, 19);
}

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── SVG Orbital Arc Visualiser ───────────────────────────────────────────────
// World-map equirectangular projection with real satellite positions.
// Shows top-12 highest-risk satellites. AR/HUD-ready — pure SVG vectors.
interface OrbitalArcProps {
  events: TelemetryEvent[];
  threatLevel: "NOMINAL" | "WARNING" | "CRISIS";
  lastPropagated?: Date | null;
}

// Convert geographic lat/lon to SVG x/y on an equirectangular projection
function latLonToXY(lat: number, lon: number, W: number, H: number): { x: number; y: number } {
  const x = ((lon + 180) / 360) * W;
  const y = ((90 - lat) / 180) * H;
  return { x, y };
}

function OrbitalArcVisualiser({ events, threatLevel, lastPropagated }: OrbitalArcProps) {
  const W = SCREEN_W - 32;
  const H = 160;
  const glowColor =
    threatLevel === "CRISIS"  ? C.RED  :
    threatLevel === "WARNING" ? C.AMBER : C.VOLT;

  // Latency timer: seconds since last propagation
  const [dataAgeSec, setDataAgeSec] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => {
      if (lastPropagated) {
        setDataAgeSec(Math.floor((Date.now() - lastPropagated.getTime()) / 1000));
      }
    }, 1000);
    return () => clearInterval(t);
  }, [lastPropagated]);

  // Top 12 highest-risk satellites with real lat/lon
  const riskySats = events
    .filter(e => e.lat !== undefined && e.lon !== undefined && !e.isOperator)
    .sort((a, b) => b.threatPct - a.threatPct)
    .slice(0, 12);

  // World map grid lines (equirectangular)
  const latLines = [-60, -30, 0, 30, 60];
  const lonLines = [-120, -60, 0, 60, 120];

  // Orbit altitude rings (approximate equatorial projections)
  // LEO ~400km, MEO ~20000km, GEO ~35786km — shown as horizontal bands
  const orbitRings = [
    { label: "LEO", yFrac: 0.35, opacity: 0.35 },
    { label: "MEO", yFrac: 0.22, opacity: 0.22 },
    { label: "GEO", yFrac: 0.08, opacity: 0.14 },
  ];

  return (
    <View>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* Background */}
        <Rect x={0} y={0} width={W} height={H} fill="#000000" />

        {/* World map grid — equirectangular graticule */}
        {latLines.map(lat => {
          const { y } = latLonToXY(lat, 0, W, H);
          return (
            <Line
              key={`lat${lat}`}
              x1={0} y1={y} x2={W} y2={y}
              stroke={C.BORDER2}
              strokeWidth={lat === 0 ? 0.8 : 0.4}
              strokeOpacity={lat === 0 ? 0.6 : 0.3}
              strokeDasharray={lat === 0 ? undefined : "2 4"}
            />
          );
        })}
        {lonLines.map(lon => {
          const { x } = latLonToXY(0, lon, W, H);
          return (
            <Line
              key={`lon${lon}`}
              x1={x} y1={0} x2={x} y2={H}
              stroke={C.BORDER2}
              strokeWidth={lon === 0 ? 0.8 : 0.4}
              strokeOpacity={lon === 0 ? 0.6 : 0.3}
              strokeDasharray={lon === 0 ? undefined : "2 4"}
            />
          );
        })}

        {/* Orbit altitude rings as horizontal bands */}
        {orbitRings.map(ring => {
          const topY = ring.yFrac * H;
          const botY = H - ring.yFrac * H;
          return (
            <React.Fragment key={ring.label}>
              <Line x1={0} y1={topY} x2={W} y2={topY}
                stroke={glowColor} strokeWidth={0.5} strokeOpacity={ring.opacity}
                strokeDasharray="4 6"
              />
              <Line x1={0} y1={botY} x2={W} y2={botY}
                stroke={glowColor} strokeWidth={0.5} strokeOpacity={ring.opacity}
                strokeDasharray="4 6"
              />
              <SvgText x={4} y={topY - 2} fontSize={6} fill={glowColor}
                fillOpacity={ring.opacity * 1.8} fontFamily={FONT.regular}>
                {ring.label}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* Satellite position dots */}
        {riskySats.map((sat) => {
          const { x, y } = latLonToXY(sat.lat!, sat.lon!, W, H);
          const color = EVENT_COLORS[sat.type] ?? C.VOLT;
          const isCritical = sat.threatPct >= DANGER_THRESHOLD;
          const isHigh = sat.threatPct >= 50;
          const r = isCritical ? 4 : isHigh ? 3 : 2;

          return (
            <React.Fragment key={sat.id}>
              {/* Glow ring for high-threat */}
              {isCritical && (
                <Circle cx={x} cy={y} r={r + 4} fill={color} fillOpacity={0.12} />
              )}
              {isHigh && !isCritical && (
                <Circle cx={x} cy={y} r={r + 2} fill={color} fillOpacity={0.08} />
              )}
              {/* Main dot */}
              <Circle cx={x} cy={y} r={r} fill={color} fillOpacity={0.95} />
              {/* Crosshair for critical */}
              {isCritical && (
                <>
                  <Line x1={x - 6} y1={y} x2={x - r - 1} y2={y} stroke={color} strokeWidth={0.8} strokeOpacity={0.7} />
                  <Line x1={x + r + 1} y1={y} x2={x + 6} y2={y} stroke={color} strokeWidth={0.8} strokeOpacity={0.7} />
                  <Line x1={x} y1={y - 6} x2={x} y2={y - r - 1} stroke={color} strokeWidth={0.8} strokeOpacity={0.7} />
                  <Line x1={x} y1={y + r + 1} x2={x} y2={y + 6} stroke={color} strokeWidth={0.8} strokeOpacity={0.7} />
                </>
              )}
              {/* Name label — only for top 6 */}
              {riskySats.indexOf(sat) < 6 && (
                <SvgText
                  x={x + r + 2}
                  y={y - 2}
                  fontSize={6}
                  fill={color}
                  fillOpacity={0.85}
                  fontFamily={FONT.regular}
                >
                  {sat.satName.slice(0, 10)}
                </SvgText>
              )}
              {/* Threat % for critical */}
              {isCritical && (
                <SvgText
                  x={x + r + 2}
                  y={y + 7}
                  fontSize={6}
                  fill={color}
                  fillOpacity={0.7}
                  fontFamily={FONT.regular}
                >
                  {sat.threatPct}%
                </SvgText>
              )}
            </React.Fragment>
          );
        })}

        {/* Corner HUD brackets */}
        {[
          [4, 4, 14, 4, 4, 14],
          [W - 4, 4, W - 14, 4, W - 4, 14],
          [4, H - 4, 14, H - 4, 4, H - 14],
          [W - 4, H - 4, W - 14, H - 4, W - 4, H - 14],
        ].map(([x1, y1, x2, y2, x3, y3], i) => (
          <Path
            key={i}
            d={`M${x1} ${y1} L${x2} ${y2} M${x1} ${y1} L${x3} ${y3}`}
            stroke={glowColor}
            strokeWidth={1.5}
            strokeOpacity={0.6}
          />
        ))}

        {/* Threat level — top left */}
        <SvgText x={6} y={12} fontSize={7} fill={glowColor} fillOpacity={0.8}
          fontFamily={FONT.bold}>
          {threatLevel}
        </SvgText>

        {/* Data age timer — top right */}
        <SvgText x={W - 6} y={12} fontSize={7}
          fill={dataAgeSec > 30 ? C.AMBER : C.MUTED}
          fillOpacity={0.9}
          textAnchor="end"
          fontFamily={FONT.regular}
        >
          {lastPropagated ? `T+${dataAgeSec}s` : "ACQUIRING"}
        </SvgText>

        {/* Satellite count — bottom left */}
        <SvgText x={6} y={H - 5} fontSize={6} fill={C.MUTED} fillOpacity={0.7}
          fontFamily={FONT.regular}>
          {`TOP ${riskySats.length} RISK`}
        </SvgText>

        {/* Equator label */}
        <SvgText
          x={W - 6}
          y={H / 2 - 3}
          fontSize={6}
          fill={C.BORDER2}
          fillOpacity={0.8}
          textAnchor="end"
          fontFamily={FONT.regular}
        >
          EQ
        </SvgText>
      </Svg>
    </View>
  );
}

// ─── Status Glow Badge ────────────────────────────────────────────────────────
function StatusGlow({ status }: { status: NodeStatus }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status === "CONNECTING") {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.2, duration: 600, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1,   duration: 600, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    } else if (status === "ONLINE") {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.5, duration: 2000, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1,   duration: 2000, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    } else {
      pulse.setValue(1);
    }
  }, [status, pulse]);

  const color =
    status === "ONLINE"      ? C.VOLT  :
    status === "CONNECTING"  ? C.AMBER : C.RED;

  return (
    <View style={styles.statusGlowWrap}>
      <Animated.View
        style={[
          styles.statusGlowRing,
          { borderColor: color, opacity: pulse },
        ]}
      />
      <View style={[styles.statusDot, { backgroundColor: color }]} />
    </View>
  );
}

// ─── Bento Card ───────────────────────────────────────────────────────────────
interface BentoCardProps {
  label: string;
  labelRight?: string;
  labelColor?: string;
  children: React.ReactNode;
  flex?: number;
  noPad?: boolean;
  accentColor?: string;
}

function BentoCard({ label, labelRight, labelColor, children, flex, noPad, accentColor }: BentoCardProps) {
  return (
    <View style={[styles.bentoCard, flex ? { flex } : undefined]}>
      {/* Top accent line */}
      <View style={[styles.bentoAccent, { backgroundColor: accentColor ?? C.VOLT }]} />
      {/* Header */}
      <View style={styles.bentoHeader}>
        <Text style={[styles.bentoLabel, labelColor ? { color: labelColor } : undefined]}>
          {label}
        </Text>
        {labelRight ? (
          <Text style={[styles.bentoLabelRight, labelColor ? { color: labelColor } : undefined]}>
            {labelRight}
          </Text>
        ) : null}
      </View>
      {/* Content */}
      <View style={noPad ? undefined : styles.bentoPad}>
        {children}
      </View>
    </View>
  );
}

// ─── Telemetry Row ────────────────────────────────────────────────────────────
interface TelemetryRowProps {
  item: TelemetryEvent;
  isNew: boolean;
}

function TelemetryRow({ item, isNew }: TelemetryRowProps) {
  const fadeAnim = useRef(new Animated.Value(isNew ? 0 : 1)).current;
  const color = EVENT_COLORS[item.type] ?? C.VOLT;
  const isCritical = item.threatPct >= DANGER_THRESHOLD;

  useEffect(() => {
    if (isNew) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isNew, fadeAnim]);

  return (
    <Animated.View
      style={[
        styles.telemetryRow,
        isCritical && styles.telemetryRowCritical,
        { opacity: fadeAnim },
      ]}
    >
      {/* Left threat indicator bar */}
      <View
        style={[
          styles.telemetryBar,
          { backgroundColor: color, opacity: isCritical ? 1 : 0.5 },
        ]}
      />
      <View style={styles.telemetryContent}>
        {/* Time + Type */}
        <View style={styles.telemetryMeta}>
          <Text style={styles.telemetryTime}>{item.timestamp.slice(0, 5)}</Text>
          <View style={[styles.typeBadge, { borderColor: color }]}>
            <Text style={[styles.typeBadgeText, { color }]}>{item.type}</Text>
          </View>
          {(item as any).isOperator && (
            <View style={styles.opBadge}>
              <Text style={styles.opBadgeText}>OP</Text>
            </View>
          )}
        </View>
        {/* Satellite name + detail */}
        <View style={styles.telemetryBody}>
          <Text style={styles.telemetrySatName} numberOfLines={1}>
            {item.satName}
          </Text>
          <Text style={styles.telemetryDetail} numberOfLines={1}>
            {item.detail}
          </Text>
        </View>
        {/* Threat bar */}
        <View style={styles.threatBarWrap}>
          <View style={[styles.threatBarFill, { width: `${item.threatPct}%` as any, backgroundColor: color }]} />
          <Text style={[styles.threatPct, { color }]}>{item.threatPct}%</Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Danger Flash Overlay ─────────────────────────────────────────────────────
interface DangerFlashProps {
  event: TelemetryEvent;
  onAcknowledge: () => void;
  onUrgentAction: (action: string) => void;
}

function DangerFlashOverlay({ event, onAcknowledge, onUrgentAction }: DangerFlashProps) {
  const strobe = useRef(new Animated.Value(1)).current;
  const color = EVENT_COLORS[event.type] ?? C.RED;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(strobe, { toValue: 0.05, duration: 120, useNativeDriver: true }),
        Animated.timing(strobe, { toValue: 1,    duration: 120, useNativeDriver: true }),
        Animated.timing(strobe, { toValue: 0.05, duration: 120, useNativeDriver: true }),
        Animated.timing(strobe, { toValue: 1,    duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [strobe]);

  return (
    <View style={styles.dangerOverlay}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color, opacity: strobe }]} />
      <View style={styles.dangerCard}>
        {/* Header */}
        <View style={styles.dangerHeader}>
          <Text style={[styles.dangerTitle, { color }]}>⚠ {event.type} DETECTED</Text>
          <Text style={styles.dangerTime}>{event.timestamp}</Text>
        </View>

        {/* Satellite info */}
        <View style={styles.dangerSatRow}>
          <Text style={styles.dangerSatLabel}>OBJECT</Text>
          <Text style={[styles.dangerSatValue, { color }]}>{event.satName}</Text>
        </View>
        <View style={styles.dangerSatRow}>
          <Text style={styles.dangerSatLabel}>COORDS</Text>
          <Text style={styles.dangerSatValue}>{event.coordinates}</Text>
        </View>
        <View style={styles.dangerSatRow}>
          <Text style={styles.dangerSatLabel}>DETAIL</Text>
          <Text style={styles.dangerSatValue} numberOfLines={2}>{event.detail}</Text>
        </View>

        {/* Threat probability bar */}
        <View style={styles.dangerThreatWrap}>
          <Text style={styles.dangerThreatLabel}>THREAT PROBABILITY</Text>
          <View style={styles.dangerThreatTrack}>
            <View style={[styles.dangerThreatFill, { width: `${event.threatPct}%` as any, backgroundColor: color }]} />
          </View>
          <Text style={[styles.dangerThreatPct, { color }]}>{event.threatPct}%</Text>
        </View>

        {/* Urgent action buttons */}
        <View style={styles.urgentRow}>
          {URGENT_CONTROLS.map(ctrl => (
            <Pressable
              key={ctrl.action}
              onPress={() => onUrgentAction(ctrl.action)}
              style={({ pressed }) => [
                styles.urgentBtn,
                { borderColor: ctrl.color, backgroundColor: pressed ? ctrl.color + "22" : "transparent" },
              ]}
            >
              <Text style={[styles.urgentBtnText, { color: ctrl.color }]}>{ctrl.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Acknowledge */}
        <Pressable
          onPress={onAcknowledge}
          style={({ pressed }) => [
            styles.ackBtn,
            { backgroundColor: pressed ? C.VOLT + "33" : "transparent" },
          ]}
        >
          <Text style={styles.ackBtnText}>ACKNOWLEDGE</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Urgent Controls Config ───────────────────────────────────────────────────
const URGENT_CONTROLS = [
  { label: "ABORT",    action: "ABORT",    color: C.RED    },
  { label: "ISOLATE",  action: "ISOLATE",  color: C.ORANGE },
  { label: "OVERRIDE", action: "OVERRIDE", color: C.AMBER  },
  { label: "LOCKDOWN", action: "LOCKDOWN", color: C.WHITE  },
];

// ─── Main HUD Screen ──────────────────────────────────────────────────────────
export default function HUDScreen() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [nodeStatus, setNodeStatus]     = useState<NodeStatus>("CONNECTING");
  const [pingMs, setPingMs]             = useState<number | null>(null);
  const [pingCount, setPingCount]       = useState(0);
  const [lastPingTime, setLastPingTime] = useState("");
  const [dataSource, setDataSource]     = useState("");

  const [allGP, setAllGP]               = useState<CelesTrakGP[]>([]);
  const [events, setEvents]             = useState<TelemetryEvent[]>([]);
  const [newEventIds, setNewEventIds]   = useState<Set<string>>(new Set());
  const [isFetchingTLE, setIsFetchingTLE] = useState(false);
  const [lastTLEFetch, setLastTLEFetch] = useState<Date | null>(null);
  const [lastPropagated, setLastPropagated] = useState<Date | null>(null);

  const [consoleLog, setConsoleLog]     = useState<ConsoleEntry[]>([]);
  const [command, setCommand]           = useState("");
  const [isReasoning, setIsReasoning]   = useState(false);

  const [dangerEvent, setDangerEvent]   = useState<TelemetryEvent | null>(null);
  const [seenDangerIds, setSeenDangerIds] = useState<Set<string>>(new Set());

  // Solar weather state
  const [solarWeather, setSolarWeather]       = useState<SpaceWeatherState | null>(null);
  const [isFetchingSolar, setIsFetchingSolar] = useState(false);
  const [lastSolarFetch, setLastSolarFetch]   = useState<Date | null>(null);
  const [solarDangerFired, setSolarDangerFired] = useState(false);

  // Contextual UI: collapse non-essential panels on CRISIS
  const [threatLevel, setThreatLevel]   = useState<"NOMINAL" | "WARNING" | "CRISIS">("NOMINAL");
  const [showOrbitalArc, setShowOrbitalArc] = useState(true);

  const consoleRef  = useRef<ScrollView>(null);
  const inputRef    = useRef<TextInput>(null);

  // ── Console logger ─────────────────────────────────────────────────────────
  const log = useCallback((text: string, color?: string, isBold?: boolean) => {
    setConsoleLog(prev => [
      ...prev.slice(-99),
      { id: genId(), time: nowTime(), text, color, isBold },
    ]);
    setTimeout(() => consoleRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  // ── Health check loop ──────────────────────────────────────────────────────
  const doHealthCheck = useCallback(async () => {
    const t0 = Date.now();
    try {
      const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(5000) });
      const ms = Date.now() - t0;
      setPingMs(ms);
      setPingCount(c => c + 1);
      setLastPingTime(nowTime());
      if (res.ok) {
        setNodeStatus("ONLINE");
        // Haptic: light for successful data fetch
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      } else {
        setNodeStatus("OFFLINE");
      }
    } catch {
      setNodeStatus("OFFLINE");
      setPingMs(null);
      setPingCount(c => c + 1);
      setLastPingTime(nowTime());
    }
  }, []);

  // ── Fetch Solar Weather ──────────────────────────────────────────────────────
  const fetchSolarData = useCallback(async () => {
    if (isFetchingSolar) return;
    setIsFetchingSolar(true);
    try {
      const weather = await fetchSpaceWeather();
      setSolarWeather(weather);
      setLastSolarFetch(new Date());

      const lvl = weather.activityLevel;
      const color = activityColor(lvl);
      const fp = weather.flareProbabilities;

      log(
        `SOLAR WEATHER UPDATE\n` +
        `Activity: ${lvl} · Flare class: ${weather.currentFlareClass}\n` +
        `M-class prob: ${fp?.mClassPct ?? "N/A"}% · X-class prob: ${fp?.xClassPct ?? "N/A"}%\n` +
        `Kp index: ${formatKp(weather.kpCurrent)} · Storm: ${weather.geoStormLevel}\n` +
        (weather.solarWind ? `Solar wind: ${Math.round(weather.solarWind.speedKms)} km/s · Bz: ${weather.solarWind.bzGsm.toFixed(1)} nT` : "") +
        (weather.error ? `\n⚠ ${weather.error}` : ""),
        color,
      );

      // Danger flash for X-class flare probability > 10% or Kp >= 7
      const isXDanger = (fp?.xClassPct ?? 0) >= 10;
      const isKpDanger = weather.kpCurrent >= 7;
      if ((isXDanger || isKpDanger) && !solarDangerFired) {
        setSolarDangerFired(true);
        const syntheticEvent: TelemetryEvent = {
          id: `solar-${Date.now()}`,
          timestamp: new Date().toISOString().slice(11, 19),
          type: "CRITICAL",
          satName: "SOLAR WEATHER ALERT",
          noradId: 0,
          coordinates: `Kp=${formatKp(weather.kpCurrent)} · ${weather.geoStormLevel}`,
          detail: isXDanger
            ? `X-class flare probability: ${fp?.xClassPct}% — all satellite operators at risk`
            : `Geomagnetic storm Kp=${formatKp(weather.kpCurrent)} — radiation belt injection risk`,
          threatPct: isXDanger ? Math.min(95, (fp?.xClassPct ?? 0) * 5) : Math.min(95, weather.kpCurrent * 10),
          altKm: 0,
          velKms: 0,
          isReal: true as const,
        };
        setDangerEvent(syntheticEvent);
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      }
    } catch (err) {
      log(`Solar weather fetch error: ${err}`, C.AMBER);
    } finally {
      setIsFetchingSolar(false);
    }
  }, [isFetchingSolar, solarDangerFired, log]);

  // ── Fetch TLE data ─────────────────────────────────────────────────────────
  const fetchTLEData = useCallback(async () => {
    if (isFetchingTLE) return;
    setIsFetchingTLE(true);
    log("Fetching live TLE data from CelesTrak...", C.MUTED);
    try {
      const gp = await fetchAllSatellites();
      setAllGP(gp);
      setLastTLEFetch(new Date());
      const src = `CelesTrak (celestrak.org) · Dr. T.S. Kelso`;
      setDataSource(src);
      log(
        `TLE data loaded: **${gp.length} satellites** across 7/7 groups.\nSource: ${src}\nPropagation: SGP4/SDP4 via satellite.js v6`,
        C.VOLT,
        true,
      );
    } catch (err) {
      log(`TLE fetch error: ${err}`, C.RED);
    } finally {
      setIsFetchingTLE(false);
    }
  }, [isFetchingTLE, log]);

  // ── Propagate satellites → telemetry events ────────────────────────────────
  const propagateAll = useCallback(async () => {
    if (allGP.length === 0) return;

    // Load operator events and merge
    const opEvents = await loadRiskEvents();
    const opTelemetry = opEvents
      .filter(e => !e.isAcknowledged)
      .slice(0, 20)
      .map(operatorEventToTelemetry);

    const now = new Date();
      const computed: TelemetryEvent[] = allGP
      .slice(0, 80)
      .map(gp => {
        // Use delta propagation — skips full SGP4 if satellite moved < 0.05°
        const state = propagateGPDelta(gp, now);
        const { type, detail, threatPct } = classifyEvent(state);
        // Add solar flare risk modifier based on orbit type and current space weather
        const orbitType = state.altKm > 35000 ? "GEO" : state.altKm > 2000 ? "MEO" : "LEO";
        const solarThreat = solarWeather ? computeSolarThreat(solarWeather, orbitType, state.altKm) : 0;
        const combinedThreat = Math.min(100, Math.round(threatPct * 0.7 + solarThreat * 0.3));
        return {
          id: `${gp.NORAD_CAT_ID}-${now.getTime()}`,
          timestamp: now.toISOString().slice(11, 19),
          type: combinedThreat >= 85 ? "CRITICAL" : type,
          satName: formatSatName(gp.OBJECT_NAME),
          noradId: gp.NORAD_CAT_ID,
          coordinates: formatCoords(state.lat, state.lon),
          detail: solarThreat > 20 ? `${detail} · ☀ Solar: +${solarThreat}%` : detail,
          threatPct: combinedThreat,
          altKm: state.altKm,
          velKms: state.velKms,
          lat: state.lat,
          lon: state.lon,
          inclination: state.inclination,
          isReal: true as const,
        };
      })
      .sort((a, b) => b.threatPct - a.threatPct);

    setLastPropagated(new Date());
    const merged = [...opTelemetry, ...computed].slice(0, 50);

    // Find new IDs
    setEvents(prev => {
      const prevIds = new Set(prev.map(e => e.id));
      const newIds = new Set(merged.filter(e => !prevIds.has(e.id)).map(e => e.id));
      setNewEventIds(newIds);
      setTimeout(() => setNewEventIds(new Set()), 1000);
      return merged;
    });

    // Update threat level for contextual UI
    const maxThreat = Math.max(...merged.map(e => e.threatPct), 0);
    const newThreatLevel =
      maxThreat >= DANGER_THRESHOLD ? "CRISIS" :
      maxThreat >= 40               ? "WARNING" : "NOMINAL";
    setThreatLevel(newThreatLevel);

    // Contextual generative UI: collapse orbital arc on CRISIS to expand telemetry
    setShowOrbitalArc(newThreatLevel !== "CRISIS");

    // Danger flash check
    const danger = merged.find(
      e => e.threatPct >= DANGER_THRESHOLD && !seenDangerIds.has(e.id)
    );
    if (danger) {
      setDangerEvent(danger);
      setSeenDangerIds(prev => new Set([...prev, danger.id]));
      // Haptic: heavy impact for danger event (distinct from data fetch)
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
  }, [allGP, seenDangerIds]);

  // ── Initialise ─────────────────────────────────────────────────────────
  useEffect(() => {
    log("GAUSS MISSION HUD ONLINE. JUDITH M1 NODE INITIALIZING...", C.VOLT, true);
    doHealthCheck();
    fetchTLEData();
    fetchSolarData();

    const healthInterval = setInterval(doHealthCheck, 10_000);
    const propInterval   = setInterval(propagateAll, 5_000);
    // TLE refresh every 6 hours
    const tleInterval    = setInterval(fetchTLEData, 6 * 3600 * 1000);
    // Solar weather refresh every 5 minutes
    const solarInterval  = setInterval(fetchSolarData, 5 * 60 * 1000);

    return () => {
      clearInterval(healthInterval);
      clearInterval(propInterval);
      clearInterval(tleInterval);
      clearInterval(solarInterval);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-depsdeps

  // Re-run propagation when GP data arrives
  useEffect(() => {
    if (allGP.length > 0) propagateAll();
  }, [allGP]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Send command ───────────────────────────────────────────────────────────
  const sendCommand = useCallback(async (cmd?: string) => {
    const text = (cmd ?? command).trim().toUpperCase();
    if (!text) return;

    setCommand("");
    log(`> ${text}`, C.VOLT);

    // Haptic: medium impact for command send (distinct from data fetch)
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    // Built-in commands
    if (text === "CLEAR") {
      setConsoleLog([]);
      return;
    }
    if (text === "SATS") {
      const critCount = events.filter(e => e.type === "CRITICAL").length;
      const anomCount = events.filter(e => e.type === "ANOMALY").length;
      log(
        `ORBITAL INVENTORY\n` +
        `Total tracked: ${allGP.length} satellites\n` +
        `Source: ${dataSource}\n` +
        `Last TLE fetch: ${lastTLEFetch?.toISOString().slice(11, 19) ?? "N/A"}\n` +
        `CRITICAL events: ${critCount}\n` +
        `ANOMALY events: ${anomCount}\n` +
        `Threat level: ${threatLevel}`,
        C.VOLT,
      );
      return;
    }
    if (text === "STATUS") {
      log(
        `NODE STATUS: ${nodeStatus}\n` +
        `Latency: ${pingMs != null ? `${pingMs}ms` : "N/A"}\n` +
        `Ping count: ${pingCount}\n` +
        `Last ping: ${lastPingTime}`,
        nodeStatus === "ONLINE" ? C.VOLT : C.RED,
      );
      return;
    }
    if (text === "CACHE") {
      const report = dataParser.formatStatsReport();
      log(report, C.VOLT);
      return;
    }
    if (text === "SOLAR") {
      if (!solarWeather) {
        log("Solar weather data not yet loaded. Fetching...", C.AMBER);
        fetchSolarData();
        return;
      }
      const fp = solarWeather.flareProbabilities;
      const sw = solarWeather.solarWind;
      log(
        `SOLAR WEATHER REPORT (NOAA SWPC)\n` +
        `Activity level: ${solarWeather.activityLevel}\n` +
        `Current X-ray flux: ${formatFlux(solarWeather.currentXrayFlux)}\n` +
        `Current flare class: ${solarWeather.currentFlareClass}\n` +
        `M-class prob (today): ${fp?.mClassPct ?? "N/A"}%\n` +
        `X-class prob (today): ${fp?.xClassPct ?? "N/A"}%\n` +
        `Proton event prob:    ${fp?.protonPct ?? "N/A"}%\n` +
        `Kp index: ${formatKp(solarWeather.kpCurrent)} · Storm: ${solarWeather.geoStormLevel}\n` +
        (sw ? `Solar wind: ${Math.round(sw.speedKms)} km/s · Density: ${sw.densityPcm3.toFixed(1)} p/cm³\n` +
              `Bz (GSM): ${sw.bzGsm.toFixed(1)} nT · Bt: ${sw.btTotal.toFixed(1)} nT\n` : "") +
        `Recent flares: ${solarWeather.latestFlares.slice(0, 3).map(f => f.maxClass).join(", ") || "None"}\n` +
        `Active regions: ${solarWeather.activeRegions.length}\n` +
        `Last updated: ${solarWeather.fetchedAt.slice(11, 19)}Z\n` +
        `Source: NOAA SWPC (swpc.noaa.gov)`,
        activityColor(solarWeather.activityLevel),
      );
      return;
    }

    // Forward to M1 node
    setIsReasoning(true);
    try {
      const res = await fetch(REASON_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const output = data.response ?? data.result ?? data.output ?? JSON.stringify(data);
      log(output, C.WHITE);
      // Haptic: success notification for M1 response
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      log(`M1 NODE UNREACHABLE: ${err?.message ?? err}\nEnsure Tailscale is active and JUDITH is online.`, C.RED);
      // Haptic: error notification
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setIsReasoning(false);
    }
  }, [command, events, allGP, dataSource, lastTLEFetch, threatLevel, nodeStatus, pingMs, pingCount, lastPingTime, log]);

  // ── Urgent control handler ─────────────────────────────────────────────────
  const handleUrgentAction = useCallback((action: string) => {
    // Haptic: heavy impact for urgent commands (maximum physicality)
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
    const ctrl = URGENT_CONTROLS.find(c => c.action === action);
    log(`>> URGENT: ${action} COMMAND DISPATCHED`, ctrl?.color ?? C.RED, true);
    sendCommand(`URGENT ${action}`);
  }, [log, sendCommand]);

  // ── Acknowledge danger flash ───────────────────────────────────────────────
  const handleAcknowledge = useCallback(() => {
    if (!dangerEvent) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    log(`ACKNOWLEDGED: ${dangerEvent.type} on ${dangerEvent.satName}`, C.AMBER);
    setDangerEvent(null);
  }, [dangerEvent, log]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const statusColor =
    nodeStatus === "ONLINE"     ? C.VOLT  :
    nodeStatus === "CONNECTING" ? C.AMBER : C.RED;

  const threatAccent =
    threatLevel === "CRISIS"  ? C.RED   :
    threatLevel === "WARNING" ? C.AMBER : C.VOLT;

  const criticalCount = events.filter(e => e.type === "CRITICAL").length;
  const anomalyCount  = events.filter(e => e.type === "ANOMALY").length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {/* ── TOP ACCENT LINE (threat-level color cascade) ── */}
        <View style={[styles.topAccent, { backgroundColor: threatAccent }]} />

        {/* ── NODE STATUS HEADER (250ms glanceability) ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>GAUSS // MISSION HUD</Text>
            <Text style={styles.headerSub}>JUDITH · M1 NODE</Text>
          </View>
          <View style={styles.headerRight}>
            <StatusGlow status={nodeStatus} />
            <View style={styles.headerStatusBlock}>
              <View style={[styles.statusBadge, { borderColor: statusColor }]}>
                <Text style={[styles.statusText, { color: statusColor }]}>{nodeStatus}</Text>
              </View>
              <Text style={styles.headerMeta}>
                #{pingCount} · {lastPingTime || nowTime()}
              </Text>
              {pingMs != null && (
                <Text style={[styles.headerMeta, { color: statusColor }]}>{pingMs}ms</Text>
              )}
            </View>
          </View>
        </View>

        {/* ── DATA SOURCE STRIP ── */}
        {dataSource ? (
          <View style={styles.dataSourceStrip}>
            <Text style={styles.dataSourceText}>
              ✓ {allGP.length} SATS · CELESTRAK · {lastTLEFetch?.toISOString().slice(11, 19) ?? ""}Z
            </Text>
            {criticalCount > 0 && (
              <Text style={[styles.dataSourceText, { color: C.RED }]}>
                {criticalCount} CRITICAL
              </Text>
            )}
            {anomalyCount > 0 && (
              <Text style={[styles.dataSourceText, { color: C.ORANGE }]}>
                {anomalyCount} ANOMALY
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.dataSourceStrip}>
            <Text style={[styles.dataSourceText, { color: C.AMBER }]}>
              {isFetchingTLE ? "FETCHING TLE DATA FROM CELESTRAK..." : "NO DATA"}
            </Text>
          </View>
        )}

        {/* ── BENTO BOX LAYOUT — scrollable ── */}
        <ScrollView
          style={styles.bentoScroll}
          contentContainerStyle={styles.bentoGrid}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── SOLAR WEATHER BENTO CARD ── */}
          {solarWeather && (
            <BentoCard
              label="SOLAR WEATHER · NOAA SWPC"
              labelRight={solarWeather.activityLevel}
              labelColor={activityColor(solarWeather.activityLevel)}
              accentColor={activityColor(solarWeather.activityLevel)}
            >
              <View style={styles.solarRow}>
                {/* Flare class */}
                <View style={styles.solarCell}>
                  <Text style={styles.solarCellLabel}>FLARE</Text>
                  <Text style={[styles.solarCellValue, { color: flareClassColor(solarWeather.currentFlareClass) }]}>
                    {solarWeather.currentFlareClass}
                  </Text>
                </View>
                {/* M-class probability */}
                <View style={styles.solarCell}>
                  <Text style={styles.solarCellLabel}>M-CLASS</Text>
                  <Text style={[styles.solarCellValue, {
                    color: (solarWeather.flareProbabilities?.mClassPct ?? 0) >= 30 ? C.ORANGE : C.VOLT
                  }]}>
                    {solarWeather.flareProbabilities?.mClassPct ?? "--"}%
                  </Text>
                </View>
                {/* X-class probability */}
                <View style={styles.solarCell}>
                  <Text style={styles.solarCellLabel}>X-CLASS</Text>
                  <Text style={[styles.solarCellValue, {
                    color: (solarWeather.flareProbabilities?.xClassPct ?? 0) >= 5 ? C.RED : C.VOLT
                  }]}>
                    {solarWeather.flareProbabilities?.xClassPct ?? "--"}%
                  </Text>
                </View>
                {/* Kp index */}
                <View style={styles.solarCell}>
                  <Text style={styles.solarCellLabel}>Kp INDEX</Text>
                  <Text style={[styles.solarCellValue, { color: gStormColor(solarWeather.geoStormLevel) }]}>
                    {formatKp(solarWeather.kpCurrent)}
                  </Text>
                </View>
                {/* G-storm level */}
                <View style={styles.solarCell}>
                  <Text style={styles.solarCellLabel}>G-STORM</Text>
                  <Text style={[styles.solarCellValue, { color: gStormColor(solarWeather.geoStormLevel) }]}>
                    {solarWeather.geoStormLevel}
                  </Text>
                </View>
                {/* Solar wind speed */}
                {solarWeather.solarWind && (
                  <View style={styles.solarCell}>
                    <Text style={styles.solarCellLabel}>SW km/s</Text>
                    <Text style={[styles.solarCellValue, {
                      color: solarWeather.solarWind.speedKms > 600 ? C.AMBER : C.VOLT
                    }]}>
                      {Math.round(solarWeather.solarWind.speedKms)}
                    </Text>
                  </View>
                )}
                {/* Bz */}
                {solarWeather.solarWind && (
                  <View style={styles.solarCell}>
                    <Text style={styles.solarCellLabel}>Bz nT</Text>
                    <Text style={[styles.solarCellValue, {
                      color: solarWeather.solarWind.bzGsm < -10 ? C.RED :
                             solarWeather.solarWind.bzGsm < -5  ? C.AMBER : C.VOLT
                    }]}>
                      {solarWeather.solarWind.bzGsm.toFixed(1)}
                    </Text>
                  </View>
                )}
              </View>
              {/* Active alerts strip */}
              {solarWeather.activeAlerts.length > 0 && (
                <View style={styles.solarAlertStrip}>
                  <Text style={[styles.solarAlertText, { color: C.AMBER }]} numberOfLines={1}>
                    ⚠ {solarWeather.activeAlerts[0].severity}: {solarWeather.activeAlerts[0].message.slice(0, 80).replace(/\r\n/g, " ")}
                  </Text>
                </View>
              )}
            </BentoCard>
          )}
          {isFetchingSolar && !solarWeather && (
            <BentoCard label="SOLAR WEATHER · NOAA SWPC" accentColor={C.AMBER}>
              <Text style={[styles.emptyFeedText, { color: C.AMBER }]}>FETCHING SPACE WEATHER DATA...</Text>
            </BentoCard>
          )}

          {/* ── ORBITAL ARC VISUALISER (collapses on CRISIS) ── */}
          {showOrbitalArc && (
            <BentoCard
              label="ORBITAL TELEMETRY · LIVE"
              labelRight={`${events.length} EVENTS`}
              accentColor={threatAccent}
            >
              <OrbitalArcVisualiser events={events} threatLevel={threatLevel} lastPropagated={lastPropagated} />
            </BentoCard>
          )}

          {/* ── TELEMETRY FEED ── */}
          <BentoCard
            label={showOrbitalArc ? "FEED" : "ORBITAL TELEMETRY · LIVE — TRAJECTORY HUD EXPANDED"}
            labelRight={`${events.length} EVENTS`}
            accentColor={threatAccent}
            noPad
          >
            {events.length === 0 ? (
              <View style={styles.emptyFeed}>
                <Text style={styles.emptyFeedText}>
                  {isFetchingTLE ? "ACQUIRING ORBITAL DATA..." : "NO EVENTS"}
                </Text>
              </View>
            ) : (
              <View>
                <View style={styles.feedHeader}>
                  <Text style={styles.feedHeaderCell}>TIME</Text>
                  <Text style={styles.feedHeaderCell}>TYPE</Text>
                  <Text style={styles.feedHeaderCell}>SATELLITE</Text>
                  <Text style={[styles.feedHeaderCell, { flex: 2 }]}>DETAIL / THREAT</Text>
                </View>
                {events.map(item => (
                  <TelemetryRow key={item.id} item={item} isNew={newEventIds.has(item.id)} />
                ))}
              </View>
            )}
          </BentoCard>

          {/* ── ACTIONING CONSOLE ── */}
          <BentoCard
            label="ACTIONING CONSOLE"
            accentColor={isReasoning ? C.AMBER : C.VOLT}
          >
            <ScrollView
              ref={consoleRef}
              style={styles.console}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => consoleRef.current?.scrollToEnd({ animated: true })}
            >
              {consoleLog.length === 0 ? (
                <Text style={styles.consoleIdle}>AWAITING COMMAND...</Text>
              ) : (
                consoleLog.map(entry => (
                  <View key={entry.id} style={styles.consoleEntry}>
                    <Text style={styles.consoleTime}>[{entry.time}]</Text>
                    <Text
                      style={[
                        styles.consoleText,
                        entry.color ? { color: entry.color } : undefined,
                        entry.isBold ? { fontFamily: FONT.bold } : undefined,
                      ]}
                    >
                      {entry.text}
                    </Text>
                  </View>
                ))
              )}
              {isReasoning && (
                <View style={styles.consoleEntry}>
                  <Text style={styles.consoleTime}>[{nowTime()}]</Text>
                  <Text style={[styles.consoleText, { color: C.AMBER }]}>
                    M1 REASONING...
                  </Text>
                </View>
              )}
            </ScrollView>
          </BentoCard>

        </ScrollView>

        {/* ── URGENT CONTROLS ── */}
        <View style={[styles.urgentBar, { borderTopColor: threatAccent }]}>
          <Text style={[styles.urgentLabel, { color: threatAccent }]}>URGENT</Text>
          {URGENT_CONTROLS.map(ctrl => (
            <Pressable
              key={ctrl.action}
              onPress={() => handleUrgentAction(ctrl.action)}
              style={({ pressed }) => [
                styles.urgentBtn,
                {
                  borderColor: ctrl.color,
                  backgroundColor: pressed ? ctrl.color + "22" : "transparent",
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
            >
              <Text style={[styles.urgentBtnText, { color: ctrl.color }]}>{ctrl.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── COMMAND INPUT ── */}
        <View style={[styles.commandBar, { borderTopColor: C.BORDER2 }]}>
          <Text style={styles.commandPrompt}>&gt;</Text>
          <TextInput
            ref={inputRef}
            style={styles.commandInput}
            value={command}
            onChangeText={setCommand}
            placeholder="ENTER COMMAND... (try: SATS)"
            placeholderTextColor={C.MUTED2}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="send"
            onSubmitEditing={() => sendCommand()}
            editable={!isReasoning}
          />
          <Pressable
            onPress={() => sendCommand()}
            disabled={isReasoning || !command.trim()}
            style={({ pressed }) => [
              styles.sendBtn,
              {
                backgroundColor:
                  isReasoning || !command.trim() ? C.MUTED2 : C.VOLT,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              },
            ]}
          >
            <Text style={[styles.sendBtnText, { color: C.BLACK }]}>
              {isReasoning ? "..." : "SEND"}
            </Text>
          </Pressable>
        </View>

      </KeyboardAvoidingView>

      {/* ── DANGER FLASH OVERLAY ── */}
      {dangerEvent && (
        <DangerFlashOverlay
          event={dangerEvent}
          onAcknowledge={handleAcknowledge}
          onUrgentAction={(action) => {
            handleUrgentAction(action);
            handleAcknowledge();
          }}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.BLACK,
  },
  topAccent: {
    height: 2,
    width: "100%",
  },

  // ── Header ─────────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: FONT.bold,
    fontSize: 13,
    color: C.VOLT,
    letterSpacing: 1.5,
  },
  headerSub: {
    fontFamily: FONT.regular,
    fontSize: 9,
    color: C.MUTED,
    letterSpacing: 1,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerStatusBlock: {
    alignItems: "flex-end",
    gap: 2,
  },
  statusBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusText: {
    fontFamily: FONT.bold,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  headerMeta: {
    fontFamily: FONT.regular,
    fontSize: 8,
    color: C.MUTED,
    letterSpacing: 0.5,
  },

  // ── Status glow ────────────────────────────────────────────────────────────
  statusGlowWrap: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  statusGlowRing: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },

  // ── Data source strip ──────────────────────────────────────────────────────
  dataSourceStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
    backgroundColor: C.SURFACE,
  },
  dataSourceText: {
    fontFamily: FONT.regular,
    fontSize: 8,
    color: C.VOLT,
    letterSpacing: 0.8,
  },

   // ── Bento grid ──────────────────────────────────────────────────────
  bentoScroll: {
    flex: 1,
  },
  bentoGrid: {
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 12,
    gap: 6,
  },
  bentoCard: {
    backgroundColor: C.SURFACE,
    borderWidth: 1,
    borderColor: C.BORDER,
    overflow: "hidden",
  },
  bentoAccent: {
    height: 2,
    width: "100%",
  },
  bentoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
  },
  bentoLabel: {
    fontFamily: FONT.bold,
    fontSize: 8,
    color: C.MUTED,
    letterSpacing: 1.5,
  },
  bentoLabelRight: {
    fontFamily: FONT.regular,
    fontSize: 8,
    color: C.MUTED,
    letterSpacing: 0.5,
  },
  bentoPad: {
    padding: 8,
  },

    // ── Telemetry feed ─────────────────────────────────────────────────────
  feedList: {
    // No maxHeight — let FlatList grow naturally inside ScrollView
    // nestedScrollEnabled allows inner FlatList to scroll within outer ScrollView
  },
  feedHeader: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
    backgroundColor: C.SURFACE2,
  },
  feedHeaderCell: {
    flex: 1,
    fontFamily: FONT.bold,
    fontSize: 7,
    color: C.MUTED,
    letterSpacing: 1,
  },
  emptyFeed: {
    height: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyFeedText: {
    fontFamily: FONT.regular,
    fontSize: 9,
    color: C.MUTED,
    letterSpacing: 1,
  },

  // ── Telemetry row ──────────────────────────────────────────────────────────
  telemetryRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
    minHeight: 36,
  },
  telemetryRowCritical: {
    backgroundColor: "#1A0000",
  },
  telemetryBar: {
    width: 2,
  },
  telemetryContent: {
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 2,
  },
  telemetryMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  telemetryTime: {
    fontFamily: FONT.regular,
    fontSize: 8,
    color: C.MUTED,
    width: 36,
  },
  typeBadge: {
    borderWidth: 1,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  typeBadgeText: {
    fontFamily: FONT.bold,
    fontSize: 7,
    letterSpacing: 0.8,
  },
  opBadge: {
    backgroundColor: C.AMBER + "33",
    borderWidth: 1,
    borderColor: C.AMBER,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  opBadgeText: {
    fontFamily: FONT.bold,
    fontSize: 7,
    color: C.AMBER,
    letterSpacing: 0.5,
  },
  telemetryBody: {
    flexDirection: "row",
    gap: 6,
    flex: 1,
  },
  telemetrySatName: {
    fontFamily: FONT.medium,
    fontSize: 9,
    color: C.WHITE,
    flex: 1,
    letterSpacing: 0.5,
  },
  telemetryDetail: {
    fontFamily: FONT.regular,
    fontSize: 8,
    color: C.MUTED,
    flex: 2,
  },
  threatBarWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  threatBarFill: {
    height: 2,
    maxWidth: "80%",
  },
  threatPct: {
    fontFamily: FONT.regular,
    fontSize: 7,
    letterSpacing: 0.5,
  },

   // ── Console ──────────────────────────────────────────────────────
  console: {
    minHeight: 120,
    maxHeight: 300,
  },
  consoleIdle: {
    fontFamily: FONT.regular,
    fontSize: 9,
    color: C.MUTED,
    letterSpacing: 1,
  },
  consoleEntry: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 4,
    flexWrap: "wrap",
  },
  consoleTime: {
    fontFamily: FONT.regular,
    fontSize: 8,
    color: C.MUTED,
    flexShrink: 0,
  },
  consoleText: {
    fontFamily: FONT.regular,
    fontSize: 9,
    color: C.WHITE,
    flex: 1,
    lineHeight: 14,
  },

  // ── Urgent controls ────────────────────────────────────────────────────────
  urgentBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
    borderTopWidth: 1,
    backgroundColor: C.SURFACE,
  },
  urgentLabel: {
    fontFamily: FONT.bold,
    fontSize: 7,
    letterSpacing: 1.5,
    marginRight: 2,
  },
  urgentBtn: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  urgentBtnText: {
    fontFamily: FONT.bold,
    fontSize: 8,
    letterSpacing: 1,
  },

  // ── Command bar ────────────────────────────────────────────────────────────
  commandBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
    borderTopWidth: 1,
    backgroundColor: C.SURFACE,
  },
  commandPrompt: {
    fontFamily: FONT.bold,
    fontSize: 14,
    color: C.VOLT,
  },
  commandInput: {
    flex: 1,
    fontFamily: FONT.regular,
    fontSize: 11,
    color: C.WHITE,
    letterSpacing: 0.5,
    paddingVertical: 4,
  },
  sendBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 4,
  },
  sendBtnText: {
    fontFamily: FONT.bold,
    fontSize: 10,
    letterSpacing: 1.5,
  },

  // ── Danger flash overlay ───────────────────────────────────────────────────
  dangerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  dangerCard: {
    width: SCREEN_W - 32,
    backgroundColor: C.SURFACE,
    borderWidth: 1,
    borderColor: C.RED,
    padding: 16,
    gap: 10,
  },
  dangerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER2,
    paddingBottom: 8,
  },
  dangerTitle: {
    fontFamily: FONT.bold,
    fontSize: 14,
    letterSpacing: 1.5,
  },
  dangerTime: {
    fontFamily: FONT.regular,
    fontSize: 9,
    color: C.MUTED,
  },
  dangerSatRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  dangerSatLabel: {
    fontFamily: FONT.bold,
    fontSize: 8,
    color: C.MUTED,
    letterSpacing: 1,
    width: 50,
    marginTop: 1,
  },
  dangerSatValue: {
    fontFamily: FONT.medium,
    fontSize: 10,
    color: C.WHITE,
    flex: 1,
    lineHeight: 15,
  },
  dangerThreatWrap: {
    gap: 4,
  },
  dangerThreatLabel: {
    fontFamily: FONT.bold,
    fontSize: 7,
    color: C.MUTED,
    letterSpacing: 1.5,
  },
  dangerThreatTrack: {
    height: 4,
    backgroundColor: C.BORDER2,
    width: "100%",
  },
  dangerThreatFill: {
    height: 4,
  },
  dangerThreatPct: {
    fontFamily: FONT.bold,
    fontSize: 11,
    letterSpacing: 1,
  },
  urgentRow: {
    flexDirection: "row",
    gap: 6,
  },
  ackBtn: {
    borderWidth: 1,
    borderColor: C.VOLT,
    paddingVertical: 10,
    alignItems: "center",
  },
  ackBtnText: {
    fontFamily: FONT.bold,
    fontSize: 11,
    color: C.VOLT,
    letterSpacing: 2,
  },

  // ── Solar weather card ──────────────────────────────────────────────────────
  solarRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  solarCell: {
    minWidth: 52,
    flex: 1,
    backgroundColor: C.SURFACE2,
    borderWidth: 1,
    borderColor: C.BORDER2,
    paddingHorizontal: 6,
    paddingVertical: 5,
    alignItems: "center",
    gap: 2,
  },
  solarCellLabel: {
    fontFamily: FONT.bold,
    fontSize: 6,
    color: C.MUTED,
    letterSpacing: 1,
  },
  solarCellValue: {
    fontFamily: FONT.bold,
    fontSize: 13,
    color: C.VOLT,
    letterSpacing: 0.5,
  },
  solarAlertStrip: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: C.BORDER2,
    paddingTop: 5,
  },
  solarAlertText: {
    fontFamily: FONT.regular,
    fontSize: 8,
    letterSpacing: 0.5,
    lineHeight: 12,
  },
});
