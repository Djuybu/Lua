import React from "react";
import { TextInput, View } from "react-native";
import { useTheme } from "../theme";
import { useLocale } from "../i18n";
import { Button, s } from "../ui";
export function FloatingSearchBar({
  query,
  onQuery,
  onFilters,
  onAdvisor,
  onAi,
  count,
}: {
  query: string;
  onQuery: (q: string) => void;
  onFilters: () => void;
  onAdvisor: () => void;
  onAi: () => void;
  count: number;
}) {
  const { c } = useTheme();
  const { t } = useLocale();
  return (
    <View
      style={{
        backgroundColor: c.surfaceContainerHigh,
        padding: 12,
        borderRadius: 28,
        gap: 8,
        margin: 12,
      }}
    >
      <TextInput
        accessibilityLabel={t("Tìm thiết bị")}
        placeholder={t("Tìm thiết bị, RAM, dung lượng…")}
        placeholderTextColor={c.onSurfaceVariant}
        value={query}
        onChangeText={onQuery}
        style={{
          minHeight: 48,
          paddingHorizontal: 16,
          color: c.onSurface,
          fontSize: 16,
        }}
      />
      <View style={s.row}>
        <Button
          label={t("Lọc") + (count ? " (" + count + ")" : "")}
          onPress={onFilters}
        />
        <Button quiet label="Mở Device Advisor" onPress={onAdvisor} />
        <Button quiet label="Tư vấn AI" onPress={onAi} />
      </View>
    </View>
  );
}
