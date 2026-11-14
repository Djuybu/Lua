# Lua data pipeline

Crawler/staging CLI cho CellphoneS, Thế Giới Di Động, FPT Shop, Trung Trần, LaptopAZ, ShopDunk, Điện Máy Xanh và Oneway. Python 3.11+; chỉ dùng standard library, không cần pip, Docker, API key hoặc tài khoản bán lẻ.

Pipeline tách fetch → extract → normalize/quality → SQLite history → export → review → backend payload. Không tự POST vào backend, không phát hành catalog. `ready_for_review` chỉ có nghĩa parser có đủ identity/price theo config và không phát hiện lỗi; không phải sản phẩm đã được duyệt mua hoặc phù hợp ngân sách.

## Bắt đầu và demo không mạng

Bộ dữ liệu **thật** từ 8 nguồn đã có tại [retail-pilot-2026-11-14](datasets/retail-pilot-2026-11-14/README.md): 10 observations và catalog development seed 4 variants. Đọc quality report trước import; không nhầm bộ này với demo synthetic bên dưới.

Đọc capture đã thu thập từ browser bằng `parse-capture --config <config.json> --input <capture.json> --db <staging.sqlite>`. Capture giữ thời điểm quan sát gốc, được kiểm tra source và gắn `captureMode=rendered_projection`; không phải HTML nguyên bản hoặc một lần HTTP crawl mới.

Trong PowerShell, từ repo root:

```powershell
Set-Location tools/data-pipeline
python -m lua_pipeline doctor
python -m unittest discover -s tests -v
python -m scripts.demo
python -m lua_pipeline report --db .work/demo/staging.sqlite
python -m lua_pipeline verify-export --input .work/demo/bundle.json
```

Demo dùng `fixtures/synthetic-product.html`, SKU `000123`, variant `synthetic:variant:16-512`, không phải dữ liệu cửa hàng thật. Lần đầu insert 1, replay insert 0; chạy lại demo vẫn không tạo observation trùng. Kết quả trong `.work/demo/`: SQLite, staging bundle, review giả lập và backend payload. Thư mục `.work/` được gitignore.

Để chạy từng bước thay demo:

```powershell
python -m lua_pipeline validate-config --config examples/synthetic.json
python -m lua_pipeline parse-fixture --config examples/synthetic.json --html fixtures/synthetic-product.html --url https://fptshop.com.vn/lua-synthetic --observed-at 2026-11-14T00:00:00+00:00 --db .work/manual.sqlite
python -m lua_pipeline export --db .work/manual.sqlite --output .work/manual-bundle.json
python -m lua_pipeline verify-export --input .work/manual-bundle.json
```

`--observed-at` là thời điểm capture có timezone, không lấy thời gian file thay cho thời điểm quan sát. Với snapshot được render từ browser, dùng thêm `--rendered`; ghi rõ chế độ này trong evidence. Công cụ chưa tự điều khiển browser hoặc render JavaScript.

## Cấu hình nguồn thật

`examples/` có 8 config riêng với một seed detail đã nghiên cứu; URL/giá có thể đổi. Copy config vào `.work/` trước khi chỉnh. Ví dụ:

```powershell
Copy-Item examples/fptshop.json .work/fptshop.json
```

Các trường:

- `schemaVersion`: `lua.pipeline-config.v1`.
- `sourceId`: `cellphones`, `tgdd`, `fptshop`, `trungtran`, `laptopaz`, `shopdunk`, `dienmayxanh`, `oneway`.
- `seeds`: danh sách detail URLs thuộc source; HTTPS, không credential/host khác. Không đặt trang tìm kiếm hoặc API nội bộ làm seed.
- `regionContext`: vùng **đã quan sát**, hoặc null nếu chưa rõ. Trường này chỉ ghi provenance, không điều khiển địa điểm trên website. Không nhập “Hà Nội” nếu chưa xác nhận response thực sự là giá Hà Nội.
- `variantMap`: key là `externalOfferId` do report xuất ra, value là exact variant ID đã duyệt trong catalog backend. Giữ số 0 đầu SKU. Không map theo title similarity hay tên dòng máy chung.
- `sitemap`: tham khảo cho lệnh discover, không tự chạy khi crawl.

Map mặc định trống nên dữ liệu thật vào quarantine (`EXACT_VARIANT_UNMAPPED`). Cập nhật mapping rồi parse lại capture sẽ tạo normalization revision mới (`mappingVersion`), giữ observation cũ. Cùng capture/config/parser replay phải bất biến. Không suy ra manufacturer MPN từ trường retailer SKU/MPN chưa được kiểm chứng.

## Chạy crawl và discovery giới hạn

```powershell
python -m lua_pipeline crawl --config .work/fptshop.json --db .work/live.sqlite --max-pages 1
python -m lua_pipeline report --db .work/live.sqlite
python -m lua_pipeline crawl --config .work/fptshop.json --db .work/live.sqlite --max-pages 3 --resume
```

`--resume` bỏ qua seed có checkpoint `done` trong DB này. Dùng khi nối tiếp một lượt thu thập; bỏ `--resume` để làm lượt refresh mới. Parsed-but-quarantined cũng là `done` về mặt thu thập; xem report/điều chỉnh map thay vì retry mạng liên tục. Một lỗi fetch/parse tạo job `failed`/`blocked`, không xóa observations đã có.

HTTP có user-agent trung thực `LuaCatalogResearch/1.0`, timeout 20 giây/request, tối đa 2 retry, 4 MB/response, 1 request tuần tự trong mỗi job, khoảng cách tối thiểu 5 giây/host hoặc robots delay lớn hơn. 429/5xx dùng backoff và Retry-After; thời gian yêu cầu chờ hơn 60 giây làm job dừng `RETRY_LATER`. Không retry 403 hay vượt CAPTCHA. Nếu chạy nhiều process, tự chia lịch để tổng số request không vượt giới hạn host; limiter hiện chỉ có hiệu lực trong process.

```powershell
python -m lua_pipeline discover --config .work/fptshop.json --sitemap https://fptshop.com.vn/sitemap.xml --output .work/discovered.json --max-sitemaps 3 --max-urls 30
```

Discovery chỉ xuất **candidate URLs**, không tự crawl và chưa phân loại mọi URL là đúng nhóm sản phẩm. Review phone/tablet/laptop/PC scope rồi thêm seed; không theo sitemap ngoài host. XML index/urlset có giới hạn và chống vòng lặp. Chưa hỗ trợ gzip sitemap hoặc tự bấm load-more. URL `code` được giữ cho identity; UTM/fbclid/gclid/fragment được bỏ. Robots guard kiểm tra URL canonical thực sự được request, mỗi redirect kiểm tra lại host/policy trước khi theo.

## Trạng thái adapter và dữ liệu

| Nguồn | Cách trích xuất / giới hạn |
|---|---|
| CellphoneS | Product/Offer JSON-LD; đối chiếu giá trong container riêng, không lấy giá trả góp cùng class bên ngoài |
| TGDD / Điện Máy Xanh | ProductGroup/hasVariant hoặc Product, SKU/stock riêng theo variant; có thể cần rendered snapshot |
| FPT Shop | Product/Offer; giữ giá hiện tại trong JSON-LD, chưa tự phân loại tất cả flash-sale/ưu đãi trong DOM |
| Trung Trần | Product/structured + bảng thông số; AggregateOffer vào quarantine, chưa ép khoảng giá thành exact offer |
| LaptopAZ | Product/Offer + vùng `.pd-price-group`; không lấy giá combo/accessory |
| ShopDunk / Oneway | JSON-LD nếu có; DOM fallback giới hạn theo product container/price và data-productid; **experimental**, mới kiểm bằng fixture, chưa xác nhận selectors live |

Nếu response chưa chứa product schema/DOM cần thiết, parser báo `PRODUCT_NOT_READY`/`PRODUCT_SCHEMA_MISSING` hoặc quarantine, không coi đó là catalog hết hàng. Không tự fallback sang API bị robots chặn. Không có dữ liệu thực tế nào được coi là đã crawl thành công chỉ vì config/fixture tồn tại.

`attributes` giữ quan sát raw, chưa là thông số typed đã duyệt. `sourceMpn` là nhãn source, không bảo đảm là mã hãng. Stock/condition chưa biết luôn UNKNOWN. Spec/price mâu thuẫn có `conflicts` và evidence; không tự chọn một giá trị để phát hành. Giá VND phải integer safe, không âm; bool/float/overflow bị từ chối. Mandatory fees và ship chưa xác minh giữ null, `totalVnd` luôn null trong staging v1 và `isVerifiedAffordable=false`. Không dùng min tất cả giá trên trang hoặc tự trừ ưu đãi lần hai.

## Export và review trước khi chuyển backend

```powershell
python -m lua_pipeline export --db .work/live.sqlite --output .work/staging.json
python -m lua_pipeline export --db .work/live.sqlite --output .work/audit.json --include-quarantine
python -m lua_pipeline verify-export --input .work/staging.json
```

Export mặc định chỉ chứa `ready_for_review`, giữ toàn bộ observation history theo ID, **không phải một snapshot latest-only**. Manifest có count/hash canonical JSON; verify kiểm tra schema, duplicate IDs, money, trạng thái và hash. Hash bảo vệ tính nhất quán, không thay chữ ký nguồn hay quyền xuất bản. Output tồn tại sẽ báo lỗi; chỉ dùng `--overwrite` khi chủ ý thay artifact. SQLite ingest giao dịch nguyên tử; batch lỗi không để lại checkpoint done. Export ghi file tạm rồi đổi tên/link nguyên tử; lỗi ghi giữ output cũ.

Backend Agent 3 hiện yêu cầu `mandatoryFeesVnd` là số, còn pipeline giữ unknown=null. Không được đổi unknown thành 0 chỉ để qua validator. Tạo review JSON sau khi đối chiếu thực tế, theo mẫu **synthetic** ở `.work/demo/reviews.json`:

```json
{
  "schemaVersion": "lua.pipeline-review.v1",
  "approvals": {
    "<observationId từ staging>": {
      "matchedVariantId": "<exact catalog variant ID đã xác nhận>",
      "mandatoryFeesVnd": 0,
      "shippingVnd": null,
      "conditionalDiscountVnd": 0,
      "reviewedAt": "2026-11-14T01:00:00+00:00",
      "evidenceUrl": "https://fptshop.com.vn/<trang-san-pham>"
    }
  }
}
```

Các số 0 chỉ là ví dụ; nhập số đã xác minh. `mandatoryFeesVnd` không chứa ship; ưu đãi có điều kiện không tự trừ vào base price. Unknown shipping được giữ null và completeness `PARTIAL_UNKNOWN`. Dữ liệu quarantine/không có approval bị loại khỏi payload; approval sai variant hoặc thiếu phí hợp lệ làm lệnh thất bại.

```powershell
python -m lua_pipeline backend-payload --input .work/staging.json --reviews .work/reviews.json --output .work/backend-payload.json
```

Kết quả `{ "offers": [...] }` theo StagedCrawlerOffer của Agent 3. Region được encode vào stable external ID để tránh lẫn giá giữa vùng. Nếu hai observations cùng identity/timestamp nhưng payload khác nhau, conversion từ chối thay vì để backend bỏ qua âm thầm. Lệnh này không gọi server. Backend vẫn phải kiểm tra known variant IDs, hợp đồng và tính nguyên tử trước import.

Nếu source backend hiện diện, kiểm tra validator thật mà không chạy server (Node 22.19+ cho type stripping):

```powershell
node --experimental-strip-types scripts/verify-backend-contract.mjs ../../services/adviser-backend .work/demo/backend-payload.json
```

Đã kiểm chứng validator tại commit `3f9389f0bf503533b74f1827a3c45fc3d09a37f8`; chưa kiểm chứng HTTP import/persistence backend end-to-end. Re-run khi contract backend đổi. Không tự gửi dữ liệu vào endpoint ingest của môi trường đang có người dùng.

## Lỗi và khôi phục

- Exit 0: command hoàn tất, **không đồng nghĩa dữ liệu đã được duyệt**. Xem số quarantine và report. Exit 2: input/config/IO/fetch/parse/verify lỗi; không bỏ qua stderr.
- `ROBOTS_DENIED`: đổi sang URL được phép đúng scope; không sửa guard hoặc đổi user-agent để né.
- `ROBOTS_UNRESOLVED`/`ROBOTS_REDIRECT_UNRESOLVED`: kiểm tra robots thực; HTML homepage không là policy allow-all.
- `NETWORK_FAILURE`/`HTTP_403`/`ACCESS_CHALLENGE`: giữ job và thử lại khi kết nối/quyền nguồn được giải quyết; có thể dùng snapshot đã thu thập hợp lệ với timestamp gốc. Không nhập cookie/token vào fixture.
- `EXACT_VARIANT_UNMAPPED`, `PRICE_CONFLICT`, `REGION_IDENTITY_CONFLICT`: review evidence/mapping, không tự sửa thành ready. Product schema thiếu: bổ sung fixture và regression test trước chỉnh adapter.
- `IMMUTABLE_OBSERVATION_CONFLICT`: cùng ID đang có nội dung khác; giữ DB cũ để điều tra, không xóa lịch sử cho pipeline xanh.
- Snapshot/file export hỏng: tạo output mới từ SQLite còn nguyên, chạy verify. Sao lưu DB khi CLI đã đóng để tránh copy giữa transaction; không chỉnh DB production.

## Bằng chứng hiện tại

Xem [VERIFICATION.md](VERIFICATION.md) và [kế hoạch](../../docs/hackathon/data-pipeline.md). Test dùng synthetic fixtures và local HTTP server; live HTTP smoke gặp lỗi mạng/kết nối ở cả 8 nguồn trong môi trường hiện tại. Cần bổ sung live-qualified fixtures/DOM selectors, kiểm tra nguồn/retention và backend import trước đưa dữ liệu vào catalog thực.
