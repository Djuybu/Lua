# Crawl toàn bộ danh mục thiết bị

Checkpoint hiện có: `tools/data-pipeline/.work/inventory-20261114/`. Mở ứng dụng, tìm kiếm hoặc xem tiến độ chỉ đọc dữ liệu đã lưu, không khởi động crawler. Crawler chỉ chạy khi bấm **Cài đặt → Cập nhật dữ liệu → Cập nhật thêm 50 trang**, chạy lệnh `--resume`/`--start` rõ ràng, hoặc đến lượt automation 02:00 hằng ngày theo giờ Việt Nam.

Phạm vi là các URL sản phẩm điện thoại, máy tính bảng, laptop và PC trên 8 nguồn đã cấu hình: CellphoneS, TGDD, Điện Máy Xanh, FPT Shop, LaptopAZ, ShopDunk, Oneway và Trung Trần. Sitemap sản phẩm được duyệt đến hết hàng đợi; không giới hạn một trang mẫu mỗi nguồn. URL phụ kiện/tin tức được lọc khỏi phạm vi, và parser còn kiểm tra lại trang chi tiết trước khi nhập. Sitemap hoặc sản phẩm lỗi vẫn có checkpoint và mã lỗi. `exhausted` chỉ có nghĩa hết các URL được phát hiện trong phạm vi của lượt quét; không chứng minh đã lấy mọi cấu hình ẩn sau JavaScript hoặc URL không được sitemap công bố.

Mỗi lượt tối đa **50 URL công việc** (gồm sitemap và trang sản phẩm), **300 giây**, và **2 worker**. Giới hạn 50 được chia sẻ giữa các worker. Đến giới hạn thì lưu hàng đợi và tạm dừng; request đang chạy được hoàn tất hoặc hết timeout trước khi thoát. Lần sau chỉ tiếp tục URL pending; URL done không bị cào lại. Lỗi/crash để lại URL running được trả về pending khi có yêu cầu tiếp tục rõ ràng.

Mỗi nguồn được xử lý tuần tự, cách request tối thiểu 5 giây hoặc crawl-delay lớn hơn do nguồn công bố. Không vượt robots, CAPTCHA, HTTP 401/403; lỗi truy cập kéo dài làm worker dừng với trạng thái blocked. Raw HTML nén và dữ liệu cấu trúc được giữ trong thư mục run để truy vết.

Từ `D:\lua\tools\data-pipeline`:

```powershell
# Xem trạng thái, không tạo một lượt crawl khác.
.work/warehouse-venv/Scripts/python.exe -m scripts.crawl_inventory --run-dir .work/inventory-20261114 --status
# Không truyền action cũng chỉ xem trạng thái, không tự resume.
.work/warehouse-venv/Scripts/python.exe -m scripts.crawl_inventory --run-dir .work/inventory-20261114

# Yêu cầu dừng có lưu checkpoint. Các request đang thực hiện sẽ kết thúc trước khi process thoát.
.work/warehouse-venv/Scripts/python.exe -m scripts.crawl_inventory --run-dir .work/inventory-20261114 --pause

# Tiếp tục sau khi process trước đã dừng.
.work/warehouse-venv/Scripts/python.exe -u -m scripts.crawl_inventory --run-dir .work/inventory-20261114 --resume --max-pages 50 --max-seconds 300 --workers 2 --publish

# Lệnh dành cho automation 02:00: chỉ một lần/ngày Việt Nam, không chạy bù ban ngày.
.work/warehouse-venv/Scripts/python.exe -u -m scripts.crawl_inventory --run-dir .work/inventory-20261114 --resume --max-pages 50 --max-seconds 300 --workers 2 --publish --daily
```

Chỉ chạy một lượt inventory tại một thời điểm. OS lock toàn bộ inventory và lock riêng run-dir ngăn chồng lượt thủ công/lịch. `--start` chỉ dành cho run-dir chưa có queue; dùng lại run-dir với `--resume` để tiếp tục. `--daily` lưu marker ngày trước khi chạy và chỉ chấp nhận khung 02:00–02:59 (UTC+7), không chạy bù khi mở app vào ban ngày. Lịch 02:00 được quản lý bằng automation Codex của chat này; máy và các dịch vụ dữ liệu phải hoạt động khi thực thi. Backend khởi động lại không tự tiếp tục lượt cào.

`queue.sqlite` chứa từng URL, loại sitemap/product, trạng thái, số records và lỗi. `progress.json` chứa tiến độ và kết quả publish. `worker.log` và `worker-error.log` là log process chạy nền; `pid.txt` là PID thực của Python. Process tự kết thúc khi hết hàng đợi hoặc tất cả nguồn đã xong/bị chặn. DB và backend tiếp tục chạy riêng.

Catalog chỉ được rebuild **tối đa một lần sau lượt hữu hạn đã yêu cầu**, khi có cờ `--publish` và dữ liệu chưa publish. Không còn rebuild định kỳ trong vòng lặp crawler. Tạm dừng theo yêu cầu bỏ qua publish và giữ dữ liệu raw cho lần tiếp tục. Chỉ chuyển active catalog sau khi data tests và Qdrant point counts đạt. Publish thất bại giữ nguyên catalog trước đó. PostgreSQL giữ lịch sử quan sát; Qdrant lập chỉ mục phiên bản tương ứng. App đọc API catalog và hiển thị tối đa 24 thẻ mỗi trang; không dựng hàng nghìn thẻ cùng lúc.

`GET /advisor/v1/crawl` chỉ đọc tiến độ đã lưu. `POST` JSON `{"action":"resume"}` tạo process Python riêng và trả 202 ngay; `{"action":"pause"}` ghi stop request. Hai route dùng cùng kiểm tra local host/origin của backend. Không có scheduler/crawler chạy trong request tải catalog hoặc trong luồng giao diện.

## Bản ghi gốc và cấu hình tham khảo

Raw staging giữ nguyên trạng thái quarantine, lý do và chứng cứ. Catalog tham khảo có thể dùng một listing gắn với source + SKU hoặc source + URL khi có loại thiết bị, RAM/dung lượng hợp lệ và không có xung đột phần cứng/định danh. Thiếu mapping offer hoặc tồn kho không biến một listing thành offer được duyệt. Giá mâu thuẫn/chưa xác minh bị giữ null trong bản tham khảo. Những thông số chưa biết vẫn là chưa biết; không tạo số để vượt validator.

Không tạo offers, tổng tiền hoặc bằng chứng hiệu năng từ lượt crawl. Các bản ghi thiếu RAM/dung lượng hoặc còn xung đột vẫn nằm trong dữ liệu gốc để xử lý tiếp. `referenceEligible` là điều kiện duyệt lớp tham khảo riêng, không xóa hoặc sửa quarantine của quan sát gốc.

Trung Trần hiện trả robots.txt chuyển hướng về trang chủ, nên worker ghi `ROBOTS_REDIRECT_UNRESOLVED` và dừng. Toàn bộ 8 nguồn không được báo thành công khi nguồn này còn bị chặn.
