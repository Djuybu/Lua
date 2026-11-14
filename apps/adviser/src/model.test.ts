import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialDraft,
  changeCategory,
  toggleOrdered,
  draftErrors,
  profileOf,
  safeEndpoint,
  CATEGORY_PURPOSES,
  VALID_PRIORITIES,
} from "./model";
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
