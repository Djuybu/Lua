/**
 * AI Proposal and Claim Validator (BR-07, U10)
 * Validates AI proposals against schema, discriminated unions, and catalog truth.
 * Rejects hallucinated fact IDs, invalid patch operations, and stale revisions.
 */

import {
  type AiNeedsPatchProposal,
  type AiExplanationProposal,
  type NeedsPatchOp,
  type PatchPath
} from '../contracts/ai.ts';
import {
  VALID_CATEGORIES,
  CATEGORY_PURPOSES,
  VALID_PRIORITIES,
  type DeviceCategory,
  type AdviserPriority
} from '../contracts/taxonomy.ts';
import { isValidVnd } from '../contracts/money.ts';

export interface PatchValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ExplanationValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates an AI patch proposal against active profile revision and discriminated union rules.
 */
export function validateNeedsPatchProposal(
  proposal: unknown,
  activeProfileRevision: number
): PatchValidationResult {
  const errors: string[] = [];

  if (!proposal || typeof proposal !== 'object') {
    return { valid: false, errors: ['Proposal must be an object'] };
  }

  const p = proposal as Partial<AiNeedsPatchProposal>;

  if (typeof p.baseProfileRevision !== 'number') {
    errors.push('baseProfileRevision must be a number');
  } else if (p.baseProfileRevision !== activeProfileRevision) {
    errors.push(
      `ERR_STALE_REVISION: baseProfileRevision (${p.baseProfileRevision}) does not match active revision (${activeProfileRevision})`
    );
  }

  if (!Array.isArray(p.patch)) {
    errors.push('patch must be an array of operations');
    return { valid: errors.length === 0, errors };
  }

  for (let i = 0; i < p.patch.length; i++) {
    const rawOp = p.patch[i] as any;
    if (!rawOp || typeof rawOp !== 'object') {
      errors.push(`Operation at index ${i} must be an object`);
      continue;
    }

    const { op, path } = rawOp;
    if (op !== 'SET' && op !== 'CLEAR') {
      errors.push(`Operation at index ${i} has invalid op: '${op}'. Must be 'SET' or 'CLEAR'.`);
      continue;
    }

    const validPaths: PatchPath[] = ['category', 'hardCeilingVnd', 'orderedPurposes', 'orderedPriorities'];
    if (!validPaths.includes(path)) {
      errors.push(`Operation at index ${i} has invalid path: '${path}'.`);
      continue;
    }

    if (op === 'CLEAR') {
      if (rawOp.value !== undefined) {
        errors.push(`Operation at index ${i} is CLEAR but contains an unexpected 'value' property.`);
      }
    } else if (op === 'SET') {
      const val = rawOp.value;
      if (path === 'category') {
        if (!VALID_CATEGORIES.includes(val as DeviceCategory)) {
          errors.push(`Invalid category in SET operation: '${val}'`);
        }
      } else if (path === 'hardCeilingVnd') {
        if (!isValidVnd(val) || val <= 0) {
          errors.push(`Invalid hardCeilingVnd in SET operation: '${val}'. Must be a positive safe integer.`);
        }
      } else if (path === 'orderedPurposes') {
        if (!Array.isArray(val) || val.length !== 3) {
          errors.push('orderedPurposes SET operation must contain exactly 3 items');
        } else if (new Set(val).size !== 3) {
          errors.push('orderedPurposes SET operation must not contain duplicates');
        }
      } else if (path === 'orderedPriorities') {
        if (!Array.isArray(val) || val.length !== 3) {
          errors.push('orderedPriorities SET operation must contain exactly 3 items');
        } else if (new Set(val).size !== 3) {
          errors.push('orderedPriorities SET operation must not contain duplicates');
        } else {
          for (const prio of val) {
            if (!VALID_PRIORITIES.includes(prio as AdviserPriority)) {
              errors.push(`Invalid priority in SET operation: '${prio}'`);
            }
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates an AI explanation proposal, ensuring no hallucinated fact IDs or invalid claim kinds.
 */
export function validateExplanationProposal(
  proposal: unknown,
  expectedVariantId: string,
  knownFactIds: Set<string>
): ExplanationValidationResult {
  const errors: string[] = [];

  if (!proposal || typeof proposal !== 'object') {
    return { valid: false, errors: ['Explanation proposal must be an object'] };
  }

  const p = proposal as Partial<AiExplanationProposal>;

  if (p.variantId !== expectedVariantId) {
    errors.push(`variantId '${p.variantId}' does not match requested variant '${expectedVariantId}'`);
  }

  if (!Array.isArray(p.claims)) {
    errors.push('claims must be an array');
    return { valid: errors.length === 0, errors };
  }

  const validKinds = ['advantage', 'limitation', 'exclusion', 'unknown'];

  for (let i = 0; i < p.claims.length; i++) {
    const claim = p.claims[i] as any;
    if (!claim || typeof claim !== 'object') {
      errors.push(`Claim at index ${i} must be an object`);
      continue;
    }

    if (!validKinds.includes(claim.kind)) {
      errors.push(`Claim at index ${i} has invalid kind: '${claim.kind}'`);
    }

    if (!claim.wordingKey || typeof claim.wordingKey !== 'string') {
      errors.push(`Claim at index ${i} must have a valid wordingKey string`);
    }

    if (!Array.isArray(claim.factIds)) {
      errors.push(`Claim at index ${i} factIds must be an array`);
      continue;
    }

    // Verify every factId exists in known facts (anti-hallucination guard)
    for (const fId of claim.factIds) {
      if (!knownFactIds.has(fId)) {
        errors.push(`Claim at index ${i} references unknown or fabricated factId: '${fId}'`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
