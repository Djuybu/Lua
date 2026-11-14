"""Opt-in integration checks against configured PostgreSQL and Qdrant.

Synthetic ingestion is rolled back. Failed-publication probe uses an unreachable
loopback port and must leave the active catalog unchanged. No retailer/AI calls.
"""
import copy
import json
import os
from pathlib import Path
import subprocess
import uuid
import psycopg
from dotenv import load_dotenv
from lua_pipeline.postgres import PostgresStore
from lua_pipeline.sources import PipelineError
from tests.test_pipeline import rows

ROOT = Path(__file__).resolve().parents[3]
load_dotenv(ROOT / 'services/adviser-backend/.env')
with psycopg.connect(autocommit=True) as db:
    before = db.execute('SELECT version,build_schema,qdrant_collection FROM lua_app.active_catalog').fetchone()
    assert before, 'Publish a catalog first'
    counts = db.execute('SELECT count(*) FROM lua_raw.pipeline_observations').fetchone()[0]
    with db.transaction():
        store = PostgresStore(db, 'pc_laptop')
        records = rows()
        records[0]['observationId'] = 'warehouse-test-' + uuid.uuid4().hex
        assert store.ingest(records) == 1
        assert store.ingest(records) == 0, 'Replay must be idempotent'
        conflicting = copy.deepcopy(records[0])
        conflicting['name'] = 'Conflicting immutable observation'
        fresh = copy.deepcopy(records[0])
        fresh['observationId'] += '-batch'
        try:
            store.ingest([fresh, conflicting])
            raise AssertionError('Conflict was accepted')
        except PipelineError:
            pass
        assert db.execute('SELECT count(*) FROM lua_raw.pipeline_observations WHERE observation_id=%s',(fresh['observationId'],)).fetchone()[0] == 0, 'Partial batch committed'
        raise psycopg.Rollback()
    assert db.execute('SELECT count(*) FROM lua_raw.pipeline_observations').fetchone()[0] == counts
    env = dict(os.environ, QDRANT_URL='http://127.0.0.1:1')
    env.pop('AI_API_KEY', None)
    result = subprocess.run(['node','--experimental-strip-types',str(ROOT/'services/adviser-backend/scripts/publish-warehouse.mjs'),before[1],uuid.uuid4().hex],env=env,capture_output=True,timeout=25)
    assert result.returncode != 0, 'Unavailable Qdrant must fail publication'
    assert db.execute('SELECT version,build_schema,qdrant_collection FROM lua_app.active_catalog').fetchone() == before, 'Failed publication changed active catalog'
    print(json.dumps({'passed':['raw replay','immutable conflict','batch rollback','no test data retained','failed publication preserves active catalog']}))
