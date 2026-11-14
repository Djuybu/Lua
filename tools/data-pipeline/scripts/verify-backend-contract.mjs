// Read-only contract check. Does not start the server or write its database.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [backendRoot, payloadPath] = process.argv.slice(2);
if (!backendRoot || !payloadPath) {
  console.error('Usage: node --experimental-strip-types scripts/verify-backend-contract.mjs <backend-root> <payload.json>');
  process.exit(2);
}
const { validateStagedCrawlerOffer } = await import(pathToFileURL(resolve(backendRoot, 'src/contracts/crawler.ts')));
const payload = JSON.parse(await readFile(payloadPath, 'utf8'));
if (!Array.isArray(payload.offers) || payload.offers.length === 0) {
  throw new Error('Expected at least one reviewed offer; an empty batch proves no contract coverage');
}
const results = payload.offers.map((offer, index) => ({ index, ...validateStagedCrawlerOffer(offer) }));
console.log(JSON.stringify({ checked: results.length, results }));
if (results.some(result => !result.valid)) process.exitCode = 2;
