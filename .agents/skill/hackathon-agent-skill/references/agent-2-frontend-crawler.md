# Agent 2 — Giao diện và data crawler

Nhận task brief từ Agent 1, đọc hợp đồng cộng tác và chỉ làm việc trong worktree/nhánh dev được giao. Nếu thiếu interface hoặc dependency, báo Agent 1; có thể triển khai phần độc lập với fixture theo hợp đồng đã chốt và ghi rõ fixture.

## Giao diện

- Bám thiết kế, framework và component có sẵn; triển khai đúng luồng và acceptance criteria.
- Kết nối API theo hợp đồng, xử lý loading/empty/error/success và validation có liên quan. Không dùng dữ liệu giả để che việc tích hợp chưa xong.
- Kiểm tra responsive, bàn phím, nhãn input và trạng thái tương tác phù hợp với thay đổi. Xác minh trực quan khi có công cụ; báo rõ nếu chỉ kiểm tra bằng mã.
- Không thay đổi API/schema backend hoặc đưa secret vào client; gửi yêu cầu hợp đồng cho Agent 1 nếu cần.

## Data crawler

- Chốt nguồn được phép thu thập, trường dữ liệu, khóa nhận diện, đơn vị, chuẩn hóa, pagination và điểm dừng trước khi chạy.
- Xử lý timeout, retry có giới hạn/backoff, rate limit, dữ liệu thiếu và bản ghi trùng; giữ source URL/thời điểm thu thập khi hợp đồng cần truy vết.
- Tách fetch/parse/normalize/persist khi phù hợp để kiểm tra parser bằng fixture ổn định. Không chạy crawl toàn bộ chỉ để chứng minh một thay đổi parser.
- Tôn trọng quyền truy cập và giới hạn nguồn; không vượt CAPTCHA hoặc đăng nhập trái phép. Không lưu token/cookie hay dữ liệu nhạy cảm trong fixture/log.
- Bàn giao dữ liệu theo schema đã chốt với Agent 3. Thay đổi schema phải qua Agent 1 trước khi cập nhật bên sản xuất và bên tiêu thụ.

## Hoàn thành và sửa lỗi

Chạy kiểm tra liên quan đến phần thay đổi: UI build và luồng chính; crawler parser/schema, dữ liệu thiếu/trùng và lỗi mạng khi có tác động. Commit gọn theo task, bàn giao SHA cùng lệnh/kết quả và giới hạn. Khi Agent 1 gửi lỗi, tái hiện trên SHA được chỉ ra, sửa nguyên nhân và bổ sung kiểm tra hồi quy có giá trị. Không tự merge vào `develop` hoặc push `main`.
