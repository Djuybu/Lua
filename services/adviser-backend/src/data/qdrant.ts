import { createHash } from 'node:crypto';

// Lexical sparse vectors, not semantic embeddings. Shared by indexer and query.
export function keywords(text: string): { indices: number[]; values: number[] } {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  const weights = new Map<number, number>();
  for (const token of normalized.match(/[a-z0-9]+/g) ?? []) {
    const id = createHash('sha256').update(token).digest().readUInt32BE(0);
    weights.set(id, (weights.get(id) ?? 0) + 1);
  }
  const indices = [...weights.keys()].sort((a,b) => a-b);
  return { indices, values: indices.map(id => 1 + Math.log(weights.get(id)!)) };
}
export function pointId(id: string): string {
  const h = createHash('sha256').update(id).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
export class QdrantIndex {
  private base: string;
  constructor(base = process.env.QDRANT_URL || 'http://127.0.0.1:6333') { this.base = base.replace(/\/$/,''); }
  async request(path: string, method = 'GET', body?: unknown): Promise<any> {
    const response = await fetch(this.base + path, { method, headers: { 'Content-Type':'application/json', ...(process.env.QDRANT_API_KEY ? {'api-key':process.env.QDRANT_API_KEY} : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Object.assign(new Error('Qdrant request failed'), { statusCode:503, code:'ERR_SEARCH_UNAVAILABLE' });
    return response.json();
  }
  async search(collection: string, text: string, limit = 100): Promise<string[]> {
    const vector = keywords(text);
    if (!vector.indices.length) return [];
    const result = await this.request(`/collections/${encodeURIComponent(collection)}/points/query`, 'POST', {
      query:vector, using:'keywords', limit, with_payload:true,
      filter:{must:[{key:'recordType',match:{value:'variant'}}]},
    });
    return result.result.points.map((p: any) => p.payload.variantId);
  }
}
