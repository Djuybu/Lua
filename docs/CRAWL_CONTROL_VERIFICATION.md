# Kiểm chứng cơ chế cập nhật dữ liệu theo yêu cầu

Ngày kiểm tra: 14/11/2026, giờ Việt Nam. Phạm vi: cơ chế crawl, checkpoint, điều khiển trong Cài đặt và tải danh mục lớn. Không xác nhận đã đo lại hiện tượng đơ trên điện thoại vật lý.

## Hành vi đã triển khai

- Khởi động backend/app, tìm kiếm và GET tiến độ không khởi chạy crawler.
- Người dùng bấm cập nhật để tiếp tục queue hiện có: tối đa 50 URL công việc (sitemap/product), 300 giây cào, 2 worker. Request đang thực hiện có timeout riêng trước khi kết thúc.
- Nút tạm dừng ghi yêu cầu stop; các URL chưa hoàn tất trở về pending. Không bỏ mất các URL done hay tiến trình cũ.
- Khóa toàn cục và khóa run-dir chặn chạy chồng lượt. Không truyền action CLI thì chỉ xem trạng thái.
- Không rebuild catalog theo chu kỳ. `--publish` thực hiện tối đa một lần sau đợt hữu hạn, sau khi worker dừng; thời gian build/index tách khỏi ngân sách cào 300 giây. Tạm dừng theo yêu cầu bỏ qua publication chưa bắt đầu.
- Automation `c-o-t-i-a-50-trang-l-c-02-00` đã tạo ACTIVE cho 02:00 hằng ngày theo thời gian client Asia/Saigon. Lệnh dùng `--daily`, giới hạn một đợt mỗi ngày Việt Nam và bỏ qua ngoài khung 02:00–02:59. Chưa đến lượt chạy đêm đầu tiên; không coi kiểm thử clock giả lập là một lượt chạy đêm thật.
- Giao diện chỉ dựng tối đa 24 thẻ/trang. API tư vấn PostgreSQL tải offers bằng một truy vấn cho toàn bộ variants thay vì một truy vấn cho mỗi variant.

## Kết quả

| Kiểm tra | Kết quả |
|---|---|
| Pipeline Python, gồm resume/pause/deadline/daily lock và báo lỗi worker | 58/58 passed |
| Backend TypeScript và tests, gồm hồi quy 1.000 variants/1 batch offers | Typecheck passed; 56/56 tests passed |
| App TypeScript và unit tests | Typecheck passed; 45/45 tests passed |
| Điều phối process Node, concurrent resume/read-only/pause/stale PID | 5/5 passed |
| Playwright với 1.800 variants mô phỏng ở 390px và 1280px | 2/2 passed |
| Web export | Passed |
| Android Hermes bundle export | Passed; artifact ở `artifacts/crawl-control-verification/android/` |
| Impeccable detector trên các màn hình sửa | Không có finding |
| git diff --check | Passed |

Các kiểm thử HTTP cục bộ/hard link trong suite pipeline được chạy lại ngoài sandbox vì sandbox chặn socket và hard link. Không nới guard crawler. Kiểm thử trình duyệt mock retailer/catalog/control responses, không gửi request tới nhà bán lẻ.

## Backend thật sau khi áp dụng

Đã thay tiến trình backend Lựa bằng mã mới, giữ nguyên Expo đang chạy. Kiểm tra lúc 18:34 ngày 14/11/2026:

- Health PostgreSQL/Qdrant: `ok`.
- Catalog thật: 959 cấu hình; lần gọi đo được 62 ms.
- API tư vấn: 85 ms; `NO_VERIFIED_OFFER`, không tự khẳng định giá đã duyệt.
- Crawler: `running=false`.
- Checkpoint trước/sau các lệnh GET và tư vấn: không thay đổi.

Các số đo là một lần kiểm tra trên máy hiện tại, không phải benchmark trên điện thoại. Không khởi chạy crawl thật để kiểm chứng giao diện. Dữ liệu và hàng đợi cũ được giữ lại.

Artifact: `artifacts/crawl-control-verification/live-api.json`; ảnh ở `apps/adviser/verification/crawl-control-390.png` và `crawl-control-1280.png`. Hướng dẫn vận hành tại [FULL_CRAWL.md](FULL_CRAWL.md).
