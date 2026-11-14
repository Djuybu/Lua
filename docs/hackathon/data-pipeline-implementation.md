# DP-00–07: implementation brief

Owner: Agent 1, directly assigned by the user. Base: `90d4352`; branch: `codex/dev/agent-1/data-pipeline`. Own `tools/data-pipeline/**` and pipeline documentation; do not modify Agent 3 backend files.

Implement Python 3.11+ standard-library CLI: bounded HTTP/sitemap discovery, eight source adapters, versioned staging contract, quarantine, SQLite observation history and atomic JSON export. Explicit seeds and approved exact-variant mapping; no fuzzy cross-source identity. Export remains staging, not signed/approved production catalog.

Acceptance/test cases before implementation:

- DP-T01–05: parse Product/@graph/ProductGroup without mixing sibling offers; preserve SKU strings, unknown specs and conflicts; DOM fallback stays scoped to product price.
- DP-T06: strict safe integer VND, unknown fees/shipping stay null, no double subtraction of discounts, no verified affordability claim.
- DP-T07–09: per-host robots guard (wildcards/UA groups), guarded redirects, size/time/retry limits, bounded sitemap traversal, URL deduplication preserving identity query.
- DP-T10: immutable capture identity, replay idempotency, failed batch rollback, durable restart and atomic export.
- DP-T11–12: validate export/hash/count, fixture and CLI end-to-end, invalid configuration/input must return nonzero exit codes.

Tests will use labelled synthetic fixtures and a local HTTP test server; retailer smoke runs are separate and will be reported individually. No live backend compatibility or production release claimed without corresponding verification.

## Result

Implemented the Python CLI, eight source configurations, JSON-LD/ProductGroup and bounded DOM adapters, guarded fetch/discovery, quality/quarantine, immutable SQLite staging/history, atomic hashed exports, explicit reviewed backend conversion and usage runbook. Source adapters are fixture-verified; live HTTP smoke remains blocked by network failures, so live source qualification is still pending.

33 automated tests passed; synthetic CLI demo and Agent 3's actual offer validator contract check passed. See `tools/data-pipeline/README.md` and `tools/data-pipeline/VERIFICATION.md`. Backend HTTP/database end-to-end has not been run. No source code was merged into main/develop or released by this task.
