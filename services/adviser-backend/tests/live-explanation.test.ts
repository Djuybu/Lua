import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveExplanation } from '../src/ai/live-explanation.ts';
import type { ProductVariant } from '../src/contracts/catalog.ts';
import type { ConfirmedNeedsProfile } from '../src/contracts/taxonomy.ts';
const variant: ProductVariant = { variantId: 'v1', familyId: 'f1', modelName: 'Test laptop', category: 'pc_laptop', brand: 'Test', specifications: { ramGb: 16, storageGb: 512, cpu: 'test', os: 'Windows' }, factIds: [] };
const profile: ConfirmedNeedsProfile = { category: 'pc_laptop', orderedPurposes: ['laptop_office_study', 'laptop_software_dev', 'laptop_ultraportable'], orderedPriorities: ['priority_budget_savings', 'priority_performance_cpu', 'priority_battery_life'], budget: { hardCeilingVnd: 20000000 } };
const output = (ids: string[]) => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ ids }) }] }] }));
test('Live provider sends bounded private structured request and renders only supplied facts', async () => {
  const request: typeof fetch = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options!.body as string);
    assert.equal(body.store, false); assert.equal(body.max_output_tokens, 800); assert.equal(body.text.format.strict, true);
    assert.ok(options!.signal);
    return output(['ram', 'price_unknown', 'evidence_unknown']);
  };
  const ai = new LiveExplanation({ mode: 'provider', model: 'test', key: 'test-secret', request });
  const result = await ai.explain(variant, profile, 'r1');
  assert.equal(result.isFallback, false); assert.match(result.lines[0]!, /16 GB/);
  assert.ok(!JSON.stringify(result).includes('test-secret'));
});
test('Fabricated or missing mandatory statements cannot become a successful AI result', async () => {
  for (const ids of [['ram', 'fabricated_price', 'price_unknown'], ['ram', 'os', 'category']]) {
    const ai = new LiveExplanation({ mode: 'provider', model: 'test', key: 'test', request: async () => output(ids) });
    const result = await ai.explain(variant, profile, 'r1');
    assert.equal(result.isFallback, true); assert.equal(result.fallbackReason, 'AI_OUTPUT_REJECTED');
  }
});
test('Provider errors and incomplete responses stay safe and distinguish fallback', async () => {
  for (const request of [async () => new Response('secret upstream error', { status: 401 }), async () => new Response(JSON.stringify({ status: 'incomplete' })), async () => { throw new Error('secret'); }]) {
    const ai = new LiveExplanation({ mode: 'provider', model: 'test', key: 'secret', request });
    const result = await ai.explain(variant, profile, 'r1');
    assert.equal(result.isFallback, true); assert.ok(!JSON.stringify(result).includes('secret'));
  }
});
test('Cancellation aborts the upstream request and prevents a late success', async () => {
  const controller = new AbortController();
  const request: typeof fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  const ai = new LiveExplanation({ mode: 'provider', model: 'test', key: 'test', request });
  const pending = ai.explain(variant, profile, 'r1', controller.signal);
  controller.abort();
  const result = await pending;
  assert.equal(result.isFallback, true);
  assert.equal(result.fallbackReason, 'AI_CANCELLED');
});
test('Mock never calls network and process call limit bounds live usage', async () => {
  let calls = 0;
  const request: typeof fetch = async () => { calls++; return output(['ram', 'price_unknown', 'evidence_unknown']); };
  const mock = new LiveExplanation({ mode: 'mock', model: '', key: '', request });
  assert.equal((await mock.explain(variant, profile, 'r')).fallbackReason, 'AI_MOCK'); assert.equal(calls, 0);
  const ai = new LiveExplanation({ mode: 'provider', model: 'test', key: 'test', request });
  for (let i = 0; i < 20; i++) await ai.explain(variant, profile, String(i));
  assert.equal((await ai.explain(variant, profile, 'limit')).fallbackReason, 'AI_LOCAL_LIMIT'); assert.equal(calls, 20);
});
