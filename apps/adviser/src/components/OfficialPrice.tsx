import React from "react";
import { Body } from "../ui";
import { officialOffer, offerTotal, sourceLabel } from "../domain/official";
import { vnd } from "../model";
import { useCatalog } from "../catalog-context";
export function OfficialPrice({ variantId }: { variantId: string }) {
  const catalog = useCatalog();
  const offer = officialOffer(catalog, variantId);
  if (!offer) return <Body>Chưa có giá trọn gói đã xác minh</Body>;
  return (
    <>
      <Body>Giá chính thức: {vnd(offerTotal(offer))}</Body>
      <Body muted>
        {sourceLabel(offer.sourceId)} · {offer.observedAt}
      </Body>
    </>
  );
}
