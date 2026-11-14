# Kế hoạch crawler và data pipeline — 8 nguồn bán lẻ

Ngày khảo sát: 14/11/2026. Bản dưới đây giữ nội dung kế hoạch nghiên cứu ban đầu.
Cập nhật sau yêu cầu triển khai: đã có mã nguồn tại `tools/data-pipeline/`, 33 test đạt và runbook; xem [implementation report](./data-pipeline-implementation.md). Live HTTP qualification và backend import E2E chưa đạt/chưa chạy, xem `tools/data-pipeline/VERIFICATION.md`. Các câu “chưa triển khai” trong nội dung khảo sát dưới đây mô tả thời điểm lập kế hoạch, không thay cho báo cáo triển khai mới.
Áp dụng skill `.agents/skill/hackathon-agent-skill/` và các hợp đồng cộng tác đã đọc.

## 1. Phạm vi và bằng chứng

Nguồn người dùng chọn: CellphoneS, Thế Giới Di Động, FPT Shop, Trung Trần, LaptopAZ, ShopDunk, Điện Máy Xanh, Oneway.

Đã mở trang chủ và ít nhất một trang sản phẩm mẫu của mỗi nguồn bằng T3 integrated browser; đọc rendered DOM và JSON-LD, kiểm tra một số danh mục và truy cập robots.txt của cả tám nguồn. Không chạy crawl hàng loạt, gọi API nội bộ, đăng nhập, mua hàng hoặc ghi dữ liệu vào backend.

Quan sát có cấu trúc lưu trong [source-browser-observations-2026-11-14.json](./source-browser-observations-2026-11-14.json). Đây là mẫu nghiên cứu, không phải catalog đã xác minh. Không lưu review hoặc danh tính khách hàng. Một số lần đọc danh mục gặp DOM chưa sẵn sàng; không suy diễn rằng trang trống hay không có sản phẩm.

Giới hạn: dữ liệu đọc từ DOM sau render chưa chứng minh có sẵn trong HTTP HTML ban đầu; chưa kiểm tra network/API, chưa kiểm thử chuyển vùng/màu, chưa bấm tải thêm, chưa kiểm tra toàn bộ sitemap hoặc điều khoản tái sử dụng. Robots là đầu vào cho crawl policy, không tự chứng minh quyền xuất bản hoặc đưa nội dung vào AI.

## 2. Kết quả từng nguồn và adapter dự kiến

| Nguồn / ID | Trang mẫu và dữ liệu quan sát | Adapter dự kiến / điều kiện cần xử lý |
|---|---|---|
| CellphoneS / `cellphones` | [OPPO Find X8](https://cellphones.com.vn/dien-thoai-oppo-find-x8.html): Product + Offer, SKU dạng slug, VND dạng chuỗi, thông số trong additionalProperty; màu và nhiều ưu đãi riêng. [Danh mục](https://cellphones.com.vn/mobile.html) có nút tải thêm. | JSON-LD + DOM đối chiếu giá chính, màu, vùng và điều kiện hotsale. Không lấy mọi `.sale-price`: cùng class còn dùng cho tiền trả góp hàng tháng. SKU slug không tự coi là manufacturer part number. |
| Thế Giới Di Động / `tgdd` | [iPhone 17 Pro Max 1TB](https://www.thegioididong.com/dtdd/iphone-17-pro-max-1tb): ProductGroup chứa hasVariant; các màu có SKU riêng, `?code=` và tồn kho khác nhau. RAM được ghi là không công bố. | Parser ProductGroup giữ quan hệ parent/child. Bảo toàn `code` khi đó là định danh variant, loại tracking riêng. Không copy stock của một màu sang màu khác, không ép unknown RAM thành 0. |
| FPT Shop / `fptshop` | [Acer Aspire Go 15](https://fptshop.com.vn/may-tinh-xach-tay/acer-aspire-go-15-ai-ag15-52p-52wt): SKU `00928037`, Product/Offer + properties; giá Offer/giá thường 22.990.000 VND, flash sale khác 21.490.000 VND; danh mục có tải thêm kết quả. | JSON-LD đối chiếu vùng giá đang hiển thị. Tách giá thường, flash sale, trả góp, ưu đãi HSSV/sinh nhật; không dùng min của tất cả số trên trang. Giữ số 0 đầu SKU. |
| Trung Trần / `trungtran` | [Gigabyte AERO X16](https://trungtran.vn/gigabyte-aero-x16-ryzen-7-16-rtx-5060-2k-1vh93vnc94dh-white/): Product SKU/MPN `1299`, AggregateOffer low/high; mã cấu hình nhà sản xuất nằm trong tên/bảng thông số. [Danh mục gaming](https://trungtran.vn/laptop-chuyen-game/) có link `/page-2/`, `/page-3/`. | JSON-LD + bảng DOM. Không coi `1299` là MPN hãng chỉ vì source gắn nhãn mpn. AggregateOffer chưa đủ để tạo exact offer nếu chưa khớp cấu hình/giá. Tách new/refurbished/like-new và giá combo. |
| LaptopAZ / `laptopaz` | [Acer Aspire 7](https://laptopaz.vn/laptop-acer-gaming-aspire-7-a715-59g-59rd-nh-dxusv-001-core-5-210h-16gb-512gb-rtx-3050-4gb-15-6-icnh-fhd-win-11-den.html): Product SKU `SP002078`, Offer, tình trạng và VAT; DOM có `.pd-price-group`, `.pd-price`. | JSON-LD + vùng giá sản phẩm/bảng thông số. Tách SKU retailer khỏi mã `NH.DXUSV.001`; giá cũ không là giá bán. Có shipping details nhưng chưa xác minh điều kiện áp dụng cho địa chỉ cụ thể. |
| ShopDunk / `shopdunk` | [iPhone 17 Pro Max 256GB](https://shopdunk.com/dien-thoai-iphone-17-pro-max-256gb): DOM có dung lượng, màu, vùng Bắc/Nam, giá bán và giá trade-in. Không thấy Product JSON-LD trong lần đọc mẫu. | Adapter DOM riêng, định danh source product/option sau bước spike; không dùng slug làm manufacturer ID. Không lấy giá sau thu cũ hoặc cashback làm giá mua thông thường. Danh mục `/iphone` từng trả DOM chưa sẵn sàng, cần readiness check. |
| Điện Máy Xanh / `dienmayxanh` | [HP 240R G10](https://www.dienmayxanh.com/laptop/hp-240r-g10-core-5-120u-c3ru7at): Product SKU `0220042003457`, Offer, additionalProperty, vùng Hà Nội và quà/giảm giá được chọn. [Danh mục laptop](https://www.dienmayxanh.com/laptop) có tải thêm; đầu trang chi tiết còn có giá máy cũ. | Tái sử dụng lõi MWG với config/parser test riêng cho từng brand. Giới hạn phone/tablet/laptop/PC theo phạm vi, tránh lấy toàn bộ gia dụng. Không nhầm giá máy cũ hoặc RAM hỗ trợ tối đa với RAM lắp sẵn. |
| Oneway / `oneway` | [Trang iPhone mẫu](https://onewaymobile.vn/dien-thoai-apple-iphone-18-pro-256gb-zp-a): nhiều dung lượng/màu/giá, vùng Hồ Chí Minh và tình trạng. URL chứa `zp-a`, H1 là `X/A`; không thấy Product JSON-LD trong mẫu. | DOM riêng, giữ raw URL/H1 và đánh dấu region identity unresolved; không tự sửa mã vùng theo slug. Nhiều `.price` thuộc option khác nhau nên phải liên kết đúng option. |

Các giá/SKU trên là quan sát để thiết kế test tại thời điểm nghiên cứu, không là khẳng định giá đang bán hoặc cấu hình đúng theo hãng. Category schema có Product không có nghĩa là một exact offer đủ điều kiện xuất bản.

## 3. Discovery và crawl policy

| Nguồn | Kết quả robots quan sát | Quyết định thiết kế |
|---|---|---|
| CellphoneS | Chặn nhiều query URL, catalogsearch, `/lapi/`, `/ltpg/`, `/ltpextra/`; có sitemap index. | Ưu tiên sitemap/canonical product URL. Không dùng API bị chặn để giả lập tải thêm. |
| TGDD | Crawl-delay 5; chặn price/cart/comment và các vùng chức năng; có product sitemap. | Tối thiểu 5 giây/request/host hoặc cao hơn theo config; không crawl review/cart. |
| FPT Shop | Chặn `/ajax/`, nhiều query filter/sort/tracking; có sitemap. | Sitemap + detail. Không sinh tổ hợp bộ lọc để discovery. |
| Trung Trần | `/robots.txt` chuyển về trang chủ trong quan sát browser. | Trạng thái `robots_unresolved`; kiểm tra HTTP/status/redirect trong spike, không coi HTML homepage là allow-all. |
| LaptopAZ | Có sitemap, chặn admin và phần lớn ajax; có content signal giới hạn mục đích và các user-agent cụ thể. | Dùng user-agent trung thực và parser policy theo đúng nhóm; review riêng quyền dùng nội dung cho AI/xuất bản. Chưa phê duyệt nội dung làm input AI. |
| ShopDunk | Có sitemap; chặn search/cart/customer/order/review actions. | Ưu tiên sitemap + product detail; không gọi các endpoint tương tác. |
| Điện Máy Xanh | Có product sitemap, chặn `/aj/`, tracking/cart và vùng chức năng. | Không dùng endpoint `/aj/` làm phương án tải thêm. |
| Oneway | Có sitemap; chặn tìm kiếm và URL có query cùng giỏ hàng/tài khoản. | Discovery bằng sitemap/detail canonical; không dùng search query hoặc pagination query bị chặn. |

Mỗi job sẽ lưu URL robots, fetchedAt, body hash, parser version và kết quả cho user-agent thật. Chưa rõ policy hoặc gặp CAPTCHA/403 thì job dừng ở `blocked`, không đổi danh tính để né. Chưa có HTTP crawler nên status/retry ở đây là thiết kế, chưa được kiểm chứng live.

Discovery đề xuất: sitemap → allowlisted category/product URLs → exact product detail. Kiểm tra same-host/allowlist trước mỗi redirect; không follow URL admin/login/cart. Loại UTM/fragment khi không mang nghĩa identity; không xóa toàn bộ query vì TGDD dùng `code` cho SKU. Đặt giới hạn sitemap depth, số URL, byte tải, timeout và vòng lặp pagination.

Mặc định thử nghiệm: 1 request đồng thời/host, khoảng cách ít nhất 5 giây (tăng nếu policy yêu cầu), timeout 20 giây, tối đa 2 lần retry cho timeout/429/5xx với backoff + Retry-After. Không retry vô hạn 403/CAPTCHA/parse error. Pilot khởi đầu 3 detail URLs/nguồn, không auto crawl hết site. Readiness của browser dựa vào H1 + vùng sản phẩm/schema, không chỉ `DOMContentLoaded`.

## 4. Kiến trúc pipeline và hợp đồng staging

Luồng đề xuất: source registry → policy/discovery → fetch → extract → normalize → identity review → quality gate → SQLite staging/history → export versioned bundle → backend validation/import.

- `source registry`: host, sourceId, category allowlist, seed/sitemap, robots/usage review, adapter/parser version và lịch chạy. Người dùng đã chọn nguồn; quyền tái sử dụng/retention vẫn cần ghi nhận riêng.
- `fetch`: tách HTML transport khỏi parser; lưu hash, URL thực, thời điểm, mã phản hồi và context vùng. Chỉ giữ phần product cần thiết trong fixture, bỏ review/tài khoản/cookie/token.
- `extract`: JSON-LD Product, ProductGroup/hasVariant và Offer/AggregateOffer; DOM fallback theo từng nguồn. Không dùng một selector giá toàn trang. Giữ đường dẫn chứng cứ cho từng trường, ví dụ JSON pointer hoặc DOM selector trong container sản phẩm.
- `normalize`: VND nguyên an toàn; phân biệt GB/TB, RAM lắp sẵn/tối đa, CPU/GPU, OS, màu, mã vùng, tình trạng, VAT, phí, giá thường/khuyến mãi. Không tự chuyển đơn vị mơ hồ hoặc dùng dữ liệu bài quảng cáo thay thông số đã xác minh.
- `identity review`: mapping theo source product/SKU + cấu hình/region/condition; không ghép cross-source bằng title similarity đơn thuần. Chưa xác định được exact variant thì quarantine, không bịa `matchedVariantId`.
- `quality gate`: so structured và DOM; lỗi/mâu thuẫn/null giữ nguyên và có reason; output parser rỗng là báo động cần kiểm tra, không có nghĩa mọi sản phẩm hết hàng.
- `persist/export`: giao dịch nguyên tử, observations bất biến, replay không trùng; snapshot partial không xóa bản tốt cũ. Export có manifest/count/hash và review status, chưa là signed catalog production.

Schema staging đề xuất (chưa phải hợp đồng backend đã nghiệm thu):

| Nhóm | Trường chính / quy tắc |
|---|---|
| Envelope | `schemaVersion`, `runId`, `parserVersion`, `sourceId`, `fetchedAt`, `sourceUrl`, `contentHash`, `regionContext`, `captureMode` |
| Identity | `externalProductId`, `externalOfferId`, `sourceVariantId`, `manufacturerPartNumber`, `matchedVariantId` nullable, raw title/attributes và resolution status |
| Money | `listedPriceVnd`, `basePriceVnd`, `mandatoryFeesVnd` không gồm shipping, `shippingVnd`, `conditionalDiscounts[]`, VAT status, `totalVnd` nullable |
| Context | condition, stock, selected color/storage, promotion/payment/membership context, validity window, observedAt |
| Quality | field evidence, `unknownFields[]`, `conflicts[]`, rejection reasons, review status, source-use status |

Phí/thuế chưa rõ được biểu diễn unknown, không default 0; không tạo verified total khi thiếu thành phần bắt buộc. Giá base có thể đã bao gồm giảm ngay: không trừ ưu đãi lần hai. Stock theo variant và vùng, không theo nút “mua ngay” chung. Offer key giữ context cần phân biệt như condition/region/promotion; observation key thêm thời điểm + raw hash để replay cùng capture idempotent và phát hiện revision xung đột.

Agent 1 sở hữu staging/pipeline; Agent 3 sở hữu backend contract/import. Cần thống nhất mapping của staging sang `StagedCrawlerOffer` trước export nhập backend, đặc biệt nullable fees/condition/stock, region, exact ID và keys. Không ép bản ghi thiếu dữ liệu vào enum/number bắt buộc để qua validator. Chưa xác nhận tương thích hoặc kết nối E2E với code của Agent 3.

## 5. Chia gói triển khai và điều kiện hoàn thành

User giao Agent 1 trực tiếp làm crawler/pipeline; phạm vi này thay việc crawler dự kiến ở Agent 2. Không tạo Agent mới. Ownership dự kiến `tools/data-pipeline/**`, tài liệu kế hoạch này và hướng dẫn đi kèm; Agent 3 tiếp tục backend. Nhánh hiện tại `codex/dev/agent-1/data-pipeline`, baseline `90d4352`; chưa commit/push vòng nghiên cứu.

| ID / thứ tự | Việc và đầu ra | Dependency | Acceptance |
|---|---|---|---|
| DP-00 | Registry 8 nguồn, source policy, fixture mẫu tối thiểu, quyết định transport/runtime | Nghiên cứu này | 8 source IDs duy nhất; allowed URL/policy rõ; không dùng fixture như dữ liệu live |
| DP-01 | Core fetch/discovery, robots guard, retry/rate/timeout và giới hạn tải | DP-00 | Không fetch disallowed URL; không vòng lặp; lỗi có trạng thái và checkpoint |
| DP-02 | JSON-LD parser cho CellphoneS/FPT/LaptopAZ, nhóm MWG | DP-00 | Product/Group/Offer được liên kết đúng; SKU có leading zero không mất; DOM conflict được giữ |
| DP-03 | Trung Trần AggregateOffer + bảng DOM; Oneway/ShopDunk DOM | DP-00/02 | Không biến aggregate thành exact offer hoặc chọn nhầm option; identity unresolved vào quarantine |
| DP-04 | Chuẩn hóa, identity mapping và quality gate | DP-02/03 | Unknown phí/spec không thành 0/pass; conflicts có evidence; không double-count giảm giá |
| DP-05 | SQLite staging/history, manifest, atomic export, checkpoint/resume | DP-04 | Replay idempotent; rollback khi crash; export deterministic từ cùng snapshot |
| DP-06 | Adapter ingest backend + contract test | DP-05 và contract Agent 3 | Import/export thật qua validator; malformed batch không làm mất snapshot cũ |
| DP-07 | Smoke pilot tối đa 3 detail/nguồn và hướng dẫn sử dụng | DP-01–06, policy đã rõ | Báo count accepted/quarantine/failed theo nguồn, nguồn bị chặn báo blocked; không báo pass giả |

Ưu tiên làm một lát cắt LaptopAZ/FPT → staging → fixture backend trước, rồi MWG ProductGroup, sau đó DOM adapters. Đây là thứ tự kỹ thuật theo cấu trúc đã quan sát, không là chứng nhận nguồn dễ crawl hoặc có quyền tái sử dụng. Runtime dự kiến Python stdlib cho parser/SQLite/CLI; chỉ chốt sau spike raw HTML. Nếu cần browser render, dùng adapter riêng với lifecycle/bounded concurrency, không bắt HTTP parser phụ thuộc browser toàn hệ thống. Không chọn endpoint nội bộ chưa nghiên cứu.

## 6. Kế hoạch kiểm thử

| Test | Dữ liệu/thao tác | Kết quả mong đợi |
|---|---|---|
| DP-T01 / Parser | Product, nested @graph, list, invalid JSON-LD, ProductGroup + hasVariant | Chỉ trích product đúng; lỗi có reason; không lấy category aggregate thành exact offer |
| DP-T02 / Variant | TGDD hai màu, SKU khác, một màu OutOfStock | Không ghép thành một offer; không mất `code`/leading zero; stock độc lập |
| DP-T03 / Giá | FPT giá thường/flash sale/đặt cọc/trả góp; CellphoneS nhiều sale-price | Không lấy min toàn DOM; price context và validity rõ |
| DP-T04 / Identity | Oneway URL `zp-a`, H1 `X/A`; SKU retailer bị gắn nhãn mpn | Đánh dấu unresolved; không khẳng định manufacturer region/MPN sai |
| DP-T05 / Specs | RAM unknown, max RAM khác installed RAM, GB/TB thiếu/mâu thuẫn | Nullable + raw evidence; không pass hard constraint bằng suy đoán |
| DP-T06 / Money | Dấu phân cách VN, bool/negative/float/overflow, fees/shipping unknown | Integer safe hoặc reject; unknown total không affordable; không cộng VAT/ship/discount hai lần |
| DP-T07 / Policy | robots wildcard/query, riêng user-agent, redirects, robots trả HTML | Guard đúng URL; unresolved không allow-all; không đổi user-agent để né |
| DP-T08 / Transport | Timeout, 429 Retry-After, 503, 403/CAPTCHA, response quá lớn | Retry hữu hạn; backoff và giới hạn; blocked phân biệt not-found/parse-error |
| DP-T09 / Discovery | Sitemap lặp, load-more không thêm ID, URL trùng/tracking, giới hạn pages | Dedupe chính xác, dừng đúng, không discovery vô hạn hoặc chạm cart/login |
| DP-T10 / Storage | Replay cùng capture, observation mới, fail giữa transaction, resume | Không trùng; history còn; snapshot cũ không hỏng; tiếp tục được |
| DP-T11 / Contract | Export accepted/quarantine → backend fixture validator | Chỉ dữ liệu đủ điều kiện được nhận; nullable/ID mismatch bị báo; raw observations vẫn giữ |
| DP-T12 / CLI + runbook | Fixture end-to-end, sai config, output tồn tại, disk error | Exit code đúng, report/count nhất quán; không báo thành công khi ghi/export lỗi |

Unit/fixture test trước, HTTP integration bằng server thử nghiệm cục bộ có fault injection, sau đó E2E staging/export/import. Live smoke chỉ là bằng chứng quan sát parser, không thay thế source approval hoặc chứng minh coverage toàn site. Mỗi evidence record gồm source SHA, fixture hash, parser version, command, timestamps, counts và trạng thái passed/failed/blocked/not_run.

## 7. Hướng dẫn sử dụng sẽ bàn giao khi có code

Runbook cần có cài runtime; cấu hình 8 nguồn/allowlist/region/rate; thêm seed URL; mapping SKU/variant; chạy fixture không mạng; dry-run sample; crawl giới hạn/resume; đọc quarantine/conflict report; review/approve; export và import backend; rollback snapshot; cập nhật parser khi site đổi.

CLI dự kiến gồm `doctor`, `validate-config`, `parse-fixture`, `crawl --max-pages`, `report`, `export`, `verify-export`. Đây chỉ là tên thiết kế, **chưa có lệnh thực thi**. Hướng dẫn hoàn chỉnh sẽ dùng lệnh đã chạy kiểm chứng trên Windows và ghi rõ output mẫu, exit codes, unknown values và các bước recovery. Không yêu cầu người dùng nhập credential vào file fixture hay commit secret.

## 8. Trạng thái xác minh và bước tiếp theo

- Đã xác minh: browser tích hợp mở được 8 nguồn và detail mẫu; JSON-LD/DOM đã nêu; robots observations có lưu. Đã đóng tab nghiên cứu sau khi xong.
- Chưa xác minh: raw HTTP HTML, chính sách tái sử dụng đầy đủ, sitemap coverage, request tải thêm/API, DOM selectors ổn định qua các variant/vùng, adapter backend thực tế.
- Chưa triển khai/chạy: crawler, pipeline, unit/integration/E2E test, import backend hoặc crawl hàng loạt.
- Lần triển khai tiếp theo bắt đầu DP-00 và kiểm tra raw-HTML/policy spike; chốt contract với Agent 3 trước DP-06. Không tự chuyển sang production hoặc công bố dữ liệu chỉ vì nghiên cứu trang mẫu hoàn tất.
