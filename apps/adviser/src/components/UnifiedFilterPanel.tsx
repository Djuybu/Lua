import React, { useEffect, useMemo, useState } from "react";
import { Modal, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { useLocale } from "../i18n";
import { Body, Button, Title, s } from "../ui";
import {
  emptyFilters,
  filterVariants,
  normalizeBrand,
  sourceOf,
  type Filters,
} from "../domain/filters";
import { sourceLabel } from "../domain/official";
import type { ProductVariant } from "../catalog";
import { categories, vnd, type ConfirmedNeedsProfile } from "../model";

export function applyConfirmedFilter(
  variants: ProductVariant[],
  showExcluded: boolean,
  confirmed: ConfirmedNeedsProfile | null,
  metadata: Record<
    string,
    { price: number | null; total: number | null; condition: string | null }
  > = {},
) {
  if (showExcluded || !confirmed) return variants;
  const reqOs = confirmed.hardConstraints?.requiredOs?.map((o) =>
    o.trim().toLowerCase(),
  );
  const minRam = confirmed.hardConstraints?.minRamGb;
  const ceiling = confirmed.budget.hardCeilingVnd;
  return variants.filter((v) => {
    if (v.category !== confirmed.category) return false;
    if (minRam && (v.specifications.ramGb === null || v.specifications.ramGb < minRam))
      return false;
    if (reqOs?.length) {
      const osText = v.specifications.os.toLowerCase();
      if (!reqOs.some((req) => osText.includes(req))) return false;
    }
    const m = metadata[v.variantId];
    const effectivePrice = m?.total ?? m?.price ?? null;
    if (effectivePrice != null && effectivePrice > ceiling) return false;
    return true;
  });
}

export function UnifiedFilterPanel({
  visible,
  metadata = {},
  value,
  variants,
  query,
  confirmed = null,
  fitOrder,
  onApply,
  onClose,
}: {
  visible: boolean;
  metadata?: Record<
    string,
    { price: number | null; total: number | null; condition: string | null }
  >;
  value: Filters;
  variants: ProductVariant[];
  query: string;
  confirmed?: ConfirmedNeedsProfile | null;
  fitOrder?: Record<string, number>;
  onApply: (f: Filters) => void;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const { t } = useLocale();
  const [d, set] = useState(value);
  const [error, setError] = useState("");
  useEffect(() => {
    if (visible) {
      set(structuredClone(value));
      setError("");
    }
  }, [visible, value]);

  const toggle = (key: "sources" | "brands", x: string) =>
    set({
      ...d,
      [key]: d[key].includes(x)
        ? d[key].filter((a) => a !== x)
        : [...d[key], x],
    });

  const availableSources = useMemo(
    () => [...new Set(variants.map(sourceOf).filter(Boolean))],
    [variants],
  );
  const availableBrands = useMemo(
    () =>
      [...new Set(variants.map((x) => normalizeBrand(x.brand)).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [variants],
  );
  const hasPriceData = useMemo(
    () =>
      Object.values(metadata).some(
        (m) => m.price != null || m.total != null || m.condition != null,
      ),
    [metadata],
  );
  const previewCount = useMemo(
    () =>
      applyConfirmedFilter(
        filterVariants(variants, d, query, metadata, fitOrder),
        d.showExcluded,
        confirmed,
        metadata,
      ).length,
    [variants, d, query, metadata, fitOrder, confirmed],
  );

  const inputStyle = [s.input, { color: c.onSurface, borderColor: c.outline }];
  const presets: [string, string, string][] = [
    ["", "15000000", "0–15 triệu"],
    ["15000000", "20000000", "15–20 triệu"],
    ["20000000", "30000000", "20–30 triệu"],
    ["30000000", "", ">30 triệu"],
  ];

  return (
    <Modal visible={visible} animationType="none" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 24,
            gap: 18,
            maxWidth: 720,
            width: "100%",
            alignSelf: "center",
          }}
        >
          <View style={{ ...s.row, justifyContent: "space-between" }}>
            <Title>Bộ lọc tổng</Title>
            <Button quiet label="Hủy" onPress={onClose} />
          </View>
          <Title small>Thiết bị</Title>
          <View style={s.row}>
            <Button
              label="Tất cả"
              selected={!d.category}
              onPress={() => set({ ...d, category: "" })}
            />
            {Object.entries(categories).map(([id, l]) => (
              <Button
                key={id}
                label={l}
                selected={d.category === id}
                onPress={() => set({ ...d, category: id })}
              />
            ))}
          </View>
          {availableSources.length > 0 && (
            <>
              <Title small>Nguồn mua</Title>
              <View style={s.row}>
                {availableSources.map((x) => (
                  <Button
                    key={x}
                    label={sourceLabel(x)}
                    selected={d.sources.includes(x)}
                    onPress={() => toggle("sources", x)}
                  />
                ))}
              </View>
            </>
          )}
          <Title small>Mức giá (VND)</Title>
          {!hasPriceData && (
            <Body muted>
              Chưa có dữ liệu giá/điều kiện được duyệt; bộ lọc không coi unknown
              là đạt.
            </Body>
          )}
          <View style={s.row}>
            {presets.map(([lo, hi, label]) => (
              <Button
                key={label}
                label={label}
                selected={d.minPrice === lo && d.maxPrice === hi}
                onPress={() => {
                  setError("");
                  set({
                    ...d,
                    minPrice: lo,
                    maxPrice: hi,
                  });
                }}
              />
            ))}
          </View>
          {(["minPrice", "maxPrice"] as const).map((key, i) => (
            <View key={key} style={{ gap: 4 }}>
              <TextInput
                accessibilityLabel={t(i ? "Giá tối đa" : "Giá tối thiểu")}
                placeholder={t(i ? "Giá tối đa" : "Giá tối thiểu")}
                placeholderTextColor={c.onSurfaceVariant}
                keyboardType="number-pad"
                maxLength={12}
                value={d[key]}
                onChangeText={(x) => {
                  setError("");
                  set({ ...d, [key]: x.replace(/[^0-9]/g, "") });
                }}
                style={inputStyle}
              />
              {!!d[key] && Number.isSafeInteger(Number(d[key])) && (
                <Body muted>{vnd(Number(d[key]), "")}</Body>
              )}
            </View>
          ))}
          {!!error && (
            <Text
              accessibilityRole="alert"
              style={{ color: c.error, fontSize: 15, fontWeight: "600" }}
            >
              {t(error)}
            </Text>
          )}
          <Title small>Tình trạng máy</Title>
          <View style={s.row}>
            {(["all", "new", "used"] as const).map((id, i) => (
              <Button
                key={id}
                label={["Tất cả", "Máy mới", "Máy cũ"][i]}
                selected={d.condition === id}
                onPress={() => set({ ...d, condition: id })}
              />
            ))}
          </View>
          <Title small>Hãng sản xuất</Title>
          <View style={s.row}>
            {availableBrands.map((x) => (
              <Button
                key={x}
                label={x}
                selected={d.brands.includes(x)}
                onPress={() => toggle("brands", x)}
              />
            ))}
          </View>
          <Title small>Thông số kỹ thuật</Title>
          <Body>RAM tối thiểu</Body>
          <View style={s.row}>
            {[0, 8, 16, 32].map((n) => (
              <Button
                key={n}
                label={n ? n + " GB" : "Tất cả"}
                selected={d.minRam === n}
                onPress={() => set({ ...d, minRam: n })}
              />
            ))}
          </View>
          <Body>Lưu trữ tối thiểu</Body>
          <View style={s.row}>
            {[0, 256, 512, 1024].map((n) => (
              <Button
                key={n}
                label={n ? n + " GB" : "Tất cả"}
                selected={d.minStorage === n}
                onPress={() => set({ ...d, minStorage: n })}
              />
            ))}
          </View>
          <Button
            label="Card đồ họa rời"
            selected={d.gpu}
            onPress={() => set({ ...d, gpu: !d.gpu })}
          />
          <View style={s.row}>
            <Button
              label="Gọn ≤ 14.5 inch"
              selected={d.maxScreen === 14.5}
              onPress={() =>
                set({ ...d, maxScreen: d.maxScreen ? 0 : 14.5, minScreen: 0 })
              }
            />
            <Button
              label="Rộng ≥ 15 inch"
              selected={d.minScreen === 15}
              onPress={() =>
                set({ ...d, minScreen: d.minScreen ? 0 : 15, maxScreen: 0 })
              }
            />
            <Button
              label="Mỏng nhẹ ≤ 1.5 kg"
              selected={d.maxWeight === 1.5}
              onPress={() => set({ ...d, maxWeight: d.maxWeight ? 0 : 1.5 })}
            />
          </View>
          <Title small>Sắp xếp</Title>
          <View style={s.row}>
            {(["name", "price", "total", "fit"] as const).map((id, i) => (
              <Button
                key={id}
                label={
                  ["Tên A–Z", "Giá niêm yết", "Tổng chi phí", "Độ phù hợp"][i]
                }
                selected={d.sort === id}
                onPress={() => set({ ...d, sort: id })}
              />
            ))}
          </View>
          {d.sort === "fit" && !fitOrder && (
            <Body muted>Chưa có đo kiểm độc lập</Body>
          )}
          <Button
            label="Hiện cấu hình vượt tiêu chí cứng"
            selected={d.showExcluded}
            onPress={() => set({ ...d, showExcluded: !d.showExcluded })}
          />
        </ScrollView>
        <View
          style={[
            s.row,
            {
              padding: 16,
              backgroundColor: c.surfaceContainer,
              justifyContent: "space-between",
            },
          ]}
        >
          <Button
            label="Xóa tất cả bộ lọc"
            onPress={() => {
              setError("");
              set(structuredClone(emptyFilters));
            }}
          />
          <Button
            selected
            label={t("Áp dụng") + " · " + previewCount}
            onPress={() => {
              if (
                d.minPrice &&
                d.maxPrice &&
                Number(d.minPrice) > Number(d.maxPrice)
              ) {
                setError("Khoảng giá không hợp lệ.");
                return;
              }
              onApply(d);
              onClose();
            }}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
