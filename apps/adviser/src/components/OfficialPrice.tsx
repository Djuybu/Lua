import type { SnapshotManifest } from "../catalog";
import React from "react";
import { Body } from "../ui";
import { officialOffer, offerTotal, sourceLabel } from "../domain/official";
import { vnd } from "../model";
import seed from "../catalog.json";
export function OfficialPrice({ variantId }: { variantId: string }) {
  const offer = officialOffer(seed as SnapshotManifest, variantId);
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
