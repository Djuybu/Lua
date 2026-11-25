import React from "react";
import { Text, View } from "react-native";
import type { ProductVariant } from "../catalog";
import { Body } from "../ui";
import { officialOffer, offerTotal, sourceLabel } from "../domain/official";
import { sourceOf } from "../domain/filters";
import { formatObservedAt, vnd } from "../model";
import { useCatalog } from "../catalog-context";
import { useTheme } from "../theme";
import { useLocale } from "../i18n";

export function OfficialPrice({
  variantId,
  variant,
}: {
  variantId: string;
  variant?: ProductVariant;
}) {
  const catalog = useCatalog();
  const { c } = useTheme();
  const { t, locale } = useLocale();
  const offer = officialOffer(catalog, variantId);
  if (offer) {
    return (
      <View style={{ gap: 2 }}>
        <Text
          style={{
            fontSize: 18,
            lineHeight: 24,
            fontWeight: "700",
            color: c.primary,
            fontVariant: ["tabular-nums"],
          }}
        >
          {t("Giá chính thức")}: {vnd(offerTotal(offer), t("Chưa xác định"))}
        </Text>
        <Body muted>
          {sourceLabel(offer.sourceId)} · {formatObservedAt(offer.observedAt, locale)}
        </Body>
      </View>
    );
  }
  const v = variant ?? catalog.variants.find((x) => x.variantId === variantId);
  if (v?.observedPriceVnd != null) {
    const src = sourceLabel(sourceOf(v));
    const observed = v.observedAt ? formatObservedAt(v.observedAt, locale) : "";
    const meta = [t("Chưa gồm phí & vận chuyển"), src, observed]
      .filter(Boolean)
      .join(" · ");
    return (
      <View style={{ gap: 2 }}>
        <Text
          style={{
            fontSize: 17,
            lineHeight: 24,
            fontWeight: "700",
            color: c.onSurface,
            fontVariant: ["tabular-nums"],
          }}
        >
          {t("Giá niêm yết tham khảo")}: {vnd(v.observedPriceVnd, t("Chưa xác định"))}
        </Text>
        <Body muted>{meta}</Body>
      </View>
    );
  }
  return <Body muted>{t("Chưa có giá công bố")}</Body>;
}
