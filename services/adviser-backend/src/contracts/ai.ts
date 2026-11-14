/**
 * AI Proposal and Patch Contracts
 * Uses discriminated unions for safe runtime validation of AI operations.
 */

import { type DeviceCategory } from './taxonomy.ts';

export type PatchPath =
  | 'category'
  | 'hardCeilingVnd'
  | 'orderedPurposes'
  | 'orderedPriorities';

export interface SetCategoryOp {
  op: 'SET';
  path: 'category';
  value: DeviceCategory;
  reasoning: string;
}

export interface SetCeilingOp {
  op: 'SET';
  path: 'hardCeilingVnd';
  value: number;
  reasoning: string;
}

export interface SetPurposesOp {
  op: 'SET';
  path: 'orderedPurposes';
  value: readonly [string, string, string];
  reasoning: string;
}

export interface SetPrioritiesOp {
  op: 'SET';
  path: 'orderedPriorities';
  value: readonly [string, string, string];
  reasoning: string;
}

export interface ClearOp {
  op: 'CLEAR';
  path: PatchPath;
  reasoning: string;
}

export type NeedsPatchOp =
  | SetCategoryOp
  | SetCeilingOp
  | SetPurposesOp
  | SetPrioritiesOp
  | ClearOp;

export interface AiNeedsPatchProposal {
  requestId: string;
  baseProfileRevision: number;
  patch: NeedsPatchOp[];
  isFallback: boolean;
  fallbackReason?: string;
}

export type ClaimKind = 'advantage' | 'limitation' | 'exclusion' | 'unknown';

export interface GroundedClaim {
  kind: ClaimKind;
  relation: string;
  factIds: string[];
  wordingKey: string;
}

export interface AiExplanationProposal {
  requestId: string;
  variantId: string;
  claims: GroundedClaim[];
  isFallback: boolean;
  fallbackReason?: string;
}
