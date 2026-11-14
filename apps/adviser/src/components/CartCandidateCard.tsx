import React from "react";
import { Text, View, Linking } from "react-native";
import { useLocale } from "../i18n";
import { useTheme } from "../theme";
import { Body, Button, s } from "../ui";
import { vnd, labels } from "../model";
import type { CartCandidate } from "../domain/carts";
import {
  latestPrice,
  type RetailerOffer,
  type PriceObservation,
} from "../domain/price-tracking";
export function CartCandidateCard({
  candidate,
  offers,
  observations,
  selected,
  onSelect,
  onView,
  onTrack,
}: {
  candidate: CartCandidate;
  offers: RetailerOffer[];
  observations: PriceObservation[];
  selected: boolean;
  onSelect: () => void;
  onView: () => void;
  onTrack?: () => void;
}) {
  const { t } = useLocale();
  const { c } = useTheme();
  const current = latestPrice(candidate, offers, observations, Date.now());
  const positive = current.delta !== null && current.delta > 0;
  return (
    <View
      style={{
        gap: 12,
        paddingVertical: 16,
        borderTopWidth: 1,
        borderColor: c.outlineVariant,
      }}
    >
      <Text style={{ fontSize: 19, fontWeight: "600", color: c.onSurface }}>
        {candidate.decisionSnapshot.variant.modelName}
      </Text>
      <Body>
        {candidate.decisionSnapshot.note ||
          candidate.decisionSnapshot.profile?.orderedPurposes
            .map((x) => t(labels[x] ?? "Chưa công bố"))
            .join(", ") ||
          t("Chưa công bố")}
      </Body>
      <Body>
        {t("Giá khi lưu")}: {vnd(candidate.baselineAmount)}
      </Body>
      <Body>
        {current.observation
          ? current.fresh
            ? t("Giá hiện tại")
            : t("Giá kiểm tra gần nhất")
          : t("Giá catalog mới nhất")}
        :{" "}
        {current.observation && current.kind !== "unknown"
          ? vnd(current.observation.amount)
          : t("Chưa kiểm tra giá")}
      </Body>
      {current.observation && (
        <>
          <Body muted>
            {current.observation.fetchedAt} · {current.offer?.retailerId} ·{" "}
            {current.observation.availability}
          </Body>
          {current.kind === "same_offer" && current.delta !== null && (
            <Body>
              {positive ? "+" : ""}
              {vnd(current.delta)}
              {current.percent !== null
                ? " (" +
                  (positive ? "+" : "") +
                  current.percent.toFixed(1) +
                  "%)"
                : ""}
            </Body>
          )}
          {current.kind === "different_offer" &&
            current.fresh &&
            candidate.baselineCurrency === current.observation.currency &&
            candidate.baselinePriceBasis !== "unknown" &&
            candidate.baselinePriceBasis === current.offer?.priceBasis &&
            candidate.baselineAmount !== null &&
            current.observation.amount < candidate.baselineAmount && (
              <Body>Ưu đãi tốt hơn</Body>
            )}
          {current.kind !== "unknown" && (
            <Body muted>
              {current.offer?.priceBasis === "listing"
                ? "Giá niêm yết"
                : "Tổng chi phí"}
            </Body>
          )}
        </>
      )}
      <Body muted>{candidate.savedAt}</Body>
      <View style={s.row}>
        {onTrack && <Button label="Theo dõi giá" onPress={onTrack} />}
        <Button label="Xem cấu hình" onPress={onView} />
        <Button label="Chọn so sánh" selected={selected} onPress={onSelect} />
        {current.offer?.canonicalUrl.startsWith("https://") &&
          current.kind !== "unknown" &&
          current.observation?.availability === "available" && (
            <Button
              label="Đến cửa hàng"
              onPress={() => void Linking.openURL(current.offer!.canonicalUrl)}
            />
          )}
      </View>
    </View>
  );
}
