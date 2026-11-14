/**
 * Request and Response Envelopes for Lua Device Adviser
 */

import { type ConfirmedNeedsProfile } from './taxonomy.ts';
import { type StagedCrawlerOffer } from './crawler.ts';

export const CURRENT_SCHEMA_VERSION = '1.0.0';
export const CURRENT_RULE_VERSION = '2026.11';

export type ResponseStatus =
  | 'SUCCESS'
  | 'NO_FIT'
  | 'NO_VERIFIED_OFFER'
  | 'ERR_STALE_REVISION'
  | 'ERR_INVALID_PROFILE'
  | 'ERROR';

export interface EnvelopeMetadata {
  schemaVersion: string;
  requestId: string;
  decisionId: string;
  profileRevision: number;
  catalogVersion: string;
  ruleVersion: string;
}

export interface RecommendationRequestEnvelope extends EnvelopeMetadata {
  profile: ConfirmedNeedsProfile;
}

export interface RankedCandidate {
  variantId: string;
  modelName: string;
  brand: string;
  /** Payable total VND or null if shipping is unknown */
  totalVnd: number | null;
  /** True only if totalVnd !== null and totalVnd <= hardCeilingVnd */
  isVerifiedAffordable: boolean;
  /** Deterministic score based on user priorities (0 - 100) */
  suitabilityScore: number;
  bestOffer: StagedCrawlerOffer | null;
  reasons: string[];
  factIds: string[];
}

export interface ExcludedCandidate {
  variantId: string;
  modelName: string;
  reasonCode: 'EXCEED_BUDGET' | 'OS_MISMATCH' | 'RAM_INSUFFICIENT' | 'UNKNOWN_CAPABILITY' | 'NO_OFFERS';
  detail: string;
}

export interface SafeErrorDetail {
  code:
    | 'ERR_INVALID_PROFILE'
    | 'ERR_STALE_REVISION'
    | 'ERR_AI_TIMEOUT'
    | 'ERR_AI_INVALID_OUTPUT'
    | 'ERR_CATALOG_UNAVAILABLE'
    | 'ERR_OVERFLOW'
    | 'ERR_INTERNAL';
  message: string;
  retryable: boolean;
}

export interface RecommendationResponseEnvelope extends EnvelopeMetadata {
  status: ResponseStatus;
  shortlist: RankedCandidate[];
  excludedVariants: ExcludedCandidate[];
  error?: SafeErrorDetail;
}
