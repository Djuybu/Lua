# A2-UIUX-FIX-01 — implementation handoff

Status: completed implementation, ready for Supervisor review. Owner: Agent2. This fixes the two P1 findings on the user-requested UIUX acceptance increment; it is not a new HTTP/native task or delegated review.

Workspace: `D:\Lua - Pickem\Lua`; branch `agent2-fe`; base `fbdcd485e6204690a868121875ac8dad066c8a1d`. Before any source edit, `git pull --ff-only origin agent2-fe` returned Already up to date; HEAD stayed at that base, status was clean. Supervisor brief/repro read from commit `c8667a609ef246ee7a4731c688fd18eafc3421c1` after fetching `origin/codex/dev/agent-1/data-pipeline`. No shared checkout switch/reset/clean, new thread/Agent, dev/main merge or dependency/native change.

## Before and after

| Requirement | Before (reproduced locally on base) | After / permanent regression |
|---|---|---|
| UIUX-F01 required runtime shape | Missing cart fields, null offer and missing snapshot specifications passed validState; invalid cart sorting could crash instead of recovery | Null-safe guards validate cart/candidate/snapshot/specification/profile fields, numbers, enums, ISO calendar dates, duplicate IDs and references before load/update exposure. Three unit cases and three production-renderer browser cases reject those exact corruptions |
| UIUX-F01 preserve/recover | Malformed v2 entered normal rendering; invalid update could mutate internal state | Failed load preserves exact raw/export value and write-lock. Browser checks recovery/export controls, failed settings write leaving raw unchanged, restart, reset-cancel preserving raw and explicit reset. Update callbacks operate on a clone; invalid update cannot mutate internal committed state or raw |
| UIUX-F01 valid data | V1 migration and valid restart must remain supported | All retained migration/restart tests pass. New valid-state roundtrip retains null budget/baseline/target/sourceUpdatedAt and unknown baseline basis, optional specs and a historical saved-offer ID without inventing data |
| UIUX-F01 reference integrity | Deleting an imported cart left legacy/tracking references | Delete removes its legacy mapping/backup entries, dependent rules and deliveries in the same durable update; browser asserts persisted state and successful restart |
| UIUX-F02 cross-basis | Complete baseline100 versus fresh valid listing90 displayed better-offer; unknown baseline basis did too | Better-offer requires current evidence, freshness, matching currency and equal known price basis. Cross-basis/unknown/stale remain neutral. Compatible different-offer positive control and same-offer signed delta remain intact. No fees are set to zero, no price basis converted |

Runtime validation lives in `src/domain/validation.ts` (primitive/profile/variant guards), `src/domain/carts.ts`, `src/domain/persisted-prices.ts` and `src/storage.ts`. Price entities are still local client persistence types, not an approved wire contract. Missing optional specification values remain omitted; nullable fields remain null. No auto-delete/coercion of bad v2 data occurs. A saved baseline can refer to an offer no longer present, preserving historical snapshots; if that offer is retained, its exact variant must match. Observations, tracking scopes and alert deliveries must resolve to their retained local entities. Validation does not fabricate an offer to repair an orphan.

## Checks actually executed

App cwd `D:\Lua - Pickem\Lua\apps\adviser`; Node v24.18.0 / npm11.16.0 / Windows PowerShell.

| Command | Result |
|---|---|
| git pull --ff-only origin agent2-fe | PASS; Already up to date before edits |
| npx tsx --test src/uiux-fix.test.ts (before source fix) | Expected RED: 5 failed / 1 passed, including all three Supervisor corruption inputs |
| npx playwright test tests/uiux-fix.spec.ts --timeout=10000 (before source fix) | Expected RED: 5 failed / 2 passed against existing base production export; three recovery failures and two basis failures; compatible and signed-delta positive controls passed |
| npm run check (after fixes) | PASS exit0 |
| npm test (after fixes) | PASS45/45, including all39 baseline and6 new tests; one new table exercises39 malformed field/member/reference mutations |
| npm run build (after fixes) | PASS exit0, Expo Metro web export |
| npm run test:e2e (after fixes) | PASS14/14: all5 baseline plus9 regressions (3 recovery,5 price-basis/evidence,1 reference cleanup/restart) |

The pre-fix suite intentionally failed assertions against the defective implementation; no oracle was weakened or baseline test removed. After source guard refinements, npm test was rerun successfully. `tests/fixtures/persisted-state.ts` is synthetic local test input, imported only by tests. The production app does not import it. Browser tests run the actual production export; existing chat tests also use their separately built isolated fixture. No live HTTP/provider or production writes.

No screenshots changed: this increment changes validation/claim conditions, not visual design. The original acceptance captures are retained. Manifest/lockfile, catalog/provenance, native config, backend and pipeline remain unchanged. Price checks and storage tests supply engineering regression evidence, not product/native release acceptance.

Not_run: Android export/APK/install/device/TalkBack/Back/IME/physical wallpaper colors, live chat/provider/Nano, price polling/notification delivery or backend integration. Production chat remains unavailable pending Supervisor's A3-CHAT-01 actual contract/source/fixtures/CORS/runbook. No new HTTP/native task is opened.

Review runbook: use an isolated checkout at the delivered commit, `cd apps/adviser`, then `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm run test:e2e` (Python and Chromium installed). Supervisor owns integration/reconciliation with other UI work. No migration version change is needed: valid v2 is retained, invalid v2 goes to existing explicit recovery, valid v1 migrates through the guarded durable path.
