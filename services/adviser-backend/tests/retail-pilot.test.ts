import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AdviserSqliteStore } from '../src/data/sqlite.ts';
import { StagingIngestStore } from '../src/data/ingest.ts';
import { evaluateEligibility } from '../src/domain/eligibility.ts';
import { rankEligibleCandidates } from '../src/domain/ranking.ts';
import { BoundedAiClient, MockAiProvider } from '../src/ai/adapter.ts';
import { type SnapshotManifest, type ProductVariant } from '../src/contracts/catalog.ts';
import { type ConfirmedNeedsProfile } from '../src/contracts/taxonomy.ts';
import { type StagedCrawlerOffer } from '../src/contracts/crawler.ts';
import { calculatePayableTotal } from '../src/contracts/money.ts';

const datasetDir = path.resolve('../../tools/data-pipeline/datasets/retail-pilot-2026-11-14');
const snapshotPath = path.join(datasetDir, 'catalog-snapshot.json');
const stagingBundlePath = path.join(datasetDir, 'staging-bundle.json');
const qualityReportPath = path.join(datasetDir, 'quality-report.json');

test('Retail Pilot Regression - loads real dataset artifacts successfully', () => {
  assert.equal(fs.existsSync(snapshotPath), true);
  assert.equal(fs.existsSync(stagingBundlePath), true);
  assert.equal(fs.existsSync(qualityReportPath), true);

  const snapshot: SnapshotManifest = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const stagingBundle = JSON.parse(fs.readFileSync(stagingBundlePath, 'utf8'));
  const qualityReport = JSON.parse(fs.readFileSync(qualityReportPath, 'utf8'));

  assert.equal(snapshot.variants.length, 4);
  assert.equal(snapshot.offers.length, 4, 'Accepted official offers must cover all four catalog variants');
  assert.deepEqual(
    new Set(snapshot.offers.map(o => o.matchedVariantId)),
    new Set(snapshot.variants.map(v => v.variantId))
  );
  for (const offer of snapshot.offers) {
    assert.equal(offer.mandatoryFeesVnd, 0);
    assert.equal(offer.shippingVnd, 0);
    assert.equal(offer.completenessStatus, 'COMPLETE');
  }
  assert.equal(snapshot.facts.length, 0, 'Facts stay empty without independent benchmark evidence');
  assert.equal(stagingBundle.records.length, 10);
  assert.equal(qualityReport.observations, 10);
  assert.equal(qualityReport.quarantined, 4);
  assert.equal(qualityReport.readyForReview, 6);
});

test('Retail Pilot Regression - activates 4 real catalog variants in SQLite and verifies restart & rollback', () => {
  const snapshot: SnapshotManifest = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const store = new AdviserSqliteStore(':memory:');

  store.activateSnapshot(snapshot);
  assert.equal(store.getActiveCatalogVersion(), snapshot.catalogVersion);

  const variants = store.getVariantsForActiveCatalog();
  assert.equal(variants.length, 4);
  assert.equal(store.getOffersForVariant('retailer:laptopaz:SP002078').length, 1);

  const variantIds = variants.map(v => v.variantId);
  assert.equal(variantIds.includes('retailer:laptopaz:SP002078'), true);
  assert.equal(variantIds.includes('retailer:cellphones:dien-thoai-oppo-find-x8'), true);
  assert.equal(variantIds.includes('retailer:dienmayxanh:0220042003457'), true);
  assert.equal(variantIds.includes('retailer:fptshop:00928037'), true);

  // Injected rollback check
  assert.throws(() => {
    store.activateSnapshot({ ...snapshot, catalogVersion: 'failed-cat' }, { injectFail: true });
  });
  assert.equal(store.getActiveCatalogVersion(), snapshot.catalogVersion);
  assert.equal(store.getVariantsForActiveCatalog().length, 4);

  store.close();
});

test('Retail Pilot Regression - validates edge cases in 10 staging observations', () => {
  const stagingBundle = JSON.parse(fs.readFileSync(stagingBundlePath, 'utf8'));
  const records = stagingBundle.records;

  // 1. FPT Shop: Quarantined due to PRICE_CONTEXT_REVIEW_REQUIRED (21.49M special vs 22.99M regular)
  const fpt = records.find((r: any) => r.sourceId === 'fptshop');
  assert.notEqual(fpt, undefined);
  assert.equal(fpt.status, 'quarantine');
  assert.equal(fpt.reasons.includes('PRICE_CONTEXT_REVIEW_REQUIRED'), true);
  assert.equal(fpt.conflicts[0].specialPrice, 21_490_000);
  assert.equal(fpt.conflicts[0].structuredPrice, 22_990_000);

  // 2. TGDD: 3 color variants for iPhone 17 Pro Max 1TB with distinct SKUs and stock states
  const tgddRecords = records.filter((r: any) => r.sourceId === 'tgdd');
  assert.equal(tgddRecords.length, 3);
  const colors = tgddRecords.map((r: any) => r.color);
  assert.deepEqual(colors.sort(), ['Bạc', 'Cam Vũ Trụ', 'Xanh Đậm']);
  const silver = tgddRecords.find((r: any) => r.color === 'Bạc');
  const blue = tgddRecords.find((r: any) => r.color === 'Xanh Đậm');
  assert.equal(silver.stockStatus, 'OUT_OF_STOCK');
  assert.equal(blue.stockStatus, 'IN_STOCK');
  assert.equal(silver.externalOfferId !== blue.externalOfferId, true);

  // 3. Trung Tran: Quarantined due to AGGREGATE_OR_UNKNOWN_OFFER and expired price validity
  const tt = records.find((r: any) => r.sourceId === 'trungtran');
  assert.notEqual(tt, undefined);
  assert.equal(tt.status, 'quarantine');
  assert.equal(tt.reasons.includes('AGGREGATE_OR_UNKNOWN_OFFER'), true);
  assert.equal(tt.reasons.includes('PRICE_VALIDITY_EXPIRED'), true);
  assert.equal(tt.basePriceVnd, null);

  // 4. Oneway: Quarantined due to JSON-LD error, missing SKU, and title X/A vs URL zp-a conflict
  const oneway = records.find((r: any) => r.sourceId === 'oneway');
  assert.notEqual(oneway, undefined);
  assert.equal(oneway.status, 'quarantine');
  assert.equal(oneway.reasons.includes('REGION_IDENTITY_CONFLICT'), true);
  assert.equal(oneway.reasons.includes('SOURCE_JSONLD_PARSE_ERROR'), true);
  assert.equal(oneway.matchedVariantId, null);

  // 5. ShopDunk: Quarantined due to UNKNOWN condition and stock
  const shopdunk = records.find((r: any) => r.sourceId === 'shopdunk');
  assert.notEqual(shopdunk, undefined);
  assert.equal(shopdunk.status, 'quarantine');
  assert.equal(shopdunk.reasons.includes('CONDITION_UNKNOWN'), true);
  assert.equal(shopdunk.reasons.includes('STOCK_UNKNOWN'), true);
});

test('Retail Pilot Regression - accepted official offers produce verified totals and affordability', () => {
  const snapshot: SnapshotManifest = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const variant = snapshot.variants.find(v => v.variantId === 'retailer:laptopaz:SP002078')!;
  const offer = snapshot.offers.find(o => o.matchedVariantId === variant.variantId)!;
  const profile: ConfirmedNeedsProfile = {
    category: 'pc_laptop',
    orderedPurposes: ['laptop_office_study', 'laptop_software_dev', 'laptop_gaming_aaa'],
    orderedPriorities: ['priority_performance_cpu', 'priority_graphics_gpu', 'priority_budget_savings'],
    budget: { hardCeilingVnd: 30_000_000 },
    hardConstraints: { minRamGb: 16, requiredOs: ['Windows'] }
  };
  const eligibility = evaluateEligibility(variant, [offer], profile);
  assert.equal(eligibility.isEligible, true);
  assert.equal(eligibility.verifiedOffer?.price.totalVnd, 26_590_000);
  assert.equal(eligibility.verifiedOffer?.price.isComplete, true);
  const ranked = rankEligibleCandidates([{ variant, eligibility }], profile, snapshot.facts);
  assert.equal(ranked[0]!.totalVnd, 26_590_000);
  assert.equal(ranked[0]!.isVerifiedAffordable, true);
  assert.equal(ranked[0]!.bestOffer?.sourceId, 'laptopaz');
  assert.equal(ranked[0]!.factIds.length, 0);
});

test('Retail Pilot Regression - raw staging unknown fees never yield isVerifiedAffordable: true', () => {
  const stagingBundle = JSON.parse(fs.readFileSync(stagingBundlePath, 'utf8'));

  for (const record of stagingBundle.records) {
    if (record.basePriceVnd !== null) {
      const calc = calculatePayableTotal({
        basePriceVnd: record.basePriceVnd,
        mandatoryFeesVnd: record.mandatoryFeesVnd, // null in real pilot!
        shippingVnd: record.shippingVnd
      });

      assert.equal(calc.totalVnd, null, `Record ${record.sourceId} must have null totalVnd`);
      assert.equal(calc.isComplete, false, `Record ${record.sourceId} must have isComplete: false`);
    }
  }
});

test('Retail Pilot Regression - real LaptopAZ variant evaluated with mock provider does not fabricate facts', async () => {
  const snapshot: SnapshotManifest = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const laptopazVariant = snapshot.variants.find(v => v.variantId === 'retailer:laptopaz:SP002078')!;

  assert.notEqual(laptopazVariant, undefined);
  assert.equal(laptopazVariant.factIds.length, 0);

  const profile: ConfirmedNeedsProfile = {
    category: 'pc_laptop',
    orderedPurposes: ['laptop_office_study', 'laptop_software_dev', 'laptop_gaming_aaa'],
    orderedPriorities: ['priority_performance_cpu', 'priority_graphics_gpu', 'priority_budget_savings'],
    budget: { hardCeilingVnd: 30_000_000 },
    hardConstraints: { minRamGb: 16, requiredOs: ['Windows'] }
  };

  // Convert ready-for-review LaptopAZ record into StagedCrawlerOffer
  const stagingBundle = JSON.parse(fs.readFileSync(stagingBundlePath, 'utf8'));
  const laptopazRecord = stagingBundle.records.find((r: any) => r.externalOfferId === 'SP002078')!;

  const stagedOffer: StagedCrawlerOffer = {
    sourceId: laptopazRecord.sourceId,
    externalOfferId: laptopazRecord.externalOfferId,
    matchedVariantId: laptopazRecord.matchedVariantId,
    condition: laptopazRecord.condition as any,
    stockStatus: laptopazRecord.stockStatus as any,
    basePriceVnd: laptopazRecord.basePriceVnd,
    mandatoryFeesVnd: laptopazRecord.mandatoryFeesVnd, // null
    shippingVnd: laptopazRecord.shippingVnd, // null
    conditionalDiscountVnd: 0,
    sourceUrl: laptopazRecord.sourceUrl,
    observedAt: laptopazRecord.observedAt,
    completenessStatus: 'PARTIAL_UNKNOWN'
  };

  const eligibility = evaluateEligibility(laptopazVariant, [stagedOffer], profile);
  assert.equal(eligibility.isEligible, true);
  assert.equal(eligibility.verifiedOffer?.price.totalVnd, null);
  assert.equal(eligibility.verifiedOffer?.price.isComplete, false);

  const ranked = rankEligibleCandidates([{ variant: laptopazVariant, eligibility }], profile, snapshot.facts);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]!.isVerifiedAffordable, false);
  assert.equal(ranked[0]!.totalVnd, null);
  assert.equal(ranked[0]!.factIds.length, 0);

  // Evaluate AI explanation: when factIds=[], AI proposal must not invent hallucinated fact IDs
  const provider = new MockAiProvider();
  const aiClient = new BoundedAiClient(provider, 1000);

  const explanation = await aiClient.getExplanation({
    variant: laptopazVariant,
    profile,
    facts: snapshot.facts,
    requestId: 'req-real-pilot-1'
  });

  // Verify that all claims have either empty factIds or valid factIds from snapshot
  assert.equal(explanation.variantId, laptopazVariant.variantId);
  const knownFactIds = new Set(snapshot.facts.map(f => f.factId));
  for (const claim of explanation.claims) {
    for (const fId of claim.factIds) {
      assert.equal(knownFactIds.has(fId), true, `Claim cannot use unknown factId '${fId}'`);
    }
  }
});
