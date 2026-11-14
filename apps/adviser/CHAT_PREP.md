# A2-CHAT-PREP-01 — transport-independent chat preparation

User-authorized owner implementation, pinned brief 84051ae0e3475018b579bc63b4388e93e6631dc3:docs/hackathon/be-chatbot-priority.md. Base cc065d38fae6a18738fec6479f2264e5fb7ef1e6, branch agent2-fe. No backend, pipeline, native config or dependency changes. No Cart page added.

## Implemented boundary

src/chat.ts defines UI view models only, NOT an approved Agent3 wire schema. ChatTransport receives text, bounded session history and profile revision plus AbortSignal. It returns display text, provider/fallback attribution, HTTPS source links and an optional validated Draft/baseProfileRevision proposal. Mapping the future backend contract to these view models remains a separately authorized integration task.

Production index.ts → App.tsx supplies no transport. The chat area in Tư vấn reports unavailable and never calls a guessed chat URL. src/AdviserApp.tsx accepts an optional chatTransport prop for later composition; the existing recommend client is unchanged. No paid provider, Nano, AI extraction or chat HTTP success is claimed.

ChatController owns a maximum 40 visible messages, 4000-character user messages, bounded replies/sources, single in-flight send, 15-second timeout, abort, late-result suppression and profile revision invalidation. Retry preserves one user turn and does not duplicate that turn in transport history. Provider errors become safe local messages. Unmount aborts and cleans listeners/timers. Session chat/history/input are never written to AsyncStorage.

ChatPanel is mounted across tab changes, preserving session messages; leaving Tư vấn cancels pending work/proposals. Reply attribution distinguishes provider from fallback and discloses missing provenance. It uses the shared Material You theme, 48dp actions, input labels, live status announcements, and returns input focus after send/cancel/error. Proposal review shows all proposed needs separately. Cancel does not mutate confirmed needs. Confirmation validates 3/3/budget and performs a compare-and-set on the existing serialized durable store; ACK follows successful storage. Write failure keeps proposal and confirmed state. Duplicate confirmation is guarded.

## Tests and runbook

From apps/adviser:

- npm run check — TypeScript passed.
- npm test — 25/25 passed: 11 existing tests plus CHAT-P01–14.
- npm run build — production web export passed.
- npm run test:e2e — builds the isolated fixture then runs 4 Chromium tests: existing journey and CHAT-U01–03.
- impeccable detect --json apps/adviser/src/ChatPanel.tsx apps/adviser/src/AdviserApp.tsx — [].

CHAT-P01 empty/unavailable; P02 double send; P03 cancel/late; P04 revision change; P05 safe error/retry; P06 review/cancel; P07 durable commit/write failure; P08 invalid/stale proposal; P09 timeout; P10 dispose; P11 provider/provenance/unsafe links; P12 retry history; P13 double confirm; P14 idle navigation retains completed-state semantics. Mapped to BR-02/03/07/11, AC-U01-04 and AC-UX02/04/05. Unit pack U06 means decision transitions, not quotation journey U06.

CHAT-U01 runs production unavailable UI and verifies input focus/no session persistence. U02 uses a clearly labelled injected in-memory fallback fixture for sending/cancel/error/retry/focus, tab retention and compact layout. U03 exercises proposal cancel, browser storage fault injection, durable confirm/reload, and cleared conversation after reload at expanded width. These are browser/fixture tests, NOT live backend chat/provider E2E. A test selector initially matched draft-preview text; it was corrected to check localStorage and confirmed-profile controls without weakening the oracle.

The fixture lives ONLY in tests/chat-ui, has its own entry, and is not imported by production. Playwright starts two loopback static servers (4173 production dist, 4174 fixture dist) and shuts them down. npm run build:chat-fixture creates ignored dist-chat-fixture. No fixture controls or providers are installed in the normal app. Evidence: verification/chat-fixture-fallback.png and chat-confirmed.png.

## Outstanding dependency

Await Supervisor handoff of A3-CHAT-01 source SHA, runtime request/response/error contract, provider/fallback semantics, provenance fields, cancellation and CORS/same-origin runbook. Only then implement an HTTP adapter. The real catalog still contains four variants, zero approved offers, zero verified facts, unknown fees; none were replaced to pass tests. Native APK/IME/TalkBack/physical-device acceptance and live HTTP/provider checks are not_run; Android export intentionally not repeated because no native/config changes occurred.

No automatic next task or dev/main merge. Commit/push stays on agent2-fe; callback includes exact source and evidence fingerprints.
