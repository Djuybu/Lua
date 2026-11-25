import React from "react";
import { Text, View } from "react-native";
import { useLocale } from "../i18n";
import { useTheme } from "../theme";
import { Body, Button, s } from "../ui";
import {
  formatObservedAt,
  labels,
  safeExternalUrl,
  vnd,
} from "../model";
import { openExternalUrl } from "../utils/share";
import { sourceLabel } from "../domain/official";
import type { CartCandidate } from "../domain/carts";
import {
  latestPrice,
  type RetailerOffer,
  type PriceObservation,
} from "../domain/price-tracking";

const AVAILABILITY_LABELS: Record<string, string> = {
  available: "Còn hàng",
  out_of_stock: "Hết hàng",
  removed: "Ngừng kinh doanh",
  unknown: "Chưa xác định",
};

export function CartCandidateCard({
  candidate,
  offers,
  observations,
  selected,
  selectDisabled = false,
  onSelect,
  onView,
  onTrack,
  onRemove,
  now = Date.now(),
}: {
  candidate: CartCandidate;
  offers: RetailerOffer[];
  observations: PriceObservation[];
  selected: boolean;
  selectDisabled?: boolean;
  onSelect: () => void;
  onView: () => void;
  onTrack?: () => void;
  onRemove?: () => void;
  now?: number;
}) {
  const { t, locale } = useLocale();
  const { c } = useTheme();
  const current = latestPrice(candidate, offers, observations, now);
  const positive = current.delta !== null && current.delta > 0;
  const externalUrl = safeExternalUrl(current.offer?.canonicalUrl);
  return (
    <View
      style={{
        gap: 10,
        paddingVertical: 16,
        borderTopWidth: 1,
        borderColor: c.outlineVariant,
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: "600", color: c.onSurface }}>
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
        {t("Giá khi lưu")}: {vnd(candidate.baselineAmount, t("Chưa xác định"))}
      </Body>
      <Body>
        {current.observation
          ? current.fresh
            ? t("Giá hiện tại")
            : t("Giá kiểm tra gần nhất")
          : t("Giá catalog mới nhất")}
        :{" "}
        {current.observation && current.kind !== "unknown"
          ? vnd(current.observation.amount, t("Chưa xác định"))
          : t("Chưa kiểm tra giá")}
      </Body>
      {current.observation && (
        <>
          <Body muted>
            {formatObservedAt(current.observation.fetchedAt, locale)}
            {current.offer?.retailerId
              ? " · " + sourceLabel(current.offer.retailerId)
              : ""}
            {" · "}
            {t(
              AVAILABILITY_LABELS[current.observation.availability] ??
                "Chưa xác định",
            )}
          </Body>
          {current.kind === "same_offer" && current.delta !== null && (
            <Body>
              {positive ? "+" : ""}
              {vnd(current.delta, t("Chưa xác định"))}
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
                ? t("Giá niêm yết")
                : t("Tổng chi phí")}
            </Body>
          )}
        </>
      )}
      <Body muted>
        {t("Đã lưu")}: {formatObservedAt(candidate.savedAt, locale)}
      </Body>
      <View style={s.row}>
        {onTrack && <Button label="Theo dõi giá" onPress={onTrack} />}
        <Button label="Xem cấu hình" onPress={onView} />
        <Button
          label={selected ? "Bỏ chọn" : "Chọn so sánh"}
          selected={selected}
          disabled={!selected && selectDisabled}
          onPress={onSelect}
        />
        {externalUrl &&
          current.kind !== "unknown" &&
          current.observation?.availability === "available" && (
            <Button
              label="Đến cửa hàng"
              onPress={() => void openExternalUrl(externalUrl)}
            />
          )}
        {onRemove && (
          <Button quiet label="Xóa khỏi giỏ" onPress={onRemove} />
        )}
      </View>
    </View>
  );
}
