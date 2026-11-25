from concurrent.futures import ThreadPoolExecutor
from contextlib import redirect_stdout
from datetime import datetime, timezone
import io
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from lua_pipeline.inventory_control import CrawlPaused, CrawlSession, RunLock, claim_daily_run
from scripts.crawl_inventory import Queue, main, run_batch, worker
from tests.test_pipeline import html


class InventoryControlTests(unittest.TestCase):
    def test_no_action_and_status_are_read_only_and_do_not_start_workers(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/'not-created'
            with patch('scripts.crawl_inventory.worker') as jobs, patch('scripts.crawl_inventory.Fetcher') as fetch, patch('scripts.crawl_inventory.subprocess.run') as publish:
                for flags in [[], ['--status']]:
                    with redirect_stdout(io.StringIO()) as output:
                        main(['--run-dir',str(path),*flags])
                    self.assertEqual(json.loads(output.getvalue())['state'],'idle')
                jobs.assert_not_called(); fetch.assert_not_called(); publish.assert_not_called()
            self.assertFalse(path.exists())

    def test_budget_is_shared_across_workers(self):
        with tempfile.TemporaryDirectory() as tmp:
            session = CrawlSession(tmp,max_pages=50)
            with ThreadPoolExecutor(max_workers=8) as pool:
                accepted = list(pool.map(lambda _:session.claim(),range(200)))
            self.assertEqual(sum(accepted),50)
            self.assertEqual(session.reason,'page_limit')

    def test_pause_and_deadline_interrupt_waits(self):
        with tempfile.TemporaryDirectory() as tmp:
            session = CrawlSession(tmp)
            (Path(tmp)/'stop').write_text('pause')
            with self.assertRaises(CrawlPaused): session.sleep(60)
            self.assertFalse(session.claim())
            self.assertEqual(session.reason,'user_pause')
            (Path(tmp)/'stop').unlink()
            clock = [0]
            session = CrawlSession(tmp,max_seconds=2,clock=lambda:clock[0])
            clock[0] = 3
            self.assertFalse(session.claim())
            self.assertEqual(session.reason,'time_limit')

    def test_os_lock_rejects_concurrent_run_and_releases_after_exit(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/'inventory.lock'
            with RunLock(path):
                with self.assertRaisesRegex(RuntimeError,'ALREADY_RUNNING'):
                    with RunLock(path): pass
            with RunLock(path): pass

    def test_schedule_is_once_per_vietnam_day_and_does_not_catch_up_in_daytime(self):
        with tempfile.TemporaryDirectory() as tmp:
            at_two = datetime(2026,11,14,19,0,tzinfo=timezone.utc)
            self.assertTrue(claim_daily_run(tmp,at_two)[0])
            self.assertEqual(claim_daily_run(tmp,at_two),(False,'already_ran_today'))
            daytime = datetime(2026,11,15,3,0,tzinfo=timezone.utc)
            self.assertEqual(claim_daily_run(tmp,daytime),(False,'outside_02h_window'))
            self.assertTrue((Path(tmp)/'daily-2026-11-15.json').exists())

    def test_resume_skips_done_urls_and_preserves_pending_urls_at_limit(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            queue = Queue(path/'queue.sqlite')
            urls = [f'https://fptshop.com.vn/may-tinh-xach-tay/synthetic-{i}' for i in range(5)]
            for url in urls: queue.add('fptshop',url,'product')
            queue.db.commit(); queue.db.close()
            fetch = MagicMock(policy_evidence=[])
            fetch.fetch.side_effect = lambda url:{'url':url,'body':html(),'contentHash':'test-only','observedAt':'2026-11-14T00:00:00+00:00','contentType':'text/html'}
            store = MagicMock()
            store.ingest.side_effect = lambda rows,*args:len(rows)
            with patch('scripts.crawl_inventory.Fetcher',return_value=fetch), patch('scripts.crawl_inventory.psycopg.connect'), patch('scripts.crawl_inventory.PostgresStore',return_value=store):
                worker('fptshop',path,CrawlSession(path,max_pages=2))
                queue = Queue(path/'queue.sqlite')
                self.assertEqual(queue.db.execute("select count(*) from tasks where state='done'").fetchone()[0],2)
                self.assertEqual(queue.db.execute("select count(*) from tasks where state='pending'").fetchone()[0],3)
                queue.db.close()
                worker('fptshop',path,CrawlSession(path,max_pages=50))
            self.assertEqual(fetch.fetch.call_count,5)
            self.assertEqual(len({call.args[0] for call in fetch.fetch.call_args_list}),5)
            self.assertEqual(store.ingest.call_count,5)

    def test_pause_during_fetch_returns_claimed_url_to_pending(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            queue = Queue(path/'queue.sqlite')
            queue.add('fptshop','https://fptshop.com.vn/may-tinh-xach-tay/synthetic','product')
            queue.db.commit(); queue.db.close()
            fetch = MagicMock(policy_evidence=[])
            fetch.fetch.side_effect = CrawlPaused()
            with patch('scripts.crawl_inventory.Fetcher',return_value=fetch), patch('scripts.crawl_inventory.psycopg.connect'), patch('scripts.crawl_inventory.PostgresStore') as store:
                worker('fptshop',path,CrawlSession(path))
                store.return_value.ingest.assert_not_called()
            queue = Queue(path/'queue.sqlite')
            self.assertEqual(queue.db.execute('select state from tasks').fetchone()[0],'pending')
            queue.db.close()

    def test_publication_is_opt_in_once_per_batch_and_keeps_previous_history(self):
        for publish in [False,True]:
            with self.subTest(publish=publish), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp)
                queue = Queue(path/'queue.sqlite')
                queue.add('fptshop','https://fptshop.com.vn/may-tinh-xach-tay/synthetic','product')
                queue.finish('fptshop','https://fptshop.com.vn/may-tinh-xach-tay/synthetic','done',1,1)
                queue.db.close()
                (path/'progress.json').write_text(json.dumps({'publications':[{'log':'old','status':'passed'}]}))
                args = SimpleNamespace(max_pages=50,max_seconds=300,workers=2,publish=publish,keep_stop_request=False)
                with patch('scripts.crawl_inventory.worker',return_value={'state':'exhausted'}), patch('scripts.crawl_inventory.subprocess.run',return_value=SimpleNamespace(returncode=0)) as run, redirect_stdout(io.StringIO()):
                    run_batch(args,path)
                self.assertEqual(run.call_count,1 if publish else 0)
                progress = json.loads((path/'progress.json').read_text())
                self.assertEqual(len(progress['publications']),2 if publish else 1)
                self.assertFalse((path/'pid.txt').exists())

    def test_failed_worker_is_persisted_and_returns_nonzero(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            queue = Queue(path/'queue.sqlite')
            queue.add('fptshop','https://fptshop.com.vn/may-tinh-xach-tay/synthetic','product')
            queue.db.commit(); queue.db.close()
            args = SimpleNamespace(max_pages=50,max_seconds=300,workers=2,publish=False,keep_stop_request=False)
            with patch('scripts.crawl_inventory.worker',return_value={'state':'failed','errorType':'OperationalError'}), redirect_stdout(io.StringIO()):
                self.assertEqual(run_batch(args,path),1)
            progress = json.loads((path/'progress.json').read_text())
            self.assertEqual(progress['state'],'failed')
            self.assertEqual(progress['error'],'CRAWLER_WORKER_FAILED')
            self.assertEqual(progress['totals'][0]['state'],'pending')


if __name__ == '__main__': unittest.main()
