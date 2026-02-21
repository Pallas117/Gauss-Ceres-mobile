/**
 * Project Gauss — Operator Satellite Registry
 * Gauss Design System (GDS) v1.0
 *
 * Allows satellite operators to register their assets and submit
 * custom risk telemetry events that feed directly into the HUD.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
  Modal,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  loadSatellites,
  saveSatellite,
  updateSatellite,
  deleteSatellite,
  loadRiskEvents,
  submitRiskEvent,
  deleteRiskEvent,
  acknowledgeRiskEvent,
  blankSatellite,
  blankRiskEvent,
  RISK_LEVELS,
  RISK_LEVEL_COLORS,
  RISK_LEVEL_THREAT,
  OPERATOR_EVENT_TYPES,
  EVENT_TYPE_LABELS,
  type OperatorSatellite,
  type OperatorRiskEvent,
  type RiskLevel,
  type OperatorEventType,
} from "@/lib/operator-store";

// ─── GDS Colors (mirrored from HUD screen) ────────────────────────────────────
const C = {
  BLACK:    "#000000",
  SURFACE:  "#0A0A0A",
  SURFACE2: "#111111",
  BORDER:   "#1A1A1A",
  BORDER2:  "#2A2A2A",
  WHITE:    "#FFFFFF",
  MUTED:    "#666666",
  MUTED2:   "#333333",
  VOLT:     "#CCFF00",
  AMBER:    "#FFAA00",
  RED:      "#FF2222",
  CYAN:     "#00CCFF",
  ORANGE:   "#FF6600",
} as const;

const FONT = {
  regular: "JetBrainsMono_400Regular",
  medium:  "JetBrainsMono_500Medium",
  bold:    "JetBrainsMono_700Bold",
} as const;

const ORBIT_TYPES = ["LEO", "MEO", "GEO", "HEO", "SSO", "OTHER"] as const;

// ─── Reusable GDS Field ───────────────────────────────────────────────────────
interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "numeric" | "decimal-pad";
  multiline?: boolean;
}

function GDSField({
  label, value, onChangeText, placeholder, required,
  autoCapitalize = "characters", keyboardType = "default", multiline,
}: FieldProps) {
  return (
    <View style={fStyles.fieldWrap}>
      <Text style={fStyles.fieldLabel}>
        {label}{required ? <Text style={{ color: C.RED }}> *</Text> : null}
      </Text>
      <TextInput
        style={[fStyles.fieldInput, multiline && fStyles.fieldMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? ""}
        placeholderTextColor={C.MUTED2}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
      />
    </View>
  );
}

const fStyles = StyleSheet.create({
  fieldWrap: { marginBottom: 10 },
  fieldLabel: {
    fontFamily: FONT.bold,
    fontSize: 8,
    color: C.MUTED,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  fieldInput: {
    backgroundColor: C.SURFACE2,
    borderWidth: 1,
    borderColor: C.BORDER2,
    color: C.WHITE,
    fontFamily: FONT.regular,
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 8,
    letterSpacing: 0.5,
  },
  fieldMultiline: {
    height: 72,
    textAlignVertical: "top",
  },
});

// ─── Selector Row ─────────────────────────────────────────────────────────────
interface SelectorProps<T extends string> {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  colorMap?: Record<string, string>;
  labelMap?: Record<string, string>;
}

function GDSSelector<T extends string>({
  label, options, value, onChange, colorMap, labelMap,
}: SelectorProps<T>) {
  return (
    <View style={selStyles.wrap}>
      <Text style={selStyles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={selStyles.scroll}>
        {options.map(opt => {
          const isActive = opt === value;
          const color = colorMap?.[opt] ?? C.VOLT;
          return (
            <Pressable
              key={opt}
              onPress={() => onChange(opt)}
              style={[
                selStyles.chip,
                {
                  borderColor: isActive ? color : C.BORDER2,
                  backgroundColor: isActive ? color + "22" : "transparent",
                },
              ]}
            >
              <Text style={[selStyles.chipText, { color: isActive ? color : C.MUTED }]}>
                {labelMap?.[opt] ?? opt}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const selStyles = StyleSheet.create({
  wrap: { marginBottom: 10 },
  label: {
    fontFamily: FONT.bold,
    fontSize: 8,
    color: C.MUTED,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  scroll: { flexDirection: "row" },
  chip: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 6,
  },
  chipText: {
    fontFamily: FONT.bold,
    fontSize: 8,
    letterSpacing: 0.8,
  },
});

// ─── Satellite Card ───────────────────────────────────────────────────────────
interface SatCardProps {
  sat: OperatorSatellite;
  onSubmitEvent: (sat: OperatorSatellite) => void;
  onEdit: (sat: OperatorSatellite) => void;
  onDelete: (sat: OperatorSatellite) => void;
}

function SatCard({ sat, onSubmitEvent, onEdit, onDelete }: SatCardProps) {
  const riskColor = RISK_LEVEL_COLORS[sat.baseRiskLevel];
  return (
    <View style={[cardStyles.card, { borderLeftColor: riskColor }]}>
      <View style={cardStyles.header}>
        <View style={cardStyles.headerLeft}>
          <Text style={cardStyles.name}>{sat.name}</Text>
          <Text style={cardStyles.meta}>
            {sat.operator} · {sat.country} · {sat.orbitType}
          </Text>
        </View>
        <View style={[cardStyles.riskBadge, { borderColor: riskColor }]}>
          <Text style={[cardStyles.riskText, { color: riskColor }]}>{sat.baseRiskLevel}</Text>
        </View>
      </View>

      {(sat.noradId || sat.cosparId) ? (
        <Text style={cardStyles.ids}>
          {sat.noradId ? `NORAD: ${sat.noradId}` : ""}
          {sat.noradId && sat.cosparId ? "  ·  " : ""}
          {sat.cosparId ? `COSPAR: ${sat.cosparId}` : ""}
        </Text>
      ) : null}

      {sat.notes ? (
        <Text style={cardStyles.notes} numberOfLines={2}>{sat.notes}</Text>
      ) : null}

      <View style={cardStyles.actions}>
        <Pressable
          onPress={() => onSubmitEvent(sat)}
          style={({ pressed }) => [
            cardStyles.actionBtn,
            { borderColor: C.RED, backgroundColor: pressed ? C.RED + "22" : "transparent" },
          ]}
        >
          <Text style={[cardStyles.actionBtnText, { color: C.RED }]}>SUBMIT RISK EVENT</Text>
        </Pressable>
        <Pressable
          onPress={() => onEdit(sat)}
          style={({ pressed }) => [
            cardStyles.actionBtn,
            { borderColor: C.MUTED, backgroundColor: pressed ? C.MUTED + "22" : "transparent" },
          ]}
        >
          <Text style={[cardStyles.actionBtnText, { color: C.MUTED }]}>EDIT</Text>
        </Pressable>
        <Pressable
          onPress={() => onDelete(sat)}
          style={({ pressed }) => [
            cardStyles.actionBtn,
            { borderColor: C.MUTED2, backgroundColor: pressed ? C.MUTED2 + "22" : "transparent" },
          ]}
        >
          <Text style={[cardStyles.actionBtnText, { color: C.MUTED2 }]}>DEL</Text>
        </Pressable>
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: C.SURFACE,
    borderWidth: 1,
    borderColor: C.BORDER,
    borderLeftWidth: 3,
    marginBottom: 8,
    padding: 10,
    gap: 6,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerLeft: { flex: 1, gap: 2 },
  name: {
    fontFamily: FONT.bold,
    fontSize: 12,
    color: C.WHITE,
    letterSpacing: 1,
  },
  meta: {
    fontFamily: FONT.regular,
    fontSize: 8,
    color: C.MUTED,
    letterSpacing: 0.5,
  },
  riskBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  riskText: {
    fontFamily: FONT.bold,
    fontSize: 8,
    letterSpacing: 1,
  },
  ids: {
    fontFamily: FONT.regular,
    fontSize: 8,
    color: C.CYAN,
    letterSpacing: 0.5,
  },
  notes: {
    fontFamily: FONT.regular,
    fontSize: 9,
    color: C.MUTED,
    lineHeight: 14,
  },
  actions: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  actionBtn: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flex: 1,
    alignItems: "center",
  },
  actionBtnText: {
    fontFamily: FONT.bold,
    fontSize: 7,
    letterSpacing: 0.8,
  },
});

// ─── Risk Event Row ───────────────────────────────────────────────────────────
function RiskEventRow({
  event,
  onAck,
  onDelete,
}: {
  event: OperatorRiskEvent;
  onAck: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const color = RISK_LEVEL_COLORS[event.riskLevel];
  return (
    <View style={[evStyles.row, event.isAcknowledged && evStyles.rowAck]}>
      <View style={[evStyles.bar, { backgroundColor: color }]} />
      <View style={evStyles.content}>
        <View style={evStyles.meta}>
          <Text style={evStyles.time}>{event.submittedAt.slice(11, 19)}</Text>
          <View style={[evStyles.badge, { borderColor: color }]}>
            <Text style={[evStyles.badgeText, { color }]}>{event.riskLevel}</Text>
          </View>
          {event.isAcknowledged && (
            <Text style={evStyles.ackTag}>ACK</Text>
          )}
        </View>
        <Text style={evStyles.satName}>{event.satelliteName}</Text>
        <Text style={evStyles.detail} numberOfLines={1}>
          {EVENT_TYPE_LABELS[event.eventType]} · {event.description || "No description"}
        </Text>
        <View style={evStyles.actions}>
          {!event.isAcknowledged && (
            <Pressable
              onPress={() => onAck(event.id)}
              style={({ pressed }) => [
                evStyles.btn,
                { borderColor: C.VOLT, backgroundColor: pressed ? C.VOLT + "22" : "transparent" },
              ]}
            >
              <Text style={[evStyles.btnText, { color: C.VOLT }]}>ACK</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => onDelete(event.id)}
            style={({ pressed }) => [
              evStyles.btn,
              { borderColor: C.MUTED2, backgroundColor: pressed ? C.MUTED2 + "22" : "transparent" },
            ]}
          >
            <Text style={[evStyles.btnText, { color: C.MUTED2 }]}>DEL</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const evStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    backgroundColor: C.SURFACE,
    borderWidth: 1,
    borderColor: C.BORDER,
    marginBottom: 6,
  },
  rowAck: { opacity: 0.5 },
  bar: { width: 3 },
  content: { flex: 1, padding: 8, gap: 3 },
  meta: { flexDirection: "row", alignItems: "center", gap: 6 },
  time: { fontFamily: FONT.regular, fontSize: 8, color: C.MUTED },
  badge: {
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  badgeText: { fontFamily: FONT.bold, fontSize: 7, letterSpacing: 0.8 },
  ackTag: { fontFamily: FONT.bold, fontSize: 7, color: C.MUTED, letterSpacing: 1 },
  satName: { fontFamily: FONT.medium, fontSize: 10, color: C.WHITE, letterSpacing: 0.5 },
  detail: { fontFamily: FONT.regular, fontSize: 8, color: C.MUTED },
  actions: { flexDirection: "row", gap: 6, marginTop: 4 },
  btn: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  btnText: { fontFamily: FONT.bold, fontSize: 7, letterSpacing: 0.8 },
});

// ─── Main Operator Screen ─────────────────────────────────────────────────────
type ActiveTab = "REGISTRY" | "EVENTS";

export default function OperatorScreen() {
  const [activeTab, setActiveTab]         = useState<ActiveTab>("REGISTRY");
  const [satellites, setSatellites]       = useState<OperatorSatellite[]>([]);
  const [riskEvents, setRiskEvents]       = useState<OperatorRiskEvent[]>([]);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showEventModal, setShowEventModal]       = useState(false);
  const [editingSat, setEditingSat]       = useState<OperatorSatellite | null>(null);
  const [targetSat, setTargetSat]         = useState<OperatorSatellite | null>(null);

  // ── Satellite form state ──────────────────────────────────────────────────
  const [satForm, setSatForm] = useState(blankSatellite());

  // ── Risk event form state ─────────────────────────────────────────────────
  const [eventForm, setEventForm] = useState(blankRiskEvent());

  // ── Load data ─────────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    const [sats, events] = await Promise.all([loadSatellites(), loadRiskEvents()]);
    setSatellites(sats);
    setRiskEvents(events);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // ── Open register modal ───────────────────────────────────────────────────
  const openRegister = useCallback((sat?: OperatorSatellite) => {
    if (sat) {
      setEditingSat(sat);
      setSatForm({
        name: sat.name,
        noradId: sat.noradId,
        cosparId: sat.cosparId,
        operator: sat.operator,
        country: sat.country,
        altitudeKm: sat.altitudeKm,
        inclination: sat.inclination,
        orbitType: sat.orbitType,
        baseRiskLevel: sat.baseRiskLevel,
        notes: sat.notes,
        isActive: sat.isActive,
      });
    } else {
      setEditingSat(null);
      setSatForm(blankSatellite());
    }
    setShowRegisterModal(true);
  }, []);

  // ── Save satellite ────────────────────────────────────────────────────────
  const handleSaveSat = useCallback(async () => {
    if (!satForm.name.trim()) {
      Alert.alert("VALIDATION ERROR", "Satellite name is required.");
      return;
    }
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (editingSat) {
      await updateSatellite(editingSat.id, satForm);
    } else {
      await saveSatellite(satForm);
    }
    setShowRegisterModal(false);
    reload();
  }, [satForm, editingSat, reload]);

  // ── Delete satellite ──────────────────────────────────────────────────────
  const handleDeleteSat = useCallback((sat: OperatorSatellite) => {
    Alert.alert(
      "DELETE SATELLITE",
      `Remove ${sat.name} and all associated events?`,
      [
        { text: "CANCEL", style: "cancel" },
        {
          text: "DELETE",
          style: "destructive",
          onPress: async () => {
            if (Platform.OS !== "web") {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            }
            await deleteSatellite(sat.id);
            reload();
          },
        },
      ]
    );
  }, [reload]);

  // ── Open risk event modal ─────────────────────────────────────────────────
  const openEventModal = useCallback((sat: OperatorSatellite) => {
    setTargetSat(sat);
    setEventForm(blankRiskEvent(sat));
    setShowEventModal(true);
  }, []);

  // ── Submit risk event ─────────────────────────────────────────────────────
  const handleSubmitEvent = useCallback(async () => {
    if (!eventForm.description.trim()) {
      Alert.alert("VALIDATION ERROR", "Event description is required.");
      return;
    }
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    await submitRiskEvent(eventForm);
    setShowEventModal(false);
    setActiveTab("EVENTS");
    reload();
  }, [eventForm, reload]);

  // ── Acknowledge event ─────────────────────────────────────────────────────
  const handleAckEvent = useCallback(async (id: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await acknowledgeRiskEvent(id);
    reload();
  }, [reload]);

  // ── Delete event ──────────────────────────────────────────────────────────
  const handleDeleteEvent = useCallback(async (id: string) => {
    await deleteRiskEvent(id);
    reload();
  }, [reload]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const unackedCount = riskEvents.filter(e => !e.isAcknowledged).length;

  return (
    <SafeAreaView style={s.root} edges={["top", "left", "right"]}>
      {/* Top accent */}
      <View style={[s.topAccent, { backgroundColor: C.VOLT }]} />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>OPERATOR REGISTRY</Text>
          <Text style={s.headerSub}>SATELLITE RISK TELEMETRY</Text>
        </View>
        <View style={s.headerRight}>
          <Text style={s.headerCount}>{satellites.length} ASSETS</Text>
          {unackedCount > 0 && (
            <View style={s.alertBadge}>
              <Text style={s.alertBadgeText}>{unackedCount} UNACK</Text>
            </View>
          )}
        </View>
      </View>

      {/* Tab bar */}
      <View style={s.tabBar}>
        {(["REGISTRY", "EVENTS"] as ActiveTab[]).map(tab => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[s.tab, activeTab === tab && s.tabActive]}
          >
            <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
              {tab}
              {tab === "EVENTS" && unackedCount > 0 ? ` (${unackedCount})` : ""}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── REGISTRY TAB ── */}
      {activeTab === "REGISTRY" && (
        <View style={{ flex: 1 }}>
          {satellites.length === 0 ? (
            <View style={s.emptyState}>
              <Text style={s.emptyTitle}>NO ASSETS REGISTERED</Text>
              <Text style={s.emptyBody}>
                Register your satellite to inject risk telemetry into the Mission HUD.
              </Text>
            </View>
          ) : (
            <FlatList
              data={satellites}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <SatCard
                  sat={item}
                  onSubmitEvent={openEventModal}
                  onEdit={openRegister}
                  onDelete={handleDeleteSat}
                />
              )}
              contentContainerStyle={s.listPad}
              showsVerticalScrollIndicator={false}
            />
          )}
          <Pressable
            onPress={() => openRegister()}
            style={({ pressed }) => [
              s.fab,
              { backgroundColor: pressed ? C.VOLT + "CC" : C.VOLT },
            ]}
          >
            <Text style={s.fabText}>+ REGISTER SATELLITE</Text>
          </Pressable>
        </View>
      )}

      {/* ── EVENTS TAB ── */}
      {activeTab === "EVENTS" && (
        <View style={{ flex: 1 }}>
          {riskEvents.length === 0 ? (
            <View style={s.emptyState}>
              <Text style={s.emptyTitle}>NO RISK EVENTS</Text>
              <Text style={s.emptyBody}>
                Submit a risk event from a registered satellite to inject it into the HUD telemetry feed.
              </Text>
            </View>
          ) : (
            <FlatList
              data={riskEvents}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <RiskEventRow
                  event={item}
                  onAck={handleAckEvent}
                  onDelete={handleDeleteEvent}
                />
              )}
              contentContainerStyle={s.listPad}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      )}

      {/* ── REGISTER SATELLITE MODAL ── */}
      <Modal
        visible={showRegisterModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowRegisterModal(false)}
      >
        <View style={modal.overlay}>
          <View style={modal.sheet}>
            <View style={modal.header}>
              <Text style={modal.title}>
                {editingSat ? "EDIT SATELLITE" : "REGISTER SATELLITE"}
              </Text>
              <Pressable onPress={() => setShowRegisterModal(false)}>
                <Text style={modal.close}>✕</Text>
              </Pressable>
            </View>

            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={{ flex: 1 }}
            >
              <ScrollView
                style={modal.scroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={modal.section}>IDENTITY</Text>
                <GDSField
                  label="SATELLITE NAME"
                  value={satForm.name}
                  onChangeText={v => setSatForm(f => ({ ...f, name: v }))}
                  placeholder="e.g. SENTINEL-6A"
                  required
                />
                <GDSField
                  label="NORAD CATALOG ID"
                  value={satForm.noradId}
                  onChangeText={v => setSatForm(f => ({ ...f, noradId: v }))}
                  placeholder="e.g. 46984"
                  autoCapitalize="none"
                  keyboardType="numeric"
                />
                <GDSField
                  label="COSPAR / INTDES"
                  value={satForm.cosparId}
                  onChangeText={v => setSatForm(f => ({ ...f, cosparId: v }))}
                  placeholder="e.g. 2020-086A"
                  autoCapitalize="characters"
                />
                <GDSField
                  label="OPERATOR ORGANISATION"
                  value={satForm.operator}
                  onChangeText={v => setSatForm(f => ({ ...f, operator: v }))}
                  placeholder="e.g. ESA / NASA / JAXA"
                />
                <GDSField
                  label="COUNTRY / AGENCY CODE"
                  value={satForm.country}
                  onChangeText={v => setSatForm(f => ({ ...f, country: v }))}
                  placeholder="e.g. EU / US / JP"
                />

                <Text style={modal.section}>ORBITAL PARAMETERS</Text>
                <GDSField
                  label="ALTITUDE (KM)"
                  value={satForm.altitudeKm}
                  onChangeText={v => setSatForm(f => ({ ...f, altitudeKm: v }))}
                  placeholder="e.g. 550"
                  keyboardType="decimal-pad"
                  autoCapitalize="none"
                />
                <GDSField
                  label="INCLINATION (°)"
                  value={satForm.inclination}
                  onChangeText={v => setSatForm(f => ({ ...f, inclination: v }))}
                  placeholder="e.g. 97.6"
                  keyboardType="decimal-pad"
                  autoCapitalize="none"
                />
                <GDSSelector
                  label="ORBIT TYPE"
                  options={ORBIT_TYPES}
                  value={satForm.orbitType}
                  onChange={v => setSatForm(f => ({ ...f, orbitType: v }))}
                />

                <Text style={modal.section}>RISK PROFILE</Text>
                <GDSSelector
                  label="BASE RISK LEVEL"
                  options={RISK_LEVELS}
                  value={satForm.baseRiskLevel}
                  onChange={v => setSatForm(f => ({ ...f, baseRiskLevel: v as RiskLevel }))}
                  colorMap={RISK_LEVEL_COLORS}
                />
                <GDSField
                  label="OPERATOR NOTES"
                  value={satForm.notes}
                  onChangeText={v => setSatForm(f => ({ ...f, notes: v }))}
                  placeholder="Mission notes, known anomalies, contact info..."
                  multiline
                  autoCapitalize="sentences"
                />

                {/* Active toggle */}
                <View style={modal.toggleRow}>
                  <Text style={modal.toggleLabel}>ACTIVE ASSET</Text>
                  <Switch
                    value={satForm.isActive}
                    onValueChange={v => setSatForm(f => ({ ...f, isActive: v }))}
                    trackColor={{ false: C.MUTED2, true: C.VOLT + "66" }}
                    thumbColor={satForm.isActive ? C.VOLT : C.MUTED}
                  />
                </View>

                <Pressable
                  onPress={handleSaveSat}
                  style={({ pressed }) => [
                    modal.saveBtn,
                    { backgroundColor: pressed ? C.VOLT + "CC" : C.VOLT },
                  ]}
                >
                  <Text style={modal.saveBtnText}>
                    {editingSat ? "SAVE CHANGES" : "REGISTER SATELLITE"}
                  </Text>
                </Pressable>

                <View style={{ height: 40 }} />
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </View>
      </Modal>

      {/* ── SUBMIT RISK EVENT MODAL ── */}
      <Modal
        visible={showEventModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEventModal(false)}
      >
        <View style={modal.overlay}>
          <View style={modal.sheet}>
            <View style={modal.header}>
              <View>
                <Text style={modal.title}>SUBMIT RISK EVENT</Text>
                {targetSat && (
                  <Text style={[modal.subtitle, { color: C.VOLT }]}>{targetSat.name}</Text>
                )}
              </View>
              <Pressable onPress={() => setShowEventModal(false)}>
                <Text style={modal.close}>✕</Text>
              </Pressable>
            </View>

            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={{ flex: 1 }}
            >
              <ScrollView
                style={modal.scroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={modal.section}>EVENT CLASSIFICATION</Text>
                <GDSSelector
                  label="EVENT TYPE"
                  options={OPERATOR_EVENT_TYPES}
                  value={eventForm.eventType}
                  onChange={v => setEventForm(f => ({ ...f, eventType: v as OperatorEventType }))}
                  labelMap={EVENT_TYPE_LABELS}
                />
                <GDSSelector
                  label="RISK LEVEL"
                  options={RISK_LEVELS}
                  value={eventForm.riskLevel}
                  onChange={v => {
                    const lvl = v as RiskLevel;
                    setEventForm(f => ({
                      ...f,
                      riskLevel: lvl,
                      threatPct: RISK_LEVEL_THREAT[lvl],
                    }));
                  }}
                  colorMap={RISK_LEVEL_COLORS}
                />

                {/* Threat probability slider (manual input) */}
                <View style={modal.threatWrap}>
                  <Text style={modal.threatLabel}>THREAT PROBABILITY (%)</Text>
                  <View style={modal.threatRow}>
                    <TextInput
                      style={modal.threatInput}
                      value={String(eventForm.threatPct)}
                      onChangeText={v => {
                        const n = parseInt(v, 10);
                        if (!isNaN(n)) {
                          setEventForm(f => ({ ...f, threatPct: Math.min(100, Math.max(0, n)) }));
                        }
                      }}
                      keyboardType="numeric"
                      maxLength={3}
                    />
                    <View style={modal.threatTrack}>
                      <View
                        style={[
                          modal.threatFill,
                          {
                            width: `${eventForm.threatPct}%` as any,
                            backgroundColor: RISK_LEVEL_COLORS[eventForm.riskLevel],
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>

                <Text style={modal.section}>LOCATION (OPTIONAL)</Text>
                <View style={modal.coordRow}>
                  <View style={{ flex: 1 }}>
                    <GDSField
                      label="LATITUDE"
                      value={eventForm.latitude}
                      onChangeText={v => setEventForm(f => ({ ...f, latitude: v }))}
                      placeholder="-33.9"
                      keyboardType="decimal-pad"
                      autoCapitalize="none"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <GDSField
                      label="LONGITUDE"
                      value={eventForm.longitude}
                      onChangeText={v => setEventForm(f => ({ ...f, longitude: v }))}
                      placeholder="151.2"
                      keyboardType="decimal-pad"
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                <Text style={modal.section}>DETAILS</Text>
                <GDSField
                  label="DESCRIPTION"
                  value={eventForm.description}
                  onChangeText={v => setEventForm(f => ({ ...f, description: v }))}
                  placeholder="Describe the risk event in detail..."
                  multiline
                  autoCapitalize="sentences"
                  required
                />
                <GDSField
                  label="AFFECTED SYSTEMS"
                  value={eventForm.affectedSystems}
                  onChangeText={v => setEventForm(f => ({ ...f, affectedSystems: v }))}
                  placeholder="e.g. ADCS, COMMS, POWER"
                />
                <GDSField
                  label="SUBMITTED BY (CALLSIGN)"
                  value={eventForm.submittedBy}
                  onChangeText={v => setEventForm(f => ({ ...f, submittedBy: v }))}
                  placeholder="e.g. OPS-ALPHA"
                />
                <GDSSelector
                  label="MITIGATION STATUS"
                  options={["NONE", "MONITORING", "MITIGATING", "RESOLVED"]}
                  value={eventForm.mitigationStatus}
                  onChange={v => setEventForm(f => ({
                    ...f,
                    mitigationStatus: v as OperatorRiskEvent["mitigationStatus"],
                  }))}
                  colorMap={{
                    NONE: C.RED,
                    MONITORING: C.AMBER,
                    MITIGATING: C.ORANGE,
                    RESOLVED: C.VOLT,
                  }}
                />

                <Pressable
                  onPress={handleSubmitEvent}
                  style={({ pressed }) => [
                    modal.saveBtn,
                    { backgroundColor: pressed ? C.RED + "CC" : C.RED },
                  ]}
                >
                  <Text style={modal.saveBtnText}>INJECT INTO HUD FEED</Text>
                </Pressable>

                <View style={{ height: 40 }} />
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.BLACK },
  topAccent: { height: 2 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
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
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerCount: {
    fontFamily: FONT.regular,
    fontSize: 9,
    color: C.MUTED,
    letterSpacing: 0.5,
  },
  alertBadge: {
    backgroundColor: C.RED + "33",
    borderWidth: 1,
    borderColor: C.RED,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  alertBadgeText: {
    fontFamily: FONT.bold,
    fontSize: 8,
    color: C.RED,
    letterSpacing: 0.8,
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: C.VOLT },
  tabText: {
    fontFamily: FONT.bold,
    fontSize: 9,
    color: C.MUTED,
    letterSpacing: 1.5,
  },
  tabTextActive: { color: C.VOLT },
  listPad: { padding: 12 },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: FONT.bold,
    fontSize: 12,
    color: C.MUTED,
    letterSpacing: 2,
    textAlign: "center",
  },
  emptyBody: {
    fontFamily: FONT.regular,
    fontSize: 10,
    color: C.MUTED2,
    textAlign: "center",
    lineHeight: 16,
    letterSpacing: 0.5,
  },
  fab: {
    margin: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 4,
  },
  fabText: {
    fontFamily: FONT.bold,
    fontSize: 11,
    color: C.BLACK,
    letterSpacing: 1.5,
  },
});

const modal = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.SURFACE,
    borderTopWidth: 2,
    borderTopColor: C.VOLT,
    maxHeight: "92%",
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
  },
  title: {
    fontFamily: FONT.bold,
    fontSize: 13,
    color: C.VOLT,
    letterSpacing: 1.5,
  },
  subtitle: {
    fontFamily: FONT.regular,
    fontSize: 9,
    letterSpacing: 1,
    marginTop: 2,
  },
  close: {
    fontFamily: FONT.bold,
    fontSize: 16,
    color: C.MUTED,
    padding: 4,
  },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
  section: {
    fontFamily: FONT.bold,
    fontSize: 8,
    color: C.VOLT,
    letterSpacing: 2,
    marginTop: 12,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
    paddingBottom: 4,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  toggleLabel: {
    fontFamily: FONT.bold,
    fontSize: 8,
    color: C.MUTED,
    letterSpacing: 1.5,
  },
  saveBtn: {
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
    borderRadius: 4,
  },
  saveBtnText: {
    fontFamily: FONT.bold,
    fontSize: 11,
    color: C.BLACK,
    letterSpacing: 1.5,
  },
  threatWrap: { marginBottom: 10 },
  threatLabel: {
    fontFamily: FONT.bold,
    fontSize: 8,
    color: C.MUTED,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  threatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  threatInput: {
    backgroundColor: C.SURFACE2,
    borderWidth: 1,
    borderColor: C.BORDER2,
    color: C.WHITE,
    fontFamily: FONT.bold,
    fontSize: 14,
    width: 56,
    textAlign: "center",
    paddingVertical: 6,
  },
  threatTrack: {
    flex: 1,
    height: 6,
    backgroundColor: C.BORDER2,
  },
  threatFill: {
    height: 6,
  },
  coordRow: {
    flexDirection: "row",
    gap: 10,
  },
});
