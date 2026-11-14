import React from "react";
import { Text, View } from "react-native";
import { Laptop, Smartphone, Tablet, Monitor } from "lucide-react-native";
import type { ProductVariant } from "../catalog";
import { useTheme } from "../theme";
import { useLocale } from "../i18n";
import { Body, Button, s } from "../ui";
import { categories } from "../model";
import { sourceOf } from "../domain/filters";
export function specRows(v: ProductVariant) {
  const x = v.specifications;
  return [
    ["Hãng / Dòng", v.brand + " / " + v.familyId],
    ["CPU", x.cpu],
    ["GPU", x.gpu],
    ["RAM", x.ramGb + " GB"],
    ["Lưu trữ", x.storageGb + " GB"],
    ["Màn hình", x.displayInches ? x.displayInches + " inch" : null],
    ["Pin", x.batteryWattHours ? x.batteryWattHours + " Wh" : null],
    ["Cân nặng", x.weightKg ? x.weightKg + " kg" : null],
    ["HĐH", x.os],
  ];
}
export function PSREFListingCard({
  variant: v,
  selected,
  onOpen,
  onCompare,
}: {
  variant: ProductVariant;
  selected: boolean;
  onOpen: () => void;
  onCompare: () => void;
}) {
  const { c } = useTheme();
  const { t } = useLocale();
  const Icon = {
    phone: Smartphone,
    tablet: Tablet,
    pc_laptop: Laptop,
    pc_desktop: Monitor,
  }[v.category];
  return (
    <View
      style={[
        s.card,
        {
          flex: 1,
          backgroundColor: c.surfaceContainerLow,
          borderWidth: 2,
          borderColor: selected ? c.primary : "transparent",
        },
      ]}
    >
      <View style={s.row}>
        <Icon size={26} color={c.primary} />
        <Body muted>
          {sourceOf(v)} · {t(categories[v.category])}
        </Body>
      </View>
      <Text
        style={{
          fontSize: 21,
          lineHeight: 28,
          fontWeight: "600",
          color: c.onSurface,
        }}
      >
        {v.modelName}
      </Text>
      <Body muted>
        {t("Hãng")}: {v.brand} · {t("Kiểu máy")}: {v.familyId}
      </Body>
      <Body>Chưa có giá trọn gói đã xác minh</Body>
      {specRows(v).map(([label, value]) => (
        <View key={label} style={{ flexDirection: "row", gap: 12 }}>
          <Text style={{ width: 88, color: c.onSurfaceVariant, fontSize: 14 }}>
            {t(label!)}
          </Text>
          <Text
            style={{
              flex: 1,
              color: value ? c.onSurface : c.onSurfaceVariant,
              fontStyle: value ? "normal" : "italic",
              fontSize: 14,
              lineHeight: 21,
            }}
          >
            {value || t("Chưa công bố")}
          </Text>
        </View>
      ))}
      <Body muted>Thông số do nhà bán lẻ công bố.</Body>
      <View style={[s.row, { marginTop: "auto" }]}>
        <Button label="Xem cấu hình" onPress={onOpen} />
        <Button
          label={selected ? "Bỏ chọn" : "So sánh"}
          selected={selected}
          onPress={onCompare}
        />
      </View>
    </View>
  );
}
