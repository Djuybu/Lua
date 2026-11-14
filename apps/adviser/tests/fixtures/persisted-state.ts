import { empty, type State } from "../../src/storage";
import { addCandidates } from "../../src/domain/carts";
import seed from "../../src/catalog.json";
import type { ProductVariant } from "../../src/catalog";

/** Synthetic local persistence only. Never imported by the production entry. */
export function persistedFixture(): State {
  const at = "2026-11-14T10:00:00Z";
  const state = structuredClone(empty);
  state.cartData = addCandidates(
    state.cartData,
    {
      id: "cart",
      title: "Synthetic comparison",
      useCase: "Regression",
      budget: null,
      currency: "VND",
      decisionNote: "Synthetic local only",
      createdAt: at,
      updatedAt: at,
      archivedAt: null,
    },
    [seed.variants[0] as ProductVariant],
    null,
    "fixture",
    at,
  );
  const candidate = state.cartData.candidates[0];
  candidate.savedOfferId = "historical-offer";
  candidate.baselineAmount = 100;
  candidate.baselinePriceBasis = "complete";
  state.offers = [
    {
      id: "current-offer",
      productVariantId: candidate.productVariantId,
      retailerId: "fixture",
      sellerId: "fixture",
      canonicalUrl: "https://example.com/synthetic",
      condition: "new",
      warrantyRegion: "VN",
      priceBasis: "listing",
    },
  ];
  state.observations = [
    {
      id: "observation",
      offerId: "current-offer",
      amount: 90,
      currency: "VND",
      availability: "available",
      fetchedAt: at,
      sourceUpdatedAt: null,
      validationStatus: "valid",
      sourceReference: "synthetic-local",
    },
  ];
  state.trackingRules = [
    {
      id: "rule",
      candidateId: candidate.id,
      status: "off",
      offerScope: ["current-offer"],
      targetAmount: null,
      currency: "VND",
      notificationsEnabled: false,
      createdAt: at,
      updatedAt: at,
    },
  ];
  state.alertDeliveries = [
    {
      id: "delivery",
      trackingRuleId: "rule",
      observationId: "observation",
      alertType: "target",
      eventKey: "rule:observation:target",
      deliveredAt: at,
    },
  ];
  return state;
}

export const corruptions: Record<string, (state: any) => void> = {
  "missing cart fields": (s) => {
    s.cartData.carts = [
      { id: "a", title: "A", currency: "VND", budget: null },
      { id: "b", title: "B", currency: "VND", budget: null },
    ];
    s.cartData.candidates = [];
    s.trackingRules = [];
    s.alertDeliveries = [];
  },
  "null offer": (s) => {
    s.offers = [null];
  },
  "missing snapshot specifications": (s) => {
    delete s.cartData.candidates[0].decisionSnapshot.variant.specifications;
  },
};
