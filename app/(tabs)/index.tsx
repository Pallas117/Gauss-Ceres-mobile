import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useKeepAwake } from "expo-keep-awake";

// ─── Configuration ────────────────────────────────────────────────────────────
// Replace with your Tailscale IP before deployment
const TAILSCALE_IP = "100.x.x.x";
const BASE_URL = `http://${TAILSCALE_IP}:8080`;
const STATUS_URL = `${BASE_URL}/status`;
const REASON_URL = `${BASE_URL}/reason`;
const HEALTH_CHECK_INTERVAL = 10_000; // 10 seconds

// ─── Types ────────────────────────────────────────────────────────────────────
type NodeStatus = "ONLINE" | "OFFLINE" | "CONNECTING";

type TelemetryEventType = "PASS" | "ANOMALY" | "LOCK" | "SIGNAL" | "DRIFT";

interface TelemetryEvent {
  id: string;
  timestamp: string;
  type: TelemetryEventType;
  satelliteId: string;
  coordinates: string;
  detail: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const VOLT_GREEN = "#CCFF00";
const BLACK = "#050505";
const SURFACE = "#0D0D0D";
const WHITE = "#FFFFFF";
const DIM = "#666666";
const BORDER = "#1A1A1A";
const RED = "#FF3333";
const ORANGE = "#FF9900";
const YELLOW = "#FFCC00";

const EVENT_TYPE_COLORS: Record<TelemetryEventType, string> = {
  PASS: WHITE,
  ANOMALY: RED,
  LOCK: VOLT_GREEN,
  SIGNAL: YELLOW,
  DRIFT: ORANGE,
};

const SATELLITE_IDS = [
  "SAT-001", "SAT-003", "SAT-007", "SAT-012", "SAT-019",
  "SAT-024", "SAT-031", "SAT-047", "SAT-055", "SAT-063",
];

const COORD_POOL = [
  "51.5°N 0.1°W", "40.7°N 74.0°W", "35.7°N 139.7°E",
  "48.9°N 2.3°E", "55.8°N 37.6°E", "1.3°N 103.8°E",
  "28.6°N 77.2°E", "23.1°S 43.2°W", "33.9°S 18.4°E",
  "64.1°N 21.9°W",
];

const EVENT_DETAILS: Record<TelemetryEventType, string[]> = {
  PASS: ["AOS confirmed", "Nominal pass", "Telemetry nominal", "LOS imminent"],
  ANOMALY: ["Attitude deviation +2.3°", "Thermal spike detected", "Comms dropout 4s", "Orbit decay alert"],
  LOCK: ["Uplink established", "Downlink locked 8.4GHz", "Ranging lock acquired", "Beacon acquired"],
  SIGNAL: ["S-band signal: -87dBm", "X-band burst received", "Beacon signal strong", "Doppler shift nominal"],
  DRIFT: ["Station-keeping burn req.", "Orbital drift +0.8km", "Inclination drift 0.02°", "Longitude drift detected"],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function now(): string {
  return new Date().toISOString().slice(11, 19);
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

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

// ─── Simple Markdown Renderer ─────────────────────────────────────────────────
function MarkdownText({ text, style }: { text: string; style?: object }) {
  // Split into lines and render basic markdown
  const lines = text.split("\n");
  return (
    <View>
      {lines.map((line, i) => {
        // Code block lines
        if (line.startsWith("    ") || line.startsWith("\t")) {
          return (
            <Text key={i} style={[styles.codeText, style]}>
              {line.replace(/^    /, "").replace(/^\t/, "")}
            </Text>
          );
        }
        // Heading 1
        if (line.startsWith("# ")) {
          return (
            <Text key={i} style={[styles.mdH1, style]}>
              {line.slice(2).toUpperCase()}
            </Text>
          );
        }
        // Heading 2
        if (line.startsWith("## ")) {
          return (
            <Text key={i} style={[styles.mdH2, style]}>
              {line.slice(3).toUpperCase()}
            </Text>
          );
        }
        // List item
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return (
            <Text key={i} style={[styles.mdList, style]}>
              {"›  "}{renderInline(line.slice(2))}
            </Text>
          );
        }
        // Empty line
        if (line.trim() === "") {
          return <View key={i} style={{ height: 6 }} />;
        }
        // Normal paragraph with inline formatting
        return (
          <Text key={i} style={[styles.mdParagraph, style]}>
            {renderInline(line)}
          </Text>
        );
      })}
    </View>
  );
}

function renderInline(text: string): React.ReactNode {
  // Handle **bold** and `code`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <Text key={i} style={styles.mdBold}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <Text key={i} style={styles.mdCode}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    return part;
  });
}

// ─── Main HUD Screen ──────────────────────────────────────────────────────────
export default function HUDScreen() {
  useKeepAwake();

  const [nodeStatus, setNodeStatus] = useState<NodeStatus>("CONNECTING");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lastChecked, setLastChecked] = useState<string>("--:--:--");
  const [telemetry, setTelemetry] = useState<TelemetryEvent[]>(() =>
    Array.from({ length: 6 }, generateTelemetryEvent)
  );
  const [consoleOutput, setConsoleOutput] = useState<string>(
    "SYSTEM READY.\n\nAWAITING COMMAND INPUT...\n\nJUDITH NODE INITIALIZING."
  );
  const [command, setCommand] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [pingCount, setPingCount] = useState(0);

  const consoleScrollRef = useRef<ScrollView>(null);
  const healthCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const telemetryRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Health Check ────────────────────────────────────────────────────────────
  const runHealthCheck = useCallback(async () => {
    const start = Date.now();
    try {
      const res = await fetch(STATUS_URL, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      const latency = Date.now() - start;
      if (res.ok) {
        setNodeStatus("ONLINE");
        setLatencyMs(latency);
      } else {
        setNodeStatus("OFFLINE");
        setLatencyMs(null);
      }
    } catch {
      setNodeStatus("OFFLINE");
      setLatencyMs(null);
    }
    setLastChecked(now());
    setPingCount((c) => c + 1);
  }, []);

  // ── Telemetry Feed ──────────────────────────────────────────────────────────
  const addTelemetryEvent = useCallback(() => {
    const event = generateTelemetryEvent();
    setTelemetry((prev) => [event, ...prev].slice(0, 50));
  }, []);

  // ── Effects ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Initial health check
    runHealthCheck();

    // Health check loop every 10s
    healthCheckRef.current = setInterval(runHealthCheck, HEALTH_CHECK_INTERVAL);

    // Telemetry feed: new event every 3–8 seconds
    const scheduleTelemetry = () => {
      const delay = 3000 + Math.random() * 5000;
      telemetryRef.current = setTimeout(() => {
        addTelemetryEvent();
        scheduleTelemetry();
      }, delay) as unknown as ReturnType<typeof setInterval>;
    };
    scheduleTelemetry();

    return () => {
      if (healthCheckRef.current) clearInterval(healthCheckRef.current);
      if (telemetryRef.current) clearTimeout(telemetryRef.current as unknown as ReturnType<typeof setTimeout>);
    };
  }, [runHealthCheck, addTelemetryEvent]);

  // Auto-scroll console to bottom on new output
  useEffect(() => {
    setTimeout(() => {
      consoleScrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [consoleOutput]);

  // ── Send Command ─────────────────────────────────────────────────────────────
  const sendCommand = useCallback(async () => {
    const trimmed = command.trim();
    if (!trimmed || isProcessing) return;

    setIsProcessing(true);
    setCommand("");
    setConsoleOutput((prev) => `${prev}\n\n> ${trimmed}\n\nPROCESSING...`);

    try {
      const res = await fetch(REASON_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
        signal: AbortSignal.timeout(30000),
      });

      if (res.ok) {
        const data = await res.json();
        const output = data.response || data.output || data.result || JSON.stringify(data, null, 2);
        setConsoleOutput((prev) => prev.replace("PROCESSING...", output));
      } else {
        setConsoleOutput((prev) =>
          prev.replace("PROCESSING...", `ERROR: HTTP ${res.status} — ${res.statusText}`)
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setConsoleOutput((prev) =>
        prev.replace(
          "PROCESSING...",
          `CONNECTION FAILED\n\nEnsure Tailscale is active and JUDITH node is reachable at:\n${REASON_URL}\n\nError: ${message}`
        )
      );
    } finally {
      setIsProcessing(false);
    }
  }, [command, isProcessing]);

  // ── Render Helpers ───────────────────────────────────────────────────────────
  const renderTelemetryItem = useCallback(({ item }: { item: TelemetryEvent }) => {
    const color = EVENT_TYPE_COLORS[item.type];
    return (
      <View style={styles.telemetryRow}>
        <Text style={styles.telemetryTime}>{item.timestamp}</Text>
        <Text style={[styles.telemetryType, { color }]}>{item.type.padEnd(7)}</Text>
        <Text style={styles.telemetrySat}>{item.satelliteId}</Text>
        <Text style={styles.telemetryDetail} numberOfLines={1}>
          {item.detail}
        </Text>
      </View>
    );
  }, []);

  const statusColor =
    nodeStatus === "ONLINE" ? VOLT_GREEN : nodeStatus === "OFFLINE" ? RED : ORANGE;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={BLACK} />
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          {/* ── NODE STATUS HEADER ─────────────────────────────────────────── */}
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <Text style={styles.appTitle}>GAUSS // MISSION HUD</Text>
              <View style={[styles.statusBadge, { borderColor: statusColor }]}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusText, { color: statusColor }]}>{nodeStatus}</Text>
              </View>
            </View>
            <View style={styles.headerBottom}>
              <Text style={styles.nodeName}>JUDITH · M1 NODE</Text>
              <View style={styles.headerMeta}>
                {latencyMs !== null && (
                  <Text style={styles.latency}>{latencyMs}ms</Text>
                )}
                <Text style={styles.lastChecked}>PING #{pingCount} · {lastChecked}</Text>
              </View>
            </View>
            <View style={styles.divider} />
          </View>

          {/* ── ORBITAL TELEMETRY FEED ─────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>ORBITAL TELEMETRY</Text>
              <Text style={styles.sectionMeta}>{telemetry.length} EVENTS</Text>
            </View>
            <View style={styles.telemetryContainer}>
              <View style={styles.telemetryHeader}>
                <Text style={[styles.telemetryColHeader, { width: 60 }]}>TIME</Text>
                <Text style={[styles.telemetryColHeader, { width: 64 }]}>TYPE</Text>
                <Text style={[styles.telemetryColHeader, { width: 68 }]}>SAT</Text>
                <Text style={[styles.telemetryColHeader, { flex: 1 }]}>DETAIL</Text>
              </View>
              <FlatList
                data={telemetry}
                keyExtractor={(item) => item.id}
                renderItem={renderTelemetryItem}
                style={styles.telemetryList}
                showsVerticalScrollIndicator={false}
                initialNumToRender={8}
              />
            </View>
          </View>

          {/* ── ACTIONING CONSOLE ──────────────────────────────────────────── */}
          <View style={[styles.section, styles.consoleSectionFlex]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>ACTIONING CONSOLE</Text>
              {isProcessing && (
                <View style={styles.processingBadge}>
                  <ActivityIndicator size="small" color={VOLT_GREEN} />
                  <Text style={styles.processingText}>PROCESSING</Text>
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
                <MarkdownText text={consoleOutput} />
              </ScrollView>
            </View>
          </View>

          {/* ── COMMAND INPUT ──────────────────────────────────────────────── */}
          <View style={styles.commandBar}>
            <View style={styles.commandInputWrapper}>
              <Text style={styles.commandPrompt}>{">"}</Text>
              <TextInput
                style={styles.commandInput}
                value={command}
                onChangeText={setCommand}
                placeholder="ENTER COMMAND..."
                placeholderTextColor={DIM}
                onSubmitEditing={sendCommand}
                returnKeyType="send"
                editable={!isProcessing}
                autoCapitalize="characters"
                autoCorrect={false}
                selectionColor={VOLT_GREEN}
              />
            </View>
            <TouchableOpacity
              style={[
                styles.sendButton,
                (isProcessing || !command.trim()) && styles.sendButtonDisabled,
              ]}
              onPress={sendCommand}
              disabled={isProcessing || !command.trim()}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.sendButtonText,
                (isProcessing || !command.trim()) && styles.sendButtonTextDisabled,
              ]}>
                {isProcessing ? "WAIT" : "SEND"}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BLACK,
  },
  safeArea: {
    flex: 1,
    backgroundColor: BLACK,
  },
  flex: {
    flex: 1,
  },

  // Header
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 0,
    backgroundColor: BLACK,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  appTitle: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 15,
    fontWeight: "700",
    color: VOLT_GREEN,
    letterSpacing: 2,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
  },
  statusText: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  headerBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  nodeName: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 11,
    color: WHITE,
    letterSpacing: 1.5,
    fontWeight: "600",
  },
  headerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  latency: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 10,
    color: VOLT_GREEN,
    letterSpacing: 1,
  },
  lastChecked: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 10,
    color: DIM,
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: BORDER,
    marginBottom: 0,
  },

  // Sections
  section: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  consoleSectionFlex: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  sectionLabel: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 9,
    color: DIM,
    letterSpacing: 3,
    fontWeight: "700",
  },
  sectionMeta: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 9,
    color: DIM,
    letterSpacing: 1,
  },

  // Telemetry
  telemetryContainer: {
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    height: 180,
  },
  telemetryHeader: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: BLACK,
  },
  telemetryColHeader: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 8,
    color: DIM,
    letterSpacing: 1.5,
    fontWeight: "700",
  },
  telemetryList: {
    flex: 1,
  },
  telemetryRow: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#111111",
    alignItems: "center",
  },
  telemetryTime: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 10,
    color: DIM,
    width: 60,
    letterSpacing: 0.5,
  },
  telemetryType: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 10,
    fontWeight: "700",
    width: 64,
    letterSpacing: 0.5,
  },
  telemetrySat: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 10,
    color: WHITE,
    width: 68,
    letterSpacing: 0.5,
  },
  telemetryDetail: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 10,
    color: DIM,
    flex: 1,
    letterSpacing: 0.3,
  },

  // Console
  consoleContainer: {
    flex: 1,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  consoleScroll: {
    flex: 1,
  },
  consoleContent: {
    padding: 12,
    paddingBottom: 20,
  },

  // Markdown styles
  mdParagraph: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 12,
    color: WHITE,
    lineHeight: 18,
    letterSpacing: 0.3,
  },
  mdH1: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 13,
    fontWeight: "700",
    color: VOLT_GREEN,
    letterSpacing: 2,
    marginBottom: 4,
    marginTop: 8,
  },
  mdH2: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 12,
    fontWeight: "700",
    color: VOLT_GREEN,
    letterSpacing: 1.5,
    marginBottom: 3,
    marginTop: 6,
  },
  mdList: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 12,
    color: WHITE,
    lineHeight: 18,
    letterSpacing: 0.3,
    paddingLeft: 8,
  },
  mdBold: {
    fontWeight: "700",
    color: VOLT_GREEN,
  },
  mdCode: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 11,
    color: VOLT_GREEN,
    backgroundColor: "#0A0A0A",
  },
  codeText: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 11,
    color: VOLT_GREEN,
    lineHeight: 17,
    letterSpacing: 0.3,
  },

  // Command Bar
  commandBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingBottom: Platform.OS === "ios" ? 16 : 12,
    borderTopWidth: 1,
    borderTopColor: VOLT_GREEN,
    backgroundColor: BLACK,
    gap: 10,
  },
  commandInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  commandPrompt: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 14,
    color: VOLT_GREEN,
    fontWeight: "700",
  },
  commandInput: {
    flex: 1,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 13,
    color: WHITE,
    letterSpacing: 0.5,
    padding: 0,
    margin: 0,
  },
  sendButton: {
    backgroundColor: VOLT_GREEN,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 4,
    minWidth: 70,
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#1A1A00",
    borderWidth: 1,
    borderColor: BORDER,
  },
  sendButtonText: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 12,
    fontWeight: "700",
    color: BLACK,
    letterSpacing: 2,
  },
  sendButtonTextDisabled: {
    color: DIM,
  },

  // Processing badge
  processingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  processingText: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 9,
    color: VOLT_GREEN,
    letterSpacing: 2,
  },
});
