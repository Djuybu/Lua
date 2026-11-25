import type { ProductVariant } from "../catalog";
import provenance from "../provenance.json";
import { sourceLabel } from "./official";
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
const CANONICAL_BRANDS: Record<string, string> = {
  asus: "ASUS",
  hp: "HP",
  msi: "MSI",
  acer: "Acer",
  lenovo: "Lenovo",
  dell: "Dell",
  apple: "Apple",
  lg: "LG",
  gigabyte: "Gigabyte",
  masstel: "Masstel",
};
export function normalizeBrand(brand: string): string {
  const trimmed = brand.trim();
  if (!trimmed) return "";
  return CANONICAL_BRANDS[trimmed.toLowerCase()] ?? trimmed;
}
function sourceFromHostname(urlString?: string): string {
  if (!urlString) return "";
  try {
    const host = new URL(urlString).hostname.toLowerCase();
    if (host.includes("thegioididong.com")) return "thegioididong";
    if (host.includes("dienmayxanh.com")) return "dienmayxanh";
    if (host.includes("fptshop.com")) return "fptshop";
    if (host.includes("cellphones.com")) return "cellphones";
    if (host.includes("laptopaz.vn")) return "laptopaz";
    if (host.includes("shopdunk.com")) return "shopdunk";
    if (host.includes("trungtran.vn")) return "trungtran";
    if (host.includes("oneway")) return "oneway";
  } catch {}
  return "";
}
export function sourceOf(v: ProductVariant) {
  const fromProvenance = provenance.variants
    .find((p) => p.variantId === v.variantId)
    ?.sourceCapture.replace(".json", "");
  if (fromProvenance) return fromProvenance;
  const match = /^retailer:([^:]+):/i.exec(v.variantId);
  if (match) return match[1].toLowerCase();
  return sourceFromHostname(v.sourceUrl);
}
export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase();
}
export function filterVariants(
  variants: ProductVariant[],
  f: Filters,
  query: string,
  metadata: Record<
    string,
    { price: number | null; total: number | null; condition: string | null }
  > = {},
  fitOrder?: Record<string, number>,
) {
  const tokens = normalizeSearchText(query).trim().split(/\s+/).filter(Boolean);
  const selectedBrands = new Set(f.brands.map(normalizeBrand));
  return variants
    .filter((v) => {
      const s = v.specifications;
      const m = metadata[v.variantId];
      const effectivePrice = m?.price ?? m?.total ?? null;
      const src = sourceOf(v);
      const haystack = tokens.length
        ? normalizeSearchText(
            [
              v.modelName,
              v.variantId,
              v.brand,
              s.cpu,
              s.gpu ?? "",
              s.os,
              src,
              sourceLabel(src),
              s.ramGb != null ? s.ramGb + "GB" : "",
              s.storageGb != null ? s.storageGb + "GB" : "",
            ].join(" "),
          )
        : "";
      return (
        (!f.category || v.category === f.category) &&
        (!selectedBrands.size || selectedBrands.has(normalizeBrand(v.brand))) &&
        (!f.sources.length || f.sources.includes(src)) &&
        (f.condition === "all" || m?.condition === f.condition) &&
        (!f.minPrice ||
          (effectivePrice != null && effectivePrice >= Number(f.minPrice))) &&
        (!f.maxPrice ||
          (effectivePrice != null && effectivePrice <= Number(f.maxPrice))) &&
        (f.minRam === 0 || (s.ramGb !== null && s.ramGb >= f.minRam)) &&
        (f.minStorage === 0 ||
          (s.storageGb !== null && s.storageGb >= f.minStorage)) &&
        (!f.gpu ||
          (!!s.gpu &&
            /RTX|GTX|Radeon\s*(RX|Pro)|Arc\s*[AB]|Quadro|GeForce\s*MX/i.test(
              s.gpu,
            ))) &&
        (!f.minScreen ||
          (s.displayInches != null && s.displayInches >= f.minScreen)) &&
        (!f.maxScreen ||
          (s.displayInches != null && s.displayInches <= f.maxScreen)) &&
        (!f.maxWeight || (s.weightKg != null && s.weightKg <= f.maxWeight)) &&
        tokens.every((tok) => haystack.includes(tok))
      );
    })
    .sort((a, b) => {
      if (f.sort === "fit" && fitOrder) {
        const aRank = fitOrder[a.variantId];
        const bRank = fitOrder[b.variantId];
        if (aRank != null || bRank != null) {
          if (aRank == null) return 1;
          if (bRank == null) return -1;
          if (aRank !== bRank) return aRank - bRank;
        }
      }
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
    const rawCond = o.condition.toLowerCase();
    const condition =
      rawCond === "new"
        ? "new"
        : ["used", "refurbished", "like_new"].includes(rawCond)
          ? "used"
          : null;
    const prior = out[o.productVariantId] ?? {
      price: null,
      total: null,
      condition: null,
    };
    const nextPrice =
      o.priceBasis === "listing"
        ? prior.price == null
          ? p.amount
          : Math.min(prior.price, p.amount)
        : prior.price;
    const nextTotal =
      o.priceBasis === "complete"
        ? prior.total == null
          ? p.amount
          : Math.min(prior.total, p.amount)
        : prior.total;
    out[o.productVariantId] = {
      price: nextPrice,
      total: nextTotal,
      condition: prior.condition ?? condition,
    };
  }
  return out;
}
