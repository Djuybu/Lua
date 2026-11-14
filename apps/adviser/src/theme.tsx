import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AccessibilityInfo, AppState, useColorScheme } from "react-native";
import { useMaterial3Theme } from "@pchmn/expo-material3-theme";
export type Appearance = "system" | "light" | "dark";
export type Preferences = {
  appearance: Appearance;
  seed: string;
  dynamic: boolean;
  endpoint: string;
  locale?: "vi" | "en";
  motion?: "system" | "reduced";
  offlineAiOnly?: boolean;
};
export const defaults: Preferences = {
  appearance: "system",
  seed: "#6750A4",
  dynamic: true,
  endpoint: "",
};
export function luminance(hex: string) {
  const a =
    hex
      .replace("#", "")
      .match(/.{2}/g)
      ?.slice(0, 3)
      .map((x) => parseInt(x, 16) / 255) ?? [];
  return a.reduce(
    (s, c, i) =>
      s +
      [0.2126, 0.7152, 0.0722][i] *
        (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4),
    0,
  );
}
export function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const light = {
  outlineVariant: "#CAC4D0",
  onTertiaryContainer: "#31111D",
  tertiaryContainer: "#FFD8E4",
  onTertiary: "#FFFFFF",
  tertiary: "#7D5260",
  onSecondaryContainer: "#1D192B",
  secondaryContainer: "#E8DEF8",
  onSecondary: "#FFFFFF",
  secondary: "#625B71",
  surfaceContainerHigh: "#ECE6F0",
  surfaceContainerLow: "#F7F2FA",
  surfaceContainerLowest: "#FFFFFF",
  background: "#FFFBFE",
  surface: "#FFFBFE",
  surfaceContainer: "#F3EDF7",
  surfaceContainerHighest: "#E6E0E9",
  onSurface: "#1D1B20",
  onSurfaceVariant: "#49454F",
  primary: "#6750A4",
  onPrimary: "#FFFFFF",
  primaryContainer: "#EADDFF",
  onPrimaryContainer: "#21005D",
  outline: "#79747E",
  error: "#B3261E",
  onError: "#FFFFFF",
};
const dark = {
  outlineVariant: "#49454F",
  onTertiaryContainer: "#FFD8E4",
  tertiaryContainer: "#633B48",
  onTertiary: "#492532",
  tertiary: "#EFB8C8",
  onSecondaryContainer: "#E8DEF8",
  secondaryContainer: "#4A4458",
  onSecondary: "#332D41",
  secondary: "#CCC2DC",
  surfaceContainerHigh: "#2B2930",
  surfaceContainerLow: "#1D1B20",
  surfaceContainerLowest: "#0F0D13",
  background: "#141218",
  surface: "#1D1B20",
  surfaceContainer: "#211F26",
  surfaceContainerHighest: "#36343B",
  onSurface: "#E6E0E9",
  onSurfaceVariant: "#CAC4D0",
  primary: "#D0BCFF",
  onPrimary: "#381E72",
  primaryContainer: "#4F378B",
  onPrimaryContainer: "#EADDFF",
  outline: "#938F99",
  error: "#F2B8B5",
  onError: "#601410",
};
export type Colors = typeof light;
export function validPalette(c: Colors) {
  return (
    contrast(c.onSurface, c.surface) >= 4.5 &&
    contrast(c.onSurface, c.background) >= 4.5 &&
    contrast(c.onSurfaceVariant, c.surfaceContainer) >= 4.5 &&
    contrast(c.onPrimary, c.primary) >= 4.5 &&
    contrast(c.onPrimaryContainer, c.primaryContainer) >= 4.5 &&
    contrast(c.outline, c.surface) >= 3
  );
}
const ThemeContext = createContext<{
  c: Colors;
  reduceMotion: boolean;
  isDark: boolean;
  fallback: boolean;
}>({ c: light, reduceMotion: true, isDark: false, fallback: false });
export const useTheme = () => useContext(ThemeContext);
export function AdvisorTheme({
  preferences,
  children,
}: {
  preferences: Preferences;
  children: React.ReactNode;
}) {
  const mode = useColorScheme();
  const isDark =
    preferences.appearance === "system"
      ? mode === "dark"
      : preferences.appearance === "dark";
  const { theme, updateTheme, resetTheme } = useMaterial3Theme(
    preferences.dynamic
      ? { fallbackSourceColor: preferences.seed }
      : { sourceColor: preferences.seed },
  );
  useEffect(() => {
    if (preferences.dynamic) resetTheme();
    else updateTheme(preferences.seed);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && preferences.dynamic) resetTheme();
    });
    return () => sub.remove();
  }, [preferences.seed, preferences.dynamic]);
  const candidate = {
    ...(isDark ? dark : light),
    ...theme[isDark ? "dark" : "light"],
  };
  const fallback = !validPalette(candidate);
  const c = fallback ? (isDark ? dark : light) : candidate;
  const [reduceMotion, setReduced] = useState(true);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduced)
      .catch(() => setReduced(true));
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    const app = AppState.addEventListener("change", (s) => {
      if (s === "active")
        AccessibilityInfo.isReduceMotionEnabled()
          .then(setReduced)
          .catch(() => {});
    });
    return () => {
      sub.remove();
      app.remove();
    };
  }, []);
  return (
    <ThemeContext.Provider
      value={{
        c,
        reduceMotion: reduceMotion || preferences.motion === "reduced",
        isDark,
        fallback,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
