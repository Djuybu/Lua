import test from 'node:test';
import assert from 'node:assert/strict';
import { AdviserSqliteStore } from '../src/data/sqlite.ts';
import { type SnapshotManifest } from '../src/contracts/catalog.ts';
import { type ConfirmedNeedsProfile } from '../src/contracts/taxonomy.ts';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const sampleManifestV1: SnapshotManifest = {
  schemaVersion: '1.0.0',
  catalogVersion: 'cat-v1.0',
  ruleVersion: '2026.11',
  publishedAt: '2026-11-14T08:00:00.000Z',
  variants: [
    {
      variantId: 'laptop-1',
      familyId: 'fam-1',
      modelName: 'Laptop One',
      category: 'pc_laptop',
      brand: 'Asus',
      specifications: { ramGb: 16, os: 'Windows 11', storageGb: 512, cpu: 'i5' },
      factIds: ['f1']
    }
  ],
  facts: [
    {
      factId: 'f1',
      variantId: 'laptop-1',
      domain: 'performance',
      claimText: '16GB RAM for multitasking',
      sourceDoc: 'spec.pdf',
      verifiedAt: '2026-11-14T08:00:00.000Z'
    }
  ],
  offers: [
    {
      sourceId: 'shopA',
      externalOfferId: 'off-1',
      matchedVariantId: 'laptop-1',
      condition: 'NEW',
      stockStatus: 'IN_STOCK',
      basePriceVnd: 18_000_000,
      mandatoryFeesVnd: 0,
      shippingVnd: 0,
      conditionalDiscountVnd: 0,
      sourceUrl: 'https://shopa.com/item1',
      observedAt: '2026-11-14T08:00:00.000Z',
      completenessStatus: 'COMPLETE'
    }
  ]
};

const sampleManifestV2: SnapshotManifest = {
  ...sampleManifestV1,
  catalogVersion: 'cat-v2.0',
  publishedAt: '2026-11-14T10:00:00.000Z',
  variants: [
    {
      variantId: 'laptop-2',
      familyId: 'fam-2',
      modelName: 'Laptop Two Updated',
      category: 'pc_laptop',
      brand: 'Lenovo',
      specifications: { ramGb: 32, os: 'Windows 11 Pro', storageGb: 1024, cpu: 'i7' },
      factIds: ['f2']
    }
  ],
  facts: []
};

test('Persistence - activates snapshot and retrieves variants', () => {
  const store = new AdviserSqliteStore(':memory:');
  store.activateSnapshot(sampleManifestV1);

  assert.equal(store.getActiveCatalogVersion(), 'cat-v1.0');
  const variants = store.getVariantsForActiveCatalog();
  assert.equal(variants.length, 1);
  assert.equal(variants[0]!.variantId, 'laptop-1');

  const offers = store.getOffersForVariant('laptop-1');
  assert.equal(offers.length, 1);
  assert.equal(offers[0]!.basePriceVnd, 18_000_000);
});

test('Persistence - rollback on failure: failed activation preserves prior active catalog', () => {
  const store = new AdviserSqliteStore(':memory:');
  store.activateSnapshot(sampleManifestV1);
  assert.equal(store.getActiveCatalogVersion(), 'cat-v1.0');

  // Attempt to activate V2 with injected failure
  assert.throws(
    () => {
      store.activateSnapshot(sampleManifestV2, { injectFail: true });
    },
    /Simulated atomic failure/
  );

  // Still active is V1
  assert.equal(store.getActiveCatalogVersion(), 'cat-v1.0');
  const variants = store.getVariantsForActiveCatalog();
  assert.equal(variants.length, 1);
  assert.equal(variants[0]!.variantId, 'laptop-1');
});

test('Persistence - restart recovery preserves saved decisions and catalog across instance restarts', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lua-sqlite-'));
  const dbFile = path.join(tempDir, 'test.sqlite');

  try {
    // Session 1: activate snapshot and save decision
    const store1 = new AdviserSqliteStore(dbFile);
    store1.activateSnapshot(sampleManifestV1);

    const testProfile: ConfirmedNeedsProfile = {
      category: 'pc_laptop',
      orderedPurposes: ['laptop_office_study', 'laptop_software_dev', 'laptop_ultraportable'],
      orderedPriorities: ['priority_budget_savings', 'priority_performance_cpu', 'priority_battery_life'],
      budget: { hardCeilingVnd: 20_000_000 }
    };

    store1.saveDecision({
      decisionId: 'dec-123',
      profileRevision: 1,
      profile: testProfile,
      selectedVariantId: 'laptop-1',
      savedAt: '2026-11-14T09:00:00.000Z'
    });

    store1.close();

    // Session 2: reopen same file
    const store2 = new AdviserSqliteStore(dbFile);
    assert.equal(store2.getActiveCatalogVersion(), 'cat-v1.0');

    const saved = store2.getSavedDecision('dec-123');
    assert.notEqual(saved, null);
    assert.equal(saved?.decisionId, 'dec-123');
    assert.equal(saved?.selectedVariantId, 'laptop-1');
    assert.equal(saved?.profile.budget.hardCeilingVnd, 20_000_000);

    store2.close();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
