/**
 * Deterministic Ranking Engine
 * Ranks eligible candidates strictly according to the 3 ordered user priorities.
 * Weights: Priority 1 (50%), Priority 2 (30%), Priority 3 (20%).
 * Tie-breaker: lowest total price, then variantId.
 */

import { type ConfirmedNeedsProfile, type AdviserPriority } from '../contracts/taxonomy.ts';
import { type ProductVariant, type FactAssertion } from '../contracts/catalog.ts';
import { type RankedCandidate } from '../contracts/envelope.ts';
import { type EligibilityResult } from './eligibility.ts';

interface ScoredVariant {
  variant: ProductVariant;
  eligibility: EligibilityResult;
  score: number;
}

/**
 * Calculates a normalized score (0 - 100) for a specific priority.
 */
function scorePriority(
  priority: AdviserPriority,
  variant: ProductVariant,
  eligibility: EligibilityResult,
  profile: ConfirmedNeedsProfile
): number {
  const specs = variant.specifications;
  const ceiling = profile.budget.hardCeilingVnd;
  const totalVnd = eligibility.verifiedOffer?.price.totalVnd ?? eligibility.verifiedOffer?.offer.basePriceVnd ?? ceiling;

  switch (priority) {
    case 'priority_budget_savings': {
      // More savings below ceiling -> higher score
      const savings = Math.max(0, ceiling - totalVnd);
      const ratio = savings / ceiling;
      return Math.min(100, Math.round(ratio * 100));
    }

    case 'priority_performance_cpu': {
      // Based on RAM and CPU core/class heuristic
      let ramScore = Math.min(60, ((specs.ramGb ?? 0) / 32) * 60);
      let cpuBonus = 20;
      const cpu = specs.cpu.toLowerCase();
      if (cpu.includes('i7') || cpu.includes('i9') || cpu.includes('ryzen 7') || cpu.includes('ryzen 9') || cpu.includes('m2') || cpu.includes('m3')) {
        cpuBonus = 40;
      }
      return Math.min(100, Math.round(ramScore + cpuBonus));
    }

    case 'priority_portability_weight': {
      // Lighter weight -> higher score (e.g. 1.0kg = 100, 2.5kg = 20)
      const weight = specs.weightKg ?? 1.8;
      if (weight <= 1.2) return 100;
      if (weight <= 1.5) return 85;
      if (weight <= 2.0) return 60;
      return 30;
    }

    case 'priority_battery_life': {
      const wh = specs.batteryWattHours ?? 50;
      if (wh >= 70) return 100;
      if (wh >= 55) return 75;
      return 50;
    }

    case 'priority_build_durability':
    case 'priority_warranty_support': {
      // New condition gets top score
      return eligibility.verifiedOffer?.offer.condition === 'NEW' ? 100 : 70;
    }

    case 'priority_graphics_gpu': {
      return specs.gpu ? 100 : 40;
    }

    default:
      return 70;
  }
}

/**
 * Deterministically ranks eligible candidates based on ordered priorities.
 */
export function rankEligibleCandidates(
  eligibleList: Array<{ variant: ProductVariant; eligibility: EligibilityResult }>,
  profile: ConfirmedNeedsProfile,
  facts: FactAssertion[] = []
): RankedCandidate[] {
  const [p1, p2, p3] = profile.orderedPriorities as [AdviserPriority, AdviserPriority, AdviserPriority];

  const scoredList: ScoredVariant[] = eligibleList.map(({ variant, eligibility }) => {
    const s1 = scorePriority(p1, variant, eligibility, profile);
    const s2 = scorePriority(p2, variant, eligibility, profile);
    const s3 = scorePriority(p3, variant, eligibility, profile);

    // Strict 50% / 30% / 20% weighting
    const compositeScore = Math.round(s1 * 0.5 + s2 * 0.3 + s3 * 0.2);

    return {
      variant,
      eligibility,
      score: compositeScore
    };
  });

  // Sort by composite score desc, then total price asc, then variantId asc
  scoredList.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    const priceA = a.eligibility.verifiedOffer?.price.totalVnd ?? Number.MAX_SAFE_INTEGER;
    const priceB = b.eligibility.verifiedOffer?.price.totalVnd ?? Number.MAX_SAFE_INTEGER;
    if (priceA !== priceB) {
      return priceA - priceB;
    }

    return a.variant.variantId.localeCompare(b.variant.variantId);
  });

  return scoredList.map(({ variant, eligibility, score }) => {
    const offerDetails = eligibility.verifiedOffer;
    const totalVnd = offerDetails?.price.totalVnd ?? null;
    const isVerifiedAffordable =
      totalVnd !== null && totalVnd <= profile.budget.hardCeilingVnd;

    // Filter relevant fact IDs
    const matchedFactIds = facts
      .filter(f => f.variantId === variant.variantId)
      .map(f => f.factId);

    return {
      variantId: variant.variantId,
      modelName: variant.modelName,
      brand: variant.brand,
      totalVnd,
      isVerifiedAffordable,
      suitabilityScore: score,
      bestOffer: offerDetails?.offer ?? null,
      reasons: eligibility.reasons,
      factIds: matchedFactIds
    };
  });
}
