import type { SnapshotManifest } from "./catalog";
import { officialOffer, offerTotal } from "./domain/official";
import seed from "./catalog.json";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { Award } from "lucide-react-native";
import type { ProductVariant } from "./catalog";
import { useTheme } from "./theme";
import { useLocale } from "./i18n";
import { Body, Button, Title, s } from "./ui";
import { winners } from "./utils/comparison-semantics";
export function ComparisonView({
  variants,
  onRemove,
  onReplace,
  onAdd,
}: {
  variants: ProductVariant[];
  onRemove: (v: ProductVariant) => void;
  onReplace: (v: ProductVariant) => void;
  onAdd: () => void;
}) {
  const { c } = useTheme();
  const { t } = useLocale();
  const rows: [
    string,
    (v: ProductVariant) => string | number | null,
    "higher" | "lower" | "neutral",
  ][] = [
    ["RAM", (v) => v.specifications.ramGb, "higher"],
    ["Lưu trữ", (v) => v.specifications.storageGb, "higher"],
    ["CPU", (v) => v.specifications.cpu, "neutral"],
    ["GPU", (v) => v.specifications.gpu ?? null, "neutral"],
    ["Màn hình", (v) => v.specifications.displayInches ?? null, "neutral"],
    ["Pin", (v) => v.specifications.batteryWattHours ?? null, "higher"],
    ["Cân nặng", (v) => v.specifications.weightKg ?? null, "lower"],
    ["HĐH", (v) => v.specifications.os, "neutral"],
    [
      "Tổng chi phí",
      (v) => {
        const o = officialOffer(seed as SnapshotManifest, v.variantId);
        return o ? offerTotal(o) : null;
      },
      "lower",
    ],
  ];
  const wins = rows.map(([, get, direction]) =>
    winners(
      variants.map((v) =>
        typeof get(v) === "number" ? (get(v) as number) : null,
      ),
      direction,
    ),
  );
  return (
    <View style={s.section}>
      <Title>So sánh</Title>
      <Body muted>Không đủ dữ liệu để kết luận máy tốt hơn.</Body>
      {!variants.length && <Body>Chưa chọn thiết bị</Body>}
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: 108 }}>
          <View style={{ height: 360, justifyContent: "center" }}>
            <Body muted>Thông số</Body>
          </View>
          {rows.map(([label]) => (
            <View
              key={label}
              style={{ minHeight: 96, padding: 10, justifyContent: "center" }}
            >
              <Body>{label}</Body>
            </View>
          ))}
        </View>
        <ScrollView horizontal>
          <View>
            <View style={{ flexDirection: "row" }}>
              {variants.map((v, i) => (
                <View
                  key={v.variantId + i}
                  style={{ width: 210, height: 360, padding: 12, gap: 8 }}
                >
                  <Text
                    style={{
                      color: c.onSurface,
                      fontWeight: "600",
                      fontSize: 17,
                    }}
                  >
                    {v.modelName}
                  </Text>
                  <Body muted>
                    {wins.filter((xs) => xs.includes(i)).length} ·{" "}
                    {t("Vượt trội về thông số này")}
                  </Body>
                  <Button quiet label="Bỏ chọn" onPress={() => onRemove(v)} />
                  <Button quiet label="Đổi máy" onPress={() => onReplace(v)} />
                </View>
              ))}
            </View>
            {rows.map(([label, get], r) => (
              <View key={label} style={{ flexDirection: "row" }}>
                {variants.map((v, i) => {
                  const win = wins[r].includes(i);
                  return (
                    <View
                      key={v.variantId + i}
                      style={{
                        width: 210,
                        minHeight: 96,
                        padding: 12,
                        backgroundColor: win
                          ? c.primaryContainer
                          : c.surfaceContainerLowest,
                        borderWidth: 1,
                        borderColor: win ? c.primary : "transparent",
                        justifyContent: "center",
                      }}
                    >
                      {win && <Award size={18} color={c.onPrimaryContainer} />}
                      <Text
                        accessibilityLabel={
                          v.modelName +
                          ", " +
                          t(label) +
                          (win ? ", " + t("Vượt trội về thông số này") : "")
                        }
                        style={{
                          color: win ? c.onPrimaryContainer : c.onSurface,
                          fontWeight: win ? "800" : "400",
                          fontSize: 15,
                          lineHeight: 22,
                        }}
                      >
                        {get(v) ?? t("Chưa công bố")}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
      {variants.length > 0 && <Button label="Thêm vào giỏ" onPress={onAdd} />}
    </View>
  );
}
