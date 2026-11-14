# Frontend verification — 14 November 2026

A2-UIUX-FIX-01 supersedes the acceptance increment totals: TypeScript, 45/45 unit tests, web export and 14/14 browser tests passed after the two P1 fixes. See [UIUX_FIX_01.md](UIUX_FIX_01.md) for before/after repro, permanent regressions, validation boundaries and native/live gates.

Latest acceptance increment: see [ACCEPTANCE.md](ACCEPTANCE.md). Current results are 39/39 unit checks and 5/5 browser journeys, TypeScript and web export passed. The sections below preserve historical evidence and do not represent additional runs.

New frontend implementation in the existing checkout. No backend/pipeline files modified. No commit or push.

| Check | Observed result |
|---|---|
| npm run check | Passed TypeScript |
| npm test | 11/11 tests passed; profile/budget/taxonomy/category invalidation, storage write-lock/serialization/write failure, request envelope and stale/unsafe response rejection |
| npm run build | Passed Metro web export |
| npm run export:android | Passed Hermes Android JavaScript export to dist-android; not an APK |
| npx expo-doctor | 20/20 checks passed |
| npx expo install --check | Dependencies compatible |
| npm run test:e2e | 1 multi-step Chromium journey passed at 390x844 and 1280x900 |
| impeccable detect --json apps/adviser/src | [] |

Browser journey: guest launch, needs selection3/3, zero-budget error, confirm, reopen/cancel, search empty/recovery, detail, save, reload, custom palette persistence, delete cancel/confirm/restart, dark appearance persistence. Selected web controls expose aria-pressed. Captures in verification/: compact-settings.png, compact-dark.png, expanded-catalog.png. Compact settings and expanded catalog were visually inspected.

Earlier failures resolved: package peer version conflict, missing status-bar import (replaced with React Native StatusBar), missing Node test type declarations, theme hook options not updating theme (explicit update/reset), browser binaries pending install, and web selection semantics. Final successful commands above are after corrections. No test assertions removed to conceal a product failure.

Not run: native APK build/install, physical wallpaper-derived colors, TalkBack, native Back/IME/rotation/recreation/performance, real backend HTTP end-to-end, live AI/Nano. ADB was not on PATH. Client HTTP tests use an injected fetch response and are not live-provider evidence. Browser uses generated Material fallback, not actual Android wallpaper colors.

Attachment parity remains bounded by missing services: no FastAPI/LangGraph/Nano bridge/signed catalog publication or approved offer/fact API in this checkout. Catalog is a dated four-variant development seed. Source-bound identifiers are not manufacturer-verified equivalence. Browser recommendation connections need same-origin/CORS configured by backend. Build web bundle is about 3MB uncompressed; broader catalog scalability and split-loading remain follow-up work.

## A2-CHAT-PREP-01 — 14 November 2026

The chat preparation increment supersedes the initial test totals above: npm run check passed, npm test 25/25 passed, npm run build passed, npm run test:e2e 4/4 Chromium journeys passed (production plus injected fixture). See CHAT_PREP.md for CHAT-P01–14/CHAT-U01–03, source/transport boundary, runbook and limits. These tests use a labelled in-memory transport, not live chat HTTP/provider inference. The original 11 tests remain included. Material You/native configuration and dependency lockfile are unchanged; Android export was intentionally not rerun. Native/HTTP integration remains not_run pending Supervisor's A3-CHAT-01 contract/source handoff.
