import test from 'node:test';
import assert from 'node:assert/strict';
import { rankEligibleCandidates } from '../src/domain/ranking.ts';
import { evaluateEligibility } from '../src/domain/eligibility.ts';
import { type ProductVariant } from '../src/contracts/catalog.ts';
import { type StagedCrawlerOffer } from '../src/contracts/crawler.ts';
import { type ConfirmedNeedsProfile } from '../src/contracts/taxonomy.ts';

const laptopCheap: ProductVariant = {
  variantId: 'laptop-cheap',
  familyId: 'cheap-line',
  modelName: 'Budget Laptop 14',
  category: 'pc_laptop',
  brand: 'Asus',
  specifications: {
    ramGb: 8,
    os: 'Windows 11',
    storageGb: 256,
    cpu: 'Intel Core i3',
    weightKg: 1.5,
    batteryWattHours: 42
  },
  factIds: []
};

const laptopPower: ProductVariant = {
  variantId: 'laptop-power',
  familyId: 'power-line',
  modelName: 'Power Laptop 14',
  category: 'pc_laptop',
  brand: 'Dell',
  specifications: {
    ramGb: 32,
    os: 'Windows 11',
    storageGb: 1024,
    cpu: 'Intel Core i7-13700H',
    weightKg: 1.4,
    batteryWattHours: 70
  },
  factIds: []
};

const offerCheap: StagedCrawlerOffer = {
  sourceId: 'shop1',
  externalOfferId: 'c1',
  matchedVariantId: 'laptop-cheap',
  condition: 'NEW',
  stockStatus: 'IN_STOCK',
  basePriceVnd: 12_000_000,
  mandatoryFeesVnd: 0,
  shippingVnd: 0,
  conditionalDiscountVnd: 0,
  sourceUrl: 'https://shop1.com',
  observedAt: '2026-11-14T08:00:00.000Z',
  completenessStatus: 'COMPLETE'
};

const offerPower: StagedCrawlerOffer = {
  sourceId: 'shop2',
  externalOfferId: 'p1',
  matchedVariantId: 'laptop-power',
  condition: 'NEW',
  stockStatus: 'IN_STOCK',
  basePriceVnd: 28_000_000,
  mandatoryFeesVnd: 0,
  shippingVnd: 0,
  conditionalDiscountVnd: 0,
  sourceUrl: 'https://shop2.com',
  observedAt: '2026-11-14T08:00:00.000Z',
  completenessStatus: 'COMPLETE'
};

test('Ranking - priority_budget_savings ranks cheaper machine first', () => {
  const profileBudgetFirst: ConfirmedNeedsProfile = {
    category: 'pc_laptop',
    orderedPurposes: ['laptop_office_study', 'laptop_software_dev', 'laptop_ultraportable'],
    orderedPriorities: ['priority_budget_savings', 'priority_battery_life', 'priority_portability_weight'],
    budget: { hardCeilingVnd: 30_000_000 }
  };

  const eCheap = evaluateEligibility(laptopCheap, [offerCheap], profileBudgetFirst);
  const ePower = evaluateEligibility(laptopPower, [offerPower], profileBudgetFirst);

  const ranked = rankEligibleCandidates(
    [
      { variant: laptopCheap, eligibility: eCheap },
      { variant: laptopPower, eligibility: ePower }
    ],
    profileBudgetFirst
  );

  assert.equal(ranked.length, 2);
  assert.equal(ranked[0]!.variantId, 'laptop-cheap');
  assert.equal(ranked[0]!.isVerifiedAffordable, true);
});

test('Ranking - priority_performance_cpu ranks high spec machine first', () => {
  const profilePowerFirst: ConfirmedNeedsProfile = {
    category: 'pc_laptop',
    orderedPurposes: ['laptop_office_study', 'laptop_software_dev', 'laptop_ultraportable'],
    orderedPriorities: ['priority_performance_cpu', 'priority_battery_life', 'priority_budget_savings'],
    budget: { hardCeilingVnd: 30_000_000 }
  };

  const eCheap = evaluateEligibility(laptopCheap, [offerCheap], profilePowerFirst);
  const ePower = evaluateEligibility(laptopPower, [offerPower], profilePowerFirst);

  const ranked = rankEligibleCandidates(
    [
      { variant: laptopCheap, eligibility: eCheap },
      { variant: laptopPower, eligibility: ePower }
    ],
    profilePowerFirst
  );

  assert.equal(ranked.length, 2);
  assert.equal(ranked[0]!.variantId, 'laptop-power');
});
