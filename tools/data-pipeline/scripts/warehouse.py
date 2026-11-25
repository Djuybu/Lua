"""Crawl/import -> PostgreSQL raw -> dbt build/test -> Qdrant -> atomic publication."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid
import psycopg
from psycopg.types.json import Jsonb
from dotenv import load_dotenv
from lua_pipeline.postgres import PostgresStore
from lua_pipeline.sources import load_config
from lua_pipeline.storage import verify_bundle
from lua_pipeline.scheduled import crawl_sources, mark_published

ROOT = Path(__file__).resolve().parents[3]
PIPELINE = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--import-existing', action='store_true', help='Read public.raw_crawled_laptops without changing it')
    parser.add_argument('--crawl-config', type=Path, action='append', default=[], help='Repeat for multiple websites')
    parser.add_argument('--crawl-all', action='store_true', help='Crawl the eight configured retailers')
    parser.add_argument('--max-pages', type=int, default=None, help='Override automatic 20-page bootstrap / 1-page refresh')
    parser.add_argument('--category', choices=['pc_laptop','pc_desktop','phone','tablet'])
    parser.add_argument('--bundle', type=Path, help='Historical reviewed-format staging bundle; original timestamps retained')
    args = parser.parse_args()
    if args.max_pages is not None and not 1 <= args.max_pages <= 20:
        parser.error('--max-pages must be 1..20')
    paths = args.crawl_config + (sorted((PIPELINE/'sources').glob('*.json')) if args.crawl_all else [])
    configs = [load_config(path) for path in paths]
    if len({c['sourceId'] for c in configs}) != len(configs):
        parser.error('Only one config per source is allowed')
    if any(not c['seeds'] or not (c.get('category') or args.category) for c in configs):
        parser.error('Each crawl source needs seeds and a category (config or --category)')
    load_dotenv(ROOT / '.env')
    load_dotenv(ROOT / 'services/adviser-backend/.env')
    if not os.environ.get('PGPASSWORD') and os.environ.get('DB_PASSWORD'):
        os.environ['PGPASSWORD'] = os.environ['DB_PASSWORD']
    run_id = uuid.uuid4().hex
    build_schema = 'lua_build_' + run_id
    out = PIPELINE / '.work/warehouse' / run_id
    out.mkdir(parents=True)
    report = {'runId':run_id,'status':'running','buildSchema':build_schema}
    with psycopg.connect(connect_timeout=10, autocommit=True) as db:
        if not db.execute('SELECT pg_try_advisory_lock(73012989)').fetchone()[0]:
            raise RuntimeError('Another Lua warehouse pipeline is running')
        db.execute((PIPELINE/'warehouse/schema.sql').read_text(encoding='utf-8'))
        db.execute('INSERT INTO lua_app.pipeline_runs(run_id,status) VALUES(%s,%s)',(run_id,'running'))
        store = PostgresStore(db,args.category)
        try:
            if args.import_existing:
                inserted = 0
                with db.transaction():
                    rows = db.execute('SELECT source,sku,id,crawled_at,payload FROM public.raw_crawled_laptops ORDER BY source,id').fetchall()
                    for source, sku, legacy_id, stamp, payload in rows:
                        payload = dict(payload)
                        categories = payload.get('categories') or []
                        payload['category'] = 'pc_laptop' if any(c.get('slug') == 'laptop' for c in categories if isinstance(c,dict)) else None
                        source = 'tgdd' if source == 'thegioididong' else source
                        inserted += store.product(source, sku or legacy_id, stamp, payload, 'existing_postgres_capture', 'reference_only')
                report['existingImport'] = {'read':len(rows),'inserted':inserted}
            if args.bundle:
                bundle = json.loads(args.bundle.read_text(encoding='utf-8'))
                verify_bundle(bundle)
                report['historicalBundleInserted'] = store.ingest(bundle['records'])
            initialized = []
            if configs:
                report['crawl'], initialized = crawl_sources(db, configs, args.category, args.max_pages)
                if not any(r['parsed'] for r in report['crawl'].values()):
                    raise RuntimeError('No live source parsed data; active catalog retained')
            env = dict(os.environ)
            env.pop('AI_API_KEY',None)
            env['DBT_ENV_SECRET_PGPASSWORD'] = env.get('PGPASSWORD','')
            env['LUA_BUILD_SCHEMA'] = build_schema
            env['DBT_TARGET_PATH'] = str(out/'target')
            env['DBT_LOG_PATH'] = str(out/'logs')
            env['DBT_SEND_ANONYMOUS_USAGE_STATS'] = 'false'
            dbt = Path(sys.executable).parent / ('dbt.exe' if os.name == 'nt' else 'dbt')
            project = PIPELINE/'warehouse/dbt'
            completed = subprocess.run([str(dbt),'build','--project-dir',str(project),'--profiles-dir',str(project)],env=env)
            if completed.returncode:
                raise RuntimeError('dbt build/tests failed; active catalog retained')
            publish = subprocess.run(['node','--experimental-strip-types',str(ROOT/'services/adviser-backend/scripts/publish-warehouse.mjs'),build_schema,run_id],env=env)
            if publish.returncode:
                raise RuntimeError('Qdrant publication failed; active catalog retained')
            mark_published(db, initialized, run_id)
            report['status'] = 'partial' if configs and any(r['failed'] or not r['parsed'] for r in report['crawl'].values()) else 'passed'
        except Exception as exc:
            report['status'] = 'failed'
            # Do not serialize driver exception text, connection strings or passwords.
            report['errorType'] = type(exc).__name__
            print('Warehouse failed; inspect crawl results or dbt test output. Active publication is preserved.',flush=True)
        finally:
            db.execute('UPDATE lua_app.pipeline_runs SET status=%s,completed_at=now(),detail=%s WHERE run_id=%s',(report['status'],Jsonb(report),run_id))
            (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps(report,ensure_ascii=False),flush=True)
    return 0 if report['status'] == 'passed' else 1

if __name__ == '__main__':
    sys.exit(main())
