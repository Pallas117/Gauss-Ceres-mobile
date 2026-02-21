import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { startOAuthLogin } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import { IconSymbol } from "@/components/ui/icon-symbol";

type AnyIconName = Parameters<typeof IconSymbol>[0]["name"];

const C = {
  BLACK:    "#000000",
  SURFACE:  "#0A0A0A",
  VOLT:     "#CCFF00",
  AMBER:    "#FFB800",
  RED:      "#FF2222",
  MUTED:    "#444444",
  DIM:      "#222222",
  WHITE:    "#FFFFFF",
  BORDER:   "#1A1A1A",
  BLUE:     "#1E90FF",
};

/** Animated blinking cursor */
function BlinkCursor() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start();
  }, [opacity]);
  return <Animated.Text style={[styles.cursor, { opacity }]}>_</Animated.Text>;
}

/** Animated orbit ring decoration */
function OrbitRing({ size, opacity: op, delay }: { size: number; opacity: number; delay: number }) {
  const scale = useRef(new Animated.Value(0.8)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(scale, { toValue: 1.05, duration: 2000, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.8, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, [scale, delay]);
  return (
    <Animated.View
      style={[
        styles.orbitRing,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity: op,
          transform: [{ scale }],
        },
      ]}
    />
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect to HUD if already authenticated
  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, loading, router]);

  const handleLogin = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setSigningIn(true);
    setError(null);
    try {
      await startOAuthLogin();
      // On native, the app will be re-opened via deep link after OAuth
      // On web, the page redirects — so we only reach here on native
    } catch (err) {
      setError("Authentication failed. Please try again.");
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <ScreenContainer containerClassName="bg-black" className="items-center justify-center">
        <ActivityIndicator color={C.VOLT} size="large" />
        <Text style={styles.loadingText}>AUTHENTICATING...</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer containerClassName="bg-black" className="items-center justify-center">
      {/* Background orbit rings */}
      <View style={styles.orbitContainer} pointerEvents="none">
        <OrbitRing size={320} opacity={0.06} delay={0} />
        <OrbitRing size={220} opacity={0.09} delay={600} />
        <OrbitRing size={140} opacity={0.12} delay={1200} />
      </View>

      {/* Logo / header block */}
      <View style={styles.logoBlock}>
        <View style={styles.logoIconRow}>
          <IconSymbol name={"satellite.fill" as AnyIconName} size={28} color={C.VOLT} />
          <View style={styles.logoTextBlock}>
            <Text style={styles.logoTitle}>GAUSS</Text>
            <Text style={styles.logoSub}>// MISSION HUD</Text>
          </View>
        </View>
        <View style={styles.voltLine} />
      </View>

      {/* Auth card */}
      <View style={styles.card}>
        {/* Card header */}
        <View style={styles.cardHeader}>
          <Text style={styles.cardHeaderText}>OPERATOR AUTHENTICATION</Text>
          <BlinkCursor />
        </View>

        {/* Node info */}
        <View style={styles.nodeRow}>
          <View style={[styles.statusDot, { backgroundColor: C.AMBER }]} />
          <Text style={styles.nodeText}>JUDITH · M1 NODE · AWAITING AUTH</Text>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* SSO description */}
        <Text style={styles.descText}>
          Authenticate via Manus SSO to access the Mission HUD. Your operator session will be
          logged for audit purposes.
        </Text>

        {/* Error message */}
        {error && (
          <View style={styles.errorRow}>
            <IconSymbol name={"exclamationmark.triangle.fill" as AnyIconName} size={14} color={C.RED} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Login button */}
        <Pressable
          onPress={handleLogin}
          disabled={signingIn}
          style={({ pressed }) => [
            styles.loginBtn,
            pressed && styles.loginBtnPressed,
            signingIn && styles.loginBtnDisabled,
          ]}
        >
          {signingIn ? (
            <ActivityIndicator color={C.BLACK} size="small" />
          ) : (
            <IconSymbol name={"arrow.right.circle.fill" as AnyIconName} size={18} color={C.BLACK} />
          )}
          <Text style={styles.loginBtnText}>
            {signingIn ? "AUTHENTICATING..." : "SIGN IN WITH MANUS SSO"}
          </Text>
        </Pressable>

        {/* Footer note */}
        <View style={styles.footerRow}>
          <IconSymbol name={"lock.fill" as AnyIconName} size={11} color={C.MUTED} />
          <Text style={styles.footerText}>
            Secured via OAuth 2.0 · Session encrypted at rest
          </Text>
        </View>
      </View>

      {/* Version tag */}
      <Text style={styles.versionText}>GAUSS HUD v1.0 · CERES BUILD</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  orbitContainer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
  },
  orbitRing: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "#CCFF00",
  },
  logoBlock: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  logoTextBlock: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  logoTitle: {
    fontFamily: "JetBrainsMono_700Bold",
    fontSize: 28,
    color: "#CCFF00",
    letterSpacing: 6,
  },
  logoSub: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 11,
    color: "#666666",
    letterSpacing: 2,
  },
  voltLine: {
    width: 120,
    height: 1,
    backgroundColor: "#CCFF00",
    opacity: 0.4,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#0A0A0A",
    borderWidth: 1,
    borderColor: "#1A1A1A",
    borderRadius: 4,
    padding: 20,
    gap: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cardHeaderText: {
    fontFamily: "JetBrainsMono_700Bold",
    fontSize: 10,
    color: "#CCFF00",
    letterSpacing: 2,
  },
  cursor: {
    fontFamily: "JetBrainsMono_700Bold",
    fontSize: 10,
    color: "#CCFF00",
  },
  nodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  nodeText: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 9,
    color: "#666666",
    letterSpacing: 1.5,
  },
  divider: {
    height: 1,
    backgroundColor: "#1A1A1A",
  },
  descText: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 10,
    color: "#888888",
    lineHeight: 16,
    letterSpacing: 0.5,
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
  loginBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#CCFF00",
    borderRadius: 2,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  loginBtnPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  loginBtnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    fontFamily: "JetBrainsMono_700Bold",
    fontSize: 11,
    color: "#000000",
    letterSpacing: 2,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    justifyContent: "center",
  },
  footerText: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 9,
    color: "#444444",
    letterSpacing: 0.5,
  },
  loadingText: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 10,
    color: "#CCFF00",
    letterSpacing: 2,
    marginTop: 12,
  },
  versionText: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 9,
    color: "#333333",
    letterSpacing: 1.5,
    marginTop: 24,
  },
});
