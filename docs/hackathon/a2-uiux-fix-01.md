# A2-UIUX-FIX-01 — owner implementation fixes

Status: ready / changes_requested from Supervisor review of A2-UIUX-ACCEPTANCE. User-authorized frontend implementation and continued coordinator bug dispatch remain in effect.

- Owner: Agent2, existing FE thread on HCN_main.
- Workspace: `D:\Lua - Pickem\Lua`; keep user-selected branch `agent2-fe`.
- Baseline: `fbdcd485e6204690a868121875ac8dad066c8a1d`. Verify actual HEAD/status before editing and preserve newer owned/user changes; report any baseline movement.
- Ownership: `apps/adviser/**` only (UI/domain/storage, tests, app docs). No BE/pipeline/root lockfile, dependency/native changes or new thread/Agent.
- Evidence: `docs/hackathon/reviews/A2-UIUX-ACCEPTANCE/{README.md,report.json,corruption-probe.ts,browser-probe.mjs}` on Coordinator task branch.

## Required implementation and acceptance

| ID | Change | Acceptance / regression |
|---|---|---|
| FIX-01 / UIUX-F01 | Harden v2 persisted cart/candidate/price/tracking validation before load/update exposure | Required UI-read fields, snapshot shape, numeric/enum/date/reference integrity checked safely; unknown nullable values remain valid where defined. Bad carts, null collection members and missing specifications rejected. load failure preserves raw bytes, keeps writes locked, shows export/recovery UI without render crash; restart/valid v1 migration remain correct |
| FIX-02 / UIUX-F02 | Guard better-offer display by actual comparability | Complete baseline100 vs listing90 cannot show “better offer”, price-drop or affordability claim. Different/unknown basis stays neutral. Existing same-offer/same-basis signed deltas and compatible positive controls remain correct, without invented charges |

Use the existing source and relevant hackathon collaboration/UI skill instructions. Avoid a broad redesign; keep current Material You, Carts, 3/3 needs, fixtures-isolated production boundary, unknown data handling, privacy settings and original user requirement mapping.

Supervisor has independently run typecheck/39 unit tests/build/5 browser journeys successfully. Additional probes prove both defects (three unit failures and two browser failures, with two browser positive controls). They are not waived by green retained suites. Add meaningful permanent regression coverage in the owner test suite; the Supervisor probes are reproduction inputs, not a requirement to keep a particular test implementation.

Run from apps/adviser: `npm run check`, `npm test`, `npm run build`, `npm run test:e2e`; include corrupt-state recovery/write-lock and cross-basis UI negative case in the final evidence. No need repeat Android export when native/config remain unchanged. Keep raw/probe data synthetic and local; no provider/production writes.

Commit/push `agent2-fe` normally, verify remote SHA; no dev/main merge or force/reset/clean/checkout over shared work. Callback completed/blocked to Supervisor environment `0d643e83-f77e-4710-96b0-3f8b4d2c8fc9`, thread `8a87aa59-85d2-41db-8572-751ac87fd1b2`, with task/status, base/head/ref, changes, commands/results, before/after defects and remaining gates. Do not self-open another task; if callback fails, push report and state the exact error.
