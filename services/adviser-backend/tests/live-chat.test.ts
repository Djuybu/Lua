import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveChat } from '../src/ai/live-chat.ts';

const variant: any = {
  variantId: 'retailer:test:1', familyId: 'retailer:test:1', modelName: 'Laptop Test', brand: 'Test', category: 'pc_laptop',
  factIds: [], specifications: { ramGb: 16, storageGb: 512, cpu: 'CPU Test', os: 'Chưa xác minh' },
  sourceUrl: 'https://example.com/laptop', observedPriceVnd: 20000000,
};

test('live chat returns provider reply with server-owned catalog sources', async () => {
  const request = async () => new Response(JSON.stringify({
    status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({
      answer: 'Có một cấu hình tham khảo.',
      proposal: {
        category: 'pc_laptop',
        purposes: ['laptop_office_study', 'laptop_software_dev', 'laptop_ultraportable'],
        priorities: ['priority_budget_savings', 'priority_performance_cpu', 'priority_portability_weight'],
        budget: '20000000', minRam: '16', os: 'Windows 11',
      },
    }) }] }],
  }), { status: 200 });
  const chat = new LiveChat({ mode: 'provider', model: 'test-model', key: 'test-key', timeoutMs: 5000, request: request as typeof fetch });
  const reply = await chat.reply({ text: 'Tìm laptop', history: [], profileRevision: 0 }, [variant]);
  assert.equal(reply.mode, 'provider');
  assert.equal(reply.sources[0]!.url, variant.sourceUrl);
  assert.equal(reply.text, 'Có một cấu hình tham khảo.');
  assert.equal(reply.proposal?.baseProfileRevision, 0);
  assert.equal(reply.proposal?.draft.budget, '20000000');
});

test('live chat fallback never invents a source', async () => {
  const chat = new LiveChat({ mode: 'fallback_only', model: '', key: '', timeoutMs: 5000 });
  const reply = await chat.reply({ text: 'Tìm laptop', history: [], profileRevision: 0 }, [{ ...variant, sourceUrl: 'javascript:bad' }]);
  assert.equal(reply.mode, 'fallback');
  assert.deepEqual(reply.sources, []);
});

