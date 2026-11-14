# PLAN-04-FE — hợp đồng UI và quyết định bootstrap

Ngày: 14/11/2026. Owner: Agent 2, HCN_main, thread Agent 2: FE. Trạng thái: **ready / planning_only**. Lead đã tiếp nhận PLAN-02; chưa mở triển khai UI.

## Quyết định của Lead

- Agent 1 sở hữu crawler/pipeline, `tools/data-pipeline/**` và dữ liệu/tài liệu liên quan. P2-09/10 không còn là nhiệm vụ triển khai của Agent 2.
- Agent 2 sở hữu kế hoạch UI/client; Agent 3 sở hữu backend/API/persistence/AI. Không tự sửa shared schema, manifests/lockfiles/native config/CI.
- Không coi source UI được tài liệu lịch sử nhắc tới là đã có. `origin/dev` hiện có backend, chưa có `apps/adviser`. Bootstrap ứng dụng chưa được mở bởi brief này.
- Requirements: root `brd.md` và Demo 2 / implementation §26; đúng 3 ordered purposes và 3 ordered priorities. Không mở Windows/U19/quotation/PC assembly. Phân biệt unit pack `U06` với journey/feature U06 để tránh mở nhầm phạm vi.

## Baseline và workspace

- Git remote: `https://github.com/Djuybu/Lua.git`.
- Backend/integration ref đã fetch: `origin/dev` = `579b719d92be8e68d00837c727113f08b84afc75`; backend implementation `3f9389f0bf503533b74f1827a3c45fc3d09a37f8` đã merge vào dev.
- Data/pipeline bổ sung trên `origin/codex/dev/agent-1/data-pipeline` = `d885e33837eab5d3cc473a27b69675f87944cc71`. Chưa giả định commit này đã nằm trong dev.
- Checkout khảo sát hiện hữu: `D:\Lua - Pickem\Lua`, local main lịch sử `ecd2ded...`, không có managed worktree được giao. Vòng planning này chỉ đọc refs: có thể `git fetch origin` rồi `git show <pinned-sha>:<path>`; không checkout/chuyển nhánh/merge/reset/pull vào main để có tài liệu.
- Khi bắt đầu, báo remote/status/HEAD/ref thực tế; nếu ref đã tiến thì ghi rõ mismatch, vẫn đối chiếu pinned contracts. Nhánh/worktree triển khai và app baseline sẽ do Lead chốt ở gói bootstrap sau; không tự điền path dự kiến thành đã tạo.

## Input và contract versions

Đọc skill hackathon cùng role/contract, PLAN-02, root BRD, frontend plan/motion, và nguồn backend ở pinned ref. Hợp đồng backend thực tế: schema `1.0.0`, rule `2026.11`, `shortlist` (không phải `rankedShortlist`), exclusion `reasonCode`, patch `baseProfileRevision` và op `reasoning`.

HTTP hiện có: GET `/health`, POST `/advisor/v1/ingest`, POST `/advisor/v1/recommend`. Không giả định đã có search/detail/offers/refresh/pagination/cancel hoặc AI HTTP endpoints. Consumer cần phân biệt contract TypeScript hiện hữu, HTTP thực tế, UI-only state và đề xuất còn chờ.

Dataset: `tools/data-pipeline/datasets/retail-pilot-2026-11-14/` ở data SHA. Có 8 browser captures, 10 observations (6 ready-for-review/4 quarantine), catalog seed 4 variants và provenance; offers/facts rỗng có chủ đích. Source-bound IDs chưa là cross-retailer identity. Phí unknown giữ null; backend hiện yêu cầu mandatory fees dạng number nên chưa nhận nguyên staging bundle. Không gán 0, bịa giá hay coi empty facts là AI evidence.

Lead đã chạy 36 Python tests và backend SQLite import 4 variants/restart/rollback trên DB tạm; các kết quả này không là UI/native bằng chứng của Agent 2.

## Output của PLAN-04-FE

Chỉ báo cáo trong thread để Lead lưu/tổng hợp; không sửa source/file, commit/push, tạo worktree, thread hoặc Agent con.

1. **FE-C01 — API/DTO gap matrix:** từng flow nhu cầu/results/detail/compare/saved/AI cần input/output nào; mapping đúng tên trường hiện tại; endpoint/seam nào có thật, cái nào còn thiếu và ai sở hữu. Ghi ảnh hưởng của nullable fees/raw staging và yêu cầu gửi Agent 3; không tự duyệt đổi consumer.
2. **FE-S01 — UI state/event contract:** draft vs confirmed revision, category invalidation, async latest-request wins, review/confirm/cancel; phân biệt loading/no-match/no-fit/no-verified-offer/unknown/error/offline. Dữ liệu thật của seed dùng cho browse/detail; positive purchase/AI demos chỉ dùng fixture có nhãn khi chưa có offer/fact được duyệt.
3. **FE-B00 — bootstrap decision brief:** đề xuất package boundary, một app entry nhất quán, app framework/native/web-preview boundary, manifest owner, package/version constraints, scripts dự kiến, và file ownership. Chưa chọn/ghi dependency versions như đã cài; chưa khởi tạo app hoặc xây hai entry AndroidApp/AdviserApp song song.
4. **FE-T01 — first-slice acceptance pack:** đề xuất lát cắt needs 3/3 → review/confirm/cancel → result surface dùng adapter seam đã định nghĩa; ca validation budget, stale response, unknown costs, error recovery, keyboard/Back/reduced motion và test fixture. Mỗi case có input, expected, test layer, owner và dependency.
5. **FE-R01 — ready/blocked map:** công việc độc lập có thể mở ngay sau bootstrap, việc chờ endpoint/contract, việc chờ Android toolchain/device/human evidence. Không estimate APK/native completion trước inventory.

## Acceptance / kiểm tra vòng planning

- AC-P4-01: mọi đề xuất gắn requirement ID và source/contract pin; phân biệt mã hiện hữu, tài liệu lịch sử, đề xuất và not_run.
- AC-P4-02: mỗi DTO/state field có ownership; không invented HTTP route được trình bày là đã có; không có xung đột với crawler/pipeline Lead.
- AC-P4-03: fixture có provenance/mode; unknown fee/RAM/facts không được biến thành 0/pass/successful inference. Không lấy historical test counts làm verification mới.
- AC-P4-04: first-slice brief có file targets dự kiến, dependency, acceptance tests và lệnh chỉ khi có manifest; lệnh chưa tồn tại ghi rõ proposed/not_run.
- AC-P4-05: báo Git/status/runtime thực tế, không sửa checkout/worktree hiện hữu. Có thể chạy `git status --short`, `git rev-parse HEAD`, `git show <sha>:<path>`, `node --version`, `npm --version`. Chưa chạy build/native/crawl.

Agent 2 bàn giao kết quả về Lead; Lead sẽ chốt PLAN-04 và mở gói bootstrap riêng. Báo ngay nếu không đọc được data ref hoặc có user instruction mới tại thread nguồn làm đổi phạm vi.
