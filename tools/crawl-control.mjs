// Reading saved state never starts Python, retailer requests, or catalog publication.
import { spawn } from 'node:child_process';
import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const activeStates = new Set(['running', 'pausing', 'publishing']);
export class CrawlControl {
  constructor(root, { launch = spawn, runDir, isAlive } = {}) {
    this.root = root;
    this.runDir = runDir || resolve(root, 'tools/data-pipeline/.work/inventory-20261114');
    this.launch = launch;
    this.isAlive = isAlive || (pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } });
    this.child = null;
    this.starting = false;
    this.lastError = null;
  }
  async status({ ignoreStarting = false } = {}) {
    let saved = { state: 'idle', totals: [], publications: [] };
    try { saved = JSON.parse(await readFile(resolve(this.runDir, 'progress.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    let pid = null;
    try { pid = Number((await readFile(resolve(this.runDir, 'pid.txt'), 'utf8')).trim()); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const running = (!ignoreStarting && this.starting) || !!this.child || (Number.isSafeInteger(pid) && pid > 0 && this.isAlive(pid));
    const pausing = running && existsSync(resolve(this.runDir, 'stop'));
    let state = running ? (pausing ? 'pausing' : activeStates.has(saved.state) ? saved.state : 'running') : activeStates.has(saved.state) ? 'paused' : saved.state;
    if (!running && this.lastError) state = 'failed';
    return {
      state, running, updatedAt: saved.updatedAt || null,
      totals: saved.totals || [], batch: saved.batch || null,
      lastPublication: saved.publications?.at(-1) || null,
      error: this.lastError || saved.error || null,
      maxPages: 50, maxSeconds: 300,
    };
  }
  async resume() {
    if (this.starting || this.child) return this.status();
    this.starting = true;
    try {
      // Do not treat this request's in-memory reservation as an existing worker.
      const current = await this.status({ ignoreStarting: true });
      if (current.running) return current;
      const python = process.env.CRAWL_PYTHON || resolve(this.root, 'tools/data-pipeline/.work/warehouse-venv/Scripts/python.exe');
      if (!existsSync(python)) throw Object.assign(new Error('Crawler runtime unavailable'), { code: 'CRAWLER_UNAVAILABLE' });
      await mkdir(this.runDir, { recursive: true });
      await unlink(resolve(this.runDir, 'stop')).catch(error => { if (error.code !== 'ENOENT') throw error; });
      const output = await open(resolve(this.runDir, 'manual-worker.log'), 'a');
      try {
        const child = this.launch(python, ['-u', '-m', 'scripts.crawl_inventory', '--run-dir', this.runDir, '--resume', '--max-pages', '50', '--max-seconds', '300', '--workers', '2', '--publish', '--keep-stop-request'], {
          cwd: resolve(this.root, 'tools/data-pipeline'),
          env: { ...process.env, PYTHONUTF8: '1' },
          stdio: ['ignore', output.fd, output.fd],
          windowsHide: true,
        });
        this.child = child;
        this.lastError = null;
        child.once('error', () => { if (this.child === child) this.child = null; this.lastError = 'CRAWLER_START_FAILED'; });
        child.once('exit', code => { if (this.child === child) this.child = null; if (code) this.lastError = 'CRAWLER_EXIT_FAILED'; });
      } finally { await output.close(); }
      return await this.status();
    } finally { this.starting = false; }
  }
  async pause() {
    await mkdir(this.runDir, { recursive: true });
    await writeFile(resolve(this.runDir, 'stop'), 'pause requested by user\n', 'ascii');
    return this.status();
  }
}

export function createCrawlHandler(control) {
  return async (req, res) => {
    if (req.url !== '/advisor/v1/crawl') return false;
    const send = (code, body) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method === 'GET') { send(200, await control.status()); return true; }
      if (req.method !== 'POST') { send(405, { error: { message: 'GET or POST required' } }); return true; }
      if (!req.headers['content-type']?.startsWith('application/json')) { send(400, { error: { message: 'JSON required' } }); return true; }
      const chunks = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 1024) { send(413, { error: { message: 'Request too large' } }); return true; }
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!body || !['resume', 'pause'].includes(body.action) || Object.keys(body).length !== 1) {
        send(400, { error: { message: 'Choose resume or pause' } }); return true;
      }
      send(202, await control[body.action]());
    } catch (error) {
      send(503, { error: { message: error.code === 'CRAWLER_UNAVAILABLE' ? 'Chưa có môi trường chạy crawler trên máy chủ.' : 'Không thể điều khiển lượt cập nhật. Hãy thử lại.' } });
    }
    return true;
  };
}
