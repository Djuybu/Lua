import React from "react";
import { TextInput, View } from "react-native";
import { useTheme } from "../theme";
import { useLocale } from "../i18n";
import { Button } from "../ui";

export function FloatingSearchBar({
  query,
  onQuery,
  onFilters,
  onAi,
  count,
}: {
  query: string;
  onQuery: (q: string) => void;
  onFilters: () => void;
  onAi: () => void;
  count: number;
}) {
  const { c } = useTheme();
  const { t } = useLocale();
  return (
    <View
      style={{
        backgroundColor: c.surfaceContainerHigh,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 28,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginHorizontal: 12,
        marginVertical: 8,
      }}
    >
      <TextInput
        accessibilityLabel={t("Tìm thiết bị")}
        placeholder={t("Tìm thiết bị, RAM, dung lượng…")}
        placeholderTextColor={c.onSurfaceVariant}
        value={query}
        onChangeText={onQuery}
        returnKeyType="search"
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 44,
          paddingHorizontal: 12,
          color: c.onSurface,
          fontSize: 15,
        }}
      />
      {query !== "" && (
        <Button
          quiet
          label="×"
          a11yLabel="Xóa từ khóa tìm kiếm"
          onPress={() => onQuery("")}
        />
      )}
      <Button
        label={t("Lọc") + (count ? " (" + count + ")" : "")}
        onPress={onFilters}
      />
      <Button quiet label="Tư vấn AI" onPress={onAi} />
    </View>
  );
}
