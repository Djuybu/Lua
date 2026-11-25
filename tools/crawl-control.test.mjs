import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { CrawlControl, createCrawlHandler } from './crawl-control.mjs';

async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'lua-crawl-control-'));
  t.after(() => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('lua-crawl-control-'));
    return rm(root, { recursive: true, force: true });
  });
  const runtime = resolve(root, 'tools/data-pipeline/.work/warehouse-venv/Scripts');
  await mkdir(runtime, { recursive: true });
  await writeFile(resolve(runtime, 'python.exe'), 'test-only');
  const runDir = resolve(root, 'checkpoint');
  const launches = [];
  const launch = (...args) => { const child = new EventEmitter(); launches.push({ args, child }); return child; };
  return { root, runDir, launches, control: new CrawlControl(root, { launch, runDir, isAlive: () => false }) };
}
test('constructing and reading status never starts a crawler', async t => {
  const { control, launches } = await fixture(t);
  assert.equal((await control.status()).state, 'idle');
  assert.equal((await control.status()).running, false);
  assert.equal(launches.length, 0);
});
test('concurrent resume requests dispatch one bounded subprocess and return immediately', async t => {
  const { control, launches } = await fixture(t);
  const results = await Promise.all([control.resume(), control.resume(), control.resume()]);
  assert.equal(launches.length, 1);
  assert.ok(results.every(row => row.running));
  const args = launches[0].args[1];
  assert.equal(args[args.indexOf('--max-pages') + 1], '50');
  assert.equal(args[args.indexOf('--workers') + 1], '2');
  assert.equal(launches[0].args[2].windowsHide, true);
});
test('pause persists a stop request and keeps the checkpoint intact', async t => {
  const { control, runDir } = await fixture(t);
  await mkdir(runDir, { recursive: true });
  const saved = JSON.stringify({ state: 'paused', totals: [{ state: 'done', tasks: 100 }] });
  await writeFile(resolve(runDir, 'progress.json'), saved);
  await control.resume();
  assert.equal((await control.pause()).state, 'pausing');
  assert.match(await readFile(resolve(runDir, 'stop'), 'utf8'), /pause requested/);
  assert.equal(await readFile(resolve(runDir, 'progress.json'), 'utf8'), saved);
});
test('a stale worker is shown as paused and never resumed by status', async t => {
  const { control, runDir, launches } = await fixture(t);
  await mkdir(runDir, { recursive: true });
  await writeFile(resolve(runDir, 'progress.json'), JSON.stringify({ state: 'running', totals: [] }));
  await writeFile(resolve(runDir, 'pid.txt'), '1234');
  assert.equal((await control.status()).state, 'paused');
  assert.equal(launches.length, 0);
});
test('GET is read-only and invalid POST cannot start jobs', async () => {
  const calls = [];
  const handler = createCrawlHandler({ status: async () => { calls.push('status'); return { running: false }; }, resume: async () => calls.push('resume') });
  const response = () => ({ writeHead(code) { this.code = code; }, end(body) { this.body = JSON.parse(body); } });
  const get = response();
  await handler({ url: '/advisor/v1/crawl', method: 'GET' }, get);
  assert.equal(get.code, 200);
  const post = response();
  const req = { url: '/advisor/v1/crawl', method: 'POST', headers: { 'content-type': 'application/json' }, async *[Symbol.asyncIterator]() { yield Buffer.from('{"action":"resume","automatic":true}'); } };
  await handler(req, post);
  assert.equal(post.code, 400);
  assert.deepEqual(calls, ['status']);
});
