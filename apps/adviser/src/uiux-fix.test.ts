import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, empty, validState } from "./storage";
import {
  corruptions,
  persistedFixture,
} from "../tests/fixtures/persisted-state";

for (const [label, corrupt] of Object.entries(corruptions)) {
  test(`UIUX-F01 rejects ${label}, preserves raw and locks writes`, async () => {
    const bad = persistedFixture();
    corrupt(bad);
    assert.equal(validState(bad), false);
    const raw = JSON.stringify(bad);
    let writes = 0;
    const store = createStore({
      getItem: async () => raw,
      setItem: async () => {
        writes++;
      },
    });
    await assert.rejects(store.load());
    await assert.rejects(store.update((x) => x));
    assert.equal(await store.exportRaw(), raw);
    assert.equal(writes, 0);
  });
}

test("UIUX-F01 validation rejects invalid numeric/enum/date/reference shapes without throwing", () => {
  const mutations: ((s: any) => void)[] = [
    (s) => {
      s.cartData.carts[0] = null;
    },
    (s) => {
      s.cartData.legacyMap = [];
    },
    (s) => {
      s.cartData.carts[0].updatedAt = "invalid";
    },
    (s) => {
      s.cartData.carts[0].createdAt = "2026-02-30";
    },
    (s) => {
      s.cartData.carts[0].budget = -1;
    },
    (s) => {
      s.cartData.carts[0].archivedAt = false;
    },
    (s) => {
      s.cartData.candidates[0].savedAt = "";
    },
    (s) => {
      s.cartData.candidates[0].cartId = "absent";
    },
    (s) => {
      s.cartData.candidates[0].decisionSnapshot.profile = false;
    },
    (s) => {
      s.cartData.candidates[0].decisionSnapshot.variant.specifications.ramGb =
        "16";
    },
    (s) => {
      s.cartData.candidates[0].decisionSnapshot.variant.specifications.weightKg =
        -1;
    },
    (s) => {
      s.cartData.candidates[0].decisionSnapshot.variant.factIds = [null];
    },
    (s) => {
      s.cartData.candidates[0].baselineAmount = NaN;
    },
    (s) => {
      s.cartData.candidates[0].baselineCurrency = "USD";
    },
    (s) => {
      s.cartData.candidates[0].baselinePriceBasis = "guess";
    },
    (s) => {
      s.cartData.legacyMap = { old: ["absent"] };
    },
    (s) => {
      s.offers[0].priceBasis = "guess";
    },
    (s) => {
      s.offers[0].canonicalUrl = 42;
    },
    (s) => {
      s.offers.push({ ...s.offers[0] });
    },
    (s) => {
      s.observations = [null];
    },
    (s) => {
      s.observations[0].amount = Infinity;
    },
    (s) => {
      s.observations[0].amount = null;
    },
    (s) => {
      s.observations[0].availability = "maybe";
    },
    (s) => {
      s.observations[0].validationStatus = "guessed";
    },
    (s) => {
      s.observations[0].sourceUpdatedAt = "invalid";
    },
    (s) => {
      s.observations[0].offerId = "absent";
    },
    (s) => {
      s.trackingRules = [null];
    },
    (s) => {
      s.trackingRules[0].status = "maybe";
    },
    (s) => {
      s.trackingRules[0].notificationsEnabled = "yes";
    },
    (s) => {
      s.trackingRules[0].candidateId = "absent";
    },
    (s) => {
      s.trackingRules[0].offerScope = ["absent"];
    },
    (s) => {
      s.alertDeliveries = [null];
    },
    (s) => {
      s.alertDeliveries[0].trackingRuleId = "absent";
    },
    (s) => {
      s.alertDeliveries[0].observationId = "absent";
    },
    (s) => {
      s.alertDeliveries[0].deliveredAt = "invalid";
    },
    (s) => {
      s.alertDeliveries.push({ ...s.alertDeliveries[0], id: "other" });
    },
    (s) => {
      s.confirmed = false;
    },
    (s) => {
      s.preferences = null;
    },
    (s) => {
      s.saved = [null];
    },
  ];
  mutations.forEach((mutate, index) => {
    const s = persistedFixture();
    mutate(s);
    assert.equal(validState(s), false, `mutation ${index}`);
  });
  for (const value of [null, false, [], {}, { version: 2 }])
    assert.equal(validState(value), false);
});

test("UIUX-F01 valid unknowns, historical offer IDs and valid state survive restart unchanged", async () => {
  const s = persistedFixture();
  s.cartData.candidates[0].baselineAmount = null;
  s.cartData.candidates[0].baselinePriceBasis = "unknown";
  assert.equal(validState(s), true);
  let raw = JSON.stringify(s);
  const io = {
    getItem: async () => raw,
    setItem: async (_: string, v: string) => {
      raw = v;
    },
  };
  const first = await createStore(io).load();
  assert.deepEqual(first, s);
  assert.deepEqual(await createStore(io).load(), s);
  assert.equal(validState(empty), true);
});

test("UIUX-F01 invalid update cannot mutate exposed durable state", async () => {
  let raw = JSON.stringify(persistedFixture());
  const before = raw;
  const store = createStore({
    getItem: async () => raw,
    setItem: async (_: string, v: string) => {
      raw = v;
    },
  });
  await store.load();
  await assert.rejects(
    store.update((s) => {
      (s.cartData.carts[0] as any).updatedAt = undefined;
      return s;
    }),
  );
  assert.equal(raw, before);
  const next = await store.update((s) => ({ ...s, revision: s.revision + 1 }));
  assert.equal(
    next.cartData.carts[0].updatedAt,
    JSON.parse(before).cartData.carts[0].updatedAt,
  );
});
