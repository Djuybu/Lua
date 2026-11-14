// A1-INT-01: real backend modules, disposable SQLite, no HTTP/provider calls.
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [backendRoot, datasetRoot, positivePath] = process.argv.slice(2);
if (!backendRoot || !datasetRoot || !positivePath) throw new Error('Expected explicit backend, dataset and synthetic payload paths');
const moduleAt = path => import(pathToFileURL(resolve(backendRoot, 'src', path)));
const { AdviserSqliteStore } = await moduleAt('data/sqlite.ts');
const { validateStagedCrawlerOffer } = await moduleAt('contracts/crawler.ts');
const { evaluateEligibility } = await moduleAt('domain/eligibility.ts');
const { StagingIngestStore } = await moduleAt('data/ingest.ts');
const snapshot = JSON.parse(await readFile(join(datasetRoot, 'catalog-snapshot.json'), 'utf8'));
const staging = JSON.parse(await readFile(join(datasetRoot, 'staging-bundle.json'), 'utf8'));
const positive = JSON.parse(await readFile(positivePath, 'utf8'));
assert.equal(positive.fixtureMode, 'synthetic_reviewed_positive');
assert.equal(snapshot.variants.length, 4);
assert.deepEqual(snapshot.offers, []);
assert.deepEqual(snapshot.facts, []);
const dir = await mkdtemp(join(tmpdir(), 'lua-a1-backend-'));
let store;
try {
  const db = join(dir, 'disposable.sqlite');
  const sorted = rows => [...rows].sort((a, b) => a.variantId.localeCompare(b.variantId));
  const profileFor = variant => ({ category: variant.category,
    orderedPurposes: ['laptop_office_study', 'laptop_software_dev', 'laptop_ultraportable'],
    orderedPriorities: ['priority_budget_savings', 'priority_performance_cpu', 'priority_battery_life'],
    budget: { hardCeilingVnd: 100_000_000 }, hardConstraints: {} });
  store = new AdviserSqliteStore(db);
  store.activateSnapshot(snapshot);
  assert.deepEqual(sorted(store.getVariantsForActiveCatalog()), sorted(snapshot.variants));
  store.close(); store = new AdviserSqliteStore(db);
  assert.deepEqual(sorted(store.getVariantsForActiveCatalog()), sorted(snapshot.variants));
  for (const variant of snapshot.variants) {
    assert.deepEqual(store.getOffersForVariant(variant.variantId), []);
    assert.equal(evaluateEligibility(variant, [], profileFor(variant)).verifiedOffer, undefined);
  }
  // Include changed/new content so rollback proves more than restoring a header.
  assert.throws(() => store.activateSnapshot({ ...snapshot, catalogVersion: 'a1-injected-failure',
    variants: snapshot.variants.map(v => ({ ...v, modelName: 'INJECTED MUST ROLLBACK' })),
    offers: positive.offers }, { injectFail: true }), /Simulated atomic failure/);
  assert.equal(store.getActiveCatalogVersion(), snapshot.catalogVersion);
  assert.deepEqual(sorted(store.getVariantsForActiveCatalog()), sorted(snapshot.variants));
  assert.deepEqual(store.getOffersForVariant(positive.offers[0].matchedVariantId), []);
  store.close(); store = new AdviserSqliteStore(db);
  assert.equal(store.getActiveCatalogVersion(), snapshot.catalogVersion);
  assert.deepEqual(sorted(store.getVariantsForActiveCatalog()), sorted(snapshot.variants));

  let rejected = 0, acceptedIncomplete = 0;
  const validationOutcomes = [];
  for (const row of staging.records) {
    assert.equal(row.mandatoryFeesVnd, null);
    assert.equal(row.totalVnd, null);
    assert.equal(row.isVerifiedAffordable, false);
    const validation = validateStagedCrawlerOffer(row);
    validationOutcomes.push({ observationId: row.observationId, ...validation });
    if (!validation.valid) { rejected++; continue; }
    // A future accepted nullable contract must still prevent verified affordability.
    const variant = snapshot.variants.find(v => v.variantId === row.matchedVariantId);
    assert(variant, 'Accepted offer must have an exact catalog variant');
    const result = evaluateEligibility(variant, [row], profileFor(variant));
    assert.notEqual(result.verifiedOffer?.price.isComplete, true);
    assert.equal(result.verifiedOffer?.price.totalVnd ?? null, null);
    acceptedIncomplete++;
  }
  const syntheticVariant = { ...snapshot.variants[0], variantId: positive.offers[0].matchedVariantId,
    familyId: 'synthetic:family', modelName: 'SYNTHETIC integration fixture', factIds: [] };
  assert.equal(positive.offers.length, 1);
  assert.equal(validateStagedCrawlerOffer(positive.offers[0]).valid, true);
  const ingest = new StagingIngestStore([syntheticVariant.variantId]);
  assert.equal(ingest.ingest(positive.offers).accepted, 1);
  assert.equal(ingest.ingest(positive.offers).duplicateIgnored, 1);
  // Isolate null mandatory fees from unresolved identity/condition in real rows.
  const nullFeeOffer = { ...positive.offers[0], mandatoryFeesVnd: null };
  const nullFeeValidation = validateStagedCrawlerOffer(nullFeeOffer);
  if (nullFeeValidation.valid) {
    const nullFeeResult = evaluateEligibility(syntheticVariant, [nullFeeOffer], profileFor(syntheticVariant));
    assert.notEqual(nullFeeResult.verifiedOffer?.price.isComplete, true);
    assert.equal(nullFeeResult.verifiedOffer?.price.totalVnd ?? null, null);
  }
  store.saveOffers(positive.offers);
  store.saveOffers(positive.offers);
  store.close(); store = new AdviserSqliteStore(db);
  const saved = store.getOffersForVariant(syntheticVariant.variantId);
  assert.equal(saved.length, 1, 'Synthetic replay must not duplicate observations');
  const result = evaluateEligibility(syntheticVariant, saved, profileFor(syntheticVariant));
  assert.equal(result.isEligible, true);
  assert.equal(result.verifiedOffer.price.isComplete, true);
  assert.equal(result.verifiedOffer.price.totalVnd, positive.offers[0].basePriceVnd);
  const unknownShipping = evaluateEligibility(syntheticVariant,
    [{ ...saved[0], shippingVnd: null }], profileFor(syntheticVariant));
  assert.equal(unknownShipping.verifiedOffer.price.totalVnd, null);
  assert.equal(unknownShipping.verifiedOffer.price.isComplete, false);
  console.log(JSON.stringify({ variantsImported: 4, restart: 'passed', rollback: 'passed',
    restartAfterRollback: 'passed', observationsChecked: staging.records.length,
    unknownFeeContractOutcomes: { rejected, acceptedIncomplete }, syntheticPositive: 'passed',
    validationOutcomes, isolatedNullFeeProbe: nullFeeValidation.valid ? 'accepted_incomplete' : 'rejected',
    syntheticReplayRestart: 'passed', unknownShipping: 'passed',
    providerCalls: 0, httpCalls: 0, productionWrites: 0 }));
} finally {
  store?.close();
  // dir is created by mkdtemp above, never taken from a CLI DB argument.
  await rm(dir, { recursive: true, force: true });
}
