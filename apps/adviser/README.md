# Lựa frontend

Expo SDK 58 / React Native 0.88 / React 19.3. One entry: index.ts → App.tsx → src/AdviserApp.tsx. Android is the delivery target; Expo web previews the same screens.

```powershell
cd "D:\Lua - Pickem\Lua\apps\adviser"
npm ci
npm run web
# Custom Android development build (requires Android SDK/JDK/device):
npm run android
```

## Material You

Settings → Bảng màu Material You: use Android 12+ system colors or choose a seed/custom #RRGGBB. System/light/dark appearance is independent. Theme updates immediately, persists on-device, and refreshes on foreground. @pchmn/expo-material3-theme needs a rebuilt native development client for wallpaper colors; Expo Go/web use a generated fallback. Contrast gates may select the documented accessible fallback. No fixed forest-green identity.

## Features

Four destinations (Home, Compare, Carts, Settings), persistent search and unified filters, six-step intake with exactly three ordered purposes/priorities, draft review/confirmation, PSREF configuration cards and grouped detail, up to four comparison columns, named decision carts with immutable snapshots and atomic Saved v1 migration. Minimum 48 dp actions, semantic labels and reduced-motion-aware press feedback. Settings includes persisted language, appearance, palette, reduced motion and privacy preferences. See [ACCEPTANCE.md](ACCEPTANCE.md) for the latest implementation and evidence boundaries.

The bundled pilot comes from Git d885e33837eab5d3cc473a27b69675f87944cc71. Four retailer configurations; zero approved offers and zero verified capability facts. Snapshot date is historical; no current-price, cheapest, measured-performance or AI success claims are generated. Provenance is in src/provenance.json. Backend contract copies are client snapshots from origin/dev at setup, not a new schema authority.

## Backend

Set EXPO_PUBLIC_API_URL at build/export time to the base URL of the existing services/adviser-backend server. No URL/token form is exposed in Settings. Empty configuration remains unavailable. HTTPS, or HTTP only for localhost, 127.0.0.1 and Android emulator host 10.0.2.2 is accepted; the existing config plugin narrowly allows those native loopback domains. Requests use POST /advisor/v1/recommend, schema 1.0.0 / rule 2026.11, request and profile revision guards, 10s timeout and cancellation. The health probe only enables price tracking UI for an explicit capabilities.priceTracking=true; an injected tracking adapter is still required before starting any tracking operation. No search/detail/AI/tracking endpoint is invented. Web requires an explicitly configured same-origin proxy or backend CORS; this frontend does not weaken backend policy.

Catalog browsing is bundled, not synchronized with server catalog changes. No cloud/Nano provider, signed catalog sync, FastAPI/LangGraph, quote intake or purchasing integration is claimed. These attachment features require source/contracts not present in this checkout. Core browsing works without them.

## Checks

npm run check
npm test
npm run build
npm run export:android
npx playwright install chromium
npm run test:e2e

Android export produces a Hermes bundle, not an APK or native integration certification. Native Material You, TalkBack, Back/IME, rotation and physical performance still require a named installed build/device. Build outputs are ignored. See VERIFICATION.md for observed results.

## Chat preparation

The floating search area opens session-only AI consultation with an injected transport seam and the current search as an editable initial prompt. Default production state is unavailable until the approved backend contract is handed off. See [CHAT_PREP.md](CHAT_PREP.md) for states, proposal confirmation, fixtures and integration dependencies. `npm run test:e2e` builds a separate in-memory fixture; it does not test a live AI provider.
