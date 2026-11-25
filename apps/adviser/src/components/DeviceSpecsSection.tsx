import React from "react";
import { Text, View } from "react-native";
import type { ProductVariant } from "../catalog";
import { useTheme } from "../theme";
import { useLocale } from "../i18n";
import { Title } from "../ui";
import { specRows } from "./PSREFListingCard";
import { sourceOf } from "../domain/filters";
import { sourceLabel } from "../domain/official";

export function DeviceSpecsSection({
  variant: v,
}: {
  variant: ProductVariant;
}) {
  const { c } = useTheme();
  const { t } = useLocale();
  const rows = specRows(v);
  const retailer = sourceLabel(sourceOf(v)) || null;
  const groups = [
    ["Nhận dạng & Xuất xứ", [rows[0], ["Nhà bán lẻ", retailer]]],
    ["Vi xử lý & Đồ họa", rows.slice(1, 3)],
    ["Bộ nhớ & Lưu trữ", rows.slice(3, 5)],
    ["Màn hình, Pin & Thiết kế", rows.slice(5)],
  ] as [string, (string | null | undefined)[][]][];
  return (
    <View style={{ gap: 24 }}>
      {groups.map(([title, list]) => (
        <View key={title} style={{ gap: 12 }}>
          <Title small>{title}</Title>
          {list.map(([label, value], i) => (
            <View
              key={label}
              style={{
                flexDirection: "row",
                padding: 12,
                gap: 12,
                backgroundColor:
                  i % 2 ? c.surfaceContainerLowest : c.surfaceContainerLow,
              }}
            >
              <Text
                style={{
                  width: 116,
                  color: c.onSurfaceVariant,
                  fontSize: 14,
                  lineHeight: 22,
                }}
              >
                {t(label!)}
              </Text>
              <Text
                style={{
                  flex: 1,
                  color: c.onSurface,
                  fontSize: 15,
                  lineHeight: 23,
                  fontStyle: value ? "normal" : "italic",
                }}
              >
                {value ? t(value) : t("Chưa công bố")}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
