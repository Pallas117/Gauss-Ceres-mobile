import { Tabs } from "expo-router";

// Single-screen HUD — no tab bar needed
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "HUD",
        }}
      />
    </Tabs>
  );
}
