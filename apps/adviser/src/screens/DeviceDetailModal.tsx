import { OfficialPrice } from "../components/OfficialPrice";
import { OfficialExplanation } from "../components/OfficialExplanation";
import type { ConfirmedNeedsProfile } from "../model";
import React, { useEffect, useState } from "react";
import { Modal, ScrollView, View, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ProductVariant } from "../catalog";
import { useTheme } from "../theme";
import { Body, Button, Title, Notice, s } from "../ui";
import { DeviceSpecsSection } from "../components/DeviceSpecsSection";
import { DeviceOverviewSection } from "../components/DeviceOverviewSection";
import provenance from "../provenance.json";
export function DeviceDetailModal({
  variant,
  variants,
  onClose,
  onVariant,
  onCompare,
  onAdd,
  historical = false,
  profile = null,
  revision = 0,
  offline = true,
  explanationEndpoint,
}: {
  variant: ProductVariant | null;
  variants: ProductVariant[];
  onClose: () => void;
  onVariant: (v: ProductVariant) => void;
  onCompare: (v: ProductVariant) => void;
  onAdd: (v: ProductVariant) => void;
  explanationEndpoint?: string;
  historical?: boolean;
  profile?: ConfirmedNeedsProfile | null;
  revision?: number;
  offline?: boolean;
}) {
  const { c } = useTheme();
  const [tab, setTab] = useState(0);
  useEffect(() => setTab(0), [variant?.variantId]);
  return (
    <Modal visible={!!variant} animationType="none" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
        <ScrollView
          contentContainerStyle={{
            padding: 24,
            gap: 24,
            maxWidth: 800,
            width: "100%",
            alignSelf: "center",
          }}
        >
          {variant && (
            <>
              <View style={s.row}>
                <Button quiet label="Đóng" onPress={onClose} />
                <Body muted>
                  {historical ? "Bản lưu lịch sử" : "Thông số tham khảo"}
                </Body>
              </View>
              <Title small>{variant.modelName}</Title>
              {!historical && <OfficialPrice variantId={variant.variantId} />}
              {!historical && (
                <OfficialExplanation
                  endpoint={explanationEndpoint}
                  variantId={variant.variantId}
                  profile={profile}
                  revision={revision}
                  offline={offline}
                />
              )}
              <View style={s.row}>
                {["Tổng quan", "Thông số", "Nguồn & chi phí"].map((l, i) => (
                  <Button
                    key={l}
                    label={l}
                    selected={i === tab}
                    onPress={() => setTab(i)}
                  />
                ))}
              </View>
              {tab === 0 && <DeviceOverviewSection variant={variant} />}{" "}
              {tab === 1 && <DeviceSpecsSection variant={variant} />}{" "}
              {tab === 2 && (
                <>
                  {!historical && (
                    <OfficialPrice variantId={variant.variantId} />
                  )}
                  {provenance.variants
                    .filter((x) => x.variantId === variant.variantId)
                    .map((x) => (
                      <View key={x.variantId} style={{ gap: 12 }}>
                        <Body>{x.sourceUrl}</Body>
                        <Body muted>{x.observedAt}</Body>
                        <Button
                          label="Mở nguồn thông số"
                          onPress={() => Linking.openURL(x.sourceUrl)}
                        />
                      </View>
                    ))}
                  <Body muted>Không phải giá hiện tại.</Body>
                </>
              )}
              <Title small>Cấu hình cùng dòng</Title>
              {variants.filter(
                (v) =>
                  v.familyId === variant.familyId &&
                  v.variantId !== variant.variantId,
              ).length ? (
                variants
                  .filter(
                    (v) =>
                      v.familyId === variant.familyId &&
                      v.variantId !== variant.variantId,
                  )
                  .map((v) => (
                    <Button
                      key={v.variantId}
                      label={v.modelName}
                      onPress={() => onVariant(v)}
                    />
                  ))
              ) : (
                <Body muted>Chưa có cấu hình cùng dòng khác.</Body>
              )}
              <View style={s.row}>
                <Button label="So sánh" onPress={() => onCompare(variant)} />
                <Button
                  selected
                  label="Thêm vào giỏ"
                  onPress={() => onAdd(variant)}
                />
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
