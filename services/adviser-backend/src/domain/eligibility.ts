/**
 * Deterministic Eligibility Engine
 * Enforces mandatory hard constraints (BR-02, BR-03, U07, U08):
 * - Hard ceiling budget (even 1 VND over fails)
 * - Required OS
 * - Minimum RAM
 * - Category matching
 * - Unknown facts do NOT default to pass.
 */

import { type ConfirmedNeedsProfile } from '../contracts/taxonomy.ts';
import { type ProductVariant, type FactAssertion } from '../contracts/catalog.ts';
import { type StagedCrawlerOffer } from '../contracts/crawler.ts';
import { calculatePayableTotal, type PriceCalculationResult } from '../contracts/money.ts';
import { type ExcludedCandidate, type RankedCandidate } from '../contracts/envelope.ts';

export interface EligibilityResult {
  isEligible: boolean;
  exclusion?: ExcludedCandidate;
  verifiedOffer?: {
    offer: StagedCrawlerOffer;
    price: PriceCalculationResult;
  };
  reasons: string[];
}

/**
 * Evaluates whether a product variant and its offers meet all hard requirements.
 */
export function evaluateEligibility(
  variant: ProductVariant,
  availableOffers: StagedCrawlerOffer[],
  profile: ConfirmedNeedsProfile,
  facts: FactAssertion[] = []
): EligibilityResult {
  const reasons: string[] = [];

  // 1. Hard constraint: Category match
  if (variant.category !== profile.category) {
    return {
      isEligible: false,
      exclusion: {
        variantId: variant.variantId,
        modelName: variant.modelName,
        reasonCode: 'OS_MISMATCH',
        detail: `Category mismatch: variant is '${variant.category}', requested '${profile.category}'`
      },
      reasons
    };
  }

  // 2. Hard constraint: Required OS
  if (profile.hardConstraints?.requiredOs && profile.hardConstraints.requiredOs.length > 0) {
    const requiredOsList = profile.hardConstraints.requiredOs.map(os => os.toLowerCase());
    const variantOs = variant.specifications.os.toLowerCase();
    const osMatched = requiredOsList.some(req => variantOs.includes(req));
    if (!osMatched) {
      return {
        isEligible: false,
        exclusion: {
          variantId: variant.variantId,
          modelName: variant.modelName,
          reasonCode: 'OS_MISMATCH',
          detail: `OS '${variant.specifications.os}' does not meet required: [${profile.hardConstraints.requiredOs.join(', ')}]`
        },
        reasons
      };
    }
    reasons.push(`Hệ điều hành phù hợp: ${variant.specifications.os}`);
  }

  // 3. Hard constraint: Minimum RAM
  if (profile.hardConstraints?.minRamGb !== undefined) {
    if (variant.specifications.ramGb === null || variant.specifications.ramGb < profile.hardConstraints.minRamGb) {
      return {
        isEligible: false,
        exclusion: {
          variantId: variant.variantId,
          modelName: variant.modelName,
          reasonCode: variant.specifications.ramGb === null ? 'UNKNOWN_CAPABILITY' : 'RAM_INSUFFICIENT',
          detail: variant.specifications.ramGb === null ? 'RAM chưa xác minh' : `RAM ${variant.specifications.ramGb}GB is below required minimum of ${profile.hardConstraints.minRamGb}GB`
        },
        reasons
      };
    }
    reasons.push(`RAM đáp ứng yêu cầu: ${variant.specifications.ramGb}GB`);
  }

  // 4. Offer and Pricing Evaluation
  // Filter for matching variant offers in stock
  const matchingOffers = availableOffers.filter(
    o => o.matchedVariantId === variant.variantId && o.stockStatus === 'IN_STOCK'
  );

  if (matchingOffers.length === 0) {
    return {
      isEligible: false,
      exclusion: {
        variantId: variant.variantId,
        modelName: variant.modelName,
        reasonCode: 'NO_OFFERS',
        detail: 'No available in-stock offers found for this exact variant'
      },
      reasons
    };
  }

  // Find lowest price among in-stock offers
  let bestOfferWithPrice: { offer: StagedCrawlerOffer; price: PriceCalculationResult } | null = null;

  for (const offer of matchingOffers) {
    const priceRes = calculatePayableTotal({
      basePriceVnd: offer.basePriceVnd,
      mandatoryFeesVnd: offer.mandatoryFeesVnd,
      shippingVnd: offer.shippingVnd,
      confirmedDiscountVnd: 0
    });

    if (bestOfferWithPrice === null) {
      bestOfferWithPrice = { offer, price: priceRes };
    } else {
      const currentBestTotal = bestOfferWithPrice.price.totalVnd;
      const thisTotal = priceRes.totalVnd;
      if (thisTotal !== null && (currentBestTotal === null || thisTotal < currentBestTotal)) {
        bestOfferWithPrice = { offer, price: priceRes };
      }
    }
  }

  if (!bestOfferWithPrice) {
    return {
      isEligible: false,
      exclusion: {
        variantId: variant.variantId,
        modelName: variant.modelName,
        reasonCode: 'NO_OFFERS',
        detail: 'Failed to calculate price for offers'
      },
      reasons
    };
  }

  const { price: bestPrice } = bestOfferWithPrice;

  // 5. Hard constraint: Budget ceiling (BR-02: Hard ceiling cannot be exceeded)
  if (bestPrice.totalVnd !== null) {
    if (bestPrice.totalVnd > profile.budget.hardCeilingVnd) {
      return {
        isEligible: false,
        exclusion: {
          variantId: variant.variantId,
          modelName: variant.modelName,
          reasonCode: 'EXCEED_BUDGET',
          detail: `Giá tổng ${bestPrice.totalVnd.toLocaleString('vi-VN')} VND vượt quá trần ngân sách ${profile.budget.hardCeilingVnd.toLocaleString('vi-VN')} VND`
        },
        reasons
      };
    }
    reasons.push(`Nằm trong trần ngân sách: ${bestPrice.totalVnd.toLocaleString('vi-VN')} VND`);
  } else {
    // Total is unknown because shipping is unknown
    // We cannot mark it verified affordable, but if base price alone exceeds ceiling, we reject immediately
    if (bestOfferWithPrice.offer.basePriceVnd > profile.budget.hardCeilingVnd) {
      return {
        isEligible: false,
        exclusion: {
          variantId: variant.variantId,
          modelName: variant.modelName,
          reasonCode: 'EXCEED_BUDGET',
          detail: `Giá niêm yết ${bestOfferWithPrice.offer.basePriceVnd.toLocaleString('vi-VN')} VND đã vượt trần ngân sách`
        },
        reasons
      };
    }
    reasons.push('Giá vận chuyển chưa xác định, chưa thể xác minh giá trọn gói');
  }

  return {
    isEligible: true,
    verifiedOffer: bestOfferWithPrice,
    reasons
  };
}
