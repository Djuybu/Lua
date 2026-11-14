# Retail pilot data — 14 November 2026

Real public retailer observations captured through the T3 integrated browser, not synthetic offers. These are development inputs/retailer claims, not manufacturer-verified facts or a publishable buying catalog.

## Artifacts

- `captures/`: eight minimized product captures: URL, timestamp, heading, selected JSON-LD, specification rows and price/context nodes. No customer reviews, reviewer identities, cookies or credentials. Rendered projections, not complete HTML archives.
- `configs/`: mappings to source-bound IDs `retailer:<source>:<sku>`. These identify the selected retailer configuration, not cross-retailer equivalence. Oneway remains unmapped where identity is unresolved.
- `staging-bundle.json`: **10 observations** with manifest/hash/provenance; **6 ready-for-review, 4 quarantined**. Ready-for-review does not mean approved offer.
- `catalog-snapshot.json`: **4 variants**, zero offers and zero verified performance facts, compatible with Agent 3 SnapshotManifest for development import.
- `variant-provenance.json`: source references for reviewed transcriptions of typed fields; missing RAM/CPU/OS was not invented to satisfy the backend.
- `quality-report.json`: per-source counts/reasons and backend blockers.

## Coverage

| Source | Rows | Use / restriction |
|---|---:|---|
| CellphoneS | 1 | OPPO Find X8 16/512; primary specification table separated from marketing article tables |
| Điện Máy Xanh | 1 | HP 240R C3RU7AT; installed RAM 16GB distinct from maximum 32GB |
| FPT Shop | 1 | Acer Aspire Go AG15-52P-52WT; normal/special prices differ, offer quarantined |
| LaptopAZ | 1 | Acer Aspire 7 NH.DXUSV.001; retailer SKU SP002078 and typed specifications |
| Oneway | 1 | Region URL/title conflict, JSON-LD error and missing SKU; quarantined |
| ShopDunk | 1 | Product ID 5578/current price; condition and stock unverified, quarantined |
| TGDD | 3 | Three colors of the 1TB phone, unique SKUs and different stock; RAM unknown, no fabricated catalog variant |
| Trung Trần | 1 | AggregateOffer with stale 2019 validity; quarantined |

Catalog contains OPPO Find X8, Acer Aspire 7, HP 240R, Acer Aspire Go. `factIds=[]`: retailer product text is not independent workload/performance evidence. FPT hardware can be used while its price context is unresolved. Required `publishedAt` is an internal development snapshot timestamp, not a production publication claim. Empty `offers` is intentional. Catalog/persistence and unknown-state work can proceed; positive affordability scenarios still require accepted offers/reviewed charges.

## Reproduce

From `tools/data-pipeline`:

```powershell
python -m scripts.build_retail_pilot
python -m lua_pipeline verify-export --input datasets/retail-pilot-2026-11-14/staging-bundle.json
python -m unittest discover -s tests -v
python -m lua_pipeline parse-capture --config datasets/retail-pilot-2026-11-14/configs/laptopaz.json --input datasets/retail-pilot-2026-11-14/captures/laptopaz.json --db .work/retail-inspect.sqlite
python -m lua_pipeline report --db .work/retail-inspect.sqlite
```

Build makes no network request and uses a fresh temporary staging DB. Typed catalog fields are reviewed transcriptions in the build script, with provenance in the output. If captures change, review those transcriptions before rebuilding; the script does not infer arbitrary device identity from a title.

## Actual backend check

```powershell
node --experimental-strip-types scripts/verify-retail-backend.mjs ../../services/adviser-backend datasets/retail-pilot-2026-11-14
```

Verified on actual source at `origin/dev` SHA `579b719d92be8e68d00837c727113f08b84afc75` (backend implementation `3f9389f`), using disposable SQLite under `.work`:

```json
{"variantsImported":4,"restart":"passed","rollback":"passed","observationsChecked":10,"unknownFeeOffersRejected":10,"providerCalls":0,"productionWrites":0}
```

Python suite: **36 tests passed**, including capture replay and preservation of real-data edge cases. HTTP ingest/live provider inference was not run. The SQLite check exercised real activation, restart and injected-failure rollback; it did not merely validate JSON shape.

## Agent 3 handoff

1. Import `catalog-snapshot.json` into a development DB and use `variant-provenance.json` for source checks.
2. Use staging/captures for ingest regressions. Do not POST the whole staging envelope to `/advisor/v1/ingest`, which expects StagedCrawlerOffer.
3. Resolve the mismatch: pipeline preserves unknown `mandatoryFeesVnd=null`; current backend requires a number/NOT NULL. Preserve unknown in a raw staging boundary or update the contract deliberately. Do not replace missing fees with zero. Positive tests may use separately labelled synthetic data.
4. Keep price-context, stock-by-color, expired aggregate and region identity cases as regression inputs, retaining quarantine/evidence until resolved.
5. Run BE/AI tests with actual IDs: unknown-cost offers must never be verified-affordable; absent fact IDs must not produce invented capability claims.

Shipping/additional fees/promotion eligibility remain unknown. Prices are historical observations and need refresh/review before buying recommendations. This seed covers the eight requested sources, not their complete inventories.
