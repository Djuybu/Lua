import pg from 'pg';
import type { ProductVariant } from '../contracts/catalog.ts';
import type { StagedCrawlerOffer } from '../contracts/crawler.ts';
import { getObservationId, validateStagedCrawlerOffer } from '../contracts/crawler.ts';
import { QdrantIndex } from './qdrant.ts';

export class AdviserPostgresStore {
  readonly pool: pg.Pool;
  readonly index = new QdrantIndex();
  constructor() { this.pool = new pg.Pool({ connectionTimeoutMillis:10000, max:5 }); }
  async publication() {
    const row = (await this.pool.query('SELECT version,build_schema,qdrant_collection,published_at FROM lua_app.active_catalog WHERE singleton=true')).rows[0];
    if (row && !/^lua_build_[a-f0-9]{32}$/.test(row.build_schema)) throw new Error('Invalid catalog schema');
    return row as {version:string;build_schema:string;qdrant_collection:string;published_at:Date} | undefined;
  }
  async getActiveCatalogVersion(): Promise<string|null> { return (await this.publication())?.version ?? null; }
  async getVariantsForActiveCatalog(): Promise<ProductVariant[]> {
    const pub = await this.publication();
    if (!pub) return [];
    return (await this.pool.query(`SELECT variant FROM "${pub.build_schema}".catalog_variants ORDER BY variant_id`)).rows.map(r=>r.variant);
  }
  async catalog(query = '') {
    const pub = await this.publication();
    if (!pub) throw Object.assign(new Error('Run warehouse pipeline first'),{statusCode:503,code:'ERR_CATALOG_UNAVAILABLE'});
    let ids: string[] | null = null;
    if (query.trim()) ids = await this.index.search(pub.qdrant_collection,query.trim());
    const rows = ids === null
      ? await this.pool.query(`SELECT variant FROM "${pub.build_schema}".catalog_variants ORDER BY variant_id`)
      : await this.pool.query(`SELECT variant FROM "${pub.build_schema}".catalog_variants WHERE variant_id=ANY($1::text[]) ORDER BY array_position($1::text[],variant_id)`,[ids]);
    return {schemaVersion:'1.0.0',catalogVersion:pub.version,ruleVersion:'2026.11',publishedAt:pub.published_at.toISOString(),variants:rows.rows.map(r=>r.variant),offers:[],facts:[],storage:'postgresql',search:query.trim()?'qdrant-lexical':null};
  }
  async getOffersForVariant(variantId: string): Promise<StagedCrawlerOffer[]> {
    return (await this.pool.query('SELECT payload FROM lua_app.reviewed_offers WHERE variant_id=$1 ORDER BY payload->>\'observedAt\' DESC',[variantId])).rows.map(r=>r.payload);
  }
  async saveOffers(offers: StagedCrawlerOffer[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const active = (await client.query('SELECT build_schema FROM lua_app.active_catalog WHERE singleton=true FOR SHARE')).rows[0];
      if (!active || !/^lua_build_[a-f0-9]{32}$/.test(active.build_schema)) throw Object.assign(new Error('No active catalog'),{statusCode:503,code:'ERR_CATALOG_UNAVAILABLE'});
      const known = new Set((await client.query(`SELECT variant_id FROM "${active.build_schema}".catalog_variants`)).rows.map(r=>r.variant_id));
      for (const offer of offers) {
        if (!known.has(offer.matchedVariantId) || !validateStagedCrawlerOffer(offer).valid || !['COMPLETE','PARTIAL_UNKNOWN'].includes(offer.completenessStatus)) throw Object.assign(new Error('Invalid approved offer or variant'),{statusCode:400,code:'ERR_SEMANTIC_VALIDATION'});
        const identity = getObservationId(offer);
        await client.query('INSERT INTO lua_app.reviewed_offers(observation_id,variant_id,payload) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING',[identity,offer.matchedVariantId,JSON.stringify(offer)]);
        const same = await client.query('SELECT payload=$2::jsonb AS identical FROM lua_app.reviewed_offers WHERE observation_id=$1',[identity,JSON.stringify(offer)]);
        if (!same.rows[0]?.identical) throw Object.assign(new Error('Conflicting offer observation'),{statusCode:409,code:'ERR_OBSERVATION_CONFLICT'});
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async health() {
    const pub = await this.publication();
    const qdrant = pub ? await this.index.request(`/collections/${encodeURIComponent(pub.qdrant_collection)}/points/count`,'POST',{exact:true}) : null;
    return {status:pub?'ok':'uninitialized',database:'postgresql',databaseName:process.env.PGDATABASE,qdrant:!!qdrant,catalogVersion:pub?.version ?? null,indexedPoints:qdrant?.result.count ?? 0};
  }
  async close() { await this.pool.end(); }
}
