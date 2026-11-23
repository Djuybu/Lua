"""Explicit, bounded inventory batches; idle/status never crawl or publish."""
import argparse
from concurrent.futures import ThreadPoolExecutor, wait
from datetime import datetime, timezone
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import threading
import time
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET
import psycopg
from dotenv import load_dotenv
from lua_pipeline.fetch import Fetcher
from lua_pipeline.extract import extract
from lua_pipeline.postgres import PostgresStore
from lua_pipeline.reference import category_of
from lua_pipeline.sources import HOSTS, PipelineError, check_url, load_config
from lua_pipeline.inventory_control import (
    CrawlPaused, CrawlSession, RunLock, atomic_json, claim_daily_run, saved_progress,
)

BASE = Path(__file__).resolve().parents[1]
ROOT = BASE.parents[1]


def sitemap_allowed(source, url):
    path = urlsplit(url).path.lower()
    if source == 'fptshop':
        return '/products/' in path and any(s in path for s in ('dien-thoai', 'may-tinh-xach-tay', 'may-tinh-de-ban', 'may-tinh-bang'))
    return 'product' in path and not any(s in path for s in ('category', 'sitemap-news', 'sitemap_article', 'sitemap-article'))


def product_candidate(source, url):
    if category_of(url):
        return True
    path = urlsplit(url).path.lower()
    return source == 'laptopaz' and path.endswith('.html') and not re.search(r'/(?:linh-kien|phu-kien|chuot|ban-phim|man-hinh|sac|cap|tui|balo|ram|ssd|o-cung|tai-nghe)(?:-|/)', path)


class Queue:
    def __init__(self, path):
        self.db = sqlite3.connect(path, timeout=30)
        self.db.execute('pragma journal_mode=wal')
        self.db.execute('''create table if not exists tasks(
          source text,url text,kind text,state text default 'pending',priority integer default 0,
          parsed integer default 0,inserted integer default 0,quarantined integer default 0,
          error text,updated_at text,primary key(source,url))''')
        self.db.commit()
        self.db.execute('create index if not exists tasks_pending on tasks(source,state,kind,priority,url)')
        self.db.commit()

    def add(self, source, url, kind, priority=0):
        self.db.execute('insert or ignore into tasks(source,url,kind,priority) values(?,?,?,?)',(source,url,kind,priority))

    def next(self, source, kind):
        row = self.db.execute("select url,kind from tasks where source=? and state='pending' and kind=? order by priority,url limit 1",(source,kind)).fetchone()
        if row:
            self.db.execute("update tasks set state='running',updated_at=? where source=? and url=?",(datetime.now(timezone.utc).isoformat(),source,row[0]))
            self.db.commit()
        return row

    def finish(self, source, url, state, parsed=0, inserted=0, quarantined=0, error=None):
        self.db.execute('update tasks set state=?,parsed=?,inserted=?,quarantined=?,error=?,updated_at=? where source=? and url=?',(state,parsed,inserted,quarantined,error,datetime.now(timezone.utc).isoformat(),source,url))
        self.db.commit()

    def release(self, source, url):
        self.db.execute("update tasks set state='pending' where source=? and url=? and state='running'", (source,url))
        self.db.commit()


def parse_sitemap(source, capture, queue):
    body = capture['body']
    if '<!DOCTYPE' in body.upper() or '<!ENTITY' in body.upper():
        raise PipelineError('UNSAFE_XML')
    root = ET.fromstring(body)
    kind = root.tag.rsplit('}',1)[-1]
    if kind not in {'sitemapindex','urlset'}:
        raise PipelineError('NOT_SITEMAP')
    counts = {'candidateProducts':0,'childSitemaps':0,'outOfScope':0}
    for element in root:
        fields = {e.tag.rsplit('}',1)[-1]:e.text for e in element}
        if not fields.get('loc'):
            continue
        try:
            url = check_url(fields['loc'],source)
        except PipelineError:
            counts['outOfScope'] += 1
            continue
        stamp = fields.get('lastmod') or ''
        priority = -int(re.sub(r'\D','',stamp)[:8] or '0')
        if kind == 'sitemapindex':
            if sitemap_allowed(source,url):
                # Newest monthly sitemap first, all retained in the queue.
                date = re.search(r'-(20\d\d)-(\d+)',url)
                if date: priority = -int(date[1]+date[2].zfill(2))
                queue.add(source,url,'sitemap',priority)
                counts['childSitemaps'] += 1
            else: counts['outOfScope'] += 1
        elif product_candidate(source,url):
            queue.add(source,url,'product',priority)
            counts['candidateProducts'] += 1
        else: counts['outOfScope'] += 1
    queue.db.commit()
    return counts


def worker(source, run_dir, stop):
    if stop.is_set():
        return {'source':source,'state':'paused'}
    q = Queue(run_dir/'queue.sqlite')
    config = load_config(BASE/'examples'/f'{source}.json')
    # Approved pilot mappings apply only to those exact retailer identities.
    mapped = BASE/'datasets/retail-pilot-2026-11-14/configs'/f'{source}.json'
    if mapped.exists(): config['variantMap'] = load_config(mapped).get('variantMap',{})
    f = Fetcher(source,timeout=15,retries=1,max_bytes=16_000_000,sleep=stop.sleep)
    outcomes = {'source':source,'state':'running','sitemapOutcomes':[]}
    response_dir = run_dir/'responses'/source
    response_dir.mkdir(parents=True,exist_ok=True)
    consecutive_network_failures = 0
    consecutive_blocked = 0
    active_url = None
    try:
        with psycopg.connect(connect_timeout=10,autocommit=True) as db:
            store = PostgresStore(db)
            since_sitemap = 10
            while not stop.is_set():
                task = q.next(source,'sitemap' if since_sitemap >= 10 else 'product')
                if not task: task = q.next(source,'product' if since_sitemap >= 10 else 'sitemap')
                if not task: break
                url,kind = task
                active_url = url
                if not stop.claim():
                    q.release(source,url)
                    active_url = None
                    break
                try:
                    capture = f.fetch(url)
                    digest = capture['contentHash']
                    with gzip.open(response_dir/(digest+'.json.gz'),'wt',encoding='utf-8') as saved:
                        json.dump(capture,saved,ensure_ascii=False)
                    if kind == 'sitemap':
                        outcome = parse_sitemap(source,capture,q)
                        outcomes['sitemapOutcomes'].append({'url':url,**outcome})
                        q.finish(source,url,'done')
                        since_sitemap = 0
                    else:
                        if capture['contentType'] not in {'text/html','application/xhtml+xml'}: raise PipelineError('NOT_HTML')
                        rows = extract(capture['body'],capture,config)
                        rows = [r for r in rows if category_of(r['sourceUrl'],r['name'])]
                        if not rows: raise PipelineError('OUT_OF_PRODUCT_SCOPE')
                        inserted = store.ingest(rows,(source,url,'done',{'records':len(rows),'contentHash':digest}))
                        q.finish(source,url,'done',len(rows),inserted,sum(r['status']=='quarantine' for r in rows))
                        since_sitemap += 1
                    consecutive_network_failures = 0
                    consecutive_blocked = 0
                except CrawlPaused:
                    q.release(source,url)
                    active_url = None
                    break
                except (PipelineError,UnicodeError,ET.ParseError,RecursionError) as exc:
                    code = str(exc)
                    blocked = code.startswith(('ROBOTS','HTTP_403','HTTP_401','RETRY_LATER','ACCESS_CHALLENGE'))
                    q.finish(source,url,'blocked' if blocked else 'failed',error=code)
                    store.job(source,url,'blocked' if blocked else 'failed',{'code':code})
                    if kind == 'product': since_sitemap += 1
                    consecutive_network_failures = consecutive_network_failures+1 if code=='NETWORK_FAILURE' else 0
                    consecutive_blocked = consecutive_blocked+1 if blocked else 0
                    if code in {'ROBOTS_REDIRECT_UNRESOLVED','ROBOTS_UNRESOLVED','ROBOTS_NO_MATCHING_GROUP','RETRY_LATER'} or consecutive_blocked >= 5 or consecutive_network_failures >= 5:
                        outcomes.update(state='blocked',error=code)
                        break
                active_url = None
                atomic_json(run_dir/(source+'.json'), {**outcomes,'policyEvidence':f.policy_evidence})
            if outcomes['state']=='running': outcomes['state']='stopped' if stop.is_set() else 'exhausted'
    except Exception as exc:
        outcomes.update(state='failed',errorType=type(exc).__name__)
    finally:
        if active_url:
            q.release(source,active_url)
        atomic_json(run_dir/(source+'.json'), {**outcomes,'policyEvidence':f.policy_evidence})
        q.db.close()
    return outcomes


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-dir',type=Path,required=True)
    action = parser.add_mutually_exclusive_group()
    action.add_argument('--start',action='store_true')
    action.add_argument('--resume',action='store_true')
    action.add_argument('--status',action='store_true')
    action.add_argument('--pause','--stop',dest='pause',action='store_true')
    parser.add_argument('--max-pages',type=int,default=50)
    parser.add_argument('--max-seconds',type=int,default=300)
    parser.add_argument('--workers',type=int,choices=[1,2],default=2)
    parser.add_argument('--publish',action='store_true',help='Publish once after this explicitly requested batch')
    parser.add_argument('--daily',action='store_true',help='At most one batch in the 02:00 Asia/Ho_Chi_Minh hour')
    parser.add_argument('--keep-stop-request',action='store_true',help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    if not 1 <= args.max_pages <= 50 or not 1 <= args.max_seconds <= 300:
        parser.error('Each batch is limited to 1..50 pages and 1..300 seconds')
    if args.daily and (not args.resume or args.max_pages != 50):
        parser.error('--daily requires --resume --max-pages 50')
    run_dir = args.run_dir.resolve()
    if args.pause:
        run_dir.mkdir(parents=True,exist_ok=True)
        (run_dir/'stop').write_text('pause requested',encoding='ascii')
        print(json.dumps({'state':'pause_requested'}));return
    if not (args.start or args.resume):
        print(json.dumps(saved_progress(run_dir),ensure_ascii=True));return
    run_dir.mkdir(parents=True,exist_ok=True)
    # Global + per-run locks prevent overlapping jobs, including scheduled/manual races.
    with RunLock(BASE/'.work/inventory.lock'), RunLock(run_dir/'running.lock'):
        if args.start and (run_dir/'queue.sqlite').exists():
            parser.error('Queue already exists; use --resume to preserve completed URLs')
        if args.daily:
            claimed,reason = claim_daily_run(run_dir)
            if not claimed:
                print(json.dumps({'state':'skipped','reason':reason}));return
        return run_batch(args,run_dir)


def run_batch(args,run_dir):
    load_dotenv(ROOT/'.env')
    load_dotenv(ROOT/'services/adviser-backend/.env')
    if not os.environ.get('PGPASSWORD') and os.environ.get('DB_PASSWORD'):
        os.environ['PGPASSWORD'] = os.environ['DB_PASSWORD']
    (run_dir/'pid.txt').write_text(str(os.getpid()),encoding='ascii')
    if not args.keep_stop_request:
        (run_dir/'stop').unlink(missing_ok=True)
    previous = saved_progress(run_dir)
    q = Queue(run_dir/'queue.sqlite')
    q.db.execute("update tasks set state='pending' where state='running'")
    if not q.db.execute('select 1 from tasks limit 1').fetchone():
        for source in HOSTS:
            config = load_config(BASE/'examples'/f'{source}.json')
            for url in config['seeds']: q.add(source,url,'product',-99999999)
            cached = BASE/'.work/inventory-discovery'/f'{source}-root.json'
            if cached.exists():
                parse_sitemap(source,json.loads(cached.read_text(encoding='utf-8')),q)
            else:
                q.add(source,config.get('sitemap') or 'https://'+HOSTS[source]+'/sitemap.xml','sitemap',-99999999)
    q.db.commit()
    stop = CrawlSession(run_dir,args.max_pages,args.max_seconds)
    publications = previous.get('publications',[])
    published_at = previous.get('publishedInserted',0)
    failure = None
    def report(state='running'):
        totals = [dict(zip(['source','kind','state','tasks','parsed','inserted','quarantined'],r)) for r in q.db.execute('select source,kind,state,count(*),sum(parsed),sum(inserted),sum(quarantined) from tasks group by source,kind,state order by source,kind,state')]
        data={'state':state,'updatedAt':datetime.now(timezone.utc).isoformat(),'totals':totals,'publications':publications,
              'publishedInserted':published_at,'error':failure,'mode':'on_demand','batch':{'maxPages':args.max_pages,'maxSeconds':args.max_seconds,
              'claimedPages':stop.claimed,'pauseReason':stop.reason},'schedule':{'time':'02:00','timezone':'Asia/Ho_Chi_Minh','maxPages':50}}
        atomic_json(run_dir/'progress.json',data)
        return data
    def publish():
        nonlocal published_at,failure
        report('publishing')
        log = run_dir/('publish-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'.log')
        with log.open('w',encoding='utf-8') as output:
            result = subprocess.run([sys.executable,'-m','scripts.warehouse'],cwd=BASE,stdout=output,stderr=subprocess.STDOUT,env={**os.environ,'PYTHONUTF8':'1'})
        publications.append({'log':str(log),'status':'passed' if result.returncode==0 else 'failed'})
        if result.returncode == 0:
            published_at = q.db.execute('select coalesce(sum(inserted),0) from tasks').fetchone()[0]
        else:
            failure = 'CATALOG_PUBLICATION_FAILED'
        print(json.dumps({'publication':publications[-1]},ensure_ascii=True),flush=True)
    report()
    # Sources with less completed work are serviced first so later batches stay fair.
    sources = sorted(HOSTS,key=lambda source:q.db.execute("select count(*) from tasks where source=? and state<>'pending'",(source,)).fetchone()[0])
    pool=ThreadPoolExecutor(max_workers=args.workers)
    futures=[pool.submit(worker,s,run_dir,stop) for s in sources]
    try:
        pending=set(futures)
        while pending:
            if (run_dir/'stop').exists(): stop.set('user_pause')
            done,pending=wait(pending,timeout=0.5)
            for future in done:
                result = future.result()
                if result['state'] == 'failed': failure = 'CRAWLER_WORKER_FAILED'
                print(json.dumps({'sourceFinished':result},ensure_ascii=True),flush=True)
            report('pausing' if stop.reason == 'user_pause' else 'running')
        if (run_dir/'stop').exists(): stop.set('user_pause')
        if args.publish and stop.reason != 'user_pause' and q.db.execute('select coalesce(sum(inserted),0) from tasks').fetchone()[0]>published_at:
            publish()
    except KeyboardInterrupt:
        stop.set('user_pause')
    except Exception:
        failure = 'CRAWLER_WORKER_FAILED'
        stop.set('worker_failure')
        raise
    finally:
        stop.event.set()
        pool.shutdown(wait=True)
        outstanding = q.db.execute("select count(*) from tasks where state in ('pending','running')").fetchone()[0]
        issues = q.db.execute("select count(*) from tasks where state in ('failed','blocked')").fetchone()[0]
        state = 'failed' if failure else 'paused' if outstanding or stop.reason else 'finished_with_gaps' if issues else 'exhausted'
        report(state)
        q.db.close()
        (run_dir/'pid.txt').unlink(missing_ok=True)
    return 1 if failure else 0


if __name__=='__main__': sys.exit(main() or 0)
