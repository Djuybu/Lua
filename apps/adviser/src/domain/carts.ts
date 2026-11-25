import type { ProductVariant } from "../catalog";
import type { ConfirmedNeedsProfile } from "../model";
import type { Saved } from "../storage";
import {
  record,
  text,
  id,
  amount,
  date,
  url,
  profile,
  variant,
  strings,
  uniqueIds,
} from "./validation";
export type Cart = {
  id: string;
  title: string;
  useCase: string;
  budget: number | null;
  currency: "VND";
  decisionNote: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};
export type CartCandidate = {
  id: string;
  cartId: string;
  productVariantId: string;
  decisionSnapshot: {
    variant: ProductVariant;
    profile: ConfirmedNeedsProfile | null;
    note: string;
    sourceUrl?: string;
    catalogVersion: string;
  };
  savedAt: string;
  savedOfferId: string | null;
  baselineAmount: number | null;
  baselineCurrency: "VND";
  baselinePriceBasis: "listing" | "complete" | "unknown";
};
export type CartData = {
  carts: Cart[];
  candidates: CartCandidate[];
  legacyMap: Record<string, string[]>;
};
export const emptyCarts: CartData = {
  carts: [],
  candidates: [],
  legacyMap: {},
};
export function importSaved(
  saved: Saved[],
  data: CartData = emptyCarts,
): CartData {
  const out = structuredClone(data);
  for (const s of saved) {
    if (Object.hasOwn(out.legacyMap, s.id)) continue;
    const name =
      (s as Saved & { groupName?: string }).groupName?.trim() ||
      "Quyết định đã nhập";
    let cart = out.carts.find((c) => c.title === name);
    if (!cart) {
      cart = {
        id: "import:" + s.id,
        title: name,
        useCase: "",
        budget: s.profile?.budget.hardCeilingVnd ?? null,
        currency: "VND",
        decisionNote: "",
        createdAt: s.at,
        updatedAt: s.at,
        archivedAt: null,
      };
      out.carts.push(cart);
    }
    out.legacyMap[s.id] = [];
    for (const [i, variant] of s.variants.entries()) {
      const id = "legacy:" + s.id + ":" + i;
      out.candidates.push({
        id,
        cartId: cart.id,
        productVariantId: variant.variantId,
        decisionSnapshot: {
          variant: structuredClone(variant),
          profile: structuredClone(s.profile),
          note: s.decisionNote ?? "",
          sourceUrl: s.sourceUrl,
          catalogVersion: s.catalogVersion,
        },
        savedAt: s.at,
        savedOfferId: s.savedOfferId ?? null,
        baselineAmount:
          s.baselineAmount != null &&
          Number.isSafeInteger(s.baselineAmount) &&
          s.baselineAmount >= 0
            ? s.baselineAmount
            : null,
        baselineCurrency: "VND",
        baselinePriceBasis: s.baselinePriceBasis ?? "unknown",
      });
      out.legacyMap[s.id].push(id);
    }
  }
  return out;
}
function clampAfter(candidateAt: string, minAt: string): string {
  const c = Date.parse(candidateAt);
  const m = Date.parse(minAt);
  return Number.isFinite(c) && Number.isFinite(m) && c >= m ? candidateAt : minAt;
}
export function addCandidates(
  data: CartData,
  cart: Cart,
  variants: ProductVariant[],
  profile: ConfirmedNeedsProfile | null,
  catalogVersion: string,
  at: string,
  resolveBaseline?: (variant: ProductVariant) => {
    savedOfferId: string | null;
    baselineAmount: number | null;
    baselinePriceBasis: "listing" | "complete" | "unknown";
  },
) {
  const out = structuredClone(data);
  if (!out.carts.some((c) => c.id === cart.id)) out.carts.push(cart);
  const existingIds = new Set(out.candidates.map((c) => c.id));
  for (const variant of variants) {
    const baseline = resolveBaseline?.(variant) ?? {
      savedOfferId: null,
      baselineAmount: null,
      baselinePriceBasis: "unknown" as const,
    };
    if (
      out.candidates.some(
        (c) =>
          c.cartId === cart.id &&
          c.productVariantId === variant.variantId &&
          c.savedOfferId === baseline.savedOfferId,
      )
    )
      continue;
    let candidateId = cart.id + ":" + variant.variantId;
    if (existingIds.has(candidateId)) {
      let suffix = 2;
      while (existingIds.has(candidateId + ":" + suffix)) suffix++;
      candidateId = candidateId + ":" + suffix;
    }
    existingIds.add(candidateId);
    out.candidates.push({
      id: candidateId,
      cartId: cart.id,
      productVariantId: variant.variantId,
      decisionSnapshot: {
        variant: structuredClone(variant),
        profile: structuredClone(profile),
        note: cart.decisionNote,
        catalogVersion,
      },
      savedAt: at,
      savedOfferId: baseline.savedOfferId,
      baselineAmount: baseline.baselineAmount,
      baselineCurrency: "VND",
      baselinePriceBasis: baseline.baselinePriceBasis,
    });
  }
  out.carts = out.carts.map((c) =>
    c.id === cart.id ? { ...c, updatedAt: clampAfter(at, c.createdAt) } : c,
  );
  return out;
}
export function removeCandidateFromCart(
  data: CartData,
  candidateId: string,
  at: string,
): CartData {
  const out = structuredClone(data);
  const target = out.candidates.find((c) => c.id === candidateId);
  if (!target) return out;
  out.candidates = out.candidates.filter((c) => c.id !== candidateId);
  out.legacyMap = Object.fromEntries(
    Object.entries(out.legacyMap)
      .map(([k, ids]) => [k, ids.filter((x) => x !== candidateId)] as const)
      .filter(([, ids]) => ids.length > 0),
  );
  out.carts = out.carts.map((c) =>
    c.id === target.cartId
      ? { ...c, updatedAt: clampAfter(at, c.createdAt) }
      : c,
  );
  return out;
}
export function updateCartDetails(
  data: CartData,
  cartId: string,
  patch: {
    title: string;
    useCase: string;
    budget: number | null;
    decisionNote: string;
  },
  at: string,
): CartData {
  const out = structuredClone(data);
  out.carts = out.carts.map((c) =>
    c.id === cartId
      ? {
          ...c,
          title: patch.title.trim() || c.title,
          useCase: patch.useCase.trim(),
          budget: patch.budget,
          decisionNote: patch.decisionNote.trim(),
          updatedAt: clampAfter(at, c.createdAt),
        }
      : c,
  );
  return out;
}
export function validCartData(value: unknown): value is CartData {
  return (
    record(value) &&
    Array.isArray(value.carts) &&
    Array.isArray(value.candidates) &&
    record(value.legacyMap) &&
    value.carts.every(
      (c: any) =>
        record(c) &&
        id(c.id) &&
        id(c.title) &&
        text(c.useCase) &&
        text(c.decisionNote) &&
        date(c.createdAt) &&
        date(c.updatedAt) &&
        Date.parse(c.updatedAt) >= Date.parse(c.createdAt) &&
        (c.archivedAt === null ||
          (date(c.archivedAt) &&
            Date.parse(c.archivedAt) >= Date.parse(c.createdAt))) &&
        c.currency === "VND" &&
        (c.budget === null || amount(c.budget)),
    ) &&
    new Set(value.carts.map((c: any) => c.id)).size === value.carts.length &&
    value.candidates.every(
      (c: any) =>
        record(c) &&
        id(c.id) &&
        id(c.productVariantId) &&
        id(c.cartId) &&
        date(c.savedAt) &&
        (c.savedOfferId === null || id(c.savedOfferId)) &&
        c.baselineCurrency === "VND" &&
        ["listing", "complete", "unknown"].includes(c.baselinePriceBasis) &&
        record(c.decisionSnapshot) &&
        variant(c.decisionSnapshot.variant) &&
        (c.decisionSnapshot.profile === null ||
          profile(c.decisionSnapshot.profile)) &&
        text(c.decisionSnapshot.note) &&
        id(c.decisionSnapshot.catalogVersion) &&
        (c.decisionSnapshot.sourceUrl === undefined ||
          url(c.decisionSnapshot.sourceUrl)) &&
        value.carts.some((x: any) => x.id === c.cartId) &&
        c.decisionSnapshot?.variant?.variantId === c.productVariantId &&
        (c.baselineAmount === null || amount(c.baselineAmount)),
    ) &&
    new Set(value.candidates.map((c: any) => c.id)).size ===
      value.candidates.length &&
    Object.entries(value.legacyMap).every(
      ([key, refs]) =>
        id(key) &&
        strings(refs) &&
        new Set(refs).size === refs.length &&
        refs.every((ref) =>
          value.candidates.some((c: CartCandidate) => c.id === ref),
        ),
    )
  );
}
