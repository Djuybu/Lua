import argparse
import json
import sqlite3
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from . import SCHEMA, PARSER_VERSION
from .sources import PipelineError, HOSTS, load_config
from .storage import Store, atomic_json, export_bundle, verify_bundle
from .fetch import Fetcher
from .runner import parse_fixture, crawl, discover
from .backend import backend_payload
from .capture import parse_capture


def positive(value):
    number = int(value)
    if not 1 <= number <= 1000:
        raise argparse.ArgumentTypeError("must be between 1 and 1000")
    return number


def main(argv=None):
    parser = argparse.ArgumentParser(description="Lua retailer staging pipeline — no automatic backend publication")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("doctor")
    c = sub.add_parser("validate-config")
    c.add_argument("--config", required=True)
    p = sub.add_parser("parse-fixture")
    p.add_argument("--config", required=True)
    p.add_argument("--html", required=True)
    p.add_argument("--url", required=True)
    p.add_argument("--observed-at", required=True, help="Capture time with timezone, never inferred from file mtime")
    p.add_argument("--rendered", action="store_true", help="Input is a reviewed rendered product snapshot")
    p.add_argument("--db", required=True)
    p = sub.add_parser("parse-capture")
    p.add_argument("--config", required=True)
    p.add_argument("--input", required=True)
    p.add_argument("--db", required=True)
    p = sub.add_parser("crawl")
    p.add_argument("--config", required=True)
    p.add_argument("--db", required=True)
    p.add_argument("--max-pages", type=positive, default=3)
    p.add_argument("--resume", action="store_true")
    p = sub.add_parser("discover")
    p.add_argument("--config", required=True)
    p.add_argument("--sitemap", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--max-sitemaps", type=positive, default=5)
    p.add_argument("--max-urls", type=positive, default=100)
    p = sub.add_parser("report")
    p.add_argument("--db", required=True)
    p = sub.add_parser("export")
    p.add_argument("--db", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--include-quarantine", action="store_true")
    p.add_argument("--overwrite", action="store_true")
    p = sub.add_parser("verify-export")
    p.add_argument("--input", required=True)
    p = sub.add_parser("backend-payload")
    p.add_argument("--input", required=True)
    p.add_argument("--reviews", required=True)
    p.add_argument("--output", required=True)
    args = parser.parse_args(argv)
    store = None
    try:
        config = load_config(args.config) if hasattr(args, "config") else None
        if args.command == "doctor":
            result = {"python": sys.version.split()[0], "sqlite": sqlite3.sqlite_version,
                      "schemaVersion": SCHEMA, "parserVersion": PARSER_VERSION, "sources": list(HOSTS)}
        elif args.command == "validate-config":
            result = {"valid": True, "sourceId": config["sourceId"]}
        elif args.command == "verify-export":
            result = verify_bundle(json.loads(Path(args.input).read_text(encoding="utf-8")))
        elif args.command == "backend-payload":
            payload, result = backend_payload(json.loads(Path(args.input).read_text(encoding="utf-8")),
                                              json.loads(Path(args.reviews).read_text(encoding="utf-8")))
            atomic_json(args.output, payload)
        elif args.command == "discover":
            result = discover(config, Fetcher(config["sourceId"]), args.sitemap,
                              max_sitemaps=args.max_sitemaps, max_urls=args.max_urls)
            atomic_json(args.output, result)
        else:
            if args.command in {"report", "export"} and not Path(args.db).is_file():
                raise PipelineError("DATABASE_NOT_FOUND")
            store = Store(args.db)
            if args.command in {"parse-fixture", "parse-capture"}:
                rows = (parse_capture(args.input, config) if args.command == "parse-capture" else
                        parse_fixture(args.html, args.url, args.observed_at, config,
                                      "rendered_snapshot" if args.rendered else "fixture"))
                result = {"inserted": store.ingest(rows), "parsed": len(rows),
                          "quarantine": sum(r["status"] == "quarantine" for r in rows)}
            elif args.command == "crawl":
                result = crawl(config, Fetcher(config["sourceId"]), store, max_pages=args.max_pages, resume=args.resume)
            elif args.command == "export":
                result = export_bundle(store, args.output, include_quarantine=args.include_quarantine, overwrite=args.overwrite)
            else:
                result = store.report()
        print(json.dumps(result, ensure_ascii=False, allow_nan=False))
        return 2 if result.get("failed", 0) else 0
    except (ValueError, OSError, sqlite3.Error, ET.ParseError, RecursionError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2
    finally:
        if store:
            store.close()


if __name__ == "__main__":
    raise SystemExit(main())
