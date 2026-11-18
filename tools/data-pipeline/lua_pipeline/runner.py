"""Bounded jobs and explicit sitemap discovery; no hidden API calls."""
import hashlib
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urljoin
from .extract import extract, Document
import re
from .sources import PipelineError, check_url


def parse_fixture(path, url, observed_at, config, mode="fixture"):
    raw = Path(path).read_bytes()
    if len(raw) > 4_000_000:
        raise PipelineError("FIXTURE_TOO_LARGE")
    return extract(raw.decode("utf-8"), {"url": url, "observedAt": observed_at,
                   "contentHash": hashlib.sha256(raw).hexdigest(), "captureMode": mode}, config)


def crawl(config, fetcher, store, *, max_pages=3, resume=False, follow_links=False):
    processed, failures, skipped, parsed, inserted, quarantined = 0, 0, 0, 0, 0, 0
    queue = list(dict.fromkeys(check_url(u, config["sourceId"]) for u in config["seeds"]))
    seen = set(queue)
    while queue:
        url = queue.pop(0)
        if processed >= max_pages:
            break
        if resume and store.completed(config["sourceId"], url):
            skipped += 1
            continue
        processed += 1
        try:
            capture = fetcher.fetch(url)
            if capture["contentType"] not in {"text/html", "application/xhtml+xml"}:
                raise PipelineError("NOT_HTML")
            if follow_links:
                for node in Document(capture['body']).root.walk():
                    if node.tag != 'a' or not node.attrs.get('href'):
                        continue
                    try:
                        candidate = check_url(urljoin(capture['url'], node.attrs['href']), config['sourceId'])
                    except PipelineError:
                        continue
                    # Explicit product/category scope prevents crawling account/cart/news links.
                    if any(re.search(pattern, candidate) for pattern in config.get('followPatterns', [])) and candidate not in seen:
                        seen.add(candidate)
                        if len(queue) < 1000:
                            queue.append(candidate)
            rows = extract(capture["body"], capture, config)
            inserted += store.ingest(rows, (config["sourceId"], url, "done", {"records": len(rows), "contentHash": capture["contentHash"]}))
            parsed += len(rows)
            quarantined += sum(r["status"] == "quarantine" for r in rows)
        except (PipelineError, UnicodeError, ET.ParseError) as exc:
            failures += 1
            code = str(exc)
            state = "blocked" if code.startswith(("ROBOTS", "HTTP_403", "HTTP_401", "RETRY_LATER", "ACCESS_CHALLENGE")) else "failed"
            store.job(config["sourceId"], url, state, {"code": code})
    return {"processed": processed, "failed": failures, "skipped": skipped,
            "parsed": parsed, "inserted": inserted, "quarantine": quarantined,
            "policyEvidence": fetcher.policy_evidence}


def discover(config, fetcher, sitemap_url, *, max_sitemaps=5, max_urls=100):
    queue, seen, urls = [check_url(sitemap_url, config["sourceId"])], set(), []
    while queue and len(seen) < max_sitemaps and len(urls) < max_urls:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        capture = fetcher.fetch(url)
        if "<!DOCTYPE" in capture["body"].upper() or "<!ENTITY" in capture["body"].upper():
            raise PipelineError("UNSAFE_XML")
        root = ET.fromstring(capture["body"])
        tag = root.tag.rsplit("}", 1)[-1]
        if tag not in {"sitemapindex", "urlset"}:
            raise PipelineError("NOT_SITEMAP")
        for entry in root:
            loc = next((e.text for e in entry if e.tag.rsplit("}", 1)[-1] == "loc"), None)
            if not loc:
                continue
            try:
                candidate = check_url(urljoin(url, loc.strip()), config["sourceId"])
            except PipelineError:
                continue
            if tag == "sitemapindex":
                if len(queue) < max_sitemaps and candidate not in seen and candidate not in queue:
                    queue.append(candidate)
            elif candidate not in urls:
                urls.append(candidate)
                if len(urls) >= max_urls:
                    break
    return {"sourceId": config["sourceId"], "candidateUrls": urls, "visitedSitemaps": sorted(seen),
            "truncated": bool(queue) or len(urls) >= max_urls,
            "note": "Review category/product scope and robots before adding candidates to seeds."}
