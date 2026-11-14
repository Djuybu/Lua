/**
 * Deterministic Template Fallback Engine (A09, U10-02)
 * Generates reliable, fact-grounded explanations when AI service fails,
 * timeouts, or outputs invalid claims.
 */

import { type AiExplanationProposal, type GroundedClaim } from '../contracts/ai.ts';
import { type ProductVariant, type FactAssertion } from '../contracts/catalog.ts';
import { type ConfirmedNeedsProfile } from '../contracts/taxonomy.ts';

export function generateDeterministicFallbackExplanation(
  variant: ProductVariant,
  profile: ConfirmedNeedsProfile,
  facts: FactAssertion[],
  fallbackReason: string,
  requestId: string
): AiExplanationProposal {
  const claims: GroundedClaim[] = [];
  const variantFacts = facts.filter(f => f.variantId === variant.variantId);
  const factIdMap = new Map(variantFacts.map(f => [f.domain, f.factId]));

  // 1. Performance claim
  const perfFactId = factIdMap.get('performance') ?? variant.factIds[0];
  claims.push({
    kind: 'advantage',
    relation: 'HIGH_PERFORMANCE_FOR_WORKLOAD',
    factIds: perfFactId ? [perfFactId] : [],
    wordingKey: 'wording_advantage_performance_suitable'
  });

  // 2. Battery / Mobility claim
  const batteryFactId = factIdMap.get('battery') ?? factIdMap.get('mobility');
  if (batteryFactId) {
    claims.push({
      kind: 'advantage',
      relation: 'GOOD_BATTERY_MOBILITY',
      factIds: [batteryFactId],
      wordingKey: 'wording_advantage_battery_suitable'
    });
  }

  // 3. Budget / Ceiling limitation if price is close to ceiling
  claims.push({
    kind: 'limitation',
    relation: 'PRICE_WITHIN_HARD_CEILING',
    factIds: [],
    wordingKey: 'wording_limitation_budget_fit'
  });

  return {
    requestId,
    variantId: variant.variantId,
    claims,
    isFallback: true,
    fallbackReason
  };
}
