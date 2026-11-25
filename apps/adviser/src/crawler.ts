/**
 * Crawler Staging & Offer Contracts
 * Aligned with Agent 1's reviewed StagedCrawlerOffer definition.
 */

import { isValidVnd } from "./money.ts";

export type OfferCondition = "NEW" | "REFURBISHED" | "LIKE_NEW";
export type OfferStockStatus = "IN_STOCK" | "OUT_OF_STOCK" | "PREORDER";
export type OfferCompleteness = "COMPLETE" | "PARTIAL_UNKNOWN";

export interface StagedCrawlerOffer {
  /** Identifier of verified source (e.g. 'fpt_shop', 'cellphones', 'tgdd') */
  sourceId: string;
  /** Seller's unique listing ID */
  externalOfferId: string;
  /** Exact target product variant ID */
  matchedVariantId: string;
  condition: OfferCondition;
  stockStatus: OfferStockStatus;

  /** Non-negative safe integer in VND */
  basePriceVnd: number;
  /** Taxes/mandatory fees EXCLUDING shipping fees, or null if unknown / unreviewed */
  mandatoryFeesVnd: number | null;
  /** Shipping fee, or null if unknown / dependent on location */
  shippingVnd: number | null;
  /** Conditional discount (card promo, trade-in) separated from payable price */
  conditionalDiscountVnd: number;

  /** Verifiable canonical destination URL */
  sourceUrl: string;
  /** ISO 8601 observation timestamp */
  observedAt: string;
  /** Computed or explicit status */
  completenessStatus: OfferCompleteness;
}

/**
 * Returns the stable offer key: (sourceId, externalOfferId).
 * Identifies the listing regardless of price change over time.
 */
export function getStableOfferId(
  offer: Pick<StagedCrawlerOffer, "sourceId" | "externalOfferId">,
): string {
  return `${offer.sourceId}::${offer.externalOfferId}`;
}

/**
 * Returns the observation key: (sourceId, externalOfferId, observedAt).
 * Identifies a specific crawl snapshot for idempotency.
 */
export function getObservationId(
  offer: Pick<
    StagedCrawlerOffer,
    "sourceId" | "externalOfferId" | "observedAt"
  >,
): string {
  return `${offer.sourceId}::${offer.externalOfferId}::${offer.observedAt}`;
}

export interface OfferValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a staged crawler offer.
 */
export function validateStagedCrawlerOffer(
  offer: unknown,
): OfferValidationResult {
  const errors: string[] = [];
  if (!offer || typeof offer !== "object") {
    return { valid: false, errors: ["Offer must be an object"] };
  }

  const o = offer as Partial<StagedCrawlerOffer>;

  if (
    !o.sourceId ||
    typeof o.sourceId !== "string" ||
    o.sourceId.trim() === ""
  ) {
    errors.push("sourceId is required and must be a non-empty string");
  }
  if (
    !o.externalOfferId ||
    typeof o.externalOfferId !== "string" ||
    o.externalOfferId.trim() === ""
  ) {
    errors.push("externalOfferId is required and must be a non-empty string");
  }
  if (
    !o.matchedVariantId ||
    typeof o.matchedVariantId !== "string" ||
    o.matchedVariantId.trim() === ""
  ) {
    errors.push("matchedVariantId is required and must be an exact variant ID");
  }

  const validConditions: OfferCondition[] = ["NEW", "REFURBISHED", "LIKE_NEW"];
  if (!o.condition || !validConditions.includes(o.condition)) {
    errors.push(`condition must be one of: ${validConditions.join(", ")}`);
  }

  const validStock: OfferStockStatus[] = [
    "IN_STOCK",
    "OUT_OF_STOCK",
    "PREORDER",
  ];
  if (!o.stockStatus || !validStock.includes(o.stockStatus)) {
    errors.push(`stockStatus must be one of: ${validStock.join(", ")}`);
  }

  if (!isValidVnd(o.basePriceVnd)) {
    errors.push("basePriceVnd must be a non-negative safe integer");
  }
  if (o.mandatoryFeesVnd !== null && !isValidVnd(o.mandatoryFeesVnd)) {
    errors.push("mandatoryFeesVnd must be null or a non-negative safe integer");
  }
  const validCompleteness: OfferCompleteness[] = [
    "COMPLETE",
    "PARTIAL_UNKNOWN",
  ];
  if (
    !o.completenessStatus ||
    !validCompleteness.includes(o.completenessStatus)
  ) {
    errors.push(
      `completenessStatus must be one of: ${validCompleteness.join(", ")}`,
    );
  }
  if (
    o.completenessStatus === "COMPLETE" &&
    (o.mandatoryFeesVnd === null || o.shippingVnd === null)
  ) {
    errors.push("COMPLETE offers require known mandatoryFeesVnd and shippingVnd");
  }
  if (o.shippingVnd !== null && !isValidVnd(o.shippingVnd)) {
    errors.push("shippingVnd must be null or a non-negative safe integer");
  }
  if (
    o.conditionalDiscountVnd !== undefined &&
    !isValidVnd(o.conditionalDiscountVnd)
  ) {
    errors.push("conditionalDiscountVnd must be a non-negative safe integer");
  }

  if (!o.sourceUrl || typeof o.sourceUrl !== "string") {
    errors.push("sourceUrl is required and must be a string");
  } else {
    try {
      const parsedUrl = new URL(o.sourceUrl);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        errors.push("sourceUrl must have http: or https: protocol");
      }
    } catch {
      errors.push("sourceUrl must be a valid, well-formed URL");
    }
  }

  if (!o.observedAt || typeof o.observedAt !== "string") {
    errors.push("observedAt is required and must be a string");
  } else {
    const timestampMs = Date.parse(o.observedAt);
    if (Number.isNaN(timestampMs) || !o.observedAt.includes("T")) {
      errors.push("observedAt must be a valid ISO 8601 date string");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
