# UI/UX acceptance implementation — 14 November 2026

Task: A2-UIUX-ACCEPTANCE (direct user request to implement the attached acceptance plan). Workspace `D:\Lua - Pickem\Lua`, branch `agent2-fe`, base HEAD `fa468aed3271e0b2cd5e0566b931ceeea80546d8`. This increment is separate from the already accepted A2-CHAT-PREP-01 preparation. It does not enable live chat.

Input: user attachment UIUX_ACCEPTANCE_IMPLEMENTATION_PLAN.md, SHA256 `deece2cc4f99437fccfb1685d01d28c65c03eaa387b01893d75da304916dac09`. The existing Expo/Metro application is authoritative for implementation; references in the attachment to a Vite/FastAPI/Hybrid/Nano installation are not evidence that those systems exist here.

## Requirement and evidence map

| Plan section / AC | Implementation / owner | Verification and remaining gate |
|---|---|---|
| 0 composition | Agent2: AdviserApp composes screens, filter/search/detail/cart components, pure domain modules | TypeScript; browser journeys |
| 1 navigation/search | Four destinations; persistent search above navigation; changing query returns Home; filters/Device Advisor/AI actions; prior saved/explore aliases | journey.spec.ts acceptance journey; AC-NAV unit |
| 2 unified filters | Draft/apply/cancel/reset; category, source, brand, condition, price, RAM/storage/GPU/screen/weight and sorting; unknowns fail strict constraints | AC-FILTER unit checks and browser zero-match/reset. Fit ranking remains neutral until verified recommendation data exists |
| 3 Material You | @pchmn/expo-material3-theme retained; semantic surface/primary/secondary/tertiary roles, custom seed, light/dark/system and reduced motion | Browser palette and locale restart checks; compact and expanded captures visually inspected. Android wallpaper/device validation not_run |
| 4 PSREF listing | Nine spec rows, full product title, source and explicit unknown price/condition, one compact/two expanded columns | Browser detail/card journey and expanded capture. Retailer strings are source labels, not verified manufacturer facts |
| 5 layout | 16dp grid gaps, stable 2dp card border, odd expanded card retains half width | Visual capture; native font scaling/physical layout not_run |
| 6 settings | Build-time EXPO_PUBLIC_API_URL, automatic configured health probe, no URL/token form, persisted locale/motion/palette/privacy, bounded redacted diagnostics and explicit report sharing | AC-HEALTH and AC-LOG unit checks; settings browser restart. English product/source/user-authored text is preserved. Full bilingual native acceptance remains a manual gate |
| 7 compare | Winner-only accent/bold with non-color Award marker; numeric RAM/storage higher, price/weight lower; ties/unknown/CPU/screen neutral | AC-COMPARE unit checks; renderer typechecked. No unknown prices are filled |
| 8 detail specs | Four grouped sections, fixed left labels and left aligned values | Browser asserts specs group; native assistive reading order not_run |
| 9 detail overview | Factual hardware highlights, exact family siblings, source/unknown cost section | Browser detail journey; no invented benchmark strengths |
| 10 decision carts | Named purpose/budget/note carts; immutable candidate variant/profile/baseline; exact configuration dedup; archive/restore/delete confirmation; contextual 2–4 compare; local search/sort | AC-CART and AC-MIGRATE units; browser create/restart/delete-cancel and actual v1 migration/restart |
| 10 tracking boundary | Six client-domain entity types; same-offer/same-basis signed delta; zero baseline has no percent; 24h freshness; exact variant matching; target-event dedup | AC-PRICE units. Tracking UI hidden unless health explicitly advertises true; sheet cannot start without injected adapter. No tracking endpoint, poller, scheduler, provider or notifications are implemented |

## Storage and truthfulness

The existing local key `lua-adviser-v1` is retained, with version 2 content. Migration validates and writes the entire next state atomically before exposing it as committed. It retains the original raw value as `legacyRaw`, the original `saved` entries and a legacy-to-candidate map. Reload does not reimport. Write failure retains the old raw data and blocks writes pending explicit recovery. Explicit deletion removes affected personal backup data to avoid restoring a deleted cart. No chat transcript/session persistence was added.

The unchanged bundled dataset has four variants, zero offers and zero verified facts. Baseline/latest prices, fees and fit remain unknown without verified input. There is no checkout total. Local price entities/helpers are client state, not an approved backend wire contract. Price changes across retailers are not labelled same-offer drops. Future ingestion must validate currency, variant, condition and price basis before persisting observations.

Chat remains production unavailable; session state, cancel/late response, revision guards, review/cancel/confirm and durable CAS are preserved. Offline-only preference disables network recommendation/chat. No local AI model or provider is claimed ready. Actual A3-CHAT-01 source SHA, contract, fixtures, CORS and runbook must be supplied by Supervisor before an HTTP adapter task.

## Commands executed for this increment

Runtime: Windows PowerShell, Node v24.18.0, npm 11.16.0. Commands below run from `apps/adviser`.

| Command | Actual result |
|---|---|
| npm run check | PASS, TypeScript |
| npm test | PASS, 39/39: 25 retained + 14 acceptance unit checks |
| npm run build | PASS, Expo Metro web export |
| npm run test:e2e | PASS, 5/5 Chromium journeys: acceptance, v1 migration, CHAT-U01–03 |

One initial `npm run check` invoked from repository root failed ENOENT because the root has no package.json; it was corrected to the app directory. During implementation a missing priceMetadata declaration failed TypeScript and was corrected before the successful checks above. No tests were removed to mask failures.

`npm run test:e2e` builds the isolated chat fixture on port 4174; main production export is served on 4173. The fixture uses in-memory transport, not live HTTP/provider inference. The new AC-MIGRATE browser case uses an explicit historical v1 fixture to exercise real storage migration; no fabricated offers enter production. Browser viewports: 390×844, 768×1024 and 1280×900. Captures: acceptance-compact-settings.png, acceptance-expanded-catalog.png, chat-confirmed.png, chat-fixture-fallback.png.

`npm run test:host-feature`: not_run, no such manifest script in this Expo app; the actual host feature checks are the Playwright journeys above. Native export was not repeated because dependencies/native configuration were unchanged. Native APK build/install, TalkBack, Android Back/IME, physical Material You, rotation/recreation/performance, notification delivery, live backend/provider, signed catalog sync and backend tracking: not_run. The older VERIFICATION.md results are historical and are not new runs.

## Integration runbook

1. Review/cherry-pick this branch in an isolated checkout; Supervisor owns reconciliation with overlapping integration UI WIP. Do not overwrite the shared checkout or merge main/dev from Agent2.
2. `cd apps/adviser`; `npm ci`; `npm run check`; `npm test`; `npm run build`; `npm run test:e2e` (Chromium and Python required). No dependency, manifest, root lockfile, data artifact, backend or native config change is required.
3. Configure EXPO_PUBLIC_API_URL before web/native export only after the real server/CORS is available. An empty variable keeps connection features unavailable. Only health/recommend use existing routes; no chat/tracking route is guessed.
4. Supervisor assigns live chat/tracking adapters after actual contract/source delivery. Device acceptance needs a named Android SDK/JDK/device/build inventory; no native completion estimate is made here.
