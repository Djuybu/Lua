// Local PostgreSQL + Qdrant API. Expo serves the frontend on port 8081.
import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { existsSync } from 'node:fs';
import { LiveChat } from '../services/adviser-backend/src/ai/live-chat.ts';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { AdviserPostgresStore } from '../services/adviser-backend/src/data/postgres.ts';
import { createHttpServer } from '../services/adviser-backend/src/server/http-app.ts';
import { BoundedAiClient, MockAiProvider } from '../services/adviser-backend/src/ai/adapter.ts';
import { LiveExplanation } from '../services/adviser-backend/src/ai/live-explanation.ts';
import { validateConfirmedProfile } from '../services/adviser-backend/src/contracts/taxonomy.ts';
import { CrawlControl, createCrawlHandler } from './crawl-control.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = resolve(root, 'services/adviser-backend');
for (const path of [resolve(root, '.env'), resolve(backendDir, '.env')]) if (existsSync(path)) loadEnvFile(path);
process.env.PGPASSWORD ||= process.env.DB_PASSWORD;
process.env.AI_API_KEY ||= process.env.API_KEY;
process.env.AI_MODE ||= process.env.AI_API_KEY ? 'provider' : 'fallback_only';
process.env.AI_MODEL ||= 'gpt-4.1-mini';
process.env.AI_PROVIDER_NAME ||= 'openai';
if (process.env.AI_MODE === 'provider' && process.env.AI_PROVIDER_NAME !== 'openai') throw new Error('This launcher supports AI_PROVIDER_NAME=openai');
const port = Number(process.env.PORT || 8080);
const store = new AdviserPostgresStore();
const crawl = new CrawlControl(root);
const handleCrawl = createCrawlHandler(crawl);
await store.health();
const ai = new LiveExplanation({ mode: process.env.AI_MODE || 'mock', model: process.env.AI_MODEL || '', key: process.env.AI_API_KEY || '', timeoutMs: Number(process.env.AI_TIMEOUT_MS || 5000) });
const chat = new LiveChat({ key: process.env.AI_MODE === 'provider' ? process.env.AI_API_KEY : '', model: process.env.AI_MODEL });
const legacy = createHttpServer(store, new BoundedAiClient(new MockAiProvider()));
const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const expoPort = Number(process.env.EXPO_PORT || 8081);
const lanIps = Object.values(networkInterfaces()).flat().filter(x => x && x.family === 'IPv4' && !x.internal).map(x => x.address);
const allowedHosts = new Set([...lanIps.map(ip => `${ip}:${port}`),`127.0.0.1:${port}`, `localhost:${port}`, `10.0.2.2:${port}`]);
const expoOrigins = new Set([...lanIps.flatMap(ip => [expoPort,8082].map(p => `http://${ip}:${p}`)),`http://localhost:8082`,`http://127.0.0.1:8082`,`http://127.0.0.1:${expoPort}`, `http://localhost:${expoPort}`]);
const localOrigins = new Set([...allowedHosts].map(host => `http://${host}`));
const trusted = req => allowedHosts.has(req.headers.host) && (!req.headers.origin || localOrigins.has(req.headers.origin) || expoOrigins.has(req.headers.origin));
const backend = http.createServer(async (req, res) => {
  if (!trusted(req)) return send(res, 403, { error: { message: 'Local origin required' } });
  if (expoOrigins.has(req.headers.origin)) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  }
  if (req.url === '/advisor/v1/ingest') return send(res, 403, {error:{message:'Use the warehouse import command'}});
  if (await handleCrawl(req,res)) return;
  if (req.url === '/advisor/v1/ai/status' && req.method === 'GET') return send(res, 200, { mode: ai.mode, model: ai.model, chat: true, configured: !!process.env.AI_API_KEY });
  if (!['/advisor/v1/explain', '/advisor/v1/chat'].includes(req.url)) { legacy.emit('request', req, res); return; }
  if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) return send(res, 400, { error: { message: 'JSON POST required' } });
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 16000) { send(res, 413, { error: { message: 'Payload too large' } }); return; } chunks.push(chunk); }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (req.url === '/advisor/v1/chat') {
      if (!body || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 4000 || !Number.isSafeInteger(body.profileRevision) || body.profileRevision < 0 || !Array.isArray(body.history) || body.history.length > 40 || body.history.some(x => !x || !['user','assistant'].includes(x.role) || typeof x.text !== 'string' || x.text.length > 16000)) return send(res,400,{error:{message:'Invalid chat request'}});
      const retrieved = (await store.catalog(body.text.slice(0,200))).variants.slice(0,20);
      const candidates = retrieved.length ? retrieved : (await store.getVariantsForActiveCatalog()).slice(0,20);
      const reply = await chat.reply(body, candidates, controller.signal);
      if (!res.destroyed) send(res,200,reply);
      return;
    }
    if (!body || typeof body.requestId !== 'string' || body.requestId.length > 100 || !validateConfirmedProfile(body.profile).valid) return send(res, 400, { error: { message: 'Invalid confirmed profile or request identity' } });
    const variant = (await store.getVariantsForActiveCatalog()).find(v => v.variantId === body.variantId);
    if (!variant) return send(res, 404, { error: { message: 'Variant not found in active catalog' } });
    const explanation = await ai.explain(variant, body.profile, body.requestId, controller.signal);
    if (!res.destroyed) send(res, 200, explanation);
  } catch { if (!res.destroyed) send(res, 400, { error: { message: 'Cannot process explanation request' } }); }
});
backend.on('error', err => { console.error('Local server failed:', err.code); process.exit(1); });
backend.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`Backend: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { if (crawl.child) await crawl.pause(); backend.closeAllConnections(); backend.close(); await store.close(); process.exit(0); });
