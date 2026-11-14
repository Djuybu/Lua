import type { ProductVariant } from "../catalog";
import provenance from "../provenance.json";
export type Filters = {
  category: string;
  brands: string[];
  sources: string[];
  condition: "all" | "new" | "used";
  minPrice: string;
  maxPrice: string;
  minRam: number;
  minStorage: number;
  gpu: boolean;
  minScreen: number;
  maxScreen: number;
  maxWeight: number;
  sort: "name" | "price" | "total" | "fit";
  showExcluded: boolean;
};
export const emptyFilters: Filters = {
  category: "",
  brands: [],
  sources: [],
  condition: "all",
  minPrice: "",
  maxPrice: "",
  minRam: 0,
  minStorage: 0,
  gpu: false,
  minScreen: 0,
  maxScreen: 0,
  maxWeight: 0,
  sort: "name",
  showExcluded: true,
};
export function sourceOf(v: ProductVariant) {
  return (
    provenance.variants
      .find((p) => p.variantId === v.variantId)
      ?.sourceCapture.replace(".json", "") ?? ""
  );
}
export function filterVariants(
  variants: ProductVariant[],
  f: Filters,
  query: string,
  metadata: Record<
    string,
    { price: number | null; total: number | null; condition: string | null }
  > = {},
) {
  return variants
    .filter((v) => {
      const s = v.specifications;
      const m = metadata[v.variantId];
      return (
        (!f.category || v.category === f.category) &&
        (!f.brands.length || f.brands.includes(v.brand)) &&
        (!f.sources.length || f.sources.includes(sourceOf(v))) &&
        (f.condition === "all" || m?.condition === f.condition) &&
        (!f.minPrice || (m?.price != null && m.price >= Number(f.minPrice))) &&
        (!f.maxPrice || (m?.price != null && m.price <= Number(f.maxPrice))) &&
        s.ramGb >= f.minRam &&
        s.storageGb >= f.minStorage &&
        (!f.gpu || (!!s.gpu && /RTX|GTX|Radeon RX|Arc A/i.test(s.gpu))) &&
        (!f.minScreen ||
          (s.displayInches != null && s.displayInches >= f.minScreen)) &&
        (!f.maxScreen ||
          (s.displayInches != null && s.displayInches <= f.maxScreen)) &&
        (!f.maxWeight || (s.weightKg != null && s.weightKg <= f.maxWeight)) &&
        [
          v.modelName,
          v.variantId,
          v.brand,
          s.cpu,
          s.ramGb + "GB",
          s.storageGb + "GB",
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase())
      );
    })
    .sort((a, b) => {
      if (f.sort === "price" || f.sort === "total") {
        const key = f.sort === "price" ? "price" : "total";
        const aPrice = metadata[a.variantId]?.[key];
        const bPrice = metadata[b.variantId]?.[key];
        if (aPrice != null || bPrice != null) {
          if (aPrice == null) return 1;
          if (bPrice == null) return -1;
          if (aPrice !== bPrice) return aPrice - bPrice;
        }
      }
      return a.modelName.localeCompare(b.modelName);
    });
}
export function countFilters(f: Filters) {
  return Object.entries(f).filter(
    ([k, v]) =>
      k !== "sort" &&
      k !== "showExcluded" &&
      (Array.isArray(v)
        ? v.length
        : typeof v === "boolean"
          ? v
          : v !== "" && v !== 0 && v !== "all"),
  ).length;
}

import type { RetailerOffer, PriceObservation } from "./price-tracking";
export function pricingMetadata(
  offers: RetailerOffer[],
  observations: PriceObservation[],
  now = Date.now(),
) {
  const out: Record<
    string,
    { price: number | null; total: number | null; condition: string | null }
  > = {};
  for (const o of offers) {
    const p = observations
      .filter(
        (x) =>
          x.offerId === o.id &&
          Number.isFinite(Date.parse(x.fetchedAt)) &&
          Date.parse(x.fetchedAt) <= now,
      )
      .sort((a, b) => Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt))[0];
    if (
      !p ||
      p.validationStatus !== "valid" ||
      p.availability !== "available" ||
      p.currency !== "VND" ||
      !Number.isSafeInteger(p.amount) ||
      p.amount < 0 ||
      now - Date.parse(p.fetchedAt) >= 86400000
    )
      continue;
    const condition = o.condition.toLowerCase();
    const next = {
      price: o.priceBasis === "listing" ? p.amount : null,
      total: o.priceBasis === "complete" ? p.amount : null,
      condition:
        condition === "new"
          ? "new"
          : ["used", "refurbished", "like_new"].includes(condition)
            ? "used"
            : null,
    };
    const prior = out[o.productVariantId];
    if (!prior || p.amount < (prior.price ?? prior.total ?? Infinity))
      out[o.productVariantId] = next;
  }
  return out;
}
