# Lựa frontend

Expo SDK 58 / React Native 0.88 / React 19.3. Entry: index.ts → App.tsx → src/AdviserApp.tsx. Android qua Expo Go là mục tiêu chạy; Expo web dùng cùng giao diện.

Từ repo root dùng `npm start` để chạy API và Expo. Xem [hướng dẫn đầy đủ](../../docs/EXPO_LOCAL.md). Điện thoại cùng Wi-Fi; API được suy ra từ host Expo. Ghi đè bằng EXPO_PUBLIC_API_URL khi cần. API key và DB password chỉ nằm trong `.env` ở root.

Giữ Material You, light/dark/system và bảng màu tùy chọn. Expo Go dùng bảng màu fallback; màu wallpaper cần native development build. Bốn trang: trang chủ, so sánh, giỏ quyết định, cài đặt. Catalog và tìm kiếm nối PostgreSQL/Qdrant, có trạng thái tải/lỗi/thử lại, bộ lọc, sáu bước nhu cầu, xem nguồn và giá quan sát, so sánh tối đa bốn cấu hình, lưu giỏ trên thiết bị. Chat dùng API hội thoại thật, có hủy/thử lại, nguồn, phản hồi dự phòng và xem lại bản nháp trước xác nhận. Lịch sử chat chỉ giữ trong phiên.

Giá chưa gồm phí/ship đã xác minh. Không kết luận phù hợp tác vụ từ thông số hoặc dùng dữ liệu đóng gói để thay thế lỗi mạng. Chưa có đồng bộ giỏ qua tài khoản hoặc mô hình AI trên thiết bị.

## Features

Four destinations (Home, Compare, Carts, Settings), persistent search and unified filters, six-step intake with exactly three ordered purposes/priorities, draft review/confirmation, PSREF configuration cards and grouped detail, up to four comparison columns, named decision carts with immutable snapshots and atomic Saved v1 migration. Minimum 48 dp actions, semantic labels and reduced-motion-aware press feedback. Settings includes persisted language, appearance, palette, reduced motion and privacy preferences. See [ACCEPTANCE.md](ACCEPTANCE.md) for the latest implementation and evidence boundaries.

The bundled pilot comes from Git d885e33837eab5d3cc473a27b69675f87944cc71. Four retailer configurations; zero approved offers and zero verified capability facts. Snapshot date is historical; no current-price, cheapest, measured-performance or AI success claims are generated. Provenance is in src/provenance.json. Backend contract copies are client snapshots from origin/dev at setup, not a new schema authority.

## Backend

Web and native builds default to `https://lua-adviser.vercel.app`, whose `/health` and `/advisor/v1/*` rewrites forward to the GCP backend. Android Studio/APK builds do not need an environment variable or browser origin for this default. An optional build-time `EXPO_PUBLIC_API_URL` overrides the base URL; unset, empty and whitespace-only values use the default gateway. Do not append `/advisor/v1` to this variable. No URL/token form is exposed in Settings. Native builds use HTTPS without enabling public cleartext HTTP. Hosting the web app on another domain requires the backend/proxy to allow that web origin; native apps do not use browser CORS.

At startup, the app loads `/advisor/v1/catalog` with a 10-second timeout and uses the bundled snapshot if the request or response validation fails. Endpoint configuration does not itself prove connectivity. After changing the endpoint code or environment, rebuild/re-export the web app and rebuild the JavaScript bundle packaged in the APK; existing installed APKs do not update automatically. The native default depends on the Vercel proxy remaining available. A future direct GCP endpoint should use an HTTPS API domain.

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

Kiểm tra: `npm run check`, `npm test`, `npm run build`, `npm run export:android`. Export Android tạo bundle, chưa phải APK hay xác minh trên điện thoại thật.
