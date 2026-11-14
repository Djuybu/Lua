export type RetailerOffer = {
  id: string;
  productVariantId: string;
  retailerId: string;
  sellerId: string;
  canonicalUrl: string;
  condition: string;
  warrantyRegion: string;
  priceBasis: "listing" | "complete";
};
export type PriceObservation = {
  id: string;
  offerId: string;
  amount: number;
  currency: "VND";
  availability: "available" | "out_of_stock" | "removed" | "unknown";
  fetchedAt: string;
  sourceUpdatedAt: string | null;
  validationStatus: "valid" | "unreviewed" | "conflict";
  sourceReference: string;
};
export type TrackingRule = {
  id: string;
  candidateId: string;
  status: "off" | "active" | "paused";
  offerScope: string[];
  targetAmount: number | null;
  currency: "VND";
  notificationsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};
export type AlertDelivery = {
  id: string;
  trackingRuleId: string;
  observationId: string;
  alertType: string;
  eventKey: string;
  deliveredAt: string;
};
export function priceComparison(
  baseline: number | null,
  baselineOffer: string | null,
  basis: string,
  current: PriceObservation | null,
  offer: RetailerOffer | null,
  now: number,
) {
  if (
    !current ||
    !offer ||
    current.offerId !== offer.id ||
    current.validationStatus !== "valid" ||
    current.availability !== "available"
  )
    return {
      kind: "unknown" as const,
      delta: null,
      percent: null,
      fresh: false,
    };
  const fresh =
    Number.isFinite(Date.parse(current.fetchedAt)) &&
    now >= Date.parse(current.fetchedAt) &&
    now - Date.parse(current.fetchedAt) < 86400000;
  if (
    current.currency !== "VND" ||
    !Number.isSafeInteger(current.amount) ||
    current.amount < 0
  )
    return {
      kind: "unknown" as const,
      delta: null,
      percent: null,
      fresh: false,
    };
  if (offer.id !== baselineOffer || offer.priceBasis !== basis)
    return {
      kind: "different_offer" as const,
      delta: null,
      percent: null,
      fresh,
    };
  const delta =
    baseline === null || !Number.isSafeInteger(baseline) || baseline < 0
      ? null
      : current.amount - baseline;
  return {
    kind: "same_offer" as const,
    delta,
    percent: baseline && delta !== null ? (delta / baseline) * 100 : null,
    fresh,
  };
}
export function trackingSupported(health: unknown): boolean {
  return (
    !!health &&
    typeof health === "object" &&
    (health as any).capabilities?.priceTracking === true
  );
}
export function targetReached(
  rule: TrackingRule,
  observation: PriceObservation,
  now: number,
) {
  return (
    rule.status === "active" &&
    (rule.offerScope.length === 0 ||
      rule.offerScope.includes(observation.offerId)) &&
    observation.currency === rule.currency &&
    Number.isSafeInteger(observation.amount) &&
    observation.amount >= 0 &&
    rule.targetAmount !== null &&
    observation.validationStatus === "valid" &&
    observation.availability === "available" &&
    now >= Date.parse(observation.fetchedAt) &&
    now - Date.parse(observation.fetchedAt) < 86400000 &&
    observation.amount <= rule.targetAmount
  );
}

export function latestPrice(
  candidate: {
    productVariantId: string;
    savedOfferId: string | null;
    baselineAmount: number | null;
    baselinePriceBasis: string;
  },
  offers: RetailerOffer[],
  observations: PriceObservation[],
  now: number,
) {
  const availableOffers = offers.filter(
    (x) => x.productVariantId === candidate.productVariantId,
  );
  const latest = observations
    .filter(
      (o) =>
        availableOffers.some((x) => x.id === o.offerId) &&
        Number.isFinite(Date.parse(o.fetchedAt)) &&
        Date.parse(o.fetchedAt) <= now,
    )
    .sort((a, b) => Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt));
  const own = latest.find((x) => x.offerId === candidate.savedOfferId);
  const observation = own ?? latest[0] ?? null;
  const offer =
    availableOffers.find((x) => x.id === observation?.offerId) ?? null;
  const comparison = priceComparison(
    candidate.baselineAmount,
    candidate.savedOfferId,
    candidate.baselinePriceBasis,
    observation,
    offer,
    now,
  );
  return { observation, offer, ...comparison };
}
export function alertEventKey(
  rule: TrackingRule,
  observation: PriceObservation,
  now: number,
  delivered: AlertDelivery[],
) {
  const key = rule.id + ":" + observation.id + ":target";
  return targetReached(rule, observation, now) &&
    !delivered.some((x) => x.eventKey === key)
    ? key
    : null;
}
