# A1-HTTP-02 — actual HTTP integration, pinned consumer

Task implementation by Agent 1. Backend acceptance remains blocked if the semantic suite is red. No backend/UI edits, production writes, live retailer refresh or paid provider calls.

## Baseline and reproduce

- Own base: `b704dfb9237fe918b541a24eb3947ac5003ed115`.
- Dispatch: `027c20016423e6c46e1d30c1758e4aa3ae3c46e8`.
- Consumer: `b979575aeb9f522565e53c69da777f37b8eb323c`.
- Backend tree: `17bad234845cb1007e1353da6f21288ffa0a2de6`.
- Integration merge on task branch: `cdf31bd` (consumer source unchanged).
- Branch: `codex/dev/agent-1/lead-tasks`; only this task branch is pushed.

From this worktree's `tools/data-pipeline` (Python 3.11+, Node 22.19+, npm/Git required):

```powershell
python -m scripts.http_integration --backend-root ../../services/adviser-backend --consumer-sha b979575aeb9f522565e53c69da777f37b8eb323c --report-dir .work/http-new-run
```

Use a new report directory. Semantic failures MUST produce runner exit 1. Do not change expected behavior to match a consumer defect. The runner validates the explicit backend source against the full SHA/tree, records harness/fixture/dataset hashes, runs the Python suite and actual backend manifest `npm ci`, `npm run typecheck`, `npm run build`, `npm run test`, then starts the actual consumer `createHttpServer` on IPv4 loopback/ephemeral ports. It uses real HTTP requests, not a mocked handler or validator-only check.

Every case owns a fresh disposable SQLite file; only initial catalog activation and read-only DB inspection use direct modules. Accepted offers enter through HTTP. The labelled synthetic positive fixture explicitly approves test-only zero mandatory/shipping charges; no real cost approvals are created. Real ten-row payloads keep null fees and quarantine/provenance. Each case records request body (or exact large-payload generation/hash/byte counts), response, accepted-store rows before/after, assertion and cleanup evidence. Failure does not stop collection of other cases.

The Node helper closes connections/server/store and removes its generated directory in `finally`. The Python parent owns a second temporary directory and kills/reaps the direct Node process on an overall timeout before deleting that directory. A readiness journal records its actual port/path; watchdog regression verifies the listening port is closed and the parent scratch removed. No shell or descendant process is used for Node execution. The Python closure probe treats timeout as inconclusive; Windows loopback refusal can take about a second, so its limit is three seconds.

Subprocess regressions test exit-code propagation, CLI failure reports, live-listener detection and killed-listener/temp cleanup. Separate actual-server `failure` and `hang` modes test assertion nonzero/cleanup and parent watchdog teardown. These modes never change suite assertions.

## Evidence and coverage

`run-01/` retains the initial run: semantic red tests plus a harness error in the original Windows socket-probe timeout. That probe was fixed without weakening the check: only an explicit connection refusal proves closure; a timeout still fails. Final evidence is `run-02/` after the source commit recorded by `sourceHead` and harness hashes in `report.json`.

Final execution on source `f6dd9b51a350083d9151932b1714727360b20588`: **runner exit 1 / semantic acceptance blocked**. Python **41/41 pass** (`02.log`), backend typecheck/build pass (`04.log`, `05.log`), backend **45/45 pass** (`06.log`). Actual HTTP suite: **20 pass / 10 fail** across 30 isolated cases (`http-suite.json`, `07.log`). All 30 server/store/directory cleanups pass. The deliberate assertion regression exits 1 and cleans up (`08.log`, `http-failure.json`); the deliberate hanging actual server is killed/reaped by the parent, its port is explicitly refused and its scratch directory is removed (`09.log`, report watchdog checks). Dataset hashes remain unchanged. Only the semantic acceptance check is red in the final runner report; backend unit-test counts do not waive these HTTP defects. Harness implementation is complete; further acceptance waits for the backend owner through coordinator.

| Case | Required behavior |
| --- | --- |
| H01 | Health/catalog metadata, JSON header and recommendation schema/rule/request identity |
| H02 | Real 10 raw rows rejected by accepted ingest with zero accepted-store writes |
| H03-* | Malformed, null, numeric, string, boolean JSON → 400 for ingest/recommend |
| H04/H05-* | Unknown exact variant and negative money → 400, zero writes |
| H06-* | Exactly 1,000,000 UTF-8 bytes accepted; larger ASCII/multibyte body → 413 |
| H07 | Approved synthetic HTTP positive → SQLite persist/replay/restart → verified affordable result |
| H08/H09-* | Conflicting replay → 409; invalid/unknown/conflicting mixed batches leave store unchanged |
| H10-* | Missing catalog explicit unavailable; no offer/unknown payable total → NO_VERIFIED_OFFER, no false affordability; genuine hard mismatch → NO_FIT |

Dataset remains 8 captures / 8 sources / 10 observations (6 ready / 4 quarantined), 4 variants, zero catalog offers/facts. Manifest `6b6c6cc13730bf375324b246de99a31acb25054b580e87b060f9b9d4928de963`. Dataset JSON byte hashes are checked before/after the run. Historical retailer browser projections are real inputs; positive charges, identities and hardware in the HTTP approval fixture are synthetic. Requests use actual localhost networking and actual SQLite. The HTTP boundary receives a local AI guard that throws if invoked; no AI route/inference is represented as tested. Existing backend unit tests may use mock AI.

## Defects for coordinator / backend owner

All repros use the command above. `http-suite.json` contains exact request/response and accepted-store contents per case; every case starts with an empty accepted store. Expected behavior remains red until the owner changes the consumer.

| Defect | Case / expected | Observed at b979575 |
| --- | --- | --- |
| HTTP-D01 | H03-ingest-null, H03-recommend-null: POST literal `null` → 400 | 500 ERR_INTERNAL from dereferencing null |
| HTTP-D02 | H04, H09-unknown: unknown variant rejected, mixed batch zero writes | 200 accepted; unknown row persisted; mixed valid/unknown batch persists two rows |
| HTTP-D03 | H06-utf8: JSON `{offers:[],padding:'ệ'.repeat(400000)}` (>1MB bytes, <1M JS chars) → 413 | 200 accepted; ASCII over-limit is correctly rejected |
| HTTP-D04 | H08, H09-conflict: same source/external ID/timestamp with price+1 → 409; mixed batch rollback | 200 success, original conflict silently ignored; new sibling row persists |
| HTTP-D05 | H09-storage: valid offer + missing completenessStatus → safe 400 and atomic zero writes | 500, first valid offer already persisted (partial write) |
| HTTP-D06 | H10-nooffer: matching hardware, no offers → NO_VERIFIED_OFFER | NO_FIT incorrectly implies hardware rejection |
| HTTP-D07 | H10-unknown: accepted synthetic offer with unknown ship → NO_VERIFIED_OFFER | SUCCESS despite no verified payable total; candidate flag/total are correctly false/null |

The runner does not repair backend code or dispatch fixes directly. Coordinator receives the defects/repro and owns the next instruction. These are observed source/HTTP outcomes, not inferred from test counts.

## Raw extension dependency

Raw adapter is explicitly **not enabled**: b979575 has no handed-off raw observation HTTP protocol. No guessed raw route is called or reported working. A3-DATA-02 is the dependency for implemented POST protocol, canonical hash agreement, durable query seam, readiness meanings, migration and collision/atomicity semantics. A future handed-off consumer can add a separate adapter that ingests the unchanged real bundle and verifies raw replay/restart/rollback while accepted offers stay zero. This task makes no claim about that unfinished contract or live AI fallback behavior.
