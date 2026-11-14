"""Synthetic fixtures exercise production paths, including real local HTTP."""
import copy
import hashlib
import json
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from lua_pipeline.extract import extract, money
from lua_pipeline.fetch import Fetcher
from lua_pipeline.policy import Robots
from lua_pipeline.runner import crawl, discover, parse_fixture
from lua_pipeline.sources import HOSTS, PipelineError, canonical_url, check_url, load_config
from lua_pipeline.storage import Store, export_bundle, verify_bundle, atomic_json
from lua_pipeline.backend import backend_payload

ROOT = Path(__file__).resolve().parents[1]
STAMP = "2026-11-14T00:00:00+00:00"


def config(source="fptshop"):
    return {"schemaVersion": "lua.pipeline-config.v1", "sourceId": source,
            "seeds": ["https://" + HOSTS[source] + "/lua-synthetic"],
            "variantMap": {"000123": "synthetic:variant:16-512"}, "regionContext": "test-only"}


def html(product=None, extra=""):
    p = product or {"@type": "Product", "name": "Synthetic Laptop 16GB 512GB", "sku": "000123",
                    "offers": {"@type": "Offer", "price": "12000000", "priceCurrency": "VND",
                               "itemCondition": "https://schema.org/NewCondition", "availability": "https://schema.org/InStock"}}
    return '<html><h1>Synthetic Laptop 16GB 512GB</h1><script type="application/ld+json">' + json.dumps(p) + "</script>" + extra + "</html>"


def rows(body=None, cfg=None):
    cfg = cfg or config()
    body = body or html()
    return extract(body, {"url": cfg["seeds"][0], "observedAt": STAMP,
                         "contentHash": hashlib.sha256(body.encode()).hexdigest()}, cfg)


class ParserTests(unittest.TestCase):
    def test_DP_T01_all_structured_sources(self):
        for source in HOSTS:
            with self.subTest(source=source):
                r = rows(cfg=config(source))[0]
                self.assertEqual(r["externalOfferId"], "000123")
                self.assertEqual(r["basePriceVnd"], 12000000)
                self.assertEqual(r["status"], "ready_for_review")

    def test_DP_T01_graph_reference(self):
        data = {"@graph": [{"@type": "Product", "sku": "000123", "offers": {"@id": "#offer"}},
                           {"@id": "#offer", "@type": "Offer", "price": 9, "priceCurrency": "VND"}]}
        self.assertEqual(rows(html(data))[0]["basePriceVnd"], 9)

    def test_DP_T01_invalid_json_or_nonproduct(self):
        with self.assertRaisesRegex(PipelineError, "PRODUCT_SCHEMA_MISSING"):
            rows('<h1>Sample</h1><script type="application/ld+json">{bad</script>')
        with self.assertRaisesRegex(PipelineError, "PRODUCT_NOT_READY"):
            rows("<html>loading</html>")

    def test_DP_T02_group_preserves_sibling_stock(self):
        p = json.loads(html().split('ld+json">')[1].split('</script>')[0])
        a, b = copy.deepcopy(p), copy.deepcopy(p)
        a["sku"], b["sku"] = "000A", "000B"
        b["offers"]["availability"] = "https://schema.org/OutOfStock"
        cfg = config("tgdd")
        cfg["variantMap"] = {"000A": "synthetic:blue", "000B": "synthetic:silver"}
        result = rows(html({"@type": "ProductGroup", "hasVariant": [a, b]}), cfg)
        self.assertEqual([r["stockStatus"] for r in result], ["IN_STOCK", "OUT_OF_STOCK"])
        self.assertEqual([r["matchedVariantId"] for r in result], ["synthetic:blue", "synthetic:silver"])

    def test_DP_T03_scoped_price_ignores_installments_and_accessories(self):
        extra = '<div class="box-product-price-wrapper"><div class="sale-price">12.000.000đ</div></div><div class="sale-price">500.000đ /tháng</div><aside>100.000đ</aside>'
        r = rows(html(extra=extra), config("cellphones"))[0]
        self.assertNotIn("PRICE_CONFLICT", r["reasons"])
        self.assertEqual(r["basePriceVnd"], 12000000)

    def test_DP_T03_conflicting_dom_price_is_quarantined(self):
        r = rows(html(extra='<div class="pd-price-group"><p class="pd-price">11.000.000đ</p></div>'), config("laptopaz"))[0]
        self.assertIn("PRICE_CONFLICT", r["reasons"])
        self.assertEqual(r["status"], "quarantine")

    def test_DP_T03_multiple_scoped_prices_are_ambiguous(self):
        r = rows(html(extra='<div class="pd-price-group"><p class="pd-price">11.000.000đ</p><p class="pd-price">12.000.000đ</p></div>'), config("laptopaz"))[0]
        self.assertIn("DOM_PRICE_AMBIGUOUS", r["reasons"])
        self.assertEqual(r["status"], "quarantine")

    def test_DP_T04_unmapped_and_aggregate_are_not_ready(self):
        p = {"@type": "Product", "sku": "retailer-only", "mpn": "1299", "offers": {"@type": "AggregateOffer", "lowPrice": 9, "highPrice": 10, "priceCurrency": "VND"}}
        r = rows(html(p), config("trungtran"))[0]
        self.assertIsNone(r["basePriceVnd"])
        self.assertIsNone(r["matchedVariantId"])
        self.assertIn("AGGREGATE_OR_UNKNOWN_OFFER", r["reasons"])
        self.assertEqual(r["sourceMpn"], "1299")

    def test_DP_T04_oneway_region_conflict(self):
        cfg = config("oneway")
        cfg["seeds"] = ["https://onewaymobile.vn/synthetic-zp-a"]
        body = '<h1>Synthetic Phone X/A</h1><div class="product-detail" data-productid="000123"><div class="product-price">12.000.000đ</div></div>'
        r = rows(body, cfg)[0]
        self.assertIn("REGION_IDENTITY_CONFLICT", r["reasons"])
        self.assertEqual(r["basePriceVnd"], 12000000)

    def test_DP_T04_shopdunk_dom_fallback(self):
        body = '<h1>Synthetic Phone</h1><div class="product-essential" data-productid="000123"><div class="product-price">12.000.000₫</div></div><aside class="price">1.000đ</aside>'
        r = rows(body, config("shopdunk"))[0]
        self.assertEqual(r["basePriceVnd"], 12000000)
        self.assertIn("STOCK_UNKNOWN", r["reasons"])

    def test_DP_T05_unknown_and_conflicting_specs(self):
        p = {"@type": "Product", "sku": "000123", "additionalProperty": [{"name": "RAM", "value": "Hãng không công bố"}], "offers": {"@type": "Offer", "price": 9, "priceCurrency": "VND"}}
        r = rows(html(p, '<table><tr><td>RAM</td><td>16 GB</td></tr></table>'))[0]
        self.assertEqual(r["attributes"]["RAM"], "Hãng không công bố")
        self.assertIn("SPEC_CONFLICT:RAM", r["reasons"])

    def test_DP_T06_money_strict_boundaries(self):
        self.assertEqual(money("12.000.000 ₫", display=True), 12000000)
        self.assertEqual(money("12,000,000đ", display=True), 12000000)
        self.assertEqual(money("12000000.00"), 12000000)
        self.assertEqual(money(2**53 - 1), 2**53 - 1)
        for value in [True, -1, 1.2, 2**53, "1e9", "12.34", "Liên hệ", None, "NaN"]:
            with self.subTest(value=value), self.assertRaises(PipelineError):
                money(value)

    def test_DP_T06_unknown_costs_do_not_become_verified(self):
        r = rows()[0]
        self.assertIsNone(r["shippingVnd"])
        self.assertIsNone(r["mandatoryFeesVnd"])
        self.assertIsNone(r["totalVnd"])
        self.assertIs(r["isVerifiedAffordable"], False)

    def test_DP_T01_duplicate_scripts_and_conflicting_offers(self):
        product = json.loads(html().split('ld+json">')[1].split('</script>')[0])
        self.assertEqual(len(rows(html([product, product]))), 1)
        other = copy.deepcopy(product)
        other["offers"]["price"] = "9000000"
        result = rows(html([product, other]))
        self.assertEqual(len(result), 1)
        self.assertIn("DUPLICATE_OFFER_CONFLICT", result[0]["reasons"])
        self.assertIsNone(result[0]["basePriceVnd"])

    def test_DP_T08_challenge_is_not_an_empty_catalog(self):
        with self.assertRaisesRegex(PipelineError, "ACCESS_CHALLENGE"):
            rows("<title>Just a moment...</title><h1>Verify you are human</h1>")


class PolicyTests(unittest.TestCase):
    def test_DP_T07_wildcards_allow_specific_ua(self):
        r = Robots("User-agent: *\nDisallow: /*?*\nAllow: /product?code=*\nCrawl-delay: 8", "LuaCatalogResearch/1.0")
        self.assertFalse(r.allows("https://x/search?q=a"))
        self.assertTrue(r.allows("https://x/product?code=001"))
        self.assertEqual(r.delay, 8)
        r = Robots("User-agent: *\nAllow: /\nUser-agent: LuaCatalogResearch\nDisallow: /", "LuaCatalogResearch/1.0")
        self.assertFalse(r.allows("https://x/product"))

    def test_DP_T07_unresolved_and_html_robots(self):
        for text in ["", "<html>home</html>", "Sitemap: https://x/sitemap.xml"]:
            with self.assertRaisesRegex(PipelineError, "ROBOTS"):
                Robots(text, "LuaCatalogResearch")

    def test_DP_T09_canonical_preserves_identity(self):
        self.assertEqual(canonical_url("https://www.thegioididong.com/dtdd/a?code=0001&utm_source=x#top"), "https://www.thegioididong.com/dtdd/a?code=0001")
        for url in ["https://evil.test/", "https://cellphones.com.vn.evil.test/", "http://cellphones.com.vn/", "https://a:b@cellphones.com.vn/"]:
            with self.assertRaises(PipelineError):
                check_url(url, "cellphones")


class PersistenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name)
        self.store = Store(self.path / "staging.sqlite")

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def test_DP_T10_replay_restart_and_history(self):
        first = rows()
        self.assertEqual(self.store.ingest(first), 1)
        self.assertEqual(self.store.ingest(first), 0)
        self.store.close()
        self.store = Store(self.path / "staging.sqlite")
        self.assertEqual(len(self.store.rows()), 1)
        second = copy.deepcopy(first)
        second[0]["observationId"] = "new-capture"
        second[0]["observedAt"] = "2026-11-15T00:00:00+00:00"
        self.store.ingest(second)
        self.assertEqual(len(self.store.rows()), 2)

    def test_DP_T10_failure_rolls_back_whole_batch_and_checkpoint(self):
        good = rows()[0]
        bad = copy.deepcopy(good)
        bad["basePriceVnd"] = -1
        with self.assertRaises(PipelineError):
            self.store.ingest([good, bad], ("fptshop", "https://fptshop.com.vn/lua-synthetic", "done", {}))
        self.assertEqual(self.store.rows(), [])
        self.assertFalse(self.store.completed("fptshop", "https://fptshop.com.vn/lua-synthetic"))

    def test_DP_T10_immutable_conflicting_replay(self):
        first = rows()
        self.store.ingest(first)
        first[0]["basePriceVnd"] = 7
        with self.assertRaisesRegex(PipelineError, "IMMUTABLE"):
            self.store.ingest(first)
        self.assertEqual(self.store.rows()[0]["basePriceVnd"], 12000000)

    def test_DP_T11_export_hash_tamper_quarantine(self):
        self.store.ingest(rows())
        export_bundle(self.store, self.path / "bundle.json")
        value = json.loads((self.path / "bundle.json").read_text(encoding="utf-8"))
        self.assertEqual(verify_bundle(value)["count"], 1)
        value["records"][0]["name"] = "tampered"
        with self.assertRaisesRegex(PipelineError, "MANIFEST_MISMATCH"):
            verify_bundle(value)
        with self.assertRaisesRegex(PipelineError, "OUTPUT_EXISTS"):
            export_bundle(self.store, self.path / "bundle.json")

    def test_DP_T11_quarantine_excluded_by_default(self):
        cfg = config()
        cfg["variantMap"] = {}
        self.store.ingest(rows(cfg=cfg))
        self.assertEqual(self.store.rows(), [])
        self.assertEqual(len(self.store.rows(True)), 1)

    def test_DP_T11_reviewed_backend_conversion_and_unknown_shipping(self):
        self.store.ingest(rows())
        export_bundle(self.store, self.path / "bundle.json")
        bundle = json.loads((self.path / "bundle.json").read_text(encoding="utf-8"))
        review = {"schemaVersion": "lua.pipeline-review.v1", "approvals": {}}
        self.assertEqual(backend_payload(bundle, review)[0]["offers"], [])
        key = bundle["records"][0]["observationId"]
        review["approvals"][key] = {"matchedVariantId": "synthetic:variant:16-512", "mandatoryFeesVnd": 0,
                                    "shippingVnd": None, "conditionalDiscountVnd": 0,
                                    "reviewedAt": STAMP, "evidenceUrl": config()["seeds"][0]}
        payload, report = backend_payload(bundle, review)
        self.assertEqual(report["accepted"], 1)
        self.assertIsNone(payload["offers"][0]["shippingVnd"])
        self.assertEqual(payload["offers"][0]["completenessStatus"], "PARTIAL_UNKNOWN")
        del review["approvals"][key]["mandatoryFeesVnd"]
        with self.assertRaisesRegex(PipelineError, "REVIEW_MONEY_REQUIRED"):
            backend_payload(bundle, review)

    def test_DP_T12_atomic_write_failure_preserves_existing(self):
        target = self.path / "bundle.json"
        target.write_text("old", encoding="utf-8")
        with patch("lua_pipeline.storage.os.replace", side_effect=OSError("disk failure")):
            with self.assertRaises(OSError):
                atomic_json(target, {"new": True}, overwrite=True)
        self.assertEqual(target.read_text(), "old")
        self.assertEqual([p.name for p in self.path.iterdir() if p.name != "staging.sqlite"], ["bundle.json"])


class TransportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.requests = []
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                cls.requests.append(self.path)
                headers = {}
                code, body, mime = 200, html(), "text/html"
                if self.path == "/robots.txt":
                    body, mime = "User-agent: *\nDisallow: /blocked\nCrawl-delay: 5", "text/plain"
                elif self.path == "/redirect":
                    code, headers = 302, {"Location": "/blocked"}
                elif self.path == "/external":
                    code, headers = 302, {"Location": "https://evil.invalid/"}
                elif self.path == "/retry":
                    if cls.requests.count("/retry") < 2:
                        code, headers = 429, {"Retry-After": "2"}
                elif self.path == "/forbidden":
                    code = 403
                elif self.path == "/large":
                    body = "x" * 1000
                elif self.path == "/index.xml":
                    body, mime = '<sitemapindex><sitemap><loc>/index.xml</loc></sitemap><sitemap><loc>/urls.xml</loc></sitemap></sitemapindex>', "application/xml"
                elif self.path == "/urls.xml":
                    body, mime = '<urlset><url><loc>/product</loc></url><url><loc>/product?utm_source=x</loc></url><url><loc>https://evil.invalid/product</loc></url></urlset>', "application/xml"
                self.send_response(code)
                self.send_header("Content-Type", mime + "; charset=utf-8")
                for k, v in headers.items():
                    self.send_header(k, v)
                self.end_headers()
                self.wfile.write(body.encode())
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = "http://127.0.0.1:" + str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def make(self, **kwargs):
        self.waits = []
        def guard(url):
            if not url.startswith(self.base + "/"):
                raise PipelineError("URL_OUTSIDE_SOURCE")
            return canonical_url(url)
        return Fetcher("fptshop", guard=guard, sleep=self.waits.append, clock=lambda: 0, **kwargs)

    def test_DP_T07_redirect_denied_before_target_request(self):
        before = self.requests.count("/blocked")
        with self.assertRaisesRegex(PipelineError, "ROBOTS_DENIED"):
            self.make().fetch(self.base + "/redirect")
        self.assertEqual(self.requests.count("/blocked"), before)
        with self.assertRaisesRegex(PipelineError, "URL_OUTSIDE_SOURCE"):
            self.make().fetch(self.base + "/external")

    def test_DP_T08_429_retry_after_and_host_interval(self):
        self.requests[:] = []
        fetcher = self.make()
        result = fetcher.fetch(self.base + "/retry")
        self.assertEqual(result["status"], 200)
        self.assertEqual(self.requests.count("/retry"), 2)
        self.assertIn(2, self.waits)
        self.assertIn(5, self.waits)

    def test_DP_T08_size_and_403_not_retried(self):
        with self.assertRaisesRegex(PipelineError, "RESPONSE_TOO_LARGE"):
            self.make(max_bytes=100).fetch(self.base + "/large")
        before = self.requests.count("/forbidden")
        with self.assertRaisesRegex(PipelineError, "HTTP_403"):
            self.make().fetch(self.base + "/forbidden")
        self.assertEqual(self.requests.count("/forbidden"), before + 1)

    def test_DP_T09_sitemap_cycle_and_dedup(self):
        fetcher = self.make()
        with patch("lua_pipeline.runner.check_url", side_effect=lambda url, source: fetcher.guard(url)):
            result = discover(config(), fetcher, self.base + "/index.xml")
        self.assertEqual(result["candidateUrls"], [self.base + "/product"])
        self.assertEqual(len(result["visitedSitemaps"]), 2)

    def test_DP_T08_timeout_has_bounded_retries(self):
        fetcher = self.make(retries=2)
        with patch.object(fetcher.opener, "open", side_effect=TimeoutError) as request:
            with self.assertRaisesRegex(PipelineError, "NETWORK_FAILURE"):
                fetcher.fetch(self.base + "/product")
            self.assertEqual(request.call_count, 3)

    def test_DP_T10_crawl_resume_and_parse_failures(self):
        cfg = config()
        capture = {"url": cfg["seeds"][0], "body": html(), "observedAt": STAMP,
                   "contentHash": "test-hash", "contentType": "text/html"}
        class FixtureFetcher:
            policy_evidence = []
            calls = 0
            def fetch(self, url):
                self.calls += 1
                return capture
        fetcher = FixtureFetcher()
        with tempfile.TemporaryDirectory() as folder:
            store = Store(Path(folder) / "test.sqlite")
            try:
                self.assertEqual(crawl(cfg, fetcher, store)["failed"], 0)
                self.assertEqual(crawl(cfg, fetcher, store, resume=True)["skipped"], 1)
                self.assertEqual(fetcher.calls, 1)
                capture["body"] = "<h1>loading</h1>"
                self.assertEqual(crawl(cfg, fetcher, store)["failed"], 1)
                self.assertEqual(len(store.rows()), 1)
                self.assertEqual(store.report()["jobs"][0]["state"], "failed")
            finally:
                store.close()


class CliTests(unittest.TestCase):
    def test_DP_T12_fixture_export_verify_end_to_end(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder)
            (p / "config.json").write_text(json.dumps(config()), encoding="utf-8")
            (p / "page.html").write_text(html(), encoding="utf-8")
            def cli(*args):
                return subprocess.run([sys.executable, "-m", "lua_pipeline", *map(str, args)], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
            result = cli("parse-fixture", "--config", p / "config.json", "--html", p / "page.html", "--url", config()["seeds"][0], "--observed-at", STAMP, "--db", p / "stage.sqlite")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["inserted"], 1)
            result = cli("export", "--db", p / "stage.sqlite", "--output", p / "bundle.json")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(cli("verify-export", "--input", p / "bundle.json").returncode, 0)
            self.assertEqual(cli("export", "--db", p / "stage.sqlite", "--output", p / "bundle.json").returncode, 2)
            self.assertEqual(cli("report", "--db", p / "missing.sqlite").returncode, 2)

    def test_DP_T12_invalid_config_and_limits(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "invalid.json"
            path.write_text(json.dumps({"schemaVersion": "bad"}), encoding="utf-8")
            with self.assertRaises(PipelineError):
                load_config(path)


if __name__ == "__main__":
    unittest.main()
