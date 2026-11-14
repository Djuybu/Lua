import { test } from "node:test";
import assert from "node:assert/strict";
import { recommend } from "./api";
import {
  initialDraft,
  profileOf,
  CATEGORY_PURPOSES,
  VALID_PRIORITIES,
  outcome,
} from "./model";
const p = profileOf({
  ...initialDraft,
  budget: "20000000",
  purposes: [...CATEGORY_PURPOSES.pc_laptop.slice(0, 3)],
  priorities: [...VALID_PRIORITIES.slice(0, 3)],
});
const response = {
  schemaVersion: "1.0.0",
  ruleVersion: "2026.11",
  requestId: "r1",
  profileRevision: 2,
  shortlist: [],
  excludedVariants: [],
  status: "NO_FIT",
};
test("HTTP adapter uses real route and preserves envelope", async () => {
  const before = globalThis.fetch;
  let body: any;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://example.com/advisor/v1/recommend");
    body = JSON.parse(init!.body as string);
    return new Response(JSON.stringify(response));
  };
  try {
    await recommend(
      "https://example.com",
      p,
      2,
      "r1",
      new AbortController().signal,
    );
    assert.deepEqual(body.profile, p);
    assert.equal(body.profileRevision, 2);
  } finally {
    globalThis.fetch = before;
  }
});
test("stale and invalid affordability responses rejected", async () => {
  const before = globalThis.fetch;
  try {
    for (const payload of [
      { ...response, profileRevision: 1 },
      {
        ...response,
        shortlist: [
          {
            variantId: "v",
            modelName: "model",
            totalVnd: null,
            isVerifiedAffordable: true,
            factIds: [],
          },
        ],
      },
    ]) {
      globalThis.fetch = async () => new Response(JSON.stringify(payload));
      await assert.rejects(
        recommend(
          "https://example.com",
          p,
          2,
          "r1",
          new AbortController().signal,
        ),
      );
    }
  } finally {
    globalThis.fetch = before;
  }
});
test("missing offers do not become a hard no-fit assertion", () => {
  assert.equal(
    outcome({ shortlist: [], excludedVariants: [{ reasonCode: "NO_OFFERS" }] }),
    "Chưa có chào bán đủ căn cứ",
  );
  assert.equal(
    outcome({
      shortlist: [],
      excludedVariants: [{ reasonCode: "UNKNOWN_CAPABILITY" }],
    }),
    "Chưa đủ bằng chứng về độ phù hợp",
  );
});
