import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNeedsPatchProposal, validateExplanationProposal } from '../src/ai/validator.ts';
import { type AiNeedsPatchProposal, type AiExplanationProposal } from '../src/contracts/ai.ts';

test('AI Validator - valid patch proposal passes', () => {
  const proposal: AiNeedsPatchProposal = {
    requestId: 'req-1',
    baseProfileRevision: 2,
    patch: [
      {
        op: 'SET',
        path: 'hardCeilingVnd',
        value: 22_000_000,
        reasoning: 'User asked to increase budget to 22 million'
      },
      {
        op: 'CLEAR',
        path: 'orderedPriorities',
        reasoning: 'User wants to re-select priorities'
      }
    ],
    isFallback: false
  };

  const res = validateNeedsPatchProposal(proposal, 2);
  assert.equal(res.valid, true);
  assert.equal(res.errors.length, 0);
});

test('AI Validator - stale profile revision is rejected', () => {
  const proposal: AiNeedsPatchProposal = {
    requestId: 'req-1',
    baseProfileRevision: 1, // Stale! Active is 2
    patch: [
      {
        op: 'SET',
        path: 'hardCeilingVnd',
        value: 20_000_000,
        reasoning: 'Update'
      }
    ],
    isFallback: false
  };

  const res = validateNeedsPatchProposal(proposal, 2);
  assert.equal(res.valid, false);
  assert.match(res.errors.join('; '), /ERR_STALE_REVISION/);
});

test('AI Validator - rejects CLEAR operation that includes a value property', () => {
  const proposal = {
    requestId: 'req-1',
    baseProfileRevision: 1,
    patch: [
      {
        op: 'CLEAR',
        path: 'category',
        value: 'phone', // FORBIDDEN in CLEAR!
        reasoning: 'Invalid'
      }
    ],
    isFallback: false
  };

  const res = validateNeedsPatchProposal(proposal, 1);
  assert.equal(res.valid, false);
  assert.match(res.errors.join('; '), /unexpected 'value' property/);
});

test('AI Validator - rejects SET operation with invalid amount or type', () => {
  const proposal = {
    requestId: 'req-1',
    baseProfileRevision: 1,
    patch: [
      {
        op: 'SET',
        path: 'hardCeilingVnd',
        value: -5000, // Negative money!
        reasoning: 'Invalid'
      }
    ],
    isFallback: false
  };

  const res = validateNeedsPatchProposal(proposal, 1);
  assert.equal(res.valid, false);
  assert.match(res.errors.join('; '), /positive safe integer/);
});

test('AI Validator - rejects explanation with hallucinated or unknown factId', () => {
  const knownFactIds = new Set(['fact_ram_16', 'fact_battery_50wh']);

  const proposal: AiExplanationProposal = {
    requestId: 'req-2',
    variantId: 'thinkpad-t14',
    claims: [
      {
        kind: 'advantage',
        relation: 'HIGH_RAM',
        factIds: ['fact_ram_16', 'hallucinated_fact_999'], // Fabricated ID!
        wordingKey: 'wording_ram'
      }
    ],
    isFallback: false
  };

  const res = validateExplanationProposal(proposal, 'thinkpad-t14', knownFactIds);
  assert.equal(res.valid, false);
  assert.match(res.errors.join('; '), /unknown or fabricated factId/);
});
