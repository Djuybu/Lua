# Supervisor review — A2-UIUX-ACCEPTANCE

Status: **changes_requested** at `fbdcd485e6204690a868121875ac8dad066c8a1d`. Two reproducible P1 findings block accepting this increment for integration. No application source was changed by Supervisor.

The new implementation is directly user-authorized in Agent2 history (the acceptance-plan request), including four destinations/Carts. Review uses the committed ACCEPTANCE.md map, source and callback. The attachment hash is the handoff's reported input identity; Supervisor did not independently obtain/hash the original attachment bytes.

## Findings

### UIUX-F01 / P1 — malformed v2 state bypasses recovery and crashes the app

Locations at the reviewed pin: `src/storage.ts:65`, `src/domain/carts.ts:139`, and the cart-date sort in `src/screens/CartsScreen.tsx`.

`validState` validates new price/tracking collections as arrays only. `validCartData` accepts carts without timestamps/useCase/note and candidate snapshots without ProductVariant specifications. These values are then treated as validated state by `createStore.load`.

Repro: persist version 2 with otherwise normal empty state and two carts `{id,title,currency:'VND',budget:null}`. Load succeeds; mounted CartsScreen calls `b.updatedAt.localeCompare(...)` and Chromium reports `Cannot read properties of undefined (reading 'localeCompare')`. No recovery notice is visible. The failure occurs even when the cart screen is hidden at startup.

Three additional unit probes also fail: malformed cart, `[null]` in offers, and snapshot missing specifications all return true from `validState`.

Expected: validate required persisted fields and references before exposing state. Malformed data must fail load safely, keep the original raw data exportable and keep writes locked until explicit recovery. Preserve valid legacy/nullable data; do not fill missing facts or prices to pass validation.

### UIUX-F02 / P1 — incompatible price bases still produce a better-offer claim

Location at the reviewed pin: `src/components/CartCandidateCard.tsx:85`.

The `different_offer` branch shows “Ưu đãi tốt hơn” whenever the new numeric amount is below the baseline. However, `priceComparison` also returns `different_offer` when price bases differ, not just when retailer identity differs.

Repro with explicitly synthetic browser state: exact same variant, saved baseline 100 VND with basis `complete`, new available/valid/fresh observation 90 VND with basis `listing`, from a different offer. The real Card renderer displays “Ưu đãi tốt hơn” despite unknown additional charges. The browser probe records `actualBetterClaim:true` where false is expected.

Expected: show the different offer/basis neutrally when comparisons are incompatible or insufficiently evidenced. Only claim a better offer after the necessary comparability checks. Preserve the signed delta's existing same-offer/same-basis rule; never coerce a listing price into complete total.

## Verification

Source was extracted directly from Git objects into an OS temporary directory. All 69 tracked app/context files were pinned; source remains byte-identical after checks. The existing browser suite regenerates verification PNGs, which are recorded separately from source. Source tree is `c51e6547069b10206e8bc55c27bf0867e2ae4216`; callback lock/catalog/provenance blobs and initial screenshot hashes match.

| Check run by Supervisor | Result |
|---|---|
| npm ci | exit 0 |
| npm run check | exit 0 |
| npm test | 39 pass / 0 fail |
| npm run build | exit 0 |
| npm run test:e2e | 5 pass / 0 fail, Chromium |
| corruption-probe.ts | 0 pass / 3 fail, exit 1 |
| browser-probe.mjs | 2 pass / 2 fail, exit 1 |

Browser negative cases exercise the real production build and renderer; health requests are intercepted, and only local synthetic storage is used. Positive controls confirm restored offline preference sends no health request and online mode attempts exactly the configured `/health`. No offline defect is asserted. The failing cases are malformed v2 recovery and incompatible price-basis promotion. Initial probe harness issues (bounded wait and Unicode selectors passed through PowerShell) were corrected before the final four-case result; they are not product findings.

The native/physical-device/IME/Back/TalkBack/performance and live provider/chat/tracking/notifications gates remain not_run. The two newly regenerated compact/expanded Chromium captures were inspected, without treating them as Android device acceptance. No additional cosmetic findings are raised.

## Reproduction

Prepare a temporary folder containing this commit's `apps/adviser/**`, with dependencies installed there. Place the committed `corruption-probe.ts` and `browser-probe.mjs` in that folder's root (next to `apps`).

1. From apps/adviser run `node node_modules/tsx/dist/cli.mjs --test <temporary-root>/corruption-probe.ts`.
2. For the browser probe, export from apps/adviser with `EXPO_PUBLIC_API_URL=https://acceptance.invalid` and `expo export --platform web --output-dir dist-offline-probe`. This is only a test configuration.
3. Run `node <temporary-root>/browser-probe.mjs`. Its own ephemeral loopback static server and Chromium are closed in finally. The invalid host is intercepted; no external request is sent.

Full commands, runtime, source/evidence hashes and logs are in report.json and neighboring files. The failed probes intentionally return nonzero. Do not replace expectations with current behavior.

## Next action

Owner implementation fix: A2-UIUX-FIX-01, same branch `agent2-fe`, starting from fbdcd48 or a newer explicitly identified owned HEAD. Add durable-state validation/recovery and price-comparability regressions; rerun affected checks and retained suites, then callback Supervisor. This is an owner code fix, not a delegated review/re-check. No new HTTP/native feature task is opened; A3 dependency remains separate.
