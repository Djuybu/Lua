# Kết quả kiểm thử local — 18/11/2026

## Thay đổi được kiểm tra

- Mỗi nguồn mới crawl tối đa 20 trang; sau publication, các lượt sau chỉ dùng `seeds[0]`.
- Catalog nhận mọi identity đã parse/lưu hợp lệ, kể cả thiếu thông số hoặc chưa mapping.
- Dedup theo `(source, external_id)`, lấy observation mới nhất; raw vẫn giữ lịch sử.
- dbt kiểm tra không có identity nào bị bỏ khỏi catalog, rồi publisher ghi Qdrant.

## Kiểm thử tự động

- FE: typecheck đạt, 51 tests đạt.
- Backend: typecheck đạt, 59 tests đạt.
- Python: 37 tests crawler/pipeline đạt; 4 tests scheduled được chạy lại sau chỉnh checkpoint và đạt.
- Full Python suite: 45/46 đạt. Test snapshot `test_adviser_app_catalog_matches_the_published_snapshot` đã lệch ngay tại HEAD: hai fixture có 61 và 4 variants. Không sửa fixture ngoài phạm vi task.
- Docker integration với PostgreSQL 18, Python 3.13, dbt, Node 22 và Qdrant thật: lượt đầu 40 trang/2 nguồn, lượt sau 2 trang, xóa schema/collection rồi khởi tạo lại 40 trang. Cả ba lượt đều có 38 variants, 76 points; bản ghi thiếu thông số được giữ, identity trùng được gộp. Exit code 0.

## Reset và crawl website thật

Theo xác nhận của người dùng, đã backup rồi reset database local `laptop` và các collection Qdrant của dự án. Backup ngoài repo: `C:\Users\Minh Duy\lua-db-backup\before-crawler-reset-20261118-133513` (PostgreSQL custom dump và 7 Qdrant snapshots, có manifest SHA256).

Runner Linux trong Docker kết nối PostgreSQL/Qdrant local vì Windows chặn dbt executable/psycopg2. Docker chỉ dùng kiểm thử; cấu hình VM vẫn chạy Python/Node trực tiếp bằng systemd.

Bootstrap run `3e11a78d243643ce91308f6b74b125f4`:

| Nguồn | Trang đã thử | Bản ghi parse được | Trang lỗi |
|---|---:|---:|---:|
| CellphoneS | 20 | 20 | 0 |
| Điện Máy Xanh | 1 | 1 | 0 |
| FPT Shop | 20 | 13 | 7 |
| LaptopAZ | 20 | 1 | 19 |
| Oneway | 4 | 4 | 0 |
| ShopDunk | 20 | 18 | 2 |
| Thế Giới Di Động | 20 | 62 | 0 |
| Trung Trần | 1 | 0 | 1 |

Kết quả: 126 trang đã thử, 119 observations, 118 identity duy nhất được publish thành 118 variants và 236 Qdrant points. dbt đạt 3 models + 14 data tests. Report `partial`, exit code 1 vì có trang lỗi; publication vẫn thành công.

Lỗi thực tế: `PRODUCT_SCHEMA_MISSING` (FPT Shop, LaptopAZ), `URL_OUTSIDE_SOURCE` (ShopDunk), `ROBOTS_REDIRECT_UNRESOLVED` (Trung Trần). Điện Máy Xanh/Oneway có ít link phù hợp hơn giới hạn 20. Không bỏ qua robots/allowlist để ép đủ số trang.

Trong lúc bootstrap đang chạy, chính sách checkpoint được chỉnh để nguồn có lỗi trang cũng chuyển sang refresh sau publication. Container bootstrap đã nạp bản trước đó, nên 4 checkpoint còn thiếu được bổ sung từ chính report đã publish, trước khi kiểm tra refresh bằng image cuối cùng. Đây là điều chỉnh dữ liệu trong lần kiểm thử phát triển; không phải thao tác cần làm khi triển khai mã cuối cùng.

Refresh run `8bb2a27e817b450d9fc057ef0c8285b1` bằng image mã cuối cùng: cả 8 nguồn đều `mode=refresh`, `pageLimit=1`, `processed=1`. Thu thêm 9 observations, tổng raw 128 observations/118 identities; catalog vẫn 118 variants và Qdrant 236 points. dbt tiếp tục đạt 17/17. Trung Trần vẫn lỗi robots, nên report `partial` nhưng publish thành công; 8 nguồn đều đã có checkpoint.

Log chi tiết (ignored): `tools/data-pipeline/.work/compose-test.log`, `live-bootstrap.log`, `live-refresh.log`; lịch sử và report lưu tại `lua_app.pipeline_runs`. Đã dọn các container kiểm thử, giữ PostgreSQL/Qdrant local và dữ liệu vừa publish.
