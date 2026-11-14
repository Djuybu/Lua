# A1-INT-01 — pipeline/backend integration

Owner: Agent 1. Scope: integration harness/tests/docs only. Backend and UI are not edited.

## Pinned baseline

- Startup/base: `7afdfcbb04cd9cdb219cf9481d4e886cc98b4078`.
- Dispatch/data: `046b9e30212c83e9e2a429a96138684753ec4351` (fast-forwarded onto task branch).
- Backend consumer: `579b719d92be8e68d00837c727113f08b84afc75`, backend implementation `3f9389f0bf503533b74f1827a3c45fc3d09a37f8`.
- Integration merge: `197280180d25b1be12a8c1d3a9b940cf50bba08b` on `codex/dev/agent-1/lead-tasks`.
- Consumer subtree: `ef1c425415d202def79011268c9008e136b7984f` (`services/adviser-backend`).

This branch includes the backend through a merge, without edits to its source. Only the task branch is pushed; dev/main are not updated. The pin describes the tested consumer, not the latest result of Agent 3's concurrent raw-staging task.

## Reproduce

Requires Python 3.11+, Node 22.19+ with SQLite/type stripping, npm, Git and access to install the backend lockfile dependencies. From this worktree's `tools/data-pipeline` directory:

```powershell
python -m scripts.integration --backend-root ../../services/adviser-backend --consumer-sha 579b719d92be8e68d00837c727113f08b84afc75 --report-dir .work/a1-new-run
```

Use a new report directory each time. Source path and full consumer SHA are mandatory. The runner refuses tracked backend changes or untracked backend files outside ignored dependency/build outputs. It runs `npm ci`, then the actual manifest scripts `typecheck`, `build`, `test`; npm writes only local dependency/build artifacts. Backend tests use in-memory/temp databases, localhost HTTP and mock AI providers. The integration helper neither starts the deployed server nor calls a provider.

The runner copies committed data into a fresh OS temporary directory, executes the real dataset builder twice there, compares every committed JSON byte, verifies the manifest, reparses all captures, then tests pipeline insert/replay/restart with all quarantine content intact. Real rows without cost approvals export no accepted offers. All integration SQLite paths are generated internally under disposable directories; there is no production DB argument. No previous `.work` backend copy is used.

The Node helper imports real backend source via the explicit path, imports the four real catalog variants, compares their complete stored content, restarts, injects snapshot failure after changed variants/offer writes, checks rollback and restarts again. A separate labelled synthetic HTML fixture goes through pipeline review/conversion, backend validator/ingest, persisted replay/restart and positive affordability. Its zero charges are synthetic known values, never applied to retailer observations. Unknown shipping and an isolated null mandatory fee probe must never produce a complete verified price.

Any unexpected command exit/assertion makes the runner exit nonzero and writes `status=failed` when the report directory was created. Negative probes deliberately corrupt a temporary manifest (expected exit 2) and catalog count (expected assertion/nonzero). A Python subprocess regression verifies invalid consumer pins fail before backend commands and leave a failure report.

## Acceptance and evidence

`run-01/` is the initial successful run before the additional invalid-pin regression and isolated-null-fee probe. Final evidence is `run-02/report.json` and its numbered logs. Each report records exact commands, cwd, exit codes, consumer tree and harness content hashes; command logs retain stdout/stderr. `integrationHeadBeforeRun` is the source commit before evidence is committed, not a claim that later report commits were already present.

| AC | Verification |
| --- | --- |
| 8 sources / 8 captures / 10 observations / 4 variants | Two byte-identical dataset rebuilds, capture parse equality and manifest verification |
| Hash/ID/replay invariant | Unique verified IDs; replay inserts 0 before and after pipeline restart; tampered manifest fails |
| Catalog import/restart/atomic rollback | Actual backend SQLite, full variant comparison, injected changed variants/offers, second restart |
| Unknown fee cannot imply verified affordability | Staging remains null/false; accepted-contract outcomes recorded; isolated null-fee probe and unknown-shipping semantic check |
| Quarantine preserved | Exact 10-row content equality after restart, 6 ready-only rows, 4 retained quarantines; no unreviewed export |
| Synthetic positive | Labelled fixture review → actual validator/ingest → SQLite replay/restart → complete affordable result |
| Nonzero failure/no production writes | Manifest/catalog corruption probes, invalid-pin subprocess regression, internally generated disposable DB paths |

At the pinned baseline the accepted-offer validator rejects the ten raw rows; this is an observed outcome, not a required rejection count. The runner records rejection reasons and can accept a nullable contract only if its eligibility result remains incomplete. A newly introduced raw-staging endpoint/store needs a deliberate additional test adapter once Agent 3 supplies its contract; this task does not invent that API.

Real data counts: 8 sources, 10 observations (6 ready for review / 4 quarantine), 4 variants, zero catalog offers/facts. Manifest SHA256: `6b6c6cc13730bf375324b246de99a31acb25054b580e87b060f9b9d4928de963`. Retailer IDs remain source-bound. Historical observations are not live price/stock qualification. Existing FPT price conflict, TGDD color stock, stale Trung Tran aggregate and Oneway identity/JSON-LD issues remain preserved.

Final execution: **passed**, source commit `42039a44dec7772e6c48440a274d4be887efaece`; Python 3.15.2, Node 22.19.0, npm 10.9.3. Python **37/37** tests pass (`run-02/08.log`); backend typecheck/build pass (`10.log`, `11.log`), **35/35** tests pass (`12.log`). Integration `17.log` passes import/restart/rollback/restart-after-rollback, synthetic positive/ingest/replay/restart, unknown-shipping and isolated null-fee checks. Both corruption probes fail as expected (`16.log`: exit 2; `18.log`: exit 1). The runner itself exits 0. No backend source changes or BE defects were found. The pinned validator rejects all ten raw rows and the isolated null-fee fixture; these outcomes do not qualify Agent 3's later raw boundary.

## Limits and next handoff

- No production writes, live retailer refresh, paid/live AI inference, Android/native/UI testing, or publication.
- Dataset integration calls backend modules directly; existing backend tests exercise localhost HTTP with synthetic fixtures. The real dataset was not posted to an HTTP ingest endpoint.
- No raw-staging migration verification for Agent 3's pending changes; rerun with its final consumer SHA and add explicit raw API checks after coordinator review.
- No BE defect found within this tested scope. Coordinator owns next dispatch and FE bootstrap decisions.
