"""Persistent per-source bootstrap: up to 20 pages, then the first seed only."""
from .runner import crawl
from .fetch import Fetcher
from .postgres import PostgresStore


def crawl_sources(db, configs, category=None, max_pages=None, fetcher_factory=None):
    reports, initialized = {}, []
    for config in configs:
        source = config['sourceId']
        prior = db.execute('SELECT 1 FROM lua_raw.crawl_state WHERE source=%s', (source,)).fetchone()
        limit = max_pages if max_pages is not None else (1 if prior else 20)
        print(f'Crawl {source}: {"refresh" if prior else "bootstrap"}, limit={limit}', flush=True)
        selected = dict(config, seeds=config['seeds'][:1] if prior and max_pages is None else config['seeds'])
        fetcher = fetcher_factory(source) if fetcher_factory else Fetcher(source, timeout=15, retries=1)
        result = crawl(selected, fetcher, PostgresStore(db, config.get('category') or category),
                       max_pages=limit, follow_links=limit > 1)
        reports[source] = dict(result, mode='refresh' if prior else 'bootstrap', pageLimit=limit)
        print(f'Crawl {source}: processed={result["processed"]}, parsed={result["parsed"]}, failed={result["failed"]}', flush=True)
        # A completed batch that publishes may contain page-level failures.
        # Those failures are reported, but must not cause another 20-page crawl.
        if result['processed']:
            initialized.append(source)
    return reports, initialized


def mark_published(db, sources, run_id):
    # Called only after dbt tests and publication succeed (including partial crawl).
    with db.transaction():
        for source in sources:
            db.execute('INSERT INTO lua_raw.crawl_state(source,run_id) VALUES(%s,%s) ON CONFLICT DO NOTHING', (source,run_id))
