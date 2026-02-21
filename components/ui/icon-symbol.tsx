// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

const MAPPING = {
  "house.fill":                              "home",
  "paperplane.fill":                         "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right":                           "chevron-right",
  // HUD icons
  "antenna.radiowaves.left.and.right":       "radar",
  "satellite.fill":                          "satellite-alt",
  "exclamationmark.triangle.fill":           "warning",
  "person.badge.plus":                       "person-add",
  // Auth & feedback icons
  "person.crop.circle.fill":                  "account-circle",
  "lock.fill":                                "lock",
  "bubble.left.and.bubble.right.fill":        "forum",
  "checkmark.circle.fill":                    "check-circle",
  "xmark.circle.fill":                        "cancel",
  "arrow.right.circle.fill":                  "login",
} as unknown as IconMapping;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
