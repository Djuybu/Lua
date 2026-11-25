import React from "react";
import { View, Text } from "react-native";
import Cpu from "lucide-react-native/icons/cpu";
import MemoryStick from "lucide-react-native/icons/memory-stick";
import Monitor from "lucide-react-native/icons/monitor";
import HardDrive from "lucide-react-native/icons/hard-drive";
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
  const items = [
    {
      Icon: Cpu,
      label: "CPU",
      value: v.specifications.cpu || t("Chưa công bố"),
      wide: true,
    },
    {
      Icon: MemoryStick,
      label: "RAM",
      value:
        v.specifications.ramGb == null
          ? t("Chưa xác minh")
          : v.specifications.ramGb + " GB",
      wide: false,
    },
    {
      Icon: HardDrive,
      label: "Lưu trữ",
      value:
        v.specifications.storageGb == null
          ? t("Chưa xác minh")
          : v.specifications.storageGb + " GB",
      wide: false,
    },
    {
      Icon: Monitor,
      label: "Màn hình",
      value: v.specifications.displayInches
        ? v.specifications.displayInches + " inch"
        : t("Chưa công bố"),
      wide: false,
    },
  ];
  return (
    <View style={{ gap: 20 }}>
      <View style={s.row}>
        {items.map(({ Icon, label, value, wide }) => (
          <View
            key={label}
            style={{
              width: wide ? "100%" : undefined,
              flexGrow: wide ? 0 : 1,
              flexBasis: wide ? "100%" : "46%",
              backgroundColor: c.surfaceContainerLow,
              padding: 16,
              borderRadius: 16,
              gap: 6,
            }}
          >
            <Icon size={22} color={c.primary} />
            <Body muted>{label}</Body>
            <Text
              style={{
                color: c.onSurface,
                fontSize: wide ? 17 : 19,
                lineHeight: 25,
                fontWeight: "600",
              }}
            >
              {value}
            </Text>
          </View>
        ))}
      </View>
      <Notice title="Độ phù hợp">Chưa có đo kiểm độc lập</Notice>
      <Body muted>Thông số do nhà bán lẻ công bố.</Body>
    </View>
  );
}
