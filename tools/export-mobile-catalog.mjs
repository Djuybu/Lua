// Generate the versioned mobile catalog bundle from the running local backend.
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const endpoint = (process.env.LUA_CATALOG_API || 'http://127.0.0.1:8080').replace(/\/$/, '');
const response = await fetch(`${endpoint}/advisor/v1/catalog`, { signal: AbortSignal.timeout(15000) });
if (!response.ok) throw new Error(`Catalog export failed: HTTP ${response.status}`);
const catalog = await response.json();
if (catalog?.schemaVersion !== '1.0.0' || !Array.isArray(catalog.variants) || !catalog.variants.length || !Array.isArray(catalog.offers)) {
  throw new Error('Catalog export rejected an invalid or empty response');
}
const output = resolve('apps/adviser/src/catalog.json');
await writeFile(output, JSON.stringify({
  schemaVersion: catalog.schemaVersion,
  catalogVersion: catalog.catalogVersion,
  ruleVersion: catalog.ruleVersion,
  publishedAt: catalog.publishedAt,
  variants: catalog.variants,
  facts: catalog.facts ?? [],
  offers: catalog.offers,
}, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ output, catalogVersion: catalog.catalogVersion, variants: catalog.variants.length, offers: catalog.offers.length }));

