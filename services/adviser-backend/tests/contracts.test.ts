import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfirmedProfile, type ConfirmedNeedsProfile } from '../src/contracts/taxonomy.ts';
import { validateStagedCrawlerOffer, type StagedCrawlerOffer } from '../src/contracts/crawler.ts';

test('Taxonomy - valid confirmed profile passes validation', () => {
  const profile: ConfirmedNeedsProfile = {
    category: 'pc_laptop',
    orderedPurposes: ['laptop_office_study', 'laptop_software_dev', 'laptop_ultraportable'],
    orderedPriorities: ['priority_performance_cpu', 'priority_battery_life', 'priority_budget_savings'],
    budget: {
      hardCeilingVnd: 25_000_000,
      preferredBand: [20_000_000, 24_000_000]
    }
  };

  const res = validateConfirmedProfile(profile);
  assert.equal(res.valid, true);
  assert.equal(res.errors.length, 0);
});

test('Taxonomy - rejects profile without exactly 3 ordered purposes or priorities', () => {
  // Only 2 purposes
  const p1 = {
    category: 'pc_laptop',
    orderedPurposes: ['laptop_office_study', 'laptop_software_dev'],
    orderedPriorities: ['priority_performance_cpu', 'priority_battery_life', 'priority_budget_savings'],
    budget: { hardCeilingVnd: 20_000_000 }
  };
  const r1 = validateConfirmedProfile(p1);
  assert.equal(r1.valid, false);
  assert.match(r1.errors.join('; '), /exactly 3 items/);

  // 4 priorities
  const p2 = {
    category: 'pc_laptop',
    orderedPurposes: ['laptop_office_study', 'laptop_software_dev', 'laptop_ultraportable'],
    orderedPriorities: [
      'priority_performance_cpu',
      'priority_battery_life',
      'priority_budget_savings',
      'priority_portability_weight'
    ],
    budget: { hardCeilingVnd: 20_000_000 }
  };
  const r2 = validateConfirmedProfile(p2);
  assert.equal(r2.valid, false);
  assert.match(r2.errors.join('; '), /exactly 3 items/);
});

test('Taxonomy - rejects duplicates in purposes or priorities', () => {
  const p = {
    category: 'phone',
    orderedPurposes: ['phone_photography', 'phone_photography', 'phone_daily_comms'],
    orderedPriorities: ['priority_battery_life', 'priority_battery_life', 'priority_budget_savings'],
    budget: { hardCeilingVnd: 15_000_000 }
  };

  const res = validateConfirmedProfile(p);
  assert.equal(res.valid, false);
  assert.match(res.errors.join('; '), /must not contain duplicates/);
});

test('Taxonomy - rejects purposes incompatible with chosen category', () => {
  const p = {
    category: 'phone',
    // Using pc_laptop purpose on phone
    orderedPurposes: ['laptop_office_study', 'phone_photography', 'phone_daily_comms'],
    orderedPriorities: ['priority_performance_cpu', 'priority_battery_life', 'priority_budget_savings'],
    budget: { hardCeilingVnd: 15_000_000 }
  };

  const res = validateConfirmedProfile(p);
  assert.equal(res.valid, false);
  assert.match(res.errors.join('; '), /not allowed for category 'phone'/);
});

test('Crawler - validateStagedCrawlerOffer validates correct payload', () => {
  const offer: StagedCrawlerOffer = {
    sourceId: 'fpt_shop',
    externalOfferId: 'fpt-12345',
    matchedVariantId: 'dell-xps-13-9315-i7-16-512',
    condition: 'NEW',
    stockStatus: 'IN_STOCK',
    basePriceVnd: 22_500_000,
    mandatoryFeesVnd: 0,
    shippingVnd: 50_000,
    conditionalDiscountVnd: 0,
    sourceUrl: 'https://fptshop.com.vn/may-tinh-xach-tay/dell-xps-13',
    observedAt: '2026-11-14T08:00:00.000Z',
    completenessStatus: 'COMPLETE'
  };

  const res = validateStagedCrawlerOffer(offer);
  assert.equal(res.valid, true);
  assert.equal(res.errors.length, 0);
});

test('Crawler - validateStagedCrawlerOffer rejects malformed fields, URLs, and timestamps', () => {
  const baseOffer: StagedCrawlerOffer = {
    sourceId: 'fpt_shop',
    externalOfferId: 'fpt-12345',
    matchedVariantId: 'dell-xps-13-9315-i7-16-512',
    condition: 'NEW',
    stockStatus: 'IN_STOCK',
    basePriceVnd: 22_500_000,
    mandatoryFeesVnd: 0,
    shippingVnd: 50_000,
    conditionalDiscountVnd: 0,
    sourceUrl: 'https://fptshop.com.vn/item',
    observedAt: '2026-11-14T08:00:00.000Z',
    completenessStatus: 'COMPLETE'
  };

  // 1. Malformed URL (not parseable or javascript: scheme)
  const resBadUrl = validateStagedCrawlerOffer({ ...baseOffer, sourceUrl: 'ftp://not-http.com' });
  assert.equal(resBadUrl.valid, false);
  assert.match(resBadUrl.errors.join('; '), /http: or https:/);

  const resMalformedUrl = validateStagedCrawlerOffer({ ...baseOffer, sourceUrl: 'ht tp://broken' });
  assert.equal(resMalformedUrl.valid, false);
  assert.match(resMalformedUrl.errors.join('; '), /well-formed URL/);

  // 2. Malformed timestamp (not ISO 8601)
  const resBadDate = validateStagedCrawlerOffer({ ...baseOffer, observedAt: 'yesterday afternoon' });
  assert.equal(resBadDate.valid, false);
  assert.match(resBadDate.errors.join('; '), /ISO 8601/);

  // 3. Invalid condition or stockStatus
  const resBadCondition = validateStagedCrawlerOffer({ ...baseOffer, condition: 'OPEN_BOX' as any });
  assert.equal(resBadCondition.valid, false);
  assert.match(resBadCondition.errors.join('; '), /condition must be one of/);

  const resBadStock = validateStagedCrawlerOffer({ ...baseOffer, stockStatus: 'FEW_LEFT' as any });
  assert.equal(resBadStock.valid, false);
  assert.match(resBadStock.errors.join('; '), /stockStatus must be one of/);

  // 4. Missing or empty IDs
  const resEmptySource = validateStagedCrawlerOffer({ ...baseOffer, sourceId: '   ' });
  assert.equal(resEmptySource.valid, false);
  assert.match(resEmptySource.errors.join('; '), /sourceId is required/);
});
