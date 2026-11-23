import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveExplanation, bestOfficialOffer, explanationFacts, payableTotalVnd } from '../src/ai/live-explanation.ts';
import type { ProductVariant } from '../src/contracts/catalog.ts';
import type { ConfirmedNeedsProfile } from '../src/contracts/taxonomy.ts';
import type { StagedCrawlerOffer } from '../src/contracts/crawler.ts';
const variant: ProductVariant = { variantId: 'v1', familyId: 'f1', modelName: 'Test laptop', category: 'pc_laptop', brand: 'Test', specifications: { ramGb: 16, storageGb: 512, cpu: 'test', os: 'Windows', batteryWattHours: 60 }, factIds: [] };
const profile: ConfirmedNeedsProfile = { category: 'pc_laptop', orderedPurposes: ['laptop_office_study', 'laptop_software_dev', 'laptop_ultraportable'], orderedPriorities: ['priority_budget_savings', 'priority_performance_cpu', 'priority_battery_life'], budget: { hardCeilingVnd: 20000000 } };
const offer: StagedCrawlerOffer = { sourceId: 'laptopaz', externalOfferId: 'SP1', matchedVariantId: 'v1', condition: 'NEW', stockStatus: 'IN_STOCK', basePriceVnd: 19990000, mandatoryFeesVnd: 0, shippingVnd: 0, conditionalDiscountVnd: 0, sourceUrl: 'https://example.com/sp1', observedAt: '2026-11-14T05:49:52.231000+00:00', completenessStatus: 'COMPLETE' };
const output = (ids: string[]) => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ ids }) }] }] }));
test('official offers produce a payable total and ground every explanation', () => {
  assert.equal(payableTotalVnd(offer), 19990000);
  assert.equal(bestOfficialOffer([offer], 'v1')?.totalVnd, 19990000);
  assert.equal(payableTotalVnd({ ...offer, mandatoryFeesVnd: null }), null);
  // Conditional promotions are never subtracted from the official payable total.
  assert.equal(payableTotalVnd({ ...offer, conditionalDiscountVnd: 500000 }), 19990000);
  const facts = explanationFacts(variant, profile, [offer]);
  assert.match(facts.find(f => f.id === 'price')!.text, /19\.990\.000/);
  assert.match(facts.find(f => f.id === 'assessment')!.text, /đáp ứng/);
  assert.ok(!facts.some(f => f.id === 'price_unknown'));
});
test('Live provider receives the question and renders only supplied official facts', async () => {
  const request: typeof fetch = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options!.body as string);
    assert.equal(body.store, false); assert.equal(body.max_output_tokens, 800); assert.equal(body.text.format.strict, true);
    const input = JSON.parse(body.input);
    assert.equal(input.question, 'Máy này có trong ngân sách không?');
    assert.ok(input.statements.some((statement: any) => /Giá chính thức/.test(statement.text)));
    assert.ok(options!.signal);
    return output(['price', 'budget', 'assessment']);
  };
  const ai = new LiveExplanation({ mode: 'provider', model: 'test', key: 'test-secret', request });
  const result = await ai.explain(variant, profile, [offer], 'r1', 'Máy này có trong ngân sách không?');
  assert.equal(result.isFallback, false); assert.match(result.lines[0]!, /Giá chính thức/);
  assert.ok(!JSON.stringify(result).includes('test-secret'));
});
test('Fabricated, duplicated, too short or unknown statements cannot become a successful AI result', async () => {
  for (const ids of [['ram', 'fabricated_price', 'price_unknown'], ['ram', 'cpu', 'cpu'], ['ram', 'cpu'], ['ram', 'cpu', 'os', 'storage', 'gpu', 'display', 'weight', 'battery']]) {
    const ai = new LiveExplanation({ mode: 'provider', model: 'test', key: 'test', request: async () => output(ids) });
    const result = await ai.explain(variant, profile, [offer], 'r1');
    assert.equal(result.isFallback, true); assert.equal(result.fallbackReason, 'AI_OUTPUT_REJECTED');
  }
});
test('Provider errors and incomplete responses stay safe and distinguish fallback', async () => {
  for (const request of [async () => new Response('secret upstream error', { status: 401 }), async () => new Response(JSON.stringify({ status: 'incomplete' })), async () => { throw new Error('secret'); }]) {
    const ai = new LiveExplanation({ mode: 'provider', model: 'test', key: 'secret', request });
    const result = await ai.explain(variant, profile, [offer], 'r1');
    assert.equal(result.isFallback, true); assert.ok(!JSON.stringify(result).includes('secret'));
  }
});
test('Cancellation aborts the upstream request and prevents a late success', async () => {
  const controller = new AbortController();
  const request: typeof fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  const ai = new LiveExplanation({ mode: 'provider', model: 'test', key: 'test', request });
  const pending = ai.explain(variant, profile, [offer], 'r1', null, controller.signal);
  controller.abort();
  const result = await pending;
  assert.equal(result.isFallback, true);
  assert.equal(result.fallbackReason, 'AI_CANCELLED');
});
test('Mock returns official price without network and answers the asked topic first', async () => {
  let calls = 0;
  const request: typeof fetch = async () => { calls++; return output(['price', 'budget', 'ram']); };
  const mock = new LiveExplanation({ mode: 'mock', model: '', key: '', request });
  const result = await mock.explain(variant, profile, [offer], 'r', 'Pin có lâu không?');
  assert.equal(result.fallbackReason, 'AI_MOCK');
  assert.equal(calls, 0);
  assert.match(result.lines[0]!, /Pin chính thức 60 Wh/);
  assert.ok(result.lines.some(line => /Giá chính thức/.test(line)));
  assert.ok(!result.lines.some(line => /Chưa xác minh được tổng tiền/.test(line)));
});
test('Process call limit bounds live usage', async () => {
  let calls = 0;
  const request: typeof fetch = async () => { calls++; return output(['price', 'budget', 'ram']); };
  const ai = new LiveExplanation({ mode: 'provider', model: 'test', key: 'test', request });
  for (let i = 0; i < 20; i++) await ai.explain(variant, profile, [offer], String(i));
  const result = await ai.explain(variant, profile, [offer], 'limit');
  assert.equal(result.fallbackReason, 'AI_LOCAL_LIMIT'); assert.equal(calls, 20);
});
test('Missing offers never invent a price or affordability claim', async () => {
  const ai = new LiveExplanation({ mode: 'mock', model: '', key: '' });
  const result = await ai.explain(variant, profile, [], 'r');
  assert.ok(result.lines.some(line => /chưa có chào bán/.test(line)));
  assert.ok(!result.lines.some(line => /Giá chính thức [\d.]/.test(line)));
  assert.match(result.lines.find(line => /Kết luận/.test(line))!, /chưa có tổng giá đầy đủ/);
});
