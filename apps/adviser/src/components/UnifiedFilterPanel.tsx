import React, { useEffect, useState } from "react";
import { Modal, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { useLocale } from "../i18n";
import { Body, Button, Title, s } from "../ui";
import {
  emptyFilters,
  filterVariants,
  sourceOf,
  type Filters,
} from "../domain/filters";
import type { ProductVariant } from "../catalog";
import { categories } from "../model";
export function UnifiedFilterPanel({
  visible,
  metadata = {},
  value,
  variants,
  query,
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
  }, [visible]);
  const toggle = (key: "sources" | "brands", x: string) =>
    set({
      ...d,
      [key]: d[key].includes(x)
        ? d[key].filter((a) => a !== x)
        : [...d[key], x],
    });
  const input = [s.input, { color: c.onSurface, borderColor: c.outline }];
  return (
    <Modal visible={visible} animationType="none" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 24,
            gap: 20,
            maxWidth: 720,
            width: "100%",
            alignSelf: "center",
          }}
        >
          <Title>Bộ lọc tổng</Title>
          <Button quiet label="Hủy" onPress={onClose} />
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
          <Title small>Nguồn mua</Title>
          <View style={s.row}>
            {[...new Set(variants.map(sourceOf))].map((x) => (
              <Button
                key={x}
                label={x}
                selected={d.sources.includes(x)}
                onPress={() => toggle("sources", x)}
              />
            ))}
          </View>
          <Title small>Mức giá (VND)</Title>
          <Body muted>
            Chưa có dữ liệu giá/điều kiện được duyệt; bộ lọc không coi unknown
            là đạt.
          </Body>
          <View style={s.row}>
            {[
              [0, 15000000],
              [15000000, 20000000],
              [20000000, 30000000],
              [30000000, 0],
            ].map(([lo, hi]) => (
              <Button
                key={lo}
                label={hi ? lo / 1e6 + "–" + hi / 1e6 + " triệu" : ">30 triệu"}
                onPress={() =>
                  set({
                    ...d,
                    minPrice: String(lo),
                    maxPrice: hi ? String(hi) : "",
                  })
                }
              />
            ))}
          </View>
          {(["minPrice", "maxPrice"] as const).map((key, i) => (
            <TextInput
              key={key}
              accessibilityLabel={t(i ? "Giá tối đa" : "Giá tối thiểu")}
              placeholder={t(i ? "Giá tối đa" : "Giá tối thiểu")}
              placeholderTextColor={c.onSurfaceVariant}
              keyboardType="number-pad"
              value={d[key] ? Number(d[key]).toLocaleString("vi-VN") : ""}
              onChangeText={(x) =>
                set({ ...d, [key]: x.replace(/[^0-9]/g, "") })
              }
              style={input}
            />
          ))}
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
            {[...new Set(variants.map((x) => x.brand))].map((x) => (
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
          <Body muted>
            {d.sort === "name" ? "" : t("Chưa có đo kiểm độc lập")}
          </Body>
          <Button
            label="Hiện cấu hình vượt tiêu chí cứng"
            selected={d.showExcluded}
            onPress={() => set({ ...d, showExcluded: !d.showExcluded })}
          />
          {!!error && <Body>{error}</Body>}
        </ScrollView>
        <View
          style={[s.row, { padding: 16, backgroundColor: c.surfaceContainer }]}
        >
          <Button
            label="Xóa tất cả bộ lọc"
            onPress={() => set(structuredClone(emptyFilters))}
          />
          <Button
            selected
            label={
              t("Áp dụng") +
              " · " +
              filterVariants(variants, d, query, metadata).length
            }
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
