"""PostgreSQL raw store; preserves the crawler's immutable observation contract."""
import hashlib
import json
from datetime import datetime
from psycopg.types.json import Jsonb
from .storage import validate_row, encoded
from .sources import PipelineError


class PostgresStore:
    def __init__(self, connection, category=None):
        self.db, self.category = connection, category

    def product(self, source, external, observed_at, payload, mode, status):
        identity = hashlib.sha256(encoded([source, external, str(observed_at), payload]).encode()).hexdigest()
        result = self.db.execute('''INSERT INTO lua_raw.product_observations
            (observation_id,source,external_id,observed_at,payload,capture_mode,review_status)
            VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING''',
            (identity,source,external,observed_at,Jsonb(payload),mode,status))
        return result.rowcount

    def ingest(self, rows, job=None):
        inserted = 0
        with self.db.transaction():
            for row in rows:
                validate_row(row)
                old = self.db.execute('SELECT payload FROM lua_raw.pipeline_observations WHERE observation_id=%s', (row['observationId'],)).fetchone()
                if old and encoded(old[0]) != encoded(row):
                    raise PipelineError('IMMUTABLE_OBSERVATION_CONFLICT')
                if old:
                    continue
                self.db.execute('INSERT INTO lua_raw.pipeline_observations(observation_id,payload) VALUES(%s,%s)', (row['observationId'],Jsonb(row)))
                attrs = row.get('attributes', {})
                def attr(*keys):
                    return next((attrs[k] for k in keys if attrs.get(k)), None)
                payload = {'name':row['name'],'url':row['offerUrl'],'category':self.category,
                    'brand':attr('Thương hiệu','Brand'),
                    'specs':{'ram':attr('RAM','Dung lượng RAM'),'storage':attr('Ổ cứng','Storage'),
                             'cpu':attr('CPU','Loại CPU'),'os':attr('Hệ điều hành','OS'),'gpu':attr('GPU','Card đồ họa')},
                    'pricing':{'current':row['basePriceVnd']},'pipelineObservationId':row['observationId']}
                self.product(row['sourceId'],row['externalOfferId'],row['observedAt'],payload,row['captureMode'],row['status'])
                inserted += 1
            if job:
                self.job(*job)
        return inserted

    def job(self, source, url, state, detail):
        self.db.execute('''INSERT INTO lua_raw.jobs(source,url,state,detail) VALUES(%s,%s,%s,%s)
            ON CONFLICT(source,url) DO UPDATE SET state=excluded.state,detail=excluded.detail,updated_at=now()''',
            (source,url,state,Jsonb(detail)))

    def completed(self, source, url):
        row = self.db.execute('SELECT state FROM lua_raw.jobs WHERE source=%s AND url=%s',(source,url)).fetchone()
        return row and row[0] == 'done'
