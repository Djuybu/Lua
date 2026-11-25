import { test } from "node:test";
import assert from "node:assert/strict";
import seed from "./catalog.json";
import { resolveApiEndpoint } from "./api/config";
import {
  changeCategory,
  draftErrors,
  initialDraft,
  profileOf,
  safeEndpoint,
  safeExternalUrl,
  CATEGORY_PURPOSES,
  VALID_PRIORITIES,
} from "./model";
import {
  emptyFilters,
  filterVariants,
  normalizeBrand,
  pricingMetadata,
  sourceOf,
} from "./domain/filters";
import {
  addCandidates,
  emptyCarts,
  removeCandidateFromCart,
  updateCartDetails,
  validCartData,
} from "./domain/carts";
import { ChatController } from "./chat";
import type { ProductVariant } from "./catalog";
import type { PriceObservation, RetailerOffer } from "./domain/price-tracking";

test("safeEndpoint blocks evil private-prefix hostnames and accepts strict private IPv4", () => {
  assert.equal(safeEndpoint("http://10.evil.com"), false);
  assert.equal(safeEndpoint("http://192.168.evil.com"), false);
  assert.equal(safeEndpoint("http://172.16.evil.com"), false);
  assert.equal(safeEndpoint("https://user:pass@example.com"), false);
  assert.equal(safeEndpoint("http://10.0.2.2:8080"), true);
  assert.equal(safeEndpoint("http://192.168.1.10:8080"), true);
  assert.equal(safeEndpoint("http://172.16.0.1:8080"), true);
  assert.equal(safeEndpoint("https://lua-adviser.vercel.app"), true);
  assert.equal(safeExternalUrl("https://example.com/p"), "https://example.com/p");
  assert.equal(safeExternalUrl("javascript:alert(1)"), null);
});

test("resolveApiEndpoint supports explicit offline mode without breaking empty fallback", () => {
  assert.equal(resolveApiEndpoint("", undefined), "https://lua-adviser.vercel.app");
  assert.equal(resolveApiEndpoint("", "offline"), "");
  assert.equal(resolveApiEndpoint("http://127.0.0.1:8080/", "offline"), "");
});

test("sourceOf resolves canonical non-empty source for every variant in catalog.json", () => {
  for (const v of seed.variants as ProductVariant[]) {
    assert.ok(sourceOf(v).length > 0, `Missing source for ${v.variantId}`);
  }
});

test("filterVariants handles null specs, diacritics, multi-token, gpu/os/source, complete-only price & brand casing", () => {
  const variants: ProductVariant[] = [
    {
      variantId: "retailer:dienmayxanh:1",
      familyId: "f1",
      modelName: "Acer Gaming Nitro",
      category: "pc_laptop",
      brand: "asus",
      specifications: {
        ramGb: null as any,
        storageGb: 512,
        cpu: "Intel Core i5",
        gpu: "NVIDIA RTX 3050",
        os: "Windows 11",
      },
      factIds: [],
    },
    {
      variantId: "retailer:fptshop:2",
      familyId: "f2",
      modelName: "HP Pavilion 15",
      category: "pc_laptop",
      brand: "Hp",
      specifications: {
        ramGb: 16,
        storageGb: 512,
        cpu: "Intel Core Ultra 5",
        os: "Windows 11",
      },
      factIds: [],
    },
  ];
  assert.equal(filterVariants(variants, emptyFilters, "null").length, 0);
  assert.equal(filterVariants(variants, emptyFilters, "dien may xanh rtx").length, 1);
  assert.equal(filterVariants(variants, emptyFilters, "windows 11").length, 2);
  assert.equal(
    filterVariants(variants, { ...emptyFilters, brands: ["ASUS"] }, "").length,
    1,
  );
  assert.equal(normalizeBrand("msi"), "MSI");
  const completeOnlyMeta = {
    "retailer:fptshop:2": { price: null, total: 18500000, condition: "new" },
  };
  assert.equal(
    filterVariants(
      variants,
      { ...emptyFilters, maxPrice: "20000000" },
      "",
      completeOnlyMeta,
    ).length,
    1,
  );
});

test("pricingMetadata preserves both listing price and complete total independently", () => {
  const now = Date.parse("2026-11-25T00:00:00Z");
  const offers: RetailerOffer[] = [
    {
      id: "o1",
      productVariantId: "v1",
      retailerId: "r1",
      sellerId: "s1",
      canonicalUrl: "https://example.com/1",
      condition: "NEW",
      warrantyRegion: "VN",
      priceBasis: "listing",
    },
    {
      id: "o2",
      productVariantId: "v1",
      retailerId: "r1",
      sellerId: "s1",
      canonicalUrl: "https://example.com/2",
      condition: "NEW",
      warrantyRegion: "VN",
      priceBasis: "complete",
    },
  ];
  const observations: PriceObservation[] = [
    {
      id: "obs1",
      offerId: "o1",
      amount: 20000000,
      currency: "VND",
      availability: "available",
      fetchedAt: "2026-11-24T12:00:00Z",
      sourceUpdatedAt: null,
      validationStatus: "valid",
      sourceReference: "src1",
    },
    {
      id: "obs2",
      offerId: "o2",
      amount: 19000000,
      currency: "VND",
      availability: "available",
      fetchedAt: "2026-11-24T12:00:00Z",
      sourceUpdatedAt: null,
      validationStatus: "valid",
      sourceReference: "src2",
    },
  ];
  const meta = pricingMetadata(offers, observations, now);
  assert.deepEqual(meta.v1, {
    price: 20000000,
    total: 19000000,
    condition: "new",
  });
});

test("addCandidates prevents duplicate candidate IDs with savedOfferId and handles reverse clock skew", () => {
  const variant = seed.variants[0] as ProductVariant;
  const cart = {
    id: "c1",
    title: "Work",
    useCase: "Dev",
    budget: 25000000,
    currency: "VND" as const,
    decisionNote: "",
    createdAt: "2026-11-25T10:00:00Z",
    updatedAt: "2026-11-25T10:00:00Z",
    archivedAt: null,
  };
  const d1 = addCandidates(emptyCarts, cart, [variant], null, "v1", "2026-11-25T10:00:00Z");
  const d2 = addCandidates(
    d1,
    cart,
    [variant],
    null,
    "v1",
    "2026-11-25T09:00:00Z",
    () => ({
      savedOfferId: "offer-1",
      baselineAmount: 20000000,
      baselinePriceBasis: "complete",
    }),
  );
  assert.equal(d2.candidates.length, 2);
  assert.equal(validCartData(d2), true);
  const updated = updateCartDetails(
    d2,
    "c1",
    { title: "Work 2", useCase: "AI", budget: 30000000, decisionNote: "Note" },
    "2026-11-25T08:00:00Z",
  );
  assert.equal(validCartData(updated), true);
  const removed = removeCandidateFromCart(updated, d2.candidates[0].id, "2026-11-25T11:00:00Z");
  assert.equal(removed.candidates.length, 1);
  assert.equal(validCartData(removed), true);
});

test("Needs model trims whitespace OS and preserves draft on same-category tap", () => {
  const draft = {
    ...initialDraft,
    budget: "20000000",
    purposes: [...CATEGORY_PURPOSES.pc_laptop.slice(0, 3)],
    priorities: [...VALID_PRIORITIES.slice(0, 3)],
    os: "   ",
    minRam: "16",
  };
  assert.equal(draftErrors(draft).length, 0);
  assert.equal(profileOf(draft).hardConstraints?.requiredOs, undefined);
  assert.deepEqual(changeCategory(draft, "pc_laptop"), draft);
});

test("ChatController cancelInFlight preserves idle proposal and dismissProposal resets error", async () => {
  const proposal = {
    baseProfileRevision: 0,
    draft: {
      ...initialDraft,
      budget: "20000000",
      purposes: [...CATEGORY_PURPOSES.pc_laptop.slice(0, 3)],
      priorities: [...VALID_PRIORITIES.slice(0, 3)],
    },
  };
  const controller = new ChatController(async () => ({
    text: "OK",
    mode: "fallback",
    providerLabel: "test",
    sources: [],
    proposal,
  }));
  await controller.send("laptop", 0);
  controller.cancelInFlight();
  assert.ok(controller.snapshot().proposal);
  assert.equal(controller.snapshot().status, "idle");
  controller.review();
  await controller.confirm(async () => {
    throw Error("disk fail");
  });
  assert.equal(controller.snapshot().status, "error");
  controller.dismissProposal();
  assert.equal(controller.snapshot().status, "idle");
  assert.equal(controller.snapshot().proposal, null);
  controller.dispose();
});
