CREATE SCHEMA IF NOT EXISTS lua_raw;
CREATE SCHEMA IF NOT EXISTS lua_app;
CREATE TABLE IF NOT EXISTS lua_raw.crawl_state (
 source text PRIMARY KEY, initialized_at timestamptz NOT NULL DEFAULT now(),
 run_id text NOT NULL
);
CREATE TABLE IF NOT EXISTS lua_raw.product_observations (
 observation_id text PRIMARY KEY, source text NOT NULL, external_id text NOT NULL,
 observed_at timestamptz NOT NULL, payload jsonb NOT NULL, capture_mode text NOT NULL,
 review_status text NOT NULL, loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS lua_raw.pipeline_observations (
 observation_id text PRIMARY KEY, payload jsonb NOT NULL, loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS lua_raw.jobs (
 source text NOT NULL, url text NOT NULL, state text NOT NULL, detail jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(source,url)
);
CREATE TABLE IF NOT EXISTS lua_app.pipeline_runs (
 run_id text PRIMARY KEY, started_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz, status text NOT NULL, detail jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS lua_app.active_catalog (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), version text NOT NULL,
 build_schema text NOT NULL, qdrant_collection text NOT NULL, published_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS lua_app.reviewed_offers (
 observation_id text PRIMARY KEY, variant_id text NOT NULL, payload jsonb NOT NULL
);
