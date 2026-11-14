# @lua/adviser-backend

Deterministic recommendation engine with a PostgreSQL catalog, Qdrant keyword search, and bounded AI adapters for Lua Device Adviser.

## Local application runtime

The application now runs against PostgreSQL (`laptop`, port 5432) and Qdrant
(port 6333). Configure the ignored `.env` from `.env.example`, then build and
publish the catalog using the [warehouse pipeline](../../tools/data-pipeline/warehouse/README.md).
Run `npm start` in this directory to serve the API on 8080. Expo serves the
frontend on 8081 with `npm run web` in `apps/adviser`. Configure PostgreSQL and
Qdrant in the ignored `.env`, then initialize the catalog using the
[warehouse pipeline](../../tools/data-pipeline/warehouse/README.md).

`GET /advisor/v1/catalog` reads the active PostgreSQL catalog;
`GET /advisor/v1/catalog?q=Lenovo` retrieves matching IDs from Qdrant and loads
their records from the same published PostgreSQL version. `/health` checks both
stores. Observed crawl prices remain reference prices until reviewed as offers.
The SQLite adapter below remains for offline snapshot tests and older tooling;
it is not used by `npm start`.

## 1. Overview & Architecture

This package implements the core backend and AI capabilities of the Vietnam-first device buying adviser, developed by **Agent 3 (Backend & AI)** under PLAN-03 / DEV-3:
- **Offline-first Deterministic Core**: Pure TypeScript evaluation ensuring zero hallucinated prices, models, or compatibility verdicts.
- **Strict Money Arithmetic**: Integer VND amounts, safe overflow protection (`Number.isSafeInteger`), mandatory fee separation (excluding shipping), and explicit `null` total when shipping is unknown.
- **Crawler Staging Ingest**: Idempotent ingestion separating stable offer identity `(sourceId, externalOfferId)` from observation identity `(sourceId, externalOfferId, observedAt)`.
- **Atomic Catalog Persistence**: Native Node `node:sqlite` storage with atomic snapshot activation and 100% rollback on failure, preserving active catalogs and historical saved decisions across restarts.
- **Bounded AI Adapter**: Runtime validator using discriminated unions for patches, anti-hallucination fact verification, and deterministic rule-based template fallback on provider errors, timeouts (≤5000ms), or cancellations.
- **HTTP Server Boundary**: Lightweight native HTTP server exposing `/health`, `/advisor/v1/recommend`, and `/advisor/v1/ingest` for localhost network testing.

## 2. Directory Structure

```
services/adviser-backend/
├── package.json
├── tsconfig.json
├── .env.example
├── README.md
├── src/
│   ├── index.ts                  # Public barrel export
│   ├── contracts/
│   │   ├── taxonomy.ts           # Categories, purposes, priorities & validation
│   │   ├── money.ts              # Integer VND arithmetic & overflow protection
│   │   ├── crawler.ts            # StagedCrawlerOffer & observation keys
│   │   ├── catalog.ts            # ProductVariant, FactAssertion, SnapshotManifest
│   │   ├── envelope.ts           # Request/response envelopes & safe error codes
│   │   └── ai.ts                 # Discriminated union patch & explanation proposals
│   ├── domain/
│   │   ├── eligibility.ts        # Hard constraint evaluation (budget, RAM, OS, category)
│   │   └── ranking.ts            # Deterministic 50%/30%/20% priority ranking
│   ├── data/
│   │   ├── ingest.ts             # Idempotent crawler offer ingest store
│   │   └── sqlite.ts             # SQLite persistence, atomic snapshots & rollback
│   ├── ai/
│   │   ├── validator.ts          # AI patch & explanation validation
│   │   ├── fallback.ts           # Grounded template fallback generator
│   │   └── adapter.ts            # Bounded AI client & mock provider
│   └── server/
│       └── http-app.ts           # Localhost HTTP boundary server
└── tests/
    ├── contracts.test.ts         # Profile & crawler schema checks
    ├── money.test.ts             # Boundary, overflow & null-fee tests
    ├── ingest.test.ts            # Idempotency & variant matching tests
    ├── eligibility.test.ts       # Hard constraints & 1 VND boundary tests
    ├── ranking.test.ts           # Deterministic priority ranking tests
    ├── persistence.test.ts       # Atomic rollback & restart recovery tests
    ├── ai-validator.test.ts      # Discriminated union & anti-hallucination tests
    ├── ai-adapter.test.ts        # Timeout, provider error & fallback tests
    └── http-server.test.ts       # Real HTTP network integration tests
```

## 3. Running Tests & Typecheck

```powershell
# Run all 35 tests
npm test

# Run TypeScript typecheck
npm run typecheck
```
