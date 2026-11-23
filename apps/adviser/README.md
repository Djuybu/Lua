# Lựa frontend

Expo SDK 58 / React Native 0.88 / React 19.3. Entry: index.ts → App.tsx → src/AdviserApp.tsx. Android qua Expo Go là mục tiêu chạy; Expo web dùng cùng giao diện.

Từ repo root dùng `npm start` để chạy API và Expo. Xem [hướng dẫn đầy đủ](../../docs/EXPO_LOCAL.md). Điện thoại cùng Wi-Fi; API được suy ra từ host Expo. Ghi đè bằng EXPO_PUBLIC_API_URL khi cần. API key và DB password chỉ nằm trong `.env` ở root.

Giữ Material You, light/dark/system và bảng màu tùy chọn. Expo Go dùng bảng màu fallback; màu wallpaper cần native development build. Bốn trang: trang chủ, so sánh, giỏ quyết định, cài đặt. Catalog và tìm kiếm nối PostgreSQL/Qdrant, có trạng thái tải/lỗi/thử lại, bộ lọc, sáu bước nhu cầu, xem nguồn và giá quan sát, so sánh tối đa bốn cấu hình, lưu giỏ trên thiết bị. Chat dùng API hội thoại thật, có hủy/thử lại, nguồn, phản hồi dự phòng và xem lại bản nháp trước xác nhận. Lịch sử chat chỉ giữ trong phiên.

Giá chưa gồm phí/ship đã xác minh. Không kết luận phù hợp tác vụ từ thông số hoặc dùng dữ liệu đóng gói để thay thế lỗi mạng. Chưa có đồng bộ giỏ qua tài khoản hoặc mô hình AI trên thiết bị.

Kiểm tra: `npm run check`, `npm test`, `npm run build`, `npm run export:android`. Export Android tạo bundle, chưa phải APK hay xác minh trên điện thoại thật.
