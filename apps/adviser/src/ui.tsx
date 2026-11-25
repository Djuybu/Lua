import React, { useRef, useEffect, useState } from "react";
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

const appStateResetListeners = new Set<() => void>();
let appStateSubscribed = false;
function subscribeAppStateReset(cb: () => void) {
  if (!appStateSubscribed) {
    appStateSubscribed = true;
    AppState.addEventListener("change", () => {
      for (const fn of appStateResetListeners) fn();
    });
  }
  appStateResetListeners.add(cb);
  return () => {
    appStateResetListeners.delete(cb);
  };
}

function isPrimitiveTextTree(node: React.ReactNode): boolean {
  if (
    node === null ||
    node === undefined ||
    typeof node === "boolean" ||
    typeof node === "string" ||
    typeof node === "number"
  )
    return true;
  if (Array.isArray(node)) return node.every(isPrimitiveTextTree);
  return false;
}

export function Button({
  label,
  onPress,
  selected,
  disabled = false,
  quiet = false,
  variant,
  fullWidth = false,
  icon,
  a11yLabel,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  quiet?: boolean;
  variant?: "primary" | "tonal" | "outlined" | "text" | "destructive";
  fullWidth?: boolean;
  icon?: React.ReactNode;
  a11yLabel?: string;
}) {
  const { c, reduceMotion } = useTheme();
  const { t } = useLocale();
  const scale = useRef(new Animated.Value(1)).current;
  const [focused, setFocused] = useState(false);
  const resolvedVariant =
    variant ?? (selected ? "primary" : quiet ? "text" : "tonal");
  const isTextOnly = resolvedVariant === "text";
  const isOutlined = resolvedVariant === "outlined";
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
    const unsubscribe = subscribeAppStateReset(() => {
      scale.stopAnimation();
      scale.setValue(1);
    });
    return () => {
      unsubscribe();
      scale.stopAnimation();
    };
  }, [reduceMotion, scale]);

  const backgroundColor = disabled
    ? isTextOnly || isOutlined
      ? "transparent"
      : c.surfaceContainerHighest
    : resolvedVariant === "destructive"
      ? c.error
      : resolvedVariant === "primary"
        ? c.primary
        : isTextOnly || isOutlined
          ? "transparent"
          : c.primaryContainer;

  const textColor = disabled
    ? c.onSurfaceVariant
    : resolvedVariant === "destructive"
      ? c.onError
      : resolvedVariant === "primary"
        ? c.onPrimary
        : isTextOnly || isOutlined
          ? c.primary
          : c.onPrimaryContainer;

  const borderColor = disabled
    ? c.outlineVariant
    : resolvedVariant === "destructive"
      ? c.error
      : resolvedVariant === "primary"
        ? c.primary
        : c.outline;

  return (
    <Pressable
      accessibilityLabel={t(a11yLabel ?? label)}
      {...(Platform.OS === "web" && selected !== undefined
        ? { "aria-pressed": selected }
        : {})}
      accessibilityRole="button"
      accessibilityState={{
        ...(selected !== undefined ? { selected } : {}),
        disabled,
      }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => animate(0.98)}
      onPressOut={() => animate(1)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={(state) => {
        const hovered =
          Platform.OS === "web" && !disabled && (state as { hovered?: boolean }).hovered;
        return [
          s.button,
          {
            alignSelf: fullWidth ? "stretch" : "flex-start",
            backgroundColor,
            opacity: state.pressed ? 0.82 : hovered ? 0.92 : 1,
            borderColor: focused && Platform.OS === "web" ? c.primary : borderColor,
            borderWidth: isTextOnly ? 0 : focused && Platform.OS === "web" ? 2 : 1,
            ...(Platform.OS === "web"
              ? ({
                  cursor: disabled ? "not-allowed" : "pointer",
                  outlineStyle: focused ? "solid" : "none",
                  outlineWidth: focused ? 2 : 0,
                  outlineColor: c.primary,
                } as any)
              : {}),
          },
        ];
      }}
    >
      <Animated.View
        style={{
          flexDirection: "row",
          gap: label !== "" && icon ? 8 : 0,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale }],
        }}
      >
        {icon}
        {label !== "" && (
          <Text
            style={{
              color: textColor,
              fontWeight: "600",
              fontSize: 15,
            }}
          >
            {t(label)}
          </Text>
        )}
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
  live = false,
  tone = "neutral",
}: {
  title: string;
  children?: React.ReactNode;
  live?: boolean;
  tone?: "neutral" | "error";
}) {
  const { c } = useTheme();
  const { t } = useLocale();
  const hasChildren =
    children !== undefined &&
    children !== null &&
    children !== false &&
    children !== "";
  return (
    <View
      {...(live ? { accessibilityLiveRegion: "polite" as const } : {})}
      style={{
        backgroundColor: c.surfaceContainer,
        padding: 18,
        borderRadius: 16,
        gap: 8,
        borderWidth: tone === "error" ? 1 : 0,
        borderColor: tone === "error" ? c.error : "transparent",
      }}
    >
      <Text
        style={{
          fontSize: 16,
          fontWeight: "600",
          color: tone === "error" ? c.error : c.onSurface,
        }}
      >
        {t(title)}
      </Text>
      {hasChildren &&
        (isPrimitiveTextTree(children) ? (
          <Body muted>{children}</Body>
        ) : (
          <View style={{ gap: 12 }}>{children}</View>
        ))}
    </View>
  );
}

export function SectionCard({
  children,
  gap = 16,
}: {
  children: React.ReactNode;
  gap?: number;
}) {
  const { c } = useTheme();
  return (
    <View
      style={{
        backgroundColor: c.surfaceContainerLow,
        padding: 20,
        borderRadius: 20,
        gap,
      }}
    >
      {children}
    </View>
  );
}

export function Chip({
  label,
  tone = "neutral",
  onPress,
}: {
  label: string;
  tone?: "neutral" | "primary" | "muted";
  onPress?: () => void;
}) {
  const { c } = useTheme();
  const { t } = useLocale();
  const bg =
    tone === "primary"
      ? c.primaryContainer
      : tone === "muted"
        ? c.surfaceContainer
        : c.surfaceContainerHigh;
  const fg =
    tone === "primary"
      ? c.onPrimaryContainer
      : tone === "muted"
        ? c.onSurfaceVariant
        : c.onSurface;
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(label)}
        onPress={onPress}
        style={({ pressed }) => ({
          backgroundColor: bg,
          paddingHorizontal: 12,
          paddingVertical: 6,
          minHeight: 36,
          borderRadius: 18,
          justifyContent: "center",
          opacity: pressed ? 0.8 : 1,
          ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
        })}
      >
        <Text style={{ color: fg, fontSize: 13, fontWeight: "600" }}>
          {t(label)}
        </Text>
      </Pressable>
    );
  }
  return (
    <View
      style={{
        backgroundColor: bg,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 12,
      }}
    >
      <Text style={{ color: fg, fontSize: 12, fontWeight: "600" }}>
        {t(label)}
      </Text>
    </View>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { c } = useTheme();
  return (
    <View
      style={{
        backgroundColor: c.surfaceContainerLow,
        borderRadius: 20,
        padding: 24,
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <Title small>{title}</Title>
      {!!description && <Body muted>{description}</Body>}
      {!!actionLabel && onAction && (
        <Button label={actionLabel} selected onPress={onAction} />
      )}
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
