import { Tabs } from "expo-router";
import { IconSymbol } from "@/components/ui/icon-symbol";

type AnyIconName = Parameters<typeof IconSymbol>[0]["name"];

const C = {
  BLACK:  "#000000",
  VOLT:   "#CCFF00",
  MUTED:  "#444444",
  BORDER: "#1A1A1A",
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.BLACK,
          borderTopColor: C.BORDER,
          borderTopWidth: 1,
          height: 56,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: C.VOLT,
        tabBarInactiveTintColor: C.MUTED,
        tabBarLabelStyle: {
          fontFamily: "JetBrainsMono_700Bold",
          fontSize: 8,
          letterSpacing: 1.2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "MISSION HUD",
          tabBarIcon: ({ color, size }) => (
            <IconSymbol
              name={"antenna.radiowaves.left.and.right" as AnyIconName}
              color={color}
              size={size - 2}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="operator"
        options={{
          title: "OPERATOR",
          tabBarIcon: ({ color, size }) => (
            <IconSymbol
              name={"person.badge.plus" as AnyIconName}
              color={color}
              size={size - 2}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="feedback"
        options={{
          title: "FEEDBACK",
          tabBarIcon: ({ color, size }) => (
            <IconSymbol
              name={"bubble.left.and.bubble.right.fill" as AnyIconName}
              color={color}
              size={size - 2}
            />
          ),
        }}
      />
    </Tabs>
  );
}
