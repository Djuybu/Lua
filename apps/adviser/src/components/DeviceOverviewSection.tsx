import React from "react";
import { View, Text } from "react-native";
import { Cpu, MemoryStick, Monitor, HardDrive } from "lucide-react-native";
import type { ProductVariant } from "../catalog";
import { useTheme } from "../theme";
import { useLocale } from "../i18n";
import { Body, Notice, s } from "../ui";
export function DeviceOverviewSection({
  variant: v,
}: {
  variant: ProductVariant;
}) {
  const { c } = useTheme();
  const { t } = useLocale();
  return (
    <View style={{ gap: 20 }}>
      <View style={s.row}>
        {[
          [Cpu, "CPU", v.specifications.cpu],
          [MemoryStick, "RAM", v.specifications.ramGb + " GB"],
          [HardDrive, "Lưu trữ", v.specifications.storageGb + " GB"],
          [
            Monitor,
            "Màn hình",
            v.specifications.displayInches
              ? v.specifications.displayInches + " inch"
              : t("Chưa công bố"),
          ],
        ].map(([Icon, label, value]) => {
          const I = Icon as typeof Cpu;
          return (
            <View
              key={label as string}
              style={{
                width: "47%",
                backgroundColor: c.surfaceContainerLow,
                padding: 16,
                borderRadius: 16,
                gap: 8,
              }}
            >
              <I size={24} color={c.primary} />
              <Body muted>{label as string}</Body>
              <Text
                style={{
                  color: c.onSurface,
                  fontSize: 19,
                  lineHeight: 26,
                  fontWeight: "600",
                }}
              >
                {value as string}
              </Text>
            </View>
          );
        })}
      </View>
      <Notice title="Độ phù hợp">Chưa có đo kiểm độc lập</Notice>
      <Body muted>Thông số do nhà bán lẻ công bố.</Body>
    </View>
  );
}
