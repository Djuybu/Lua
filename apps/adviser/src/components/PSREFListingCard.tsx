import React from "react";
import { Pressable, Text, View } from "react-native";
import Laptop from "lucide-react-native/icons/laptop";
import Smartphone from "lucide-react-native/icons/smartphone";
import Tablet from "lucide-react-native/icons/tablet";
import Monitor from "lucide-react-native/icons/monitor";
import type { ProductVariant } from "../catalog";
import { useTheme } from "../theme";
import { useLocale } from "../i18n";
import { Body, Button, Chip, s } from "../ui";
import { categories } from "../model";
import { normalizeBrand, sourceOf } from "../domain/filters";
import { sourceLabel } from "../domain/official";
import { OfficialPrice } from "./OfficialPrice";

export function specRows(v: ProductVariant) {
  const x = v.specifications;
  return [
    ["Hãng / Dòng", normalizeBrand(v.brand) + " / " + v.familyId],
    ["CPU", x.cpu],
    ["GPU", x.gpu],
    ["RAM", x.ramGb == null ? null : x.ramGb + " GB"],
    ["Lưu trữ", x.storageGb == null ? null : x.storageGb + " GB"],
    ["Màn hình", x.displayInches ? x.displayInches + " inch" : null],
    ["Pin", x.batteryWattHours ? x.batteryWattHours + " Wh" : null],
    ["Cân nặng", x.weightKg ? x.weightKg + " kg" : null],
    ["HĐH", x.os],
  ];
}

function shortCpu(cpu: string) {
  return cpu.length > 36 ? cpu.slice(0, 35).trimEnd() + "…" : cpu;
}

export function PSREFListingCard({
  variant: v,
  selected,
  compareFull = false,
  onOpen,
  onCompare,
}: {
  variant: ProductVariant;
  selected: boolean;
  compareFull?: boolean;
  onOpen: () => void;
  onCompare: () => void;
}) {
  const { c } = useTheme();
  const { t } = useLocale();
  const Icon =
    v.category === "phone"
      ? Smartphone
      : v.category === "tablet"
        ? Tablet
        : v.category === "pc_desktop"
          ? Monitor
          : Laptop;
  const src = sourceLabel(sourceOf(v));
  const brand = normalizeBrand(v.brand);
  const specs = v.specifications;
  const chips = [
    specs.cpu ? shortCpu(specs.cpu) : null,
    specs.ramGb != null ? `${specs.ramGb} GB RAM` : null,
    specs.storageGb != null ? `${specs.storageGb} GB SSD` : null,
    specs.gpu &&
    /RTX|GTX|Radeon\s*(RX|Pro)|Arc\s*[AB]|Quadro|GeForce\s*MX/i.test(specs.gpu)
      ? shortCpu(specs.gpu)
      : null,
    specs.os && specs.os !== "Chưa xác minh" ? specs.os : null,
  ].filter(Boolean) as string[];

  return (
    <View
      style={[
        s.card,
        {
          backgroundColor: c.surfaceContainerLow,
          flex: 1,
          justifyContent: "space-between",
          gap: 12,
          padding: 18,
        },
      ]}
    >
      <View style={{ gap: 10 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
            <Icon size={18} color={c.primary} />
            {src !== "" && <Chip label={src} tone="primary" />}
            <Body muted>
              {[
                brand,
                v.category === "unknown"
                  ? t("Chưa xác định")
                  : t(categories[v.category]),
              ]
                .filter(Boolean)
                .join(" · ")}
            </Body>
          </View>
          <Button
            quiet={!selected}
            label={selected ? "Đã chọn" : "So sánh"}
            a11yLabel={selected ? "Bỏ chọn so sánh" : "Chọn so sánh"}
            selected={selected}
            disabled={!selected && compareFull}
            onPress={onCompare}
          />
        </View>

        <Pressable
          accessibilityRole="link"
          accessibilityLabel={v.modelName}
          onPress={onOpen}
          style={{ gap: 6 }}
        >
          <Text
            numberOfLines={2}
            style={{
              fontSize: 18,
              lineHeight: 25,
              fontWeight: "600",
              color: c.onSurface,
            }}
          >
            {v.modelName}
          </Text>
          <OfficialPrice variantId={v.variantId} variant={v} />
        </Pressable>

        <View style={s.row}>
          {chips.slice(0, 4).map((chip, idx) => (
            <Chip key={idx} label={chip} tone="neutral" />
          ))}
        </View>
      </View>

      <View style={s.row}>
        <Button label="Xem cấu hình" onPress={onOpen} />
      </View>
    </View>
  );
}
