# Supervisor review — A2-CHAT-PREP-01

Result: **accepted for transport-independent UI/controller preparation only**. No blocking finding in the reviewed scope. This does not approve live chatbot, backend integration, or native Android acceptance. No source was changed or merged during this review.

## Source and ownership

- Base: `cc065d38fae6a18738fec6479f2264e5fb7ef1e6`.
- Reviewed source and verified remote `agent2-fe`: `fa468aed3271e0b2cd5e0566b931ceeea80546d8`.
- Source subtree: `8b0d2ddc098498c0f97829bb4b636eb03d09ed88`.
- Client lock blob: `057ba4c482149b7fd73dba7d2698be8e785c4021`, unchanged from base.
- All 18 changed files are under `apps/adviser/**`; no backend/pipeline/root-lockfile changes.
- Source, lockfile and screenshot fingerprints match the callback. ChatPanel/lockfile reported SHA256 uses CRLF working bytes; the Git source has LF. Both normalized forms and exact hashes are recorded in `report.json`.

## Checks performed by Supervisor

Extracted only committed app/context files into an OS temporary directory, installed pinned dependencies and ran:

| Command | Result | Evidence |
|---|---|---|
| `npm.cmd ci --no-audit --no-fund` | exit 0 | npm-ci.log |
| `npm.cmd run check` | exit 0 | typecheck.log |
| `npm.cmd test` | 25 pass / 0 fail | unit-tests.log |
| `npm.cmd run build` | exit 0, production web bundle | build.log |

Every extracted tracked file matches the reviewed Git object after LF/CRLF normalization; binary files match exactly. Windows Git archive text conversion accounts for the line-ending-only differences recorded in `report.json`. Production JS does not contain fixture transport labels/diagnostics or a guessed `/advisor/v1/chat` route. Browser fixture entry is separate; default App supplies no transport. No production database or external AI provider was used.

## Source review

- Send bounds text/history, allows one in-flight request, preserves one user turn on retry and cleans timers/abort listeners. Cancel/revision/dispose discard late results.
- Proposal validation checks the Draft and revision. Confirmation uses existing serialized durable storage, compare-and-set revision and post-write ACK. Failed writes retain confirmed state and the reviewable proposal; duplicate confirmation is guarded.
- Panel retains session messages across tabs, cancels pending work when inactive, exposes provider/fallback/source availability and only accepts HTTPS source links.
- Shared theme/buttons preserve Material You, accessible labels, disabled state and 48dp controls. The two committed Chromium captures were inspected as browser evidence. They do not establish native Material You, TalkBack, IME, system Back or font-scale acceptance.
- No default HTTP schema/endpoint, invented offer/fact or production fixture import was introduced. UI view-model types remain separate from Agent3 wire contracts.

## Evidence limits and next dependency

Agent2 reported 4/4 Chromium journeys; Supervisor did not repeat those journeys because no source changed and focused verification passed. Live chat HTTP/provider/native tests remain not_run. Static detector output is Agent2's reported evidence, not a native accessibility verdict.

A3-DATA-02 remains in_progress: `149388f` is only the HTTP D01–D07 partial handoff. Await final durable raw-staging/migration/truthful fallback handoff before activating A3-CHAT-01 and handing its versioned request/reply/error/provenance/revision/cancel contract to Agent2.

Integration is pending. The Supervisor shared checkout contains pre-existing uncommitted changes to overlapping UI files and separate local backend/demo work; these were preserved. No checkout/reset/stash or dev/main push was used for this review. Before integration, reconcile overlapping owner changes explicitly and test the final combined source, rather than overwrite them.

Agent2 has no new task from this review. Next authorized implementation is the real HTTP adapter/E2E after the backend contract is available; fixture tests must continue to be labelled separately.
