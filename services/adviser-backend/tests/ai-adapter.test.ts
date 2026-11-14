import test from 'node:test';
import assert from 'node:assert/strict';
import { BoundedAiClient, MockAiProvider } from '../src/ai/adapter.ts';
import { type ProductVariant, type FactAssertion } from '../src/contracts/catalog.ts';
import { type ConfirmedNeedsProfile } from '../src/contracts/taxonomy.ts';

const testVariant: ProductVariant = {
  variantId: 'laptop-ai-test',
  familyId: 'ai-fam',
  modelName: 'AI Test Laptop',
  category: 'pc_laptop',
  brand: 'Dell',
  specifications: { ramGb: 16, os: 'Windows 11', storageGb: 512, cpu: 'i7' },
  factIds: ['fact_ram_16']
};

const testFacts: FactAssertion[] = [
  {
    factId: 'fact_ram_16',
    variantId: 'laptop-ai-test',
    domain: 'performance',
    claimText: '16GB RAM is verified',
    sourceDoc: 'manual.pdf',
    verifiedAt: '2026-11-14T08:00:00.000Z'
  }
];

const testProfile: ConfirmedNeedsProfile = {
  category: 'pc_laptop',
  orderedPurposes: ['laptop_office_study', 'laptop_software_dev', 'laptop_ultraportable'],
  orderedPriorities: ['priority_budget_savings', 'priority_performance_cpu', 'priority_battery_life'],
  budget: { hardCeilingVnd: 25_000_000 }
};

test('AI Adapter - successful provider returns verified proposal', async () => {
  const provider = new MockAiProvider();
  const client = new BoundedAiClient(provider, 1000);

  const res = await client.getExplanation({
    variant: testVariant,
    profile: testProfile,
    facts: testFacts,
    requestId: 'req-succ'
  });

  assert.equal(res.isFallback, false);
  assert.equal(res.variantId, 'laptop-ai-test');
  assert.equal(res.claims.length, 1);
  assert.equal(res.claims[0]!.factIds[0], 'fact_ram_16');
});

test('AI Adapter - provider timeout triggers deterministic fallback with AI_TIMEOUT label', async () => {
  const provider = new MockAiProvider();
  provider.shouldTimeout = true;
  provider.timeoutMs = 50;

  // Set bounded client timeout to 50ms
  const client = new BoundedAiClient(provider, 50);

  const res = await client.getExplanation({
    variant: testVariant,
    profile: testProfile,
    facts: testFacts,
    requestId: 'req-timeout'
  });

  assert.equal(res.isFallback, true);
  assert.equal(res.fallbackReason, 'AI_TIMEOUT');
  assert.equal(res.claims.length > 0, true);
});

test('AI Adapter - upstream error triggers deterministic fallback with AI_PROVIDER_ERROR label', async () => {
  const provider = new MockAiProvider();
  provider.shouldError = true;

  const client = new BoundedAiClient(provider, 1000);

  const res = await client.getExplanation({
    variant: testVariant,
    profile: testProfile,
    facts: testFacts,
    requestId: 'req-err'
  });

  assert.equal(res.isFallback, true);
  assert.match(res.fallbackReason || '', /AI_PROVIDER_ERROR/);
});

test('AI Adapter - invalid/hallucinated output triggers fallback with AI_OUTPUT_REJECTED label', async () => {
  const provider = new MockAiProvider();
  provider.shouldReturnInvalid = true;

  const client = new BoundedAiClient(provider, 1000);

  const res = await client.getExplanation({
    variant: testVariant,
    profile: testProfile,
    facts: testFacts,
    requestId: 'req-invalid'
  });

  assert.equal(res.isFallback, true);
  assert.match(res.fallbackReason || '', /AI_OUTPUT_REJECTED/);
});
