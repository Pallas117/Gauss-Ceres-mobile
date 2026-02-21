import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/components/ui/icon-symbol";

type AnyIconName = Parameters<typeof IconSymbol>[0]["name"];

const C = {
  BLACK:    "#000000",
  SURFACE:  "#0A0A0A",
  VOLT:     "#CCFF00",
  AMBER:    "#FFB800",
  RED:      "#FF2222",
  BLUE:     "#1E90FF",
  MUTED:    "#444444",
  DIM:      "#222222",
  WHITE:    "#FFFFFF",
  BORDER:   "#1A1A1A",
  SUCCESS:  "#00FF88",
};

type Category = "BUG" | "FEATURE" | "DATA" | "OTHER";
type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const CATEGORIES: { value: Category; label: string; color: string }[] = [
  { value: "BUG",     label: "BUG",     color: C.RED   },
  { value: "FEATURE", label: "FEATURE", color: C.BLUE  },
  { value: "DATA",    label: "DATA",    color: C.AMBER },
  { value: "OTHER",   label: "OTHER",   color: C.MUTED },
];

const SEVERITIES: { value: Severity; label: string; color: string }[] = [
  { value: "LOW",      label: "LOW",      color: C.MUTED },
  { value: "MEDIUM",   label: "MEDIUM",   color: C.VOLT  },
  { value: "HIGH",     label: "HIGH",     color: C.AMBER },
  { value: "CRITICAL", label: "CRITICAL", color: C.RED   },
];

function formatDate(d: Date | string) {
  const dt = new Date(d);
  return dt.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITIES.find((x) => x.value === severity);
  return (
    <View style={[styles.badge, { borderColor: s?.color ?? C.MUTED }]}>
      <Text style={[styles.badgeText, { color: s?.color ?? C.MUTED }]}>{severity}</Text>
    </View>
  );
}

function CategoryBadge({ category }: { category: Category }) {
  const c = CATEGORIES.find((x) => x.value === category);
  return (
    <View style={[styles.badge, { borderColor: c?.color ?? C.MUTED }]}>
      <Text style={[styles.badgeText, { color: c?.color ?? C.MUTED }]}>{category}</Text>
    </View>
  );
}

export default function FeedbackScreen() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const [category, setCategory] = useState<Category>("BUG");
  const [severity, setSeverity] = useState<Severity>("MEDIUM");
  const [message, setMessage] = useState("");
  const [contextRef, setContextRef] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const submitMutation = trpc.feedback.submit.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      setMessage("");
      setContextRef("");
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      myListQuery.refetch();
    },
    onError: (err) => {
      setValidationError(err.message);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
  });

  const myListQuery = trpc.feedback.myList.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const handleSubmit = () => {
    setValidationError(null);
    setSubmitted(false);
    if (message.trim().length < 10) {
      setValidationError("Message must be at least 10 characters.");
      return;
    }
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    submitMutation.mutate({
      category,
      severity,
      message: message.trim(),
      contextRef: contextRef.trim() || undefined,
    });
  };

  if (authLoading) {
    return (
      <ScreenContainer containerClassName="bg-black" className="items-center justify-center">
        <ActivityIndicator color={C.VOLT} />
      </ScreenContainer>
    );
  }

  if (!isAuthenticated) {
    return (
      <ScreenContainer containerClassName="bg-black" className="items-center justify-center gap-4 p-6">
        <IconSymbol name={"lock.fill" as AnyIconName} size={32} color={C.MUTED} />
        <Text style={styles.unauthTitle}>AUTHENTICATION REQUIRED</Text>
        <Text style={styles.unauthDesc}>
          Sign in to submit feedback and view your submission history.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.loginBtn, pressed && styles.btnPressed]}
          onPress={() => router.push("/login")}
        >
          <Text style={styles.loginBtnText}>SIGN IN</Text>
        </Pressable>
      </ScreenContainer>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.BLACK }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScreenContainer containerClassName="bg-black">
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <IconSymbol name={"bubble.left.and.bubble.right.fill" as AnyIconName} size={16} color={C.VOLT} />
              <Text style={styles.headerTitle}>FEEDBACK PORTAL</Text>
            </View>
            <Text style={styles.headerUser}>{user?.name ?? user?.email ?? "OPERATOR"}</Text>
          </View>
          <View style={styles.voltLine} />

          {/* Success banner */}
          {submitted && (
            <View style={styles.successBanner}>
              <IconSymbol name={"checkmark.circle.fill" as AnyIconName} size={14} color={C.SUCCESS} />
              <Text style={styles.successText}>
                FEEDBACK SUBMITTED — THANK YOU, OPERATOR
              </Text>
            </View>
          )}

          {/* Form card */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>NEW REPORT</Text>

            {/* Category selector */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>CATEGORY</Text>
              <View style={styles.chipRow}>
                {CATEGORIES.map((c) => (
                  <Pressable
                    key={c.value}
                    onPress={() => setCategory(c.value)}
                    style={({ pressed }) => [
                      styles.chip,
                      category === c.value && { borderColor: c.color, backgroundColor: `${c.color}18` },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: category === c.value ? c.color : C.MUTED },
                      ]}
                    >
                      {c.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Severity selector */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>SEVERITY</Text>
              <View style={styles.chipRow}>
                {SEVERITIES.map((s) => (
                  <Pressable
                    key={s.value}
                    onPress={() => setSeverity(s.value)}
                    style={({ pressed }) => [
                      styles.chip,
                      severity === s.value && { borderColor: s.color, backgroundColor: `${s.color}18` },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: severity === s.value ? s.color : C.MUTED },
                      ]}
                    >
                      {s.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Context ref */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>CONTEXT REF (OPTIONAL)</Text>
              <TextInput
                style={styles.textInput}
                value={contextRef}
                onChangeText={setContextRef}
                placeholder="e.g. NORAD ID, event ID, satellite name"
                placeholderTextColor={C.MUTED}
                maxLength={128}
                returnKeyType="next"
              />
            </View>

            {/* Message */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>MESSAGE *</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={message}
                onChangeText={(t) => {
                  setMessage(t);
                  setValidationError(null);
                }}
                placeholder="Describe the issue, feature request, or data discrepancy in detail..."
                placeholderTextColor={C.MUTED}
                multiline
                numberOfLines={5}
                maxLength={2000}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>{message.length}/2000</Text>
            </View>

            {/* Validation error */}
            {(validationError || submitMutation.isError) && (
              <View style={styles.errorRow}>
                <IconSymbol name={"exclamationmark.triangle.fill" as AnyIconName} size={12} color={C.RED} />
                <Text style={styles.errorText}>
                  {validationError ?? submitMutation.error?.message}
                </Text>
              </View>
            )}

            {/* Submit button */}
            <Pressable
              onPress={handleSubmit}
              disabled={submitMutation.isPending}
              style={({ pressed }) => [
                styles.submitBtn,
                pressed && styles.btnPressed,
                submitMutation.isPending && styles.btnDisabled,
              ]}
            >
              {submitMutation.isPending ? (
                <ActivityIndicator color={C.BLACK} size="small" />
              ) : (
                <Text style={styles.submitBtnText}>SUBMIT REPORT</Text>
              )}
            </Pressable>
          </View>

          {/* Submission history */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>MY SUBMISSIONS</Text>
            {myListQuery.isLoading && (
              <ActivityIndicator color={C.VOLT} style={{ marginVertical: 12 }} />
            )}
            {myListQuery.data && myListQuery.data.length === 0 && (
              <Text style={styles.emptyText}>NO SUBMISSIONS YET</Text>
            )}
            {myListQuery.data?.map((item) => (
              <View key={item.id} style={styles.historyRow}>
                <View style={styles.historyTop}>
                  <CategoryBadge category={item.category as Category} />
                  <SeverityBadge severity={item.severity as Severity} />
                  {item.isResolved && (
                    <View style={[styles.badge, { borderColor: C.SUCCESS }]}>
                      <Text style={[styles.badgeText, { color: C.SUCCESS }]}>RESOLVED</Text>
                    </View>
                  )}
                  <Text style={styles.historyDate}>{formatDate(item.createdAt)}</Text>
                </View>
                <Text style={styles.historyMessage} numberOfLines={2}>
                  {item.message}
                </Text>
                {item.contextRef && (
                  <Text style={styles.historyRef}>REF: {item.contextRef}</Text>
                )}
                {item.adminNote && (
                  <View style={styles.adminNoteRow}>
                    <Text style={styles.adminNoteLabel}>ADMIN NOTE:</Text>
                    <Text style={styles.adminNoteText}>{item.adminNote}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </ScrollView>
      </ScreenContainer>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontFamily: "JetBrainsMono_700Bold",
    fontSize: 12,
    color: "#CCFF00",
    letterSpacing: 2,
  },
  headerUser: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 9,
    color: "#444444",
    letterSpacing: 1,
  },
  voltLine: {
    height: 1,
    backgroundColor: "#CCFF00",
    opacity: 0.3,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#001A0D",
    borderWidth: 1,
    borderColor: "#00FF88",
    borderRadius: 2,
    padding: 10,
  },
  successText: {
    fontFamily: "JetBrainsMono_700Bold",
    fontSize: 10,
    color: "#00FF88",
    letterSpacing: 1,
  },
  card: {
    backgroundColor: "#0A0A0A",
    borderWidth: 1,
    borderColor: "#1A1A1A",
    borderRadius: 4,
    padding: 16,
    gap: 14,
  },
  sectionLabel: {
    fontFamily: "JetBrainsMono_700Bold",
    fontSize: 9,
    color: "#CCFF00",
    letterSpacing: 2,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontFamily: "JetBrainsMono_700Bold",
    fontSize: 9,
    color: "#666666",
    letterSpacing: 1.5,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#222222",
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: {
    fontFamily: "JetBrainsMono_700Bold",
    fontSize: 9,
    letterSpacing: 1.5,
  },
  textInput: {
    backgroundColor: "#050505",
    borderWidth: 1,
    borderColor: "#1A1A1A",
    borderRadius: 2,
    padding: 10,
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 11,
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  textArea: {
    minHeight: 100,
    lineHeight: 18,
  },
  charCount: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 9,
    color: "#444444",
    textAlign: "right",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1A0000",
    borderWidth: 1,
    borderColor: "#FF2222",
    borderRadius: 2,
    padding: 8,
  },
  errorText: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 10,
    color: "#FF2222",
    flex: 1,
  },
  submitBtn: {
    backgroundColor: "#CCFF00",
    borderRadius: 2,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontFamily: "JetBrainsMono_700Bold",
    fontSize: 11,
    color: "#000000",
    letterSpacing: 2,
  },
  emptyText: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 10,
    color: "#333333",
    letterSpacing: 1.5,
    textAlign: "center",
    paddingVertical: 12,
  },
  historyRow: {
    borderTopWidth: 1,
    borderTopColor: "#111111",
    paddingTop: 10,
    gap: 6,
  },
  historyTop: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  historyDate: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 9,
    color: "#444444",
    marginLeft: "auto",
  },
  historyMessage: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 10,
    color: "#888888",
    lineHeight: 15,
  },
  historyRef: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 9,
    color: "#555555",
    letterSpacing: 0.5,
  },
  adminNoteRow: {
    backgroundColor: "#0A0A14",
    borderLeftWidth: 2,
    borderLeftColor: "#1E90FF",
    paddingLeft: 8,
    paddingVertical: 4,
    gap: 2,
  },
  adminNoteLabel: {
    fontFamily: "JetBrainsMono_700Bold",
    fontSize: 8,
    color: "#1E90FF",
    letterSpacing: 1.5,
  },
  adminNoteText: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 10,
    color: "#AAAAAA",
  },
  badge: {
    borderWidth: 1,
    borderRadius: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: "JetBrainsMono_700Bold",
    fontSize: 8,
    letterSpacing: 1,
  },
  unauthTitle: {
    fontFamily: "JetBrainsMono_700Bold",
    fontSize: 12,
    color: "#CCFF00",
    letterSpacing: 2,
  },
  unauthDesc: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 11,
    color: "#666666",
    textAlign: "center",
    lineHeight: 18,
  },
  loginBtn: {
    backgroundColor: "#CCFF00",
    borderRadius: 2,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  loginBtnText: {
    fontFamily: "JetBrainsMono_700Bold",
    fontSize: 11,
    color: "#000000",
    letterSpacing: 2,
  },
});
