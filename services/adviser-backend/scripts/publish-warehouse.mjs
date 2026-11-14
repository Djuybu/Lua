import pg from 'pg';
import { QdrantIndex, keywords, pointId } from '../src/data/qdrant.ts';
const [schema, runId] = process.argv.slice(2);
if (!/^lua_build_[a-f0-9]{32}$/.test(schema || '') || !/^[a-f0-9]{32}$/.test(runId || '')) throw new Error('Invalid warehouse identity');
const prefix = process.env.QDRANT_COLLECTION || 'lua_catalog';
if (!/^[a-z][a-z0-9_]{1,60}$/.test(prefix)) throw new Error('Invalid collection prefix');
const collection = `${prefix}_${runId}`;
const pool = new pg.Pool({ connectionTimeoutMillis:10000 });
const index = new QdrantIndex();
try {
  const documents = (await pool.query(`SELECT * FROM "${schema}".search_documents ORDER BY document_id`)).rows;
  if (!documents.some(d => d.record_type === 'variant')) throw new Error('Empty catalog cannot replace active data');
  await index.request(`/collections/${collection}`, 'PUT', { sparse_vectors:{keywords:{modifier:'idf'}} });
  for (let i=0;i<documents.length;i+=64) {
    await index.request(`/collections/${collection}/points?wait=true`,'PUT', {points:documents.slice(i,i+64).map(d => ({id:pointId(d.document_id),vector:{keywords:keywords(d.search_text)},payload:{...d.payload,documentId:d.document_id}}))});
  }
  const count = await index.request(`/collections/${collection}/points/count`,'POST',{exact:true});
  if (count.result.count !== documents.length) throw new Error('Qdrant count mismatch');
  // One PG row switches both the SQL schema and exact Qdrant collection atomically.
  await pool.query(`INSERT INTO lua_app.active_catalog(singleton,version,build_schema,qdrant_collection)
    VALUES(true,$1,$2,$3) ON CONFLICT(singleton) DO UPDATE SET version=excluded.version,build_schema=excluded.build_schema,qdrant_collection=excluded.qdrant_collection,published_at=now()`,['warehouse-'+runId,schema,collection]);
  console.log(JSON.stringify({published:true,variants:documents.filter(d=>d.record_type==='variant').length,qdrantPoints:documents.length,collection}));
} catch { console.error('Warehouse publish failed. Previous catalog remains active; incomplete build retained for inspection.'); process.exitCode=1; }
finally { await pool.end(); }
