# BE và chatbot: ưu tiên sau vòng sửa lỗi

Nguồn: yêu cầu trực tiếp của người dùng tại Supervisor ngày 2026-11-14: sau khi Agent 3 trả kết quả sửa bug, đẩy nhanh hoàn thiện BE và chatbot. Đây là thứ tự triển khai tiếp theo; không hạ điều kiện nghiệm thu của vòng sửa lỗi.

Coordinator: environment `0d643e83-f77e-4710-96b0-3f8b4d2c8fc9`, thread `8a87aa59-85d2-41db-8572-751ac87fd1b2`. Mọi handoff hoặc blocker phải callback về đây, kèm source SHA và bằng chứng. Các Agent không tự tạo thread/Agent hoặc giao việc cho nhau.

## Baseline và cập nhật

- A3-DATA-02 đang chạy trên `codex/dev/agent-3/data-02`, worktree `C:\Users\duyhg\.t3\worktrees\Lua\codex-dev-agent-3-plan--38c9fd12caa9adf7`. Agent 3 đã xác nhận base `cdf31bd32519805e56240ff6e9470c1dc5708606`; backend tree `17bad234845cb1007e1353da6f21288ffa0a2de6` trước sửa.
- HTTP harness đã bàn giao tại `4ab33ca5f2d621ec46f54dfb36e4180b36983450`, kết quả cũ 20/30 pass, 7 nhóm defect. Giữ nguyên oracle trong `handoff-gates-http-ui.md`.
- Frontend đã được người dùng yêu cầu commit/push trực tiếp trong thread Agent 2: `origin/agent2-fe` = `cc065d38fae6a18738fec6479f2264e5fb7ef1e6`, 32 files. Coordinator đã fetch object và kiểm tra remote SHA. Thông tin UI còn untracked trong handoff cũ đã hết hiệu lực; source acceptance chưa được suy ra từ push.
- Agent 2 dùng `D:\Lua - Pickem\Lua`, branch `agent2-fe`. Giữ yêu cầu Material You/custom palette. User attachment được gọi là v3 hiện được Agent 2 báo hash giống bản trước; không suy diễn các thay đổi chưa có.
- Shared checkout Supervisor đang có các merge do tác nhân khác, HEAD quan sát `53a0a93b1bd63910c2d026edcd8223bdf52852c1` trên local `dev`. Không đổi/reset/push checkout này để gửi brief; chỉ publish file kế hoạch trên nhánh coordinator riêng.

## Gate P0: kết thúc A3-DATA-02 trước

Owner Agent 3, phạm vi/task hiện tại không thay đổi. Cần callback sửa 7 defect với before/after và pin consumer mới; đúng 30/30 HTTP cases gốc, raw staging/migration/replay/conflict/rollback/restart, AI grounding và timeout/cancel tests theo brief hiện hữu. Unknown money/facts không được biến thành số 0 hoặc claim tích cực. Push nhánh task, không tự merge contract mới vào dev/main.

Nếu chưa đạt gate, ưu tiên sửa lỗi còn lại; không gọi việc bổ sung chatbot là đã khép lỗi BE. Có thể gửi contract/source SHA bàn giao từng phần để rút ngắn thời gian chờ, phải ghi trạng thái incomplete.

## A3-CHAT-01: nhiệm vụ kế tiếp sau callback sửa lỗi

Trạng thái: prepared / chờ handoff A3-DATA-02 để Coordinator chốt baseline và kích hoạt. Owner Agent 3, chỉ `services/adviser-backend/**` và tài liệu backend liên quan; không sửa frontend/pipeline/harness của Agent 1.

Mục tiêu là một backend khởi chạy được và chatbot tối thiểu hoạt động qua HTTP thật, tái sử dụng domain/validator/AI adapter hiện có. Không cần đổi sang FastAPI/LangGraph hoặc làm Nano/signed-catalog để mở luồng này.

1. Bàn giao hợp đồng chatbot có version cùng request/response/error fixtures ngay đầu task. Tách nhu cầu tự do thành proposal cần review, câu hỏi thiếu dữ kiện thành clarification và giải thích sản phẩm dựa trên catalog server. Dùng request/conversation IDs, base profile revision, catalog/rule versions khi áp dụng. Backend giữ quyền sở hữu schema; UI chỉ dùng hợp đồng đã bàn giao, không tự đoán endpoint.
2. Bổ sung HTTP route/handler thực và runtime validation cho các tác vụ trên, giới hạn body/text/history, timeout/cancel, safe errors. Fact/offer dùng để giải thích phải lấy từ catalog và kết quả deterministic của server, không tin evidence do client tự gửi.
3. Provider chưa cấu hình phải có trạng thái rõ và fallback/clarification trung thực; không biến mock thành inference thành công. Thiếu facts/offer ở pilot thật phải nói thiếu dữ liệu; không bịa giá, phù hợp hiệu năng hoặc trong ngân sách. Needs proposal không tự sửa confirmed profile; mọi áp dụng đi qua review/confirm và guard revision.
4. Thêm lệnh khởi chạy BE có tài liệu và cấu hình demo dùng SQLite tạm/riêng, seed catalog thật, port/base URL và health/catalog version. Web kết nối bằng same-origin hoặc CORS allowlist cấu hình rõ; native không mở global cleartext. Không đưa secret vào app/log/repo.
5. Nếu có provider adapter dùng được thì cấu hình bằng biến môi trường phía server; mặc định không gọi paid/live provider trong test. Báo riêng phần live AI chưa xác minh. Nano và APK acceptance thuộc vòng riêng.

Acceptance / test cases phải viết trước implementation:

| ID | Test | Expected |
|---|---|---|
| CHAT-01 | HTTP input rỗng/null/scalar/sai schema/over-byte-limit | Safe 4xx, không provider call và không mutation |
| CHAT-02 | Nhu cầu chưa đủ và proposal hợp lệ | Clarification hoặc typed proposal; profile chưa bị sửa; đúng 3/3 khi xác nhận |
| CHAT-03 | Request/revision mismatch, hủy và response về muộn | Không áp dụng kết quả cũ; timer/listener được dọn |
| CHAT-04 | Catalog pilot 4 variants / 0 accepted offers / 0 facts | Không có claim tích cực không chứng cứ hoặc giá/affordability bịa |
| CHAT-05 | Synthetic fixture được gắn nhãn, có fact đúng domain và offer đầy đủ | Explanation/recommendation có ID provenance đúng, không lẫn dữ liệu synthetic vào pilot |
| CHAT-06 | Provider lỗi/timeout/output sai/không cấu hình | Fallback/unavailable minh bạch; có giới hạn thời gian và không leak secret |
| CHAT-07 | Khởi chạy theo runbook, HTTP health/chat/recommend và restart | Có thể chạy lại, catalog version khớp, không ghi production |
| CHAT-08 | Hồi quy BE | Typecheck/build/tests và đúng 30 HTTP cases hiện hữu pass |

## A2-CHAT-PREP-01: làm song song phần frontend độc lập

Owner Agent 2; baseline source `cc065d38fae6a18738fec6479f2264e5fb7ef1e6` trên nhánh người dùng chọn `agent2-fe`. Kiểm tra HEAD/status mới trước sửa; giữ các thay đổi người dùng. Sở hữu `apps/adviser/**` và tài liệu UI, không sửa BE/pipeline hoặc root/shared lockfile.

Được triển khai ngay UI/controller chatbot trong luồng Tư vấn hiện có: nhập/gửi, lịch sử hội thoại trong phiên, sending/cancel/error/retry/unavailable, hiển thị nguồn và nhãn fallback, proposal review/confirm/cancel giữ draft/confirmed riêng. Tái sử dụng Material You và responsive shell; không tự thêm service/session persistence ngoài phạm vi. Transport được inject/disabled khi chưa có contract BE; không hardcode API chưa được implement hoặc coi fixture là chat live. Chốt runtime types/endpoint từ handoff A3-CHAT-01 trước nối HTTP.

Tests cần có cho state/controller/UI: submit rỗng; gửi lặp; cancel/late response; profile revision đổi; error/retry; proposal chỉ durable commit sau confirm, cancel/write failure giữ profile; keyboard/focus/loading và nhãn fallback/unavailable. Chạy checks theo package hiện có (`npm run check`, `npm test`, `npm run build`, `npm run test:e2e` khi môi trường hỗ trợ). Fixture tests phải ghi rõ không phải HTTP E2E. Không cần chạy lại Android export nếu không đổi native/config.

Commit/push phần UI chuẩn bị trên nhánh người dùng đã chọn, verify remote SHA. Callback về Coordinator trước khi nhận task HTTP integration; không tự merge dev/main. Handoff gồm attachment/version mapping còn thiếu nếu có, source/lock/evidence hashes và actual tests/not_run. Không chặn các phần độc lập chỉ vì attachment v3 chưa khác bản cũ.

## Integration tiếp theo

- Coordinator nhận bugfix SHA/contract rồi kích hoạt A3-CHAT-01 và chuyển contract cho Agent 2. Việc A2 chuẩn bị UI không tự mở gate HTTP.
- Sau source/contract mới, Agent 1 được giao triển khai raw/chat HTTP harness mở rộng trên temp SQLite + fixtures có nhãn, và lệnh/runbook E2E. Đây là task implementation harness, không gộp vào báo cáo re-check của source cũ.
- Nối UI thật -> HTTP chatbot -> proposal review -> confirmed needs -> recommend -> grounded response. Kiểm tra pilot thiếu chứng cứ và synthetic positive riêng; CORS/same-origin, mismatch catalog/revision, offline/cancel/failure có evidence.
- Chỉ nhận phần có pin source và bằng chứng. Mọi task hoàn tất/blocked callback Supervisor; không tự mở vòng mới, không tuyên bố full AI/native acceptance khi chưa chạy.
