import type { CartData } from "./carts";
import {
  record,
  text,
  id,
  amount,
  date,
  url,
  strings,
  uniqueIds,
} from "./validation";

/** Client persistence integrity only; this is not a backend DTO validator. */
export function validPriceData(value: unknown, cartData: CartData): boolean {
  if (
    !record(value) ||
    ![
      value.offers,
      value.observations,
      value.trackingRules,
      value.alertDeliveries,
    ].every(Array.isArray)
  )
    return false;
  const { offers, observations, trackingRules, alertDeliveries } = value;
  if (
    !offers.every(
      (o: any) =>
        record(o) &&
        [o.id, o.productVariantId, o.retailerId, o.sellerId].every(id) &&
        url(o.canonicalUrl) &&
        text(o.condition) &&
        text(o.warrantyRegion) &&
        ["listing", "complete"].includes(o.priceBasis),
    ) ||
    !uniqueIds(offers)
  )
    return false;
  if (
    !observations.every(
      (o: any) =>
        record(o) &&
        id(o.id) &&
        id(o.offerId) &&
        offers.some((x: any) => x.id === o.offerId) &&
        amount(o.amount) &&
        o.currency === "VND" &&
        ["available", "out_of_stock", "removed", "unknown"].includes(
          o.availability,
        ) &&
        ["valid", "unreviewed", "conflict"].includes(o.validationStatus) &&
        date(o.fetchedAt) &&
        (o.sourceUpdatedAt === null || date(o.sourceUpdatedAt)) &&
        id(o.sourceReference),
    ) ||
    !uniqueIds(observations)
  )
    return false;
  // A baseline may refer to a historical offer no longer present. If retained,
  // however, it must belong to that exact configuration.
  if (
    !cartData.candidates.every(
      (c) =>
        !c.savedOfferId ||
        !offers.some(
          (o: any) =>
            o.id === c.savedOfferId &&
            o.productVariantId !== c.productVariantId,
        ),
    )
  )
    return false;
  if (
    !trackingRules.every(
      (r: any) =>
        record(r) &&
        id(r.id) &&
        id(r.candidateId) &&
        cartData.candidates.some((c) => c.id === r.candidateId) &&
        ["off", "active", "paused"].includes(r.status) &&
        strings(r.offerScope) &&
        new Set(r.offerScope).size === r.offerScope.length &&
        r.offerScope.every((offerId: string) =>
          offers.some(
            (o: any) =>
              o.id === offerId &&
              o.productVariantId ===
                cartData.candidates.find((c) => c.id === r.candidateId)!
                  .productVariantId,
          ),
        ) &&
        (r.targetAmount === null || amount(r.targetAmount)) &&
        r.currency === "VND" &&
        typeof r.notificationsEnabled === "boolean" &&
        date(r.createdAt) &&
        date(r.updatedAt) &&
        Date.parse(r.updatedAt) >= Date.parse(r.createdAt),
    ) ||
    !uniqueIds(trackingRules)
  )
    return false;
  if (
    !alertDeliveries.every((d: any) => {
      if (
        !record(d) ||
        ![
          d.id,
          d.trackingRuleId,
          d.observationId,
          d.alertType,
          d.eventKey,
        ].every(id) ||
        !date(d.deliveredAt)
      )
        return false;
      const rule = trackingRules.find((r: any) => r.id === d.trackingRuleId);
      const observation = observations.find(
        (o: any) => o.id === d.observationId,
      );
      if (!rule || !observation) return false;
      const candidate = cartData.candidates.find(
        (c) => c.id === rule.candidateId,
      )!;
      return offers.some(
        (o: any) =>
          o.id === observation.offerId &&
          o.productVariantId === candidate.productVariantId,
      );
    }) ||
    !uniqueIds(alertDeliveries) ||
    new Set(alertDeliveries.map((d: any) => d.eventKey)).size !==
      alertDeliveries.length
  )
    return false;
  return true;
}
