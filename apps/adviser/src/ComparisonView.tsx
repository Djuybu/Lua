import { officialOffer, offerTotal } from "./domain/official";
import { useCatalog } from "./catalog-context";
import React, { useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import Award from "lucide-react-native/icons/award";
import type { ProductVariant } from "./catalog";
import { useTheme } from "./theme";
import { useLocale } from "./i18n";
import { Body, Button, EmptyState, Title, s } from "./ui";
import { vnd } from "./model";
import { winners } from "./utils/comparison-semantics";

type SpecRow = {
  label: string;
  getRaw: (v: ProductVariant) => string | number | null;
  format: (v: ProductVariant, t: (k: string) => string) => string;
  direction: "higher" | "lower" | "neutral";
};

export function ComparisonView({
  variants,
  onRemove,
  onReplace,
  onAdd,
  onBrowse,
}: {
  variants: ProductVariant[];
  onRemove: (v: ProductVariant) => void;
  onReplace: (v: ProductVariant) => void;
  onAdd: () => void;
  onBrowse?: () => void;
}) {
  const { c } = useTheme();
  const { t } = useLocale();
  const catalog = useCatalog();
  const [diffOnly, setDiffOnly] = useState(false);

  const rows: SpecRow[] = [
    {
      label: "RAM",
      getRaw: (v) => v.specifications.ramGb,
      format: (v, tr) =>
        v.specifications.ramGb != null ? `${v.specifications.ramGb} GB` : tr("Chưa công bố"),
      direction: "higher",
    },
    {
      label: "Lưu trữ",
      getRaw: (v) => v.specifications.storageGb,
      format: (v, tr) =>
        v.specifications.storageGb != null
          ? `${v.specifications.storageGb} GB`
          : tr("Chưa công bố"),
      direction: "higher",
    },
    {
      label: "CPU",
      getRaw: (v) => v.specifications.cpu,
      format: (v, tr) => v.specifications.cpu || tr("Chưa công bố"),
      direction: "neutral",
    },
    {
      label: "GPU",
      getRaw: (v) => v.specifications.gpu || null,
      format: (v, tr) => v.specifications.gpu || tr("Chưa công bố"),
      direction: "neutral",
    },
    {
      label: "Màn hình",
      getRaw: (v) => v.specifications.displayInches ?? null,
      format: (v, tr) =>
        v.specifications.displayInches != null
          ? `${v.specifications.displayInches} inch`
          : tr("Chưa công bố"),
      direction: "neutral",
    },
    {
      label: "Pin",
      getRaw: (v) => v.specifications.batteryWattHours ?? null,
      format: (v, tr) =>
        v.specifications.batteryWattHours != null
          ? `${v.specifications.batteryWattHours} Wh`
          : tr("Chưa công bố"),
      direction: "higher",
    },
    {
      label: "Cân nặng",
      getRaw: (v) => v.specifications.weightKg ?? null,
      format: (v, tr) =>
        v.specifications.weightKg != null
          ? `${v.specifications.weightKg} kg`
          : tr("Chưa công bố"),
      direction: "lower",
    },
    {
      label: "HĐH",
      getRaw: (v) => v.specifications.os,
      format: (v, tr) => v.specifications.os || tr("Chưa công bố"),
      direction: "neutral",
    },
    {
      label: "Giá niêm yết tham khảo",
      getRaw: (v) => v.observedPriceVnd ?? null,
      format: (v, tr) =>
        v.observedPriceVnd != null
          ? vnd(v.observedPriceVnd, tr("Chưa công bố"))
          : tr("Chưa công bố"),
      direction: "lower",
    },
    {
      label: "Tổng chi phí",
      getRaw: (v) => {
        const o = officialOffer(catalog, v.variantId);
        return o ? offerTotal(o) : null;
      },
      format: (v, tr) => {
        const o = officialOffer(catalog, v.variantId);
        const total = o ? offerTotal(o) : null;
        return total != null ? vnd(total, tr("Chưa công bố")) : tr("Chưa công bố");
      },
      direction: "lower",
    },
  ];

  const wins = rows.map((row) =>
    winners(
      variants.map((v) => {
        const raw = row.getRaw(v);
        return typeof raw === "number" ? raw : null;
      }),
      row.direction,
    ),
  );

  const visibleRowIndices = rows
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => {
      if (!diffOnly || variants.length < 2) return true;
      const values = new Set(variants.map((v) => row.format(v, t)));
      return values.size > 1;
    });

  if (!variants.length) {
    return (
      <View style={s.section}>
        <Title>So sánh</Title>
        <EmptyState
          title="Chưa chọn thiết bị"
          description="Chọn tối đa 4 cấu hình từ Trang chủ hoặc Giỏ hàng để đối chiếu thông số và giá."
          actionLabel={onBrowse ? "Chọn thêm thiết bị" : undefined}
          onAction={onBrowse}
        />
      </View>
    );
  }

  return (
    <View style={s.section}>
      <Title>So sánh</Title>
      <Body muted>Không đủ dữ liệu để kết luận máy tốt hơn.</Body>
      {variants.length >= 2 && (
        <View style={s.row}>
          <Button
            label="Chỉ hiện điểm khác biệt"
            selected={diffOnly}
            onPress={() => setDiffOnly(!diffOnly)}
          />
          <Button label="Thêm vào giỏ" variant="primary" onPress={onAdd} />
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View
          style={{
            borderRadius: 16,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: c.outlineVariant,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              backgroundColor: c.surfaceContainerLow,
              borderBottomWidth: 1,
              borderColor: c.outlineVariant,
            }}
          >
            <View
              style={{
                width: 120,
                padding: 12,
                justifyContent: "center",
                backgroundColor: c.surfaceContainerLow,
                ...(Platform.OS === "web" ? ({ position: "sticky", left: 0, zIndex: 2 } as any) : {}),
              }}
            >
              <Body muted>Thông số</Body>
            </View>
            {variants.map((v, i) => (
              <View
                key={v.variantId}
                style={{
                  width: 220,
                  minHeight: 132,
                  padding: 12,
                  gap: 8,
                  borderLeftWidth: 1,
                  borderColor: c.outlineVariant,
                  justifyContent: "space-between",
                }}
              >
                <View style={{ gap: 4 }}>
                  <Text
                    style={{
                      color: c.onSurface,
                      fontWeight: "600",
                      fontSize: 16,
                      lineHeight: 22,
                    }}
                  >
                    {v.modelName}
                  </Text>
                  {variants.length >= 2 && (
                    <Body muted>
                      {wins.filter((xs) => xs.includes(i)).length} ·{" "}
                      {t("Vượt trội về thông số này")}
                    </Body>
                  )}
                </View>
                <View style={s.row}>
                  <Button quiet label="Bỏ chọn" onPress={() => onRemove(v)} />
                  <Button quiet label="Đổi máy" onPress={() => onReplace(v)} />
                </View>
              </View>
            ))}
          </View>

          {visibleRowIndices.map(({ row, idx }) => (
            <View
              key={row.label}
              style={{
                flexDirection: "row",
                borderBottomWidth: 1,
                borderColor: c.outlineVariant,
              }}
            >
              <View
                style={{
                  width: 120,
                  padding: 12,
                  justifyContent: "center",
                  backgroundColor: c.surfaceContainerLow,
                  ...(Platform.OS === "web" ? ({ position: "sticky", left: 0, zIndex: 1 } as any) : {}),
                }}
              >
                <Body>{row.label}</Body>
              </View>
              {variants.map((v, i) => {
                const win = wins[idx].includes(i);
                const formatted = row.format(v, t);
                return (
                  <View
                    key={v.variantId}
                    style={{
                      width: 220,
                      minHeight: 68,
                      padding: 12,
                      borderLeftWidth: 1,
                      borderColor: win ? c.primary : c.outlineVariant,
                      backgroundColor: win
                        ? c.primaryContainer
                        : c.surfaceContainerLowest,
                      justifyContent: "center",
                      gap: 4,
                    }}
                  >
                    {win && <Award size={18} color={c.onPrimaryContainer} />}
                    <Text
                      accessibilityLabel={`${v.modelName}, ${t(row.label)}: ${formatted}${win ? ", " + t("Vượt trội về thông số này") : ""}`}
                      style={{
                        color: win ? c.onPrimaryContainer : c.onSurface,
                        fontWeight: win ? "800" : "400",
                        fontSize: 14,
                        lineHeight: 20,
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {formatted}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
      {variants.length === 1 && (
        <Button label="Thêm vào giỏ" variant="primary" onPress={onAdd} />
      )}
    </View>
  );
}
