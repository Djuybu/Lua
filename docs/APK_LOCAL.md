# APK Lựa với backend và AI cục bộ

APK release chứa giao diện và bundle JavaScript, không cần Expo Go, tài khoản Expo hoặc Metro. Backend Node, PostgreSQL, Qdrant và OpenAI vẫn chạy trên máy chủ; chúng không được nhúng vào APK. API key và mật khẩu DB chỉ ở `.env` phía máy chủ.

## Chạy backend

Mở Docker Desktop, sau đó từ `D:\lua`:

```powershell
powershell -ExecutionPolicy Bypass -File tools/Start-Backend.ps1
```

Giữ cửa sổ backend mở. Lệnh dùng các container `lua-postgres`, `qdrant` đã được khởi tạo và catalog đã publish. Nếu cổng 8080 đang có backend hoạt động thì không mở thêm bản thứ hai. Kiểm tra `http://<IP-máy-chủ>:8080/health` trả về `status=ok`. Máy tính và điện thoại cần cùng mạng, và Windows Firewall phải cho phép Node nhận kết nối vào cổng 8080 trên mạng đó.

## Build APK

```powershell
cd D:\lua
powershell -ExecutionPolicy Bypass -File tools/Build-Apk.ps1 -ApiUrl http://172.20.10.4:8080
```

Địa chỉ API được đóng vào bundle release. Khi IP máy chủ thay đổi, build lại APK với địa chỉ mới; không dùng địa chỉ `localhost` cho điện thoại thật. Máy chủ HTTPS có tên miền cố định có thể dùng thay LAN khi đã được triển khai riêng.

APK và `build.json` được đặt trong `artifacts/android`. Script kiểm tra SHA-256 sau khi sao chép; tên file chứa 12 ký tự đầu của hash. Kiến trúc gồm ARM64 cho điện thoại và x86_64 cho emulator. Release hiện ký bằng chứng chỉ debug của Android để cài nội bộ, không phải khóa phát hành Play Store.

## Kiểm tra sau cài

1. Mở APK khi Metro và Expo đã tắt; catalog phải tải từ backend.
2. Tìm kiếm, mở nguồn và thời điểm giá quan sát, so sánh cấu hình.
3. Nhập và xác nhận nhu cầu; lưu giỏ rồi mở lại để kiểm tra dữ liệu lưu.
4. Gửi tin nhắn AI; phân biệt nhãn OpenAI với phản hồi dự phòng. Đề xuất nhu cầu chỉ được lưu sau khi người dùng xác nhận.
5. Tắt backend: ứng dụng phải hiện lỗi/thử lại, không thay bằng catalog fixture.

APK cần backend hoạt động để tải catalog mới và sử dụng AI trực tuyến. Hiện chưa có dữ liệu offer/hiệu năng được duyệt để xác nhận tổng tiền hoặc đáp ứng tác vụ. Giỏ quyết định lưu cục bộ trên thiết bị.
