import test from 'node:test';
import assert from 'node:assert/strict';
import { StagingIngestStore } from '../src/data/ingest.ts';
import { type StagedCrawlerOffer } from '../src/contracts/crawler.ts';

test('Ingest - accepts valid staged offers and updates observation count', () => {
  const store = new StagingIngestStore(['macbook-air-m2-8-256', 'dell-xps-13']);

  const sampleOffer: StagedCrawlerOffer = {
    sourceId: 'cellphones',
    externalOfferId: 'cps-9988',
    matchedVariantId: 'macbook-air-m2-8-256',
    condition: 'NEW',
    stockStatus: 'IN_STOCK',
    basePriceVnd: 24_000_000,
    mandatoryFeesVnd: 0,
    shippingVnd: 0,
    conditionalDiscountVnd: 0,
    sourceUrl: 'https://cellphones.com.vn/macbook-air-m2.html',
    observedAt: '2026-11-14T09:00:00.000Z',
    completenessStatus: 'COMPLETE'
  };

  const report = store.ingest([sampleOffer]);
  assert.equal(report.accepted, 1);
  assert.equal(report.rejected, 0);
  assert.equal(report.duplicateIgnored, 0);
  assert.equal(store.getObservationCount(), 1);
});

test('Ingest - idempotent: identical observation is ignored without duplicate count', () => {
  const store = new StagingIngestStore(['macbook-air-m2-8-256']);

  const offer: StagedCrawlerOffer = {
    sourceId: 'cellphones',
    externalOfferId: 'cps-9988',
    matchedVariantId: 'macbook-air-m2-8-256',
    condition: 'NEW',
    stockStatus: 'IN_STOCK',
    basePriceVnd: 24_000_000,
    mandatoryFeesVnd: 0,
    shippingVnd: 0,
    conditionalDiscountVnd: 0,
    sourceUrl: 'https://cellphones.com.vn/macbook-air-m2.html',
    observedAt: '2026-11-14T09:00:00.000Z',
    completenessStatus: 'COMPLETE'
  };

  // First ingest
  const r1 = store.ingest([offer]);
  assert.equal(r1.accepted, 1);
  assert.equal(r1.duplicateIgnored, 0);

  // Re-ingest exact same observation
  const r2 = store.ingest([offer]);
  assert.equal(r2.accepted, 0);
  assert.equal(r2.duplicateIgnored, 1);
  assert.equal(store.getObservationCount(), 1);
});

test('Ingest - updates latest offer when newer observation arrives for same stable key', () => {
  const store = new StagingIngestStore(['macbook-air-m2-8-256']);

  const offer1: StagedCrawlerOffer = {
    sourceId: 'cellphones',
    externalOfferId: 'cps-9988',
    matchedVariantId: 'macbook-air-m2-8-256',
    condition: 'NEW',
    stockStatus: 'IN_STOCK',
    basePriceVnd: 24_000_000,
    mandatoryFeesVnd: 0,
    shippingVnd: 0,
    conditionalDiscountVnd: 0,
    sourceUrl: 'https://cellphones.com.vn/macbook-air-m2.html',
    observedAt: '2026-11-14T08:00:00.000Z',
    completenessStatus: 'COMPLETE'
  };

  const offer2: StagedCrawlerOffer = {
    ...offer1,
    basePriceVnd: 23_500_000, // Price dropped
    observedAt: '2026-11-14T10:00:00.000Z'
  };

  store.ingest([offer1, offer2]);
  assert.equal(store.getObservationCount(), 2);

  const latest = store.getLatestOffersForVariant('macbook-air-m2-8-256');
  assert.equal(latest.length, 1);
  assert.equal(latest[0]!.basePriceVnd, 23_500_000);
});

test('Ingest - rejects offer referencing unknown catalog variant', () => {
  const store = new StagingIngestStore(['macbook-air-m2-8-256']);

  const phantomOffer: StagedCrawlerOffer = {
    sourceId: 'unknown_shop',
    externalOfferId: 'p-1',
    matchedVariantId: 'non-existent-device-xyz',
    condition: 'NEW',
    stockStatus: 'IN_STOCK',
    basePriceVnd: 10_000_000,
    mandatoryFeesVnd: 0,
    shippingVnd: 0,
    conditionalDiscountVnd: 0,
    sourceUrl: 'https://unknown.com',
    observedAt: '2026-11-14T10:00:00.000Z',
    completenessStatus: 'COMPLETE'
  };

  const report = store.ingest([phantomOffer]);
  assert.equal(report.accepted, 0);
  assert.equal(report.rejected, 1);
  assert.match(report.rejectedReasons[0]!.reason, /does not match any known catalog variant/);
});
