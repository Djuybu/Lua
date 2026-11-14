// Exercises real backend persistence in a disposable DB; does not start a server.
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const [backendRoot, datasetRoot] = process.argv.slice(2);
if (!backendRoot || !datasetRoot) throw new Error('Usage: verify-retail-backend.mjs <backend-root> <dataset-root>');
const { AdviserSqliteStore } = await import(pathToFileURL(resolve(backendRoot, 'src/data/sqlite.ts')));
const { validateStagedCrawlerOffer } = await import(pathToFileURL(resolve(backendRoot, 'src/contracts/crawler.ts')));
const snapshot = JSON.parse(await readFile(join(datasetRoot, 'catalog-snapshot.json'), 'utf8'));
const staging = JSON.parse(await readFile(join(datasetRoot, 'staging-bundle.json'), 'utf8'));
const workRoot = resolve('.work');
const dir = await mkdtemp(join(workRoot, 'retail-backend-'));
let store;
try {
  const db = join(dir, 'test.sqlite');
  store = new AdviserSqliteStore(db);
  store.activateSnapshot(snapshot);
  assert.equal(store.getVariantsForActiveCatalog().length, 4);
  assert.equal(store.getActiveCatalogVersion(), snapshot.catalogVersion);
  store.close(); store = new AdviserSqliteStore(db);
  assert.equal(store.getVariantsForActiveCatalog().length, 4);
  assert.throws(() => store.activateSnapshot({ ...snapshot, catalogVersion: 'injected-failure' }, { injectFail: true }));
  assert.equal(store.getActiveCatalogVersion(), snapshot.catalogVersion);
  const rejectionChecks = staging.records.map(row => validateStagedCrawlerOffer(row));
  assert(rejectionChecks.every(result => !result.valid), 'Unknown fees must remain rejected by current contract');
  console.log(JSON.stringify({ variantsImported: 4, restart: 'passed', rollback: 'passed',
    observationsChecked: staging.records.length, unknownFeeOffersRejected: rejectionChecks.length,
    providerCalls: 0, productionWrites: 0 }));
} finally {
  store?.close();
  if (!resolve(dir).startsWith(workRoot + sep)) throw new Error('Refusing cleanup outside .work');
  await rm(dir, { recursive: true, force: true });
}
