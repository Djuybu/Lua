import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEligibility } from '../src/domain/eligibility.ts';
import { type ProductVariant } from '../src/contracts/catalog.ts';
import { type StagedCrawlerOffer } from '../src/contracts/crawler.ts';
import { type ConfirmedNeedsProfile } from '../src/contracts/taxonomy.ts';

const baseVariant: ProductVariant = {
  variantId: 'thinkpad-t14-gen-3',
  familyId: 'thinkpad-t14',
  modelName: 'Lenovo ThinkPad T14 Gen 3',
  category: 'pc_laptop',
  brand: 'Lenovo',
  specifications: {
    ramGb: 16,
    os: 'Windows 11 Pro',
    storageGb: 512,
    cpu: 'Intel Core i5-1240P',
    weightKg: 1.36,
    batteryWattHours: 57
  },
  factIds: ['fact-1', 'fact-2']
};

const baseProfile: ConfirmedNeedsProfile = {
  category: 'pc_laptop',
  orderedPurposes: ['laptop_office_study', 'laptop_software_dev', 'laptop_ultraportable'],
  orderedPriorities: ['priority_budget_savings', 'priority_performance_cpu', 'priority_battery_life'],
  budget: {
    hardCeilingVnd: 20_000_000
  },
  hardConstraints: {
    minRamGb: 16,
    requiredOs: ['Windows']
  }
};

const baseOffer: StagedCrawlerOffer = {
  sourceId: 'fpt_shop',
  externalOfferId: 'fpt-t14',
  matchedVariantId: 'thinkpad-t14-gen-3',
  condition: 'NEW',
  stockStatus: 'IN_STOCK',
  basePriceVnd: 19_500_000,
  mandatoryFeesVnd: 0,
  shippingVnd: 50_000,
  conditionalDiscountVnd: 0,
  sourceUrl: 'https://fptshop.com.vn',
  observedAt: '2026-11-14T10:00:00.000Z',
  completenessStatus: 'COMPLETE'
};

test('Eligibility - eligible when all hard constraints and budget are met', () => {
  const res = evaluateEligibility(baseVariant, [baseOffer], baseProfile);
  assert.equal(res.isEligible, true);
  assert.equal(res.verifiedOffer !== undefined, true);
  assert.equal(res.verifiedOffer?.price.totalVnd, 19_550_000);
});

test('Eligibility - budget boundary: exceeds budget by 1 VND is excluded', () => {
  const overOffer: StagedCrawlerOffer = {
    ...baseOffer,
    basePriceVnd: 19_950_001,
    shippingVnd: 50_000 // Total = 20,000,001 VND > 20,000,000 ceiling
  };

  const res = evaluateEligibility(baseVariant, [overOffer], baseProfile);
  assert.equal(res.isEligible, false);
  assert.equal(res.exclusion?.reasonCode, 'EXCEED_BUDGET');
});

test('Eligibility - RAM below hard constraint is excluded', () => {
  const lowRamVariant: ProductVariant = {
    ...baseVariant,
    specifications: {
      ...baseVariant.specifications,
      ramGb: 8 // Profile requires 16GB
    }
  };

  const res = evaluateEligibility(lowRamVariant, [baseOffer], baseProfile);
  assert.equal(res.isEligible, false);
  assert.equal(res.exclusion?.reasonCode, 'RAM_INSUFFICIENT');
});

test('Eligibility - OS mismatch is excluded', () => {
  const macVariant: ProductVariant = {
    ...baseVariant,
    specifications: {
      ...baseVariant.specifications,
      os: 'macOS Sonoma' // Profile requires Windows
    }
  };

  const res = evaluateEligibility(macVariant, [baseOffer], baseProfile);
  assert.equal(res.isEligible, false);
  assert.equal(res.exclusion?.reasonCode, 'OS_MISMATCH');
});

test('Eligibility - null shipping produces eligible without verified affordability', () => {
  const nullShipOffer: StagedCrawlerOffer = {
    ...baseOffer,
    shippingVnd: null
  };

  const res = evaluateEligibility(baseVariant, [nullShipOffer], baseProfile);
  assert.equal(res.isEligible, true);
  assert.equal(res.verifiedOffer?.price.totalVnd, null);
  assert.equal(res.verifiedOffer?.price.isComplete, false);
});

test('Eligibility - variant with no offers or only out-of-stock offers is excluded with NO_OFFERS', () => {
  // 1. Completely empty offers
  const resNoOffers = evaluateEligibility(baseVariant, [], baseProfile);
  assert.equal(resNoOffers.isEligible, false);
  assert.equal(resNoOffers.exclusion?.reasonCode, 'NO_OFFERS');

  // 2. Only OUT_OF_STOCK offer
  const outOfStockOffer: StagedCrawlerOffer = {
    ...baseOffer,
    stockStatus: 'OUT_OF_STOCK'
  };
  const resOutOfStock = evaluateEligibility(baseVariant, [outOfStockOffer], baseProfile);
  assert.equal(resOutOfStock.isEligible, false);
  assert.equal(resOutOfStock.exclusion?.reasonCode, 'NO_OFFERS');

  // 3. Offer belongs to a different variant (exact identity required)
  const differentVariantOffer: StagedCrawlerOffer = {
    ...baseOffer,
    matchedVariantId: 'different-variant-id-999'
  };
  const resMismatchVariant = evaluateEligibility(baseVariant, [differentVariantOffer], baseProfile);
  assert.equal(resMismatchVariant.isEligible, false);
  assert.equal(resMismatchVariant.exclusion?.reasonCode, 'NO_OFFERS');
});
