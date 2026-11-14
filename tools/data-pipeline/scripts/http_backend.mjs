// A1-HTTP-02: actual HTTP server + actual SQLite, never an external service.
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [backendRoot, datasetRoot, fixturePath, scratchRoot, resultPath, mode = 'suite'] = process.argv.slice(2);
if (!resultPath) throw new Error('Expected backend dataset fixture scratch result [suite|failure|hang]');
const moduleAt = path => import(pathToFileURL(resolve(backendRoot, 'src', path)));
const { AdviserSqliteStore } = await moduleAt('data/sqlite.ts');
const { createHttpServer } = await moduleAt('server/http-app.ts');
const bundle = JSON.parse(await readFile(join(datasetRoot, 'staging-bundle.json'), 'utf8'));
const retail = JSON.parse(await readFile(join(datasetRoot, 'catalog-snapshot.json'), 'utf8'));
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
assert.equal(fixture.fixtureMode, 'synthetic_approved_known_charges_not_retail_data');
const synthetic = { ...retail, catalogVersion: 'a1-http-synthetic', variants: [fixture.variant], offers: [], facts: [] };
const report = { task: 'A1-HTTP-02', mode, cases: [], providerCalls: 0, productionWrites: 0,
  transport: 'actual createHttpServer / IPv4 loopback ephemeral ports',
  rawAdapter: { status: 'not_enabled', reason: 'No handed-off raw HTTP contract at pinned consumer b979575' } };
const save = () => writeFile(resultPath, JSON.stringify(report, null, 2) + '\n');
let active;
const envelope = profile => ({ schemaVersion: '1.0.0', requestId: 'synthetic-http-request',
  decisionId: 'synthetic-http-decision', profileRevision: 1, ruleVersion: '2026.11',
  catalogVersion: synthetic.catalogVersion, profile: profile ?? fixture.profile });

async function portClosed(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.setTimeout(300);
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
}

async function context(manifest) {
  const dir = await mkdtemp(join(scratchRoot, 'http-db-'));
  const db = join(dir, 'disposable.sqlite');
  let store, server;
  const ctx = { dir, db, trace: [], ports: [] };
  const rows = () => {
    const reader = new DatabaseSync(db, { readOnly: true });
    try { return reader.prepare('SELECT * FROM staged_offers ORDER BY source_id,external_offer_id,observed_at').all(); }
    finally { reader.close(); }
  };
  ctx.rows = rows;
  ctx.start = async (initialize = false) => {
    store = new AdviserSqliteStore(db);
    if (initialize && manifest) store.activateSnapshot(manifest);
    // The current HTTP boundary does not expose AI routes. Any unexpected call fails locally.
    const forbiddenAi = { getExplanation: async () => { report.providerCalls++; throw new Error('Unexpected AI call'); } };
    server = createHttpServer(store, forbiddenAi);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    ctx.port = server.address().port;
    ctx.ports.push(ctx.port);
    report.active = { port: ctx.port, dir, db };
    await save(); // readiness journal for parent watchdog regression
  };
  ctx.stop = async () => {
    if (server) {
      const closing = new Promise(resolve => server.close(resolve));
      server.closeAllConnections();
      await closing;
      server = undefined;
    }
    store?.close(); store = undefined;
  };
  ctx.restart = async () => { await ctx.stop(); await ctx.start(); };
  ctx.cleanup = async () => {
    await ctx.stop();
    const closed = await Promise.all(ctx.ports.map(portClosed));
    await rm(dir, { recursive: true, force: true }); // mkdtemp-generated path only
    let removed = false;
    try { await access(dir); } catch { removed = true; }
    return { ports: ctx.ports, portsClosed: closed.every(Boolean), directoryRemoved: removed };
  };
  ctx.request = async (path, body, { method = 'POST', raw, timeoutMs = 2000 } = {}) => {
    const payload = raw !== undefined ? raw : body === undefined ? '' : JSON.stringify(body);
    const evidence = { method, path, payloadBytes: Buffer.byteLength(payload), payloadChars: payload.length,
      sha256: createHash('sha256').update(payload).digest('hex'),
      body: payload.length < 12000 ? payload : '<large payload: reconstruct from case>', port: ctx.port };
    ctx.trace.push(evidence);
    const response = await new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: ctx.port, path, method,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), Connection: 'close' } }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
          catch (err) { reject(err); }
        });
      });
      req.setTimeout(timeoutMs, () => req.destroy(new Error('HTTP_CLIENT_TIMEOUT')));
      req.on('error', reject);
      req.end(payload);
    });
    evidence.response = response;
    return response;
  };
  try { await ctx.start(true); }
  catch (err) { await ctx.cleanup(); throw err; }
  return ctx;
}

async function test(id, name, fn, manifest = synthetic) {
  const result = { id, name, status: 'failed' };
  report.cases.push(result);
  let ctx;
  try {
    ctx = await context(manifest); active = ctx;
    result.before = ctx.rows();
    await fn(ctx);
    result.status = 'passed';
  } catch (err) {
    result.error = { message: err.message, stack: err.stack, actual: err.actual, expected: err.expected };
  } finally {
    if (ctx) {
      result.trace = ctx.trace;
      result.after = ctx.rows();
      result.cleanup = await ctx.cleanup(); active = undefined;
      if (!result.cleanup.portsClosed || !result.cleanup.directoryRemoved) {
        result.status = 'failed'; result.cleanupFailure = true;
      }
    }
    delete report.active;
    await save();
  }
}
const ingest = (ctx, offers) => ctx.request('/advisor/v1/ingest', { offers });
const noWrites = ctx => assert.deepEqual(ctx.rows(), []);
try {
  if (mode === 'hang') {
    active = await context(synthetic);
    await new Promise(() => {}); // deliberate parent-watchdog fixture, not suite behavior
  } else if (mode === 'failure') {
    await test('PROBE-FAIL', 'Deliberate assertion proves nonzero and cleanup', async ctx => {
      assert.equal((await ctx.request('/health', undefined, { method: 'GET' })).status, 599);
    });
  } else {
    await test('H01', 'Health, JSON headers and response schema', async ctx => {
      const health = await ctx.request('/health', undefined, { method: 'GET' });
      assert.equal(health.status, 200); assert.equal(health.body.status, 'ok');
      assert.equal(health.body.catalogVersion, synthetic.catalogVersion);
      assert.match(health.headers['content-type'], /application\/json/);
      const rec = await ctx.request('/advisor/v1/recommend', envelope());
      assert.equal(rec.body.schemaVersion, '1.0.0'); assert.equal(rec.body.ruleVersion, '2026.11');
      assert.equal(rec.body.requestId, 'synthetic-http-request');
    });
    await test('H02', 'Real ten raw observations rejected, accepted store unchanged', async ctx => {
      assert.equal(bundle.records.length, 10);
      assert.equal((await ingest(ctx, bundle.records)).status, 400); noWrites(ctx);
    }, retail);
    for (const [label, raw] of [['malformed', '{bad'], ['null', 'null'], ['number', '42'], ['string', '"scalar"'], ['boolean', 'false']]) {
      for (const route of ['ingest', 'recommend']) {
        await test(`H03-${route}-${label}`, `Reject ${label} JSON at ${route} with 400`, async ctx => {
          assert.equal((await ctx.request(`/advisor/v1/${route}`, undefined, { raw })).status, 400); noWrites(ctx);
        });
      }
    }
    await test('H04', 'Unknown exact variant rejected without accepted writes', async ctx => {
      assert.equal((await ingest(ctx, [{ ...fixture.offer, matchedVariantId: 'unknown:variant' }])).status, 400); noWrites(ctx);
    });
    for (const field of ['basePriceVnd', 'mandatoryFeesVnd', 'shippingVnd', 'conditionalDiscountVnd']) {
      await test(`H05-${field}`, `Reject negative ${field}`, async ctx => {
        assert.equal((await ingest(ctx, [{ ...fixture.offer, [field]: -1 }])).status, 400); noWrites(ctx);
      });
    }
    await test('H06-ascii', 'Over one million ASCII bytes rejected', async ctx => {
      const raw = JSON.stringify({ offers: [], padding: 'a'.repeat(1_000_001) });
      assert.equal((await ctx.request('/advisor/v1/ingest', undefined, { raw })).status, 413); noWrites(ctx);
    });
    await test('H06-boundary', 'Exactly one million UTF8 bytes accepted', async ctx => {
      const overhead = Buffer.byteLength(JSON.stringify({ offers: [], padding: '' }));
      const raw = JSON.stringify({ offers: [], padding: 'a'.repeat(1_000_000 - overhead) });
      assert.equal(Buffer.byteLength(raw), 1_000_000);
      assert.equal((await ctx.request('/advisor/v1/ingest', undefined, { raw })).status, 200); noWrites(ctx);
    });
    await test('H06-utf8', 'UTF8 bytes exceed limit while JS string length stays below it', async ctx => {
      const raw = JSON.stringify({ offers: [], padding: 'ệ'.repeat(400_000) });
      assert(Buffer.byteLength(raw) > 1_000_000 && raw.length < 1_000_000);
      assert.equal((await ctx.request('/advisor/v1/ingest', undefined, { raw })).status, 413); noWrites(ctx);
    });
    await test('H07', 'Approved synthetic HTTP persist/replay/restart and affordable result', async ctx => {
      assert.equal((await ingest(ctx, [fixture.offer])).status, 200);
      assert.equal(ctx.rows().length, 1);
      assert.equal((await ingest(ctx, [fixture.offer])).status, 200);
      assert.equal(ctx.rows().length, 1);
      await ctx.restart(); assert.equal(ctx.rows().length, 1);
      const rec = await ctx.request('/advisor/v1/recommend', envelope());
      assert.equal(rec.status, 200); assert.equal(rec.body.status, 'SUCCESS');
      assert.equal(rec.body.shortlist[0].isVerifiedAffordable, true);
      assert.equal(rec.body.shortlist[0].totalVnd, fixture.offer.basePriceVnd);
    });
    await test('H08', 'Same observation changed content reports conflict 409 and preserves original', async ctx => {
      assert.equal((await ingest(ctx, [fixture.offer])).status, 200);
      const before = ctx.rows();
      assert.equal((await ingest(ctx, [{ ...fixture.offer, basePriceVnd: fixture.offer.basePriceVnd + 1 }])).status, 409);
      assert.deepEqual(ctx.rows(), before);
    });
    await test('H09-validation', 'Mixed valid/negative batch rejected atomically', async ctx => {
      assert.equal((await ingest(ctx, [fixture.offer, { ...fixture.offer, externalOfferId: 'bad', basePriceVnd: -1 }])).status, 400);
      noWrites(ctx);
    });
    await test('H09-unknown', 'Mixed valid/unknown variant batch rejected atomically', async ctx => {
      assert.equal((await ingest(ctx, [fixture.offer, { ...fixture.offer, externalOfferId: 'unknown', matchedVariantId: 'unknown:variant' }])).status, 400);
      noWrites(ctx);
    });
    await test('H09-storage', 'Mixed batch with storage-invalid member rejects without half write', async ctx => {
      const incomplete = { ...fixture.offer, externalOfferId: 'missing-completeness' };
      delete incomplete.completenessStatus;
      const result = await ingest(ctx, [fixture.offer, incomplete]);
      assert.equal(result.status, 400); noWrites(ctx);
    });
    await test('H09-conflict', 'Mixed new/conflicting replay reports conflict with no partial insert', async ctx => {
      assert.equal((await ingest(ctx, [fixture.offer])).status, 200);
      const before = ctx.rows();
      assert.equal((await ingest(ctx, [{ ...fixture.offer, externalOfferId: 'new-before-conflict' },
        { ...fixture.offer, basePriceVnd: fixture.offer.basePriceVnd + 1 }])).status, 409);
      assert.deepEqual(ctx.rows(), before);
    });
    await test('H10-nocatalog', 'Missing catalog is explicit retryable unavailable, not false affordability', async ctx => {
      const rec = await ctx.request('/advisor/v1/recommend', envelope());
      assert.equal(rec.status, 503);
      assert.equal(rec.body.error.code, 'ERR_CATALOG_UNAVAILABLE');
      assert.deepEqual(rec.body.shortlist, []);
    }, null);
    await test('H10-nooffer', 'Matching hardware without offers is NO_VERIFIED_OFFER, not NO_FIT', async ctx => {
      const rec = await ctx.request('/advisor/v1/recommend', envelope());
      assert.equal(rec.status, 200); assert.equal(rec.body.status, 'NO_VERIFIED_OFFER');
      assert(rec.body.shortlist.every(row => !row.isVerifiedAffordable));
    });
    await test('H10-unknown', 'Unknown shipping cannot report successful verified purchase', async ctx => {
      assert.equal((await ingest(ctx, [{ ...fixture.offer, shippingVnd: null, completenessStatus: 'PARTIAL_UNKNOWN' }])).status, 200);
      const rec = await ctx.request('/advisor/v1/recommend', envelope());
      assert.equal(rec.status, 200);
      assert(rec.body.shortlist.every(row => row.isVerifiedAffordable === false && row.totalVnd === null));
      assert.equal(rec.body.status, 'NO_VERIFIED_OFFER');
    });
    await test('H10-hardfail', 'Actual hard RAM mismatch remains NO_FIT', async ctx => {
      assert.equal((await ingest(ctx, [fixture.offer])).status, 200);
      const rec = await ctx.request('/advisor/v1/recommend', envelope({ ...fixture.profile, hardConstraints: { minRamGb: 64 } }));
      assert.equal(rec.body.status, 'NO_FIT');
      assert(rec.body.excludedVariants.some(row => row.reasonCode === 'RAM_INSUFFICIENT'));
    });
  }
} finally {
  if (active) { report.finalCleanup = await active.cleanup(); delete report.active; }
  report.passed = report.cases.filter(c => c.status === 'passed').length;
  report.failed = report.cases.filter(c => c.status !== 'passed').length;
  report.status = report.failed ? 'failed' : 'passed';
  await save();
}
process.exitCode = report.failed ? 1 : 0;
