# Verification — 14 November 2026

## Retail-data follow-up (parser 1.1.0)

Collected eight real product browser projections and reproduced 10 observations (6 ready-for-review, 4 quarantine). Added four retailer-claim catalog variants without inventing missing RAM or trusted AI facts. 36 Python tests passed. Actual backend at origin/dev `579b719` imported all four variants into a temporary SQLite DB, restored them after restart, and preserved the active snapshot on injected rollback. All ten unknown-fee observations were rejected by the existing offer contract as expected. See `datasets/retail-pilot-2026-11-14/README.md` for artifacts and handoff. Earlier HTTP transport limitations below still apply; browser projection acquisition is a separate successful path.

Environment: Windows, Python 3.15.2, SQLite 3.53.4, Node 22.19.0. No external Python dependencies.

## Passed

- `python -m unittest discover -s tests -v`: **33 tests passed**, 0 failures/errors, final run 1.303 seconds.
- `python -m compileall -q lua_pipeline scripts`: passed.
- `python -m scripts.demo`: synthetic capture → SQLite → replay → hashed export → explicit review → backend payload passed. First insert 1, replay 0; subsequent demo runs insert 0, replay 0.
- `python -m lua_pipeline doctor`, `validate-config --config examples/fptshop.json`, and `verify-export --input .work/demo/bundle.json`: passed.
- Production Agent 3 `validateStagedCrawlerOffer` checked the synthetic reviewed offer: `{checked:1, valid:true, errors:[]}`. Validator modules were read from Git commit `3f9389f0bf503533b74f1827a3c45fc3d09a37f8`, into ignored `.work/backend-contract`; no backend source was merged or changed for this check.

Test coverage includes all eight source IDs on synthetic Product/Offer data, ProductGroup sibling stock, graph offer references, duplicate/conflicting scripts, narrowly scoped DOM prices, DOM fallbacks, SKU/region conflicts, unknown/conflicting specifications, strict VND bounds, unknown costs, robots group/wildcard rules, guarded redirects, bounded timeout retries, real local HTTP 429/403/size checks, sitemap cycles/deduplication, job resume, SQLite restart/replay/rollback, export tampering, atomic-write failure, human-reviewed backend conversion, and CLI end-to-end/error paths.

## Live HTTP smoke — not passed

Attempted one explicit detail URL per source with the production Fetcher and robots guard (8-second timeout and no retries for the smoke). Different hosts were probed independently; per-host rate limits were retained. See [live-http-smoke.json](verification/live-http-smoke.json).

- CellphoneS: robots HTTP 200 and policy hash captured; product request failed with NETWORK_FAILURE.
- Điện Máy Xanh, FPT Shop, Oneway, ShopDunk, TGDD, Trung Trần: NETWORK_FAILURE while establishing the fetch/policy path.
- LaptopAZ: connection reset (WinError 10054). Transport subsequently normalized OSError network failures into the bounded NETWORK_FAILURE path, covered by the test suite.

These results do not establish permanent source blocking or missing product data. Earlier integrated-browser research could read the sources; that is a different transport. No site is labelled live-qualified by these HTTP results. ShopDunk/Oneway DOM selectors remain experimental until matched against a live or reviewed rendered fixture. AggregateOffer is intentionally quarantined rather than converted into an exact offer.

## Not run / separate acceptance

- Backend HTTP ingest, backend database persistence of a pipeline export, signed catalog activation and Android integration.
- Live AI inference, paid API calls, broad catalog crawling, full pagination and complete regional/variant coverage.
- Production data publication/source-use approval and cross-process global rate limiting.

The backend conversion contract check proves shape acceptance for a synthetic reviewed offer, not those integration outcomes. Unknown mandatory fees remain null in staging; conversion requires explicit review rather than assuming zero.
