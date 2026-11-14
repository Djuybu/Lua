# Official prices/explanation port onto current UI

Scope authorized by user: fix review item 3 only. Work is performed by Supervisor, with no message or delegation back to Agent3.

Base: latest fetched origin/dev `11d5a16ae3f2d5426912b14551d645e3f73132f5`. Source of official-data/explanation implementation: `2104b3316789decd15093d8e446cd5c58d584f11`, now published on AGENT3-FIXED. Implementation branch: `codex/fix/official-ui-current`, isolated Supervisor worktree `D:\hobby_project\lua-official-ui`.

The old monolithic AdviserApp was not copied. Prices and source/date are rendered in the current listing/detail/compare/result composition. Device detail hosts the question input and three quick questions for the existing POST /advisor/v1/explain contract. Confirmed needs are required; offline/unconfigured mode disables calls. Request identity/variant validation, bounded timeout, cancel and revision/variant/unmount invalidation prevent late answers. Fallback is labelled distinctly from provider responses. Historical detail does not silently receive a current explanation/price.

The four destinations, decision Carts, v1-to-v2 migration, strict storage validation, same-basis price guards, Material You/preferences and transport-independent needs-chat remain in place. The general chat seam is still separate from product-detail explanation.

Official offer data, fees/shipping decisions, original catalog version and provenance metadata are copied unchanged from 2104b33. Review items 1 and 2 were not changed. This is not a fresh crawl, a new fee-verification decision, or independent benchmark evidence.

Backend/dev-launcher explanation and catalog dependencies were ported with their tests. The first HTTP run exposed missing parent dependencies (replay conflict/storage validation); the original SQLite batch and crawler completeness fixes from 015689e were included without weakening assertions. Final HTTP suite passes 30/30. No claim of completing the separate raw-staging/migration handoff is made.

## Verification

Node22.19.0 / npm10.9.3 / Python3.15.2, Windows PowerShell, isolated worktree.

- App: npm run check; npm test (47/47); npm run build; npm run test:e2e (15/15).
- All prior 45 unit and 14 browser cases are retained. Added API tests cover request/variant identity and question; browser test exercises current Carts navigation, official prices and detail question/reply/fallback/offline gates using an explicitly intercepted test endpoint. This is not live provider/PostgreSQL E2E.
- Backend: npm run typecheck; npm test (56/56).
- Pipeline: python -m unittest discover -s tests from tools/data-pipeline (42/42).
- Actual HTTP/SQLite harness: node tools/data-pipeline/scripts/http_backend.mjs services/adviser-backend tools/data-pipeline/datasets/retail-pilot-2026-11-14 tools/data-pipeline/tests/fixtures/http-approved-synthetic.json .work/official-ui .work/official-ui/http-verified.json suite (30/30, exit0).
- git diff --check passes. No manifest/dependency/native configuration changes.

Commands/results, fingerprints and HTTP report are in the neighboring official-ui-evidence directory. PostgreSQL/Qdrant service E2E, live AI provider, APK/device/TalkBack/IME/Back/performance remain not_run. The launcher still requires its documented PostgreSQL/environment setup. No paid provider or production write was used in verification.
