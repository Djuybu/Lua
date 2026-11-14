# PostgreSQL + dbt + Qdrant pipeline

Run from `tools/data-pipeline` using Python 3.13 in `.work/warehouse-venv`.
Connection values come from the Git-ignored `services/adviser-backend/.env`.
No password belongs in this directory, dbt profile or command line.
Install the backend's Node dependencies (`npm ci` in `services/adviser-backend`)
and this pipeline's `requirements-warehouse.txt` before running publication.

```powershell
# Import the existing database's raw crawl history, normalize, test and publish.
.work/warehouse-venv/Scripts/python.exe -m scripts.warehouse --import-existing

# Fetch one allowed product page, store the raw observation in PostgreSQL,
# then run dbt tests and publish to Qdrant if all stages succeed.
.work/warehouse-venv/Scripts/python.exe -m scripts.warehouse --crawl-config examples/laptopaz.json --category pc_laptop --max-pages 1

# Rebuild/index already loaded raw data without making any retailer requests.
.work/warehouse-venv/Scripts/python.exe -m scripts.warehouse
```

dbt transforms data already in PostgreSQL; it does not download websites.
The Python entrypoint orchestrates the existing guarded crawler, PostgreSQL
loading, `dbt build` (including data tests), and the Qdrant publisher.
Robots rules, source allowlists, timeouts, retries and rate limits remain active.
Live failures are recorded as failures; previously captured rows never become
new live observations merely because this pipeline is run again.

`--import-existing` reads `public.raw_crawled_laptops` without changing it,
`public.laptops`, `public.pipeline_runs`, or the original Qdrant `laptops`
collection. Input source + external identity remain distinct across retailers.
Imported legacy captures retain their original timestamps and are labelled
`existing_postgres_capture`. Rows missing parsed RAM/storage, category, identity
or a safe source URL cannot enter the catalog; they remain in raw/staging data.
Unknown OS/CPU are shown as `Chưa xác minh`, never as compatible evidence.

Storage:

- `lua_raw.product_observations`: immutable product history, including existing
  raw payloads and newly parsed product observations.
- `lua_raw.pipeline_observations`: complete crawler evidence/quarantine records.
- `lua_raw.jobs`: crawl outcomes, including network/robots failures.
- `lua_build_<run-id>`: isolated dbt tables (`stg_products`, `catalog_variants`,
  `search_documents`) and their test results. Raw records remain untouched.
- `lua_catalog_<run-id>`: versioned Qdrant collection, containing normalized
  catalog documents and latest raw observations with separate record types.
- `lua_app.active_catalog`: atomically selects both the tested SQL schema and
  exact Qdrant collection. SQL data is authoritative for returned variants.
- `lua_app.reviewed_offers`: separately validated offers. Raw observed prices
  never flow into this table automatically.

Qdrant uses deterministic lexical sparse vectors with accent normalization and
IDF. This is keyword retrieval, not paid embeddings or semantic AI similarity.
The same tokenizer is used for indexing and querying. Search only returns
`recordType=variant`, so quarantine and raw observations are not recommended.

Publication creates a new SQL schema and Qdrant collection, runs dbt tests,
waits for every upsert and verifies exact point counts before switching the
active PostgreSQL pointer. A failure leaves the prior publication intact.
Concurrent pipeline runs are excluded by a PostgreSQL advisory lock. Re-import
is idempotent at the raw layer; rebuilding creates a new recoverable version.
Old builds/collections are deliberately retained; no broad cleanup runs here.
To roll back, use a known previously successful schema + collection pair in
`lua_app.active_catalog` in one transaction after verifying both still exist.

Reports and dbt artifacts: `.work/warehouse/<run-id>/`. The process returns
nonzero on crawl, dbt or indexing failure. The `pipeline_runs` table records
status and failure type without credentials. The frontend displays loading,
error and empty states and does not silently switch to bundled JSON.

Verification on 2026-11-14: imported 60 original observations and re-imported
with zero duplicates. A live LaptopAZ request parsed and stored one additional
observation; `EXACT_VARIANT_UNMAPPED` correctly quarantined it. All 60 legacy
products entered the catalog after category/storage normalization. Qdrant has
121 points (60 catalog documents + 61 latest source observations). Thirteen
dbt data tests passed. A browser search for Lenovo returned eight products.

Opt-in integration checks, from `tools/data-pipeline`:

```powershell
.work/warehouse-venv/Scripts/python.exe -m scripts.check_warehouse
```

This tests replay, conflicting observation rollback and failed Qdrant publication
without retaining synthetic data. From the repository root with the app running,
`node tools/warehouse-smoke.mjs` checks catalog loading, Qdrant search and visible
backend failure in the browser; it does not call the AI provider.

References: [dbt build](https://docs.getdbt.com/reference/commands/build),
[Postgres profile](https://docs.getdbt.com/docs/core/connect-data-platform/postgres-setup),
[Qdrant sparse vectors](https://qdrant.tech/documentation/concepts/vectors/).
