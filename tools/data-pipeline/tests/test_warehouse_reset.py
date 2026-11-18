"""Opt-in destructive integration test: disposable DB and Qdrant prefix only.

Uses real PostgreSQL, dbt, Node publisher and Qdrant. Retailer pages are deterministic
fixtures; no external retailer calls. Not discovered by unittest (no TestCase).
"""
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
from unittest.mock import patch
from urllib.request import Request, urlopen
import psycopg
from psycopg import sql

from scripts import warehouse
from tests.test_pipeline import html


def main():
    if not os.environ.get('PGDATABASE', '').startswith('lua_test_') or not os.environ.get('QDRANT_COLLECTION', '').startswith('lua_test_'):
        raise RuntimeError('Use disposable lua_test_* database and collection prefix')
    prefix = os.environ['QDRANT_COLLECTION']
    base = os.environ['QDRANT_URL']

    def qrequest(path, method='GET'):
        with urlopen(Request(base+path, method=method), timeout=15) as response:
            return json.load(response)

    class FixtureFetcher:
        policy_evidence = []
        stamp = '2026-11-18T00:00:00+00:00'
        visited = []

        def __init__(self, source, **kwargs):
            self.source = source

        def fetch(self, url):
            self.visited.append((self.source,url))
            number = int(url.rsplit('/',1)[-1].split('-')[-1])
            # Last page duplicates identity 18; null specs/unmapped records must remain cataloged.
            sku = str(min(number,18))
            product = {'@type':'Product','name':f'Device {sku}','sku':sku,
                       'offers':{'@type':'Offer','price':'12000000','priceCurrency':'VND'}}
            links = ''.join(f'<a href="/product-{i}">next</a>' for i in range(25))
            body = html(product, links)
            stamp = self.stamp.replace(':00+00:00', f':{number:02d}+00:00')
            return dict(url=url,body=body,contentType='text/html',observedAt=stamp,
                        contentHash=hashlib.sha256(body.encode()).hexdigest(),captureMode='fixture')

    with psycopg.connect(autocommit=True) as db, tempfile.TemporaryDirectory() as temp:
        assert db.execute('select current_database()').fetchone()[0] == os.environ['PGDATABASE']
        configs = []
        for source,host in [('fptshop','fptshop.com.vn'),('laptopaz','laptopaz.vn')]:
            path = Path(temp)/f'{source}.json'
            path.write_text(json.dumps(dict(schemaVersion='lua.pipeline-config.v1',sourceId=source,
                seeds=[f'https://{host}/product-0'],followPatterns=[r'/product-\d+$'],
                variantMap={},category='pc_laptop')),encoding='utf-8')
            configs.extend(['--crawl-config',str(path)])

        def run():
            FixtureFetcher.visited = []
            with patch.object(sys,'argv',['warehouse',*configs]), patch('lua_pipeline.scheduled.Fetcher',FixtureFetcher):
                assert warehouse.main() == 0
            return len(FixtureFetcher.visited)

        def assert_catalog(expected):
            build, collection = db.execute('select build_schema,qdrant_collection from lua_app.active_catalog').fetchone()
            variants = db.execute(sql.SQL('select variant from {}.catalog_variants').format(sql.Identifier(build))).fetchall()
            assert len(variants) == expected, (len(variants),expected)
            assert all(v[0]['specifications']['ramGb'] is None for v in variants)
            assert all(v[0]['catalogAdmission'] == 'automatic' for v in variants)
            assert all(v[0]['qualityIssues'] for v in variants)
            info = qrequest('/collections/'+collection)['result']
            assert info['points_count'] == expected * 2, info
            return collection

        # Initial creation, next-run first-page behavior, and deletion/reinitialization.
        assert run() == 40
        assert_catalog(38)
        assert db.execute('select count(*) from lua_raw.crawl_state').fetchone()[0] == 2
        FixtureFetcher.stamp = '2026-11-18T01:00:00+00:00'
        assert run() == 2
        assert_catalog(38)

        # Snapshot test namespace, delete only those schemas/collections, then bootstrap anew.
        collections = [c['name'] for c in qrequest('/collections')['result']['collections'] if c['name'].startswith(prefix+'_')]
        for name in collections:
            qrequest('/collections/'+name, 'DELETE')
        for (name,) in db.execute("select nspname from pg_namespace where nspname in ('lua_app','lua_raw') or nspname ~ '^lua_build_[a-f0-9]{32}$'").fetchall():
            db.execute(sql.SQL('drop schema {} cascade').format(sql.Identifier(name)))
        assert not [c for c in qrequest('/collections')['result']['collections'] if c['name'].startswith(prefix+'_')]
        assert run() == 40
        assert_catalog(38)
        print(json.dumps({'passed':True,'initialPages':40,'refreshPages':2,'afterResetPages':40,
                          'catalogVariants':38,'qdrantPoints':76,'missingSpecsAdmitted':True,'duplicateIdentitiesMerged':True}))


if __name__ == '__main__':
    main()
