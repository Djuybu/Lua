import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from lua_pipeline.scheduled import crawl_sources
from lua_pipeline.runner import crawl
from lua_pipeline.storage import Store
from lua_pipeline.sources import load_config
from tests.test_pipeline import config, html, STAMP


class Fetcher:
    policy_evidence = []

    def __init__(self):
        self.urls = []

    def fetch(self, url):
        self.urls.append(url)
        links = ''.join(f'<a href="/product-{i}">next</a>' for i in range(30))
        links += '<a href="https://attacker.invalid/product-1">outside</a><a href="/account">account</a>'
        return dict(url=url, body=html(extra=links), observedAt=STAMP,
                    contentHash='test', contentType='text/html')


class DB:
    def __init__(self, initialized=False):
        self.initialized = initialized

    def execute(self, *args):
        return self

    def fetchone(self):
        return (1,) if self.initialized else None


class ScheduledTests(unittest.TestCase):
    def test_bootstrap_follows_only_scoped_links_and_stops_at_twenty(self):
        cfg = config()
        cfg['followPatterns'] = [r'/product-\d+$']
        fetcher = Fetcher()
        with tempfile.TemporaryDirectory() as d:
            store = Store(Path(d)/'test.sqlite')
            try:
                result = crawl(cfg, fetcher, store, max_pages=20, follow_links=True)
            finally:
                store.close()
        self.assertEqual(result['processed'], 20)
        self.assertEqual(len(set(fetcher.urls)), 20)
        self.assertFalse(any('account' in u or 'attacker' in u for u in fetcher.urls))

    def test_later_run_uses_first_seed_and_no_discovery(self):
        cfg = dict(config(), seeds=['https://fptshop.com.vn/one','https://fptshop.com.vn/two'])
        with patch('lua_pipeline.scheduled.PostgresStore'), patch('lua_pipeline.scheduled.crawl') as run:
            run.return_value = dict(processed=1,parsed=1,failed=0)
            report, sources = crawl_sources(DB(True), [cfg], 'pc_laptop', fetcher_factory=lambda s: Fetcher())
        self.assertEqual(run.call_args.args[0]['seeds'], cfg['seeds'][:1])
        self.assertEqual(run.call_args.kwargs['max_pages'], 1)
        self.assertFalse(run.call_args.kwargs['follow_links'])
        self.assertEqual(report['fptshop']['mode'], 'refresh')

    def test_partial_crawl_is_checkpoint_candidate_but_does_not_write_state(self):
        with patch('lua_pipeline.scheduled.PostgresStore'), patch('lua_pipeline.scheduled.crawl') as run:
            run.return_value = dict(processed=2,parsed=1,failed=1)
            report, sources = crawl_sources(DB(), [config()], 'pc_laptop', fetcher_factory=lambda s: Fetcher())
        self.assertEqual(sources, ['fptshop'])
        self.assertEqual(report['fptshop']['pageLimit'], 20)

    def test_sources_have_explicit_category_and_scope(self):
        paths = list((Path(__file__).resolve().parents[1]/'sources').glob('*.json'))
        self.assertEqual(len(paths), 8)
        for path in paths:
            cfg = load_config(path)
            self.assertTrue(cfg['category'])
            self.assertTrue(cfg['followPatterns'])


if __name__ == '__main__':
    unittest.main()
