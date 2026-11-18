# Chạy crawl + dbt ngầm trên VM

Service này dành cho Debian/systemd, repo `/home/<user>/Lua`, venv ở repo root
`.venv`, PostgreSQL và Qdrant cài trực tiếp trên VM. Sửa đường dẫn unit nếu bạn
dùng vị trí khác. Không cần activate venv hoặc alias `python` trong systemd.

## Luồng thực tế

`scripts.warehouse --crawl-all` (hoặc `--crawl-config ...` lặp nhiều lần) chạy lần lượt:

1. Lấy PostgreSQL advisory lock để tránh chạy hai warehouse job đồng thời.
2. Đọc trạng thái khởi tạo từng nguồn trong `lua_raw.crawl_state`. Nguồn mới:
   crawl tối đa 20 trang, bắt đầu từ seeds và lần theo link trong `followPatterns`.
   Nguồn đã publish thành công: chỉ crawl seed đầu tiên, không lần theo link.
   Đây là giới hạn số trang HTTP mỗi website, không phải 20 tầng đệ quy.
3. Ghi raw observations và crawl jobs vào PostgreSQL.
4. Chạy `dbt build` với schema build riêng, gồm models và data tests.
5. Publish collection Qdrant mới rồi đổi `lua_app.active_catalog`. Chỉ sau đó mới
   ghi trạng thái khởi tạo cho các nguồn đã được thử, kể cả khi có trang lỗi.
   Nếu cả lượt thất bại trước publication, lần sau vẫn bootstrap. Không cần xóa dữ liệu để chạy cập nhật thường ngày.

`python -m scripts.warehouse` **không có `--crawl-config`/`--crawl-all` không crawl website**;
nó chỉ build và publish dữ liệu đã có. dbt không phải crawler hay daemon;
systemd giữ tiến trình điều phối chạy độc lập phiên SSH.

## Chuẩn bị

Sau khi chép thư mục `deploy` này lên VM, chạy bằng user sở hữu repo:

Service mặc định đọc 8 file JSON trong `tools/data-pipeline/sources/`. Mỗi file
có `sourceId`, `category`, `seeds`, `followPatterns`. Kiểm tra/cập nhật các URL
trước khi chạy vì nhà bán lẻ có thể thay đổi đường dẫn. Không dùng các file
`examples/` (giữ nguyên cho thử nghiệm cũ) làm cấu hình service mặc định.

`seeds[0]` là "trang đầu" dùng cho các lần refresh; các seeds bổ sung và link
khám phá chỉ dùng khi bootstrap. 20 là mức tối đa, có thể ít hơn nếu không đủ
link sản phẩm hoặc nguồn bị chặn. Robots, HTTP errors và allowlist vẫn được giữ.

Catalog tự nhận mọi identity đã parse/lưu hợp lệ, kể cả `quarantine` do chưa
mapping, thiếu giá/RAM/storage hoặc thông tin còn mâu thuẫn. `qualityIssues`
giữ lý do để tra cứu; thông số thiếu là JSON null, UI hiển thị chưa xác minh.
Không biến các giá trị chưa biết thành 0, và không tự duyệt tổng giá mua hàng.
Giá raw vẫn là giá tham khảo, `reviewed_offers` không được tự thêm dữ liệu.

Chống trùng catalog theo `(source, external_id)`, giữ quan sát mới nhất. Cùng
SKU ở hai website vẫn là hai bản ghi nguồn khác nhau. Lịch sử raw vẫn giữ
quan sát theo thời gian; không xóa lịch sử giá chỉ vì sản phẩm đã có trong catalog.
dbt test `all_unique_products_are_cataloged` đảm bảo không bỏ sót identity.

Yêu cầu trước khi chạy:

- `~/Lua/.venv/bin/python` và `~/Lua/.venv/bin/dbt` hoạt động.
- `/usr/bin/node` hoặc `/usr/local/bin/node` là Node 22 tương thích.
- Backend đã `npm ci` để publisher import được `pg`.
- `~/Lua/services/adviser-backend/.env` có đủ PGHOST/PGPORT/PGDATABASE/PGUSER/
  PGPASSWORD và QDRANT_URL; user chạy service đọc được file.
- PostgreSQL và Qdrant hoạt động. Unit giả định Qdrant service tên `qdrant`.

## Cài service và chạy một lượt ngầm

```bash
cd ~/Lua/tools/data-pipeline
sudo install -m 0644 deploy/lua-warehouse@.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemd-analyze verify /etc/systemd/system/lua-warehouse@.service
sudo systemctl start --no-block "lua-warehouse@$(id -un).service"
```

Sau lệnh start, có thể đóng SSH; systemd tiếp tục quản lý job. Đây là service
oneshot: kết thúc sau một batch, không tự lặp hay chạy lại sau reboot. Không
cần `systemctl enable` cho unit này; chưa thiết lập lịch crawl tự động.

```bash
sudo journalctl -u "lua-warehouse@$(id -un).service" -f
sudo systemctl show "lua-warehouse@$(id -un).service" \
  -p ActiveState -p SubState -p Result -p ExecMainStatus
```

Ctrl+C ở `journalctl -f` chỉ thoát xem log, không dừng crawler.

Thành công: `Result=success`, `ExecMainStatus=0`, report `status=passed`, và
`published=true`. `inactive/dead` sau khi hoàn tất là bình thường cho oneshot.
Không chỉ nhìn PASS của dbt: cần publisher cũng thành công. Report có ở
`.work/warehouse/<run-id>/report.json`; lịch sử ở `lua_app.pipeline_runs`.

```bash
# Chạy batch tiếp theo sau khi batch trước kết thúc:
sudo systemctl start --no-block "lua-warehouse@$(id -un).service"
# Chủ động dừng batch đang chạy:
sudo systemctl stop "lua-warehouse@$(id -un).service"
```

systemd không khởi chạy thêm instance cùng tên khi instance đó còn chạy;
advisory lock bảo vệ thêm trước các lần chạy thủ công/instance khác.

## Giới hạn và lỗi cần biết

- Có thể chọn nhiều nguồn bằng `--crawl-config file1 --crawl-config file2`.
  `--max-pages N` (1..20) là override thủ công, thay chính sách 20/1 tự động.
  Không tự gọi sitemap discovery và không render JavaScript bằng browser.
- Một nguồn lỗi không làm mất dữ liệu parse được của nguồn khác: publish phần
  hợp lệ nếu dbt đạt, report `status=partial` và exit code 1 để cảnh báo. Nếu
  tất cả nguồn đều không parse được, không publish catalog mới.
- Raw observation đã ghi có thể vẫn còn sau khi batch lỗi; đây là dữ liệu lịch sử.
- dbt/publish lỗi trước khi đổi pointer: catalog trước đó tiếp tục được dùng.
- Unit giới hạn tổng thời gian 30 phút, không retry tự động để tránh crawl dồn.
  Nếu bị kill/timeout, block `finally` của Python có thể không chạy và run trong
  DB còn `running`; xem systemd Result/log. Nếu publisher đã đổi pointer trước
  lúc bị dừng, publication mới có thể đã active: kiểm tra DB trước khi kết luận.
- Build schemas/collections cũ được giữ lại; chạy nhiều lần sẽ tăng dung lượng.
- Có thể thêm systemd timer sau khi chọn nguồn và tần suất; không cần thay dbt
  hoặc thêm thư viện Python chỉ để chạy nền.

Chạy thủ công cùng chính sách với service:

```bash
cd ~/Lua/tools/data-pipeline
~/Lua/.venv/bin/python -m scripts.warehouse --crawl-all
```

## Kiểm thử

`python -m unittest tests.test_scheduled tests.test_pipeline -v` kiểm tra giới hạn
20 trang, scope URL, trạng thái refresh và checkpoint sau publication. Bài integration
`python -m tests.test_warehouse_reset` dùng PostgreSQL/dbt/Qdrant thật, nguồn HTML
fixture cố định và thực sự xóa schema/collection để khởi tạo lại. Chỉ chạy với
database và collection prefix `lua_test_*`; không dùng để reset database thật.
Dockerfile `tests/Dockerfile.warehouse` cung cấp môi trường Linux để chạy bài này.

Từ repository root (Docker chỉ phục vụ bài test, không đổi cách deploy VM):

```bash
docker compose -f tools/data-pipeline/tests/compose.warehouse.yml up --build --abort-on-container-exit --exit-code-from verify
docker compose -f tools/data-pipeline/tests/compose.warehouse.yml down -v
```

Compose không mở cổng ra host, dùng database `lua_test_warehouse` và lưu dữ liệu
test trong tmpfs; lệnh `down` chỉ dọn project `lua-warehouse-check` của bài test.

Tài liệu: [dbt commands](https://docs.getdbt.com/reference/dbt-commands),
[systemd oneshot](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html).
