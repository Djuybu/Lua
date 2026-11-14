import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { type AddressInfo } from 'node:net';
import { createHttpServer } from '../src/server/http-app.ts';
import { AdviserSqliteStore } from '../src/data/sqlite.ts';
import { BoundedAiClient, MockAiProvider } from '../src/ai/adapter.ts';
import { type SnapshotManifest } from '../src/contracts/catalog.ts';
import { type RecommendationRequestEnvelope } from '../src/contracts/envelope.ts';

function makeRequest(
  port: number,
  path: string,
  method: string,
  body?: any
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
        }
      },
      res => {
        let raw = '';
        res.on('data', chunk => (raw += chunk));
        res.on('end', () => {
          try {
            const parsed = raw ? JSON.parse(raw) : {};
            resolve({ status: res.statusCode || 500, data: parsed });
          } catch (e) {
            resolve({ status: res.statusCode || 500, data: raw });
          }
        });
      }
    );

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

const sampleManifest: SnapshotManifest = {
  schemaVersion: '1.0.0',
  catalogVersion: 'http-cat-v1',
  ruleVersion: '2026.11',
  publishedAt: '2026-11-14T08:00:00.000Z',
  variants: [
    {
      variantId: 'laptop-http-1',
      familyId: 'fam-h',
      modelName: 'Laptop HTTP Test',
      category: 'pc_laptop',
      brand: 'Asus',
      specifications: { ramGb: 16, os: 'Windows 11', storageGb: 512, cpu: 'i5' },
      factIds: []
    }
  ],
  facts: [],
  offers: [
    {
      sourceId: 'shopX',
      externalOfferId: 'ox-1',
      matchedVariantId: 'laptop-http-1',
      condition: 'NEW',
      stockStatus: 'IN_STOCK',
      basePriceVnd: 15_000_000,
      mandatoryFeesVnd: 0,
      shippingVnd: 50_000,
      conditionalDiscountVnd: 0,
      sourceUrl: 'https://shopx.com/item',
      observedAt: '2026-11-14T08:00:00.000Z',
      completenessStatus: 'COMPLETE'
    }
  ]
};

test('HTTP Server Boundary - live localhost network integration', async () => {
  const store = new AdviserSqliteStore(':memory:');
  store.activateSnapshot(sampleManifest);

  const provider = new MockAiProvider();
  const aiClient = new BoundedAiClient(provider, 1000);
  const server = createHttpServer(store, aiClient);

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    // 1. GET /health
    const health = await makeRequest(port, '/health', 'GET');
    assert.equal(health.status, 200);
    assert.equal(health.data.status, 'ok');
    assert.equal(health.data.catalogVersion, 'http-cat-v1');

    // 2. Valid POST /advisor/v1/recommend
    const validReq: RecommendationRequestEnvelope = {
      schemaVersion: '1.0.0',
      requestId: 'req-net-1',
      decisionId: 'dec-net-1',
      profileRevision: 1,
      catalogVersion: 'http-cat-v1',
      ruleVersion: '2026.11',
      profile: {
        category: 'pc_laptop',
        orderedPurposes: ['laptop_office_study', 'laptop_software_dev', 'laptop_ultraportable'],
        orderedPriorities: ['priority_budget_savings', 'priority_performance_cpu', 'priority_battery_life'],
        budget: { hardCeilingVnd: 20_000_000 }
      }
    };

    const recRes = await makeRequest(port, '/advisor/v1/recommend', 'POST', validReq);
    assert.equal(recRes.status, 200);
    assert.equal(recRes.data.status, 'SUCCESS');
    assert.equal(recRes.data.shortlist.length, 1);
    assert.equal(recRes.data.shortlist[0].variantId, 'laptop-http-1');
    assert.equal(recRes.data.shortlist[0].totalVnd, 15_050_000);
    assert.equal(recRes.data.shortlist[0].isVerifiedAffordable, true);

    // 3. Invalid Profile POST /advisor/v1/recommend (only 1 purpose)
    const invalidReq = {
      ...validReq,
      profile: {
        ...validReq.profile,
        orderedPurposes: ['laptop_office_study']
      }
    };
    const invalidRes = await makeRequest(port, '/advisor/v1/recommend', 'POST', invalidReq);
    assert.equal(invalidRes.status, 400);
    assert.equal(invalidRes.data.status, 'ERR_INVALID_PROFILE');
    assert.equal(invalidRes.data.error.code, 'ERR_INVALID_PROFILE');

    // 4. POST /advisor/v1/ingest
    const ingestRes = await makeRequest(port, '/advisor/v1/ingest', 'POST', [
      {
        sourceId: 'shopY',
        externalOfferId: 'oy-1',
        matchedVariantId: 'laptop-http-1',
        condition: 'NEW',
        stockStatus: 'IN_STOCK',
        basePriceVnd: 14_900_000,
        mandatoryFeesVnd: 0,
        shippingVnd: 20_000,
        conditionalDiscountVnd: 0,
        sourceUrl: 'https://shopy.com',
        observedAt: '2026-11-14T09:00:00.000Z',
        completenessStatus: 'COMPLETE'
      }
    ]);
    assert.equal(ingestRes.status, 200);
    assert.equal(ingestRes.data.count, 1);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  }
});
