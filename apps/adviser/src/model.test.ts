import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialDraft,
  changeCategory,
  toggleOrdered,
  draftErrors,
  profileOf,
  safeEndpoint,
  officialOffer,
  offerTotal,
  aiFallbackCopy,
  CATEGORY_PURPOSES,
  VALID_PRIORITIES,
} from "./model";
import type { StagedCrawlerOffer } from "./crawler";
const offer: StagedCrawlerOffer = {
  sourceId: "laptopaz",
  externalOfferId: "SP002078",
  matchedVariantId: "retailer:laptopaz:SP002078",
  condition: "NEW",
  stockStatus: "IN_STOCK",
  basePriceVnd: 26590000,
  mandatoryFeesVnd: 0,
  shippingVnd: 0,
  conditionalDiscountVnd: 0,
  sourceUrl: "https://example.com/sp002078",
  observedAt: "2026-11-14T05:49:52.231000+00:00",
  completenessStatus: "COMPLETE",
};
import { createStore, empty } from "./storage";
const draft = {
  ...initialDraft,
  purposes: [...CATEGORY_PURPOSES.pc_laptop.slice(0, 3)],
  priorities: [...VALID_PRIORITIES.slice(0, 3)],
  budget: "20000000",
};
test("valid profile preserves exactly three ordered selections", () => {
  assert.deepEqual(draftErrors(draft), []);
  assert.deepEqual(profileOf(draft).orderedPurposes, draft.purposes);
});
test("reject invalid, fractional, unsafe and zero budgets", () => {
  for (const budget of [
    "",
    "0",
    "-1",
    "1.5",
    "2e7",
    "20,000,000",
    "9007199254740992",
  ])
    assert.ok(draftErrors({ ...draft, budget }).length, budget);
});
test("duplicate, missing and wrong-category purposes rejected", () => {
  for (const purposes of [
    [],
    [draft.purposes[0], draft.purposes[0], draft.purposes[1]],
    ["phone_daily_comms", ...draft.purposes.slice(0, 2)],
  ])
    assert.ok(draftErrors({ ...draft, purposes }).length);
});
test("selection cap and category invalidation", () => {
  assert.equal(toggleOrdered(draft.purposes, "another").length, 3);
  assert.equal(toggleOrdered(draft.purposes, draft.purposes[0]).length, 2);
  assert.deepEqual(changeCategory(draft, "phone").purposes, []);
  assert.equal(changeCategory({ ...draft, os: "Windows" }, "phone").os, "");
});
test("official offers use base price plus known fees as payable total", () => {
  assert.equal(offerTotal(offer), 26590000);
  assert.equal(offerTotal({ ...offer, mandatoryFeesVnd: null }), null);
  assert.equal(offerTotal({ ...offer, shippingVnd: null }), null);
  assert.equal(
    offerTotal({ ...offer, basePriceVnd: 20000000, mandatoryFeesVnd: 1000000, shippingVnd: 500000 }),
    21500000,
  );
});
test("officialOffer picks the cheapest in-stock complete offer and ignores others", () => {
  const manifest = {
    offers: [
      { ...offer, externalOfferId: "expensive", basePriceVnd: 26900000 },
      offer,
      { ...offer, externalOfferId: "out", stockStatus: "OUT_OF_STOCK" as const, basePriceVnd: 1000 },
      { ...offer, externalOfferId: "partial", completenessStatus: "PARTIAL_UNKNOWN" as const, basePriceVnd: 1000 },
      { ...offer, externalOfferId: "unknown", mandatoryFeesVnd: null, basePriceVnd: 1000 },
    ],
  };
  assert.equal(officialOffer(manifest, offer.matchedVariantId)?.externalOfferId, "SP002078");
  assert.equal(officialOffer(manifest, "other"), null);
});
test("AI fallback copy is explicit but never blocks the answer", () => {
  assert.match(aiFallbackCopy("AI_MOCK"), /tổng hợp trực tiếp/);
  assert.match(aiFallbackCopy("AI_TIMEOUT"), /dữ liệu chính thức/);
  assert.equal(aiFallbackCopy(null), "");
});
test("endpoint permits HTTPS and loopback only", () => {
  assert.ok(safeEndpoint("https://example.com"));
  assert.ok(safeEndpoint("http://10.0.2.2:8787"));
  assert.ok(!safeEndpoint("http://example.com"));
  assert.ok(!safeEndpoint("javascript:alert(1)"));
});
test("corrupt storage blocks writes and preserves original", async () => {
  let raw = "broken";
  const store = createStore({
    getItem: async () => raw,
    setItem: async (_, v) => {
      raw = v;
    },
  });
  await assert.rejects(store.load());
  await assert.rejects(store.update((x) => x));
  assert.equal(raw, "broken");
});
test("serialized updates use latest durable state", async () => {
  let raw: string | null = null;
  const store = createStore({
    getItem: async () => raw,
    setItem: async (_, v) => {
      raw = v;
    },
  });
  await store.load();
  await Promise.all([
    store.update((x) => ({ ...x, revision: x.revision + 1 })),
    store.update((x) => ({ ...x, revision: x.revision + 1 })),
  ]);
  assert.equal(JSON.parse(raw!).revision, 2);
});
test("failed writes do not advance committed profile", async () => {
  let fail = true;
  let raw: string | null = null;
  const store = createStore({
    getItem: async () => raw,
    setItem: async (_, v) => {
      if (fail) throw Error("disk");
      raw = v;
    },
  });
  await store.load();
  await assert.rejects(
    store.update((x) => ({ ...x, revision: 1, confirmed: profileOf(draft) })),
  );
  fail = false;
  const saved = await store.update((x) => ({
    ...x,
    preferences: { ...x.preferences, appearance: "dark" },
  }));
  assert.equal(saved.revision, 0);
  assert.equal(saved.confirmed, null);
});
