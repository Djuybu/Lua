# Chạy Lựa bằng Expo Go

Từ `D:\lua`, cài dependencies một lần:

```powershell
npm --prefix services/adviser-backend ci
npm --prefix apps/adviser ci
```

PostgreSQL và Qdrant cần chạy và đã có catalog được publish bằng warehouse pipeline. Cấu hình kết nối và API key nằm trong `.env` ở repo root:

```dotenv
API_KEY=""
DB_PASSWORD=""
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=laptop
PGUSER=postgres
QDRANT_URL=http://127.0.0.1:6333
AI_MODEL=gpt-4.1-mini
```

Không chép API key hoặc mật khẩu DB vào biến `EXPO_PUBLIC_*`. `AI_MODE=fallback_only` tắt gọi nhà cung cấp. Khi có key, runtime mặc định dùng provider; khi thiếu key, runtime thông báo phản hồi dự phòng. Chat giới hạn 100 lượt gọi mỗi process, một lượt đồng thời, timeout 12 giây. Model chỉ chọn dữ liệu catalog và đề xuất nhu cầu có kiểm tra; không viết thêm thông số hoặc giá.

```powershell
cd D:\lua
npm start
```

Lệnh mở API port 8080 và Expo port 8082, ưu tiên IP Wi-Fi. Điện thoại Android dùng cùng mạng với máy tính. Expo Go và Expo CLI phải đăng nhập cùng tài khoản Expo; dùng `npx expo login` từ `apps/adviser` nếu chưa đăng nhập. Quét QR trong terminal hoặc mở địa chỉ `exp://<IP-Wi-Fi>:8082`. Firewall cần cho phép Node trên mạng đang dùng. API được suy ra từ host của Expo; không nhập cấu hình API vào giao diện. `EXPO_PUBLIC_API_URL` có thể ghi đè địa chỉ cho môi trường khác. Tunnel Expo đơn lẻ không tunnel API: dùng cùng mạng LAN cho luồng này.

Giao diện giữ Material You; Expo Go dùng bảng màu fallback vì module lấy màu wallpaper cần development build. Có danh mục và tìm kiếm Qdrant, bộ lọc, sáu bước nhập nhu cầu, xác nhận, so sánh, giỏ quyết định lưu trên thiết bị, nguồn và thời điểm giá quan sát, chat AI có nguồn, xem lại và xác nhận bản nháp. Khi mất backend, hiện lỗi và nút thử lại; không thay bằng dữ liệu fixture.

Giá crawl là giá quan sát, chưa phải tổng giá phải trả. Chưa có offer và bằng chứng hiệu năng được duyệt nên hệ thống giữ trạng thái chưa đủ căn cứ thay vì xác nhận đáp ứng ngân sách/công việc. Lịch sử chat chỉ nằm trong phiên; nội dung gửi chat được chuyển cho backend và OpenAI, với `store:false`.
