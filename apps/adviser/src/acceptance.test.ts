import { test } from "node:test";
import assert from "node:assert/strict";
import { importSaved, addCandidates } from "./domain/carts";
import { priceComparison, trackingSupported } from "./domain/price-tracking";
import { winners } from "./utils/comparison-semantics";
import { emptyFilters, filterVariants } from "./domain/filters";
import { pricingMetadata } from "./domain/filters";
import seed from "./catalog.json";
import type { Saved } from "./storage";
test("AC-CART migration is idempotent and preserves exact saved snapshots", () => {
  const saved = {
    id: "old",
    at: "2026-11-10",
    variants: seed.variants.slice(0, 1),
    profile: null,
    catalogVersion: "old",
  } as Saved;
  const first = importSaved([saved]);
  assert.deepEqual(importSaved([saved], first), first);
  assert.equal(first.candidates[0].baselineAmount, null);
  assert.deepEqual(
    first.candidates[0].decisionSnapshot.variant,
    saved.variants[0],
  );
  assert.equal(first.carts[0].title, "Quyết định đã nhập");
});
test("AC-CART dedup does not merge different configurations", () => {
  const c = {
    id: "c",
    title: "Work",
    useCase: "",
    budget: null,
    currency: "VND",
    decisionNote: "Original reason",
    createdAt: "now",
    updatedAt: "now",
    archivedAt: null,
  } as const;
  let data = addCandidates(
    { carts: [], candidates: [], legacyMap: {} },
    c,
    seed.variants.slice(0, 2) as any,
    null,
    "v",
    "now",
  );
  data = addCandidates(
    data,
    c,
    seed.variants.slice(0, 1) as any,
    null,
    "v",
    "later",
  );
  assert.equal(data.candidates.length, 2);
  assert.equal(data.candidates[0].decisionSnapshot.note, "Original reason");
});
test("AC-PRICE unknown/baseline0/different offer have no invented delta", () => {
  assert.equal(
    priceComparison(null, null, "unknown", null, null, 0).delta,
    null,
  );
  assert.equal(
    trackingSupported({ capabilities: { priceTracking: "true" } }),
    false,
  );
  assert.equal(
    trackingSupported({ capabilities: { priceTracking: true } }),
    true,
  );
});
test("AC-COMPARE ties, unknown and neutral fields never imply winners", () => {
  assert.deepEqual(winners([16, 16], "higher"), []);
  assert.deepEqual(winners([16, null], "higher"), []);
  assert.deepEqual(winners([16, 32], "higher"), [1]);
  assert.deepEqual(winners([1.2, 2], "lower"), [0]);
  assert.deepEqual(winners([13, 16], "neutral"), []);
});
test("AC-FILTER unknown price/condition/weight do not pass strict filters", () => {
  const unknownMetadata = [
    {
      ...seed.variants[0],
      specifications: {
        ...seed.variants[0]!.specifications,
        ramGb: 16,
        weightKg: undefined,
      },
    },
  ] as any;
  assert.equal(
    filterVariants(
      unknownMetadata,
      { ...emptyFilters, minPrice: "100" },
      "",
    ).length,
    0,
  );
  assert.equal(
    filterVariants(
      unknownMetadata,
      { ...emptyFilters, condition: "new" },
      "",
    ).length,
    0,
  );
  assert.equal(
    filterVariants(unknownMetadata, { ...emptyFilters, maxWeight: 2 }, "")
      .length,
    0,
  );
  assert.equal(
    filterVariants(unknownMetadata, { ...emptyFilters, minRam: 32 }, "")
      .length,
    0,
  );
});

import { createStore, empty } from "./storage";
import {
  latestPrice,
  targetReached,
  alertEventKey,
  type RetailerOffer,
  type PriceObservation,
  type TrackingRule,
} from "./domain/price-tracking";
import { probeCapabilities } from "./api/capabilities";
import { recordError, diagnosticReport } from "./utils/error-logger";
const now = Date.parse("2026-11-14T12:00:00Z");
const offer: RetailerOffer = {
  id: "o",
  productVariantId: "v",
  retailerId: "r",
  sellerId: "r",
  canonicalUrl: "https://example.com",
  condition: "new",
  warrantyRegion: "VN",
  priceBasis: "listing",
};
const observation: PriceObservation = {
  id: "p",
  offerId: "o",
  amount: 18000000,
  currency: "VND",
  availability: "available",
  fetchedAt: "2026-11-14T11:00:00Z",
  sourceUpdatedAt: null,
  validationStatus: "valid",
  sourceReference: "fixture",
};
test("AC-PRICE immutable baseline, signed delta and 24h freshness", () => {
  const x = priceComparison(20000000, "o", "listing", observation, offer, now);
  assert.equal(x.delta, -2000000);
  assert.equal(x.percent, -10);
  assert.equal(x.fresh, true);
  assert.equal(
    priceComparison(
      20000000,
      "o",
      "listing",
      { ...observation, fetchedAt: "2026-11-13T11:00:00Z" },
      offer,
      now,
    ).fresh,
    false,
  );
  assert.equal(
    priceComparison(0, "o", "listing", observation, offer, now).percent,
    null,
  );
  assert.equal(
    priceComparison(20000000, "other", "listing", observation, offer, now)
      .delta,
    null,
  );
});
test("AC-PRICE latest exact variant only and target dedup", () => {
  const c = {
    productVariantId: "v",
    savedOfferId: "o",
    baselineAmount: 20000000,
    baselinePriceBasis: "listing",
  };
  assert.equal(
    latestPrice(
      c,
      [{ ...offer, productVariantId: "wrong" }],
      [observation],
      now,
    ).observation,
    null,
  );
  const rule: TrackingRule = {
    id: "r",
    candidateId: "c",
    status: "active",
    offerScope: ["o"],
    targetAmount: 19000000,
    currency: "VND",
    notificationsEnabled: true,
    createdAt: "",
    updatedAt: "",
  };
  assert.equal(targetReached(rule, observation, now), true);
  assert.equal(
    targetReached(rule, { ...observation, availability: "out_of_stock" }, now),
    false,
  );
  const key = alertEventKey(rule, observation, now, []);
  assert.equal(key, "r:p:target");
  assert.equal(
    alertEventKey(rule, observation, now, [
      {
        id: "a",
        trackingRuleId: "r",
        observationId: "p",
        alertType: "target",
        eventKey: key!,
        deliveredAt: "",
      },
    ]),
    null,
  );
});
test("AC-MIGRATE v1 atomic write retains recovery copy and no duplicate restart", async () => {
  const old = {
    version: 1,
    preferences: empty.preferences,
    confirmed: null,
    revision: 0,
    saved: [
      {
        id: "old",
        at: "2026-11-10T00:00:00Z",
        variants: seed.variants.slice(0, 1),
        profile: null,
        catalogVersion: "old",
        groupName: "Work",
        decisionNote: "Original",
        baselineAmount: 123,
        savedOfferId: "o",
        baselinePriceBasis: "listing",
      },
    ],
  };
  let raw = JSON.stringify(old);
  let writes = 0;
  const io = {
    getItem: async () => raw,
    setItem: async (_: string, v: string) => {
      writes++;
      raw = v;
    },
  };
  const state = await createStore(io).load();
  assert.equal(state.version, 2);
  assert.equal(state.legacyRaw, JSON.stringify(old));
  assert.equal(state.cartData.carts[0].title, "Work");
  assert.equal(state.cartData.candidates[0].baselineAmount, 123);
  assert.equal(state.trackingRules[0].status, "off");
  await createStore(io).load();
  assert.equal(writes, 1);
});
test("AC-MIGRATE failure preserves original raw and write-lock", async () => {
  let raw = JSON.stringify({
    version: 1,
    preferences: empty.preferences,
    confirmed: null,
    revision: 0,
    saved: [],
  });
  const before = raw;
  const store = createStore({
    getItem: async () => raw,
    setItem: async () => {
      throw Error("disk");
    },
  });
  await assert.rejects(store.load());
  await assert.rejects(store.update((x) => x));
  assert.equal(raw, before);
});
test("AC-HEALTH capability is explicit and endpoint is health only", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.equal(url, "https://example.com/health");
      return new Response(
        JSON.stringify({ capabilities: { priceTracking: true } }),
      );
    };
    assert.equal(
      (
        await probeCapabilities(
          "https://example.com",
          new AbortController().signal,
        )
      ).priceTracking,
      true,
    );
    globalThis.fetch = async () => new Response(JSON.stringify({}));
    assert.equal(
      (
        await probeCapabilities(
          "https://example.com",
          new AbortController().signal,
        )
      ).priceTracking,
      false,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("AC-LOG circular diagnostics discard raw details and retain at most100", () => {
  for (let i = 0; i < 105; i++)
    recordError("network", "password=private prompt");
  const report = diagnosticReport();
  assert.equal(report.errors.length, 100);
  assert.ok(!JSON.stringify(report).includes("password"));
});

import { destination } from "./domain/navigation";
test("AC-NAV previous saved/explore destinations preserve their journeys", () => {
  assert.equal(destination("saved"), "carts");
  assert.equal(destination("explore"), "advisor");
  assert.equal(destination("unknown"), "advisor");
});
test("AC-FILTER known metadata supports price/condition and sort without unknown imputation", () => {
  const v = seed.variants as any;
  const metadata = {
    [v[0].variantId]: { price: 100, total: null, condition: "new" },
    [v[1].variantId]: { price: 50, total: null, condition: "used" },
  };
  assert.equal(
    filterVariants(
      v,
      { ...emptyFilters, minPrice: "75", condition: "new" },
      "",
      metadata,
    ).length,
    1,
  );
  assert.equal(
    filterVariants(v, { ...emptyFilters, sort: "price" }, "", metadata)[0]
      .variantId,
    v[1].variantId,
  );
});

test("AC-PRICE latest conflict or stale observation cannot promote an older price", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  const offer = {
    id: "o",
    productVariantId: "v",
    retailerId: "r",
    sellerId: "s",
    canonicalUrl: "https://example.com",
    condition: "new",
    warrantyRegion: "VN",
    priceBasis: "listing" as const,
  };
  const old = {
    id: "p1",
    offerId: "o",
    amount: 100,
    currency: "VND" as const,
    availability: "available" as const,
    fetchedAt: "2026-11-14T10:00:00Z",
    sourceUpdatedAt: null,
    validationStatus: "valid" as const,
    sourceReference: "capture1",
  };
  const conflict = {
    ...old,
    id: "p2",
    fetchedAt: "2026-11-14T11:00:00Z",
    validationStatus: "conflict" as const,
  };
  assert.equal(pricingMetadata([offer], [old], now).v.price, 100);
  assert.deepEqual(pricingMetadata([offer], [old, conflict], now), {});
  assert.deepEqual(pricingMetadata([offer], [old], now + 86400000), {});
  const current = latestPrice(
    {
      productVariantId: "v",
      savedOfferId: "o",
      baselineAmount: 120,
      baselinePriceBasis: "listing",
    },
    [offer],
    [old, conflict],
    now,
  );
  assert.equal(current.observation?.id, "p2");
  assert.equal(current.kind, "unknown");
  assert.equal(current.delta, null);
});
