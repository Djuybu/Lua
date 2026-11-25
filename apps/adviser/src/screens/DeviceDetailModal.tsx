import { OfficialPrice } from "../components/OfficialPrice";
import { OfficialExplanation } from "../components/OfficialExplanation";
import type { ConfirmedNeedsProfile } from "../model";
import { formatObservedAt, safeExternalUrl, vnd } from "../model";
import { openExternalUrl } from "../utils/share";
import React, { useEffect, useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ProductVariant } from "../catalog";
import { useTheme } from "../theme";
import { useLocale } from "../i18n";
import { Body, Button, Chip, Title, s } from "../ui";
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
  selected = false,
  compareFull = false,
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
  selected?: boolean;
  compareFull?: boolean;
  historical?: boolean;
  profile?: ConfirmedNeedsProfile | null;
  revision?: number;
  offline?: boolean;
  explanationEndpoint?: string;
}) {
  const { c } = useTheme();
  const { t, locale } = useLocale();
  const [tab, setTab] = useState(0);
  useEffect(() => {
    setTab(0);
  }, [variant?.variantId]);

  if (!variant) return null;

  const provenanceMatches = provenance.variants.filter(
    (x) => x.variantId === variant.variantId && x.sourceUrl !== variant.sourceUrl,
  );
  const retailerUrl = safeExternalUrl(variant.sourceUrl);
  const siblings = variants.filter(
    (v) => v.familyId === variant.familyId && v.variantId !== variant.variantId,
  );

  return (
    <Modal visible animationType="none" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 14,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderColor: c.outlineVariant,
            maxWidth: 720,
            width: "100%",
            alignSelf: "center",
            gap: 10,
          }}
        >
          <View style={{ ...s.row, justifyContent: "space-between" }}>
            {historical ? (
              <Chip label="Bản lưu lịch sử" tone="primary" />
            ) : (
              <View />
            )}
            <Button quiet label="Đóng" onPress={onClose} />
          </View>
          <Title small>{variant.modelName}</Title>
          {!historical && (
            <OfficialPrice variantId={variant.variantId} variant={variant} />
          )}
          <View style={s.row}>
            {["Tổng quan", "Thông số", "Nguồn & chi phí", "Tư vấn AI"].map(
              (l, i) => (
                <Button
                  key={l}
                  label={l}
                  selected={i === tab}
                  onPress={() => setTab(i)}
                />
              ),
            )}
          </View>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 20,
            gap: 20,
            maxWidth: 720,
            width: "100%",
            alignSelf: "center",
          }}
        >
          {tab === 0 && <DeviceOverviewSection variant={variant} />}
          {tab === 1 && <DeviceSpecsSection variant={variant} />}
          {tab === 2 && (
            <View style={{ gap: 16 }}>
              {!historical && (
                <OfficialPrice variantId={variant.variantId} variant={variant} />
              )}
              {retailerUrl && (
                <View style={{ gap: 8 }}>
                  {variant.observedPriceVnd != null && (
                    <Body>
                      {t("Giá niêm yết tham khảo")}:{" "}
                      {vnd(variant.observedPriceVnd, t("Chưa xác định"))}
                    </Body>
                  )}
                  {!!variant.observedAt && (
                    <Body muted>
                      {t("Thời điểm quan sát")}:{" "}
                      {formatObservedAt(variant.observedAt, locale)}
                    </Body>
                  )}
                  <Button
                    label="Mở trang nhà bán lẻ"
                    onPress={() => void openExternalUrl(retailerUrl)}
                  />
                </View>
              )}
              {provenanceMatches.map((x) => (
                <View key={x.variantId + x.sourceUrl} style={{ gap: 10 }}>
                  <Body>{x.sourceUrl}</Body>
                  <Body muted>{formatObservedAt(x.observedAt, locale)}</Body>
                  <Button
                    label="Mở nguồn thông số"
                    onPress={() => void openExternalUrl(x.sourceUrl)}
                  />
                </View>
              ))}
              {!retailerUrl && provenanceMatches.length === 0 && (
                <Body muted>Chưa có liên kết nguồn bán lẻ đã xác minh.</Body>
              )}
              <Body muted>
                Giá tại thời điểm thu thập; cần xác nhận lại tồn kho và tổng
                chi phí.
              </Body>
            </View>
          )}
          {tab === 3 && (
            <OfficialExplanation
              variantId={variant.variantId}
              profile={profile}
              revision={revision}
              offline={offline}
              endpoint={explanationEndpoint}
            />
          )}

          <Title small>Cấu hình cùng dòng</Title>
          {siblings.length > 0 ? (
            siblings.map((v) => (
              <Button
                key={v.variantId}
                label={v.modelName}
                onPress={() => onVariant(v)}
              />
            ))
          ) : (
            <Body muted>Chưa có cấu hình cùng dòng khác.</Body>
          )}
        </ScrollView>

        <View
          style={{
            padding: 16,
            backgroundColor: c.surfaceContainer,
            borderTopWidth: 1,
            borderColor: c.outlineVariant,
          }}
        >
          <View
            style={{
              ...s.row,
              maxWidth: 720,
              width: "100%",
              alignSelf: "center",
            }}
          >
            <Button
              label={selected ? "Bỏ chọn" : "So sánh"}
              selected={selected}
              disabled={!selected && compareFull}
              onPress={() => onCompare(variant)}
            />
            <Button
              label="Thêm vào giỏ"
              variant="primary"
              onPress={() => onAdd(variant)}
            />
            {retailerUrl && (
              <Button
                quiet
                label="Mở trang nhà bán lẻ"
                onPress={() => void openExternalUrl(retailerUrl)}
              />
            )}
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
