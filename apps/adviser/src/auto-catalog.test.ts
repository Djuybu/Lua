import { test } from 'node:test';
import assert from 'node:assert/strict';
import { variant } from './domain/validation';
import { filterVariants, emptyFilters } from './domain/filters';
import { loadCatalog } from './api';
import type { ProductVariant } from './catalog';

const unknown: ProductVariant = {
  variantId: 'retailer:fptshop:test', familyId: 'retailer:fptshop:test',
  modelName: 'Automatically admitted product', brand: 'Chưa xác minh', category: 'unknown',
  specifications: { ramGb: null, storageGb: null, cpu: 'Chưa xác minh', os: 'Chưa xác minh' },
  factIds: [],
};

test('auto catalog retains unknown specs in persistence and default browsing, not strict filters', () => {
  assert.equal(variant(unknown), true);
  assert.equal(filterVariants([unknown], emptyFilters, '').length, 1);
  assert.equal(filterVariants([unknown], {...emptyFilters, minRam: 8}, '').length, 0);
  assert.equal(filterVariants([unknown], {...emptyFilters, minStorage: 128}, '').length, 0);
  assert.equal(variant({...unknown, specifications: {...unknown.specifications, ramGb: -1}}), false);
});

test('HTTP catalog accepts explicit unknown RAM and storage', async () => {
  const before = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({schemaVersion:'1.0.0',
    catalogVersion:'auto',ruleVersion:'2026.11',publishedAt:'2026-11-18T00:00:00Z',
    variants:[unknown],offers:[],facts:[]}));
  try {
    const result = await loadCatalog('https://example.com', new AbortController().signal);
    assert.equal(result.variants[0].specifications.ramGb, null);
  } finally { globalThis.fetch = before; }
});
