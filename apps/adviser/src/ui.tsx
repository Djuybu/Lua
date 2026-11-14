import React, { useRef, useEffect } from "react";
import {
  Animated,
  AppState,
  Pressable,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTheme } from "./theme";
import { useLocale } from "./i18n";
export function Button({
  label,
  onPress,
  selected = false,
  disabled = false,
  quiet = false,
  icon,
  a11yLabel,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  quiet?: boolean;
  icon?: React.ReactNode;
  a11yLabel?: string;
}) {
  const { c, reduceMotion } = useTheme();
  const { t } = useLocale();
  const scale = useRef(new Animated.Value(1)).current;
  function animate(v: number) {
    scale.stopAnimation();
    if (reduceMotion) scale.setValue(1);
    else
      Animated.spring(scale, {
        toValue: v,
        stiffness: 800,
        damping: 33.94,
        mass: 1,
        useNativeDriver: true,
      }).start();
  }
  useEffect(() => {
    scale.stopAnimation();
    scale.setValue(1);
    const sub = AppState.addEventListener("change", () => {
      scale.stopAnimation();
      scale.setValue(1);
    });
    return () => {
      sub.remove();
      scale.stopAnimation();
    };
  }, [reduceMotion]);
  return (
    <Pressable
      accessibilityLabel={t(a11yLabel ?? label)}
      {...(Platform.OS === "web" ? { "aria-pressed": selected } : {})}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => animate(0.98)}
      onPressOut={() => animate(1)}
      style={({ pressed }) => [
        s.button,
        {
          backgroundColor: disabled
            ? c.surfaceContainerHighest
            : selected
              ? c.primary
              : quiet
                ? "transparent"
                : c.primaryContainer,
          opacity: pressed ? 0.8 : 1,
          borderColor: selected ? c.primary : c.outline,
          borderWidth: quiet ? 0 : 1,
        },
      ]}
    >
      <Animated.View
        style={{
          flexDirection: "row",
          gap: 8,
          alignItems: "center",
          transform: [{ scale }],
        }}
      >
        {icon}
        <Text
          style={{
            color: selected
              ? c.onPrimary
              : quiet
                ? c.primary
                : c.onPrimaryContainer,
            fontWeight: "600",
            fontSize: 15,
          }}
        >
          {t(label)}
        </Text>
      </Animated.View>
    </Pressable>
  );
}
export function Title({
  children,
  small = false,
}: {
  children: React.ReactNode;
  small?: boolean;
}) {
  const { c } = useTheme();
  const { t } = useLocale();
  return (
    <Text
      accessibilityRole="header"
      style={{
        color: c.onSurface,
        fontSize: small ? 22 : 34,
        lineHeight: small ? 30 : 42,
        fontWeight: "700",
        letterSpacing: -0.5,
      }}
    >
      {React.Children.map(children, (child) =>
        typeof child === "string" ? t(child) : child,
      )}
    </Text>
  );
}
export function Body({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  const { c } = useTheme();
  const { t } = useLocale();
  return (
    <Text
      style={{
        fontSize: 15,
        lineHeight: 23,
        color: muted ? c.onSurfaceVariant : c.onSurface,
      }}
    >
      {React.Children.map(children, (child) =>
        typeof child === "string" ? t(child) : child,
      )}
    </Text>
  );
}
export function Notice({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  const { c } = useTheme();
  const { t } = useLocale();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        backgroundColor: c.surfaceContainer,
        padding: 20,
        borderRadius: 16,
        gap: 8,
      }}
    >
      <Text style={{ fontSize: 17, fontWeight: "600", color: c.onSurface }}>
        {t(title)}
      </Text>
      {children &&
        (typeof children === "string" ? (
          <Body muted>{children}</Body>
        ) : (
          <View style={{ gap: 12 }}>{children}</View>
        ))}
    </View>
  );
}
export const s = StyleSheet.create({
  button: {
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
  },
  section: { gap: 16, marginBottom: 24 },
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
  },
  card: { borderRadius: 16, padding: 22, gap: 14 },
  spec: { flexBasis: "45%", flexGrow: 1, paddingVertical: 10 },
  divider: { height: 1, marginVertical: 10 },
});
