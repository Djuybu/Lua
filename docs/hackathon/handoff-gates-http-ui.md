# Handoff gates — A1-HTTP-02 và Agent 2 frontend

Coordinator: thread `8a87aa59-85d2-41db-8572-751ac87fd1b2`, environment `0d643e83-f77e-4710-96b0-3f8b4d2c8fc9`. Không tự mở vòng task tiếp theo; callback completed/blocked về đây.

## A1-HTTP-02: harness complete, HTTP acceptance BLOCKED_BY_BACKEND

Task HEAD đã fetch `4ab33ca5f2d621ec46f54dfb36e4180b36983450`; harness source `f6dd9b51a350083d9151932b1714727360b20588`; consumer `b979575aeb9f522565e53c69da777f37b8eb323c`, backend subtree `17bad234845cb1007e1353da6f21288ffa0a2de6`.

Coordinator đã kiểm tra hash committed source/fixture so với report (LF/CRLF), đủ9commandlogs, report status failed và suite20pass/10fail. Tất cả10caseđỏ khớp7defects dưới đây. Current fetched origin/dev `cdf31bd32519805e56240ff6e9470c1dc5708606` có backend subtree giống pin, nên remote source chưa vô hiệu các repro này. Working changes của Agent3 không được suy diễn từ remote refs.

41Python/45BE tests, typecheck/build và cleanup/watchdog là pass trong report. Chúng không thay cho HTTP acceptance. Không cần chạy lại cùng pin trước khi owner có sửa source. Raw adapter chưa bật, không có raw API acceptance claim.

| Defect / cases | Actual | Expected / dữ liệu cần giữ |
|---|---|---|
| HTTP-D01 / H03-ingest-null, H03-recommend-null | JSON literal null →500 | 400 safe validation; không writes |
| HTTP-D02 / H04, H09-unknown | Unknown exact variant →200; mixed batch ghi cả2 | 400; whole batch zero writes, không bypass known-variant validation |
| HTTP-D03 / H06-utf8 | JSON padding `ệ`×400000 >1MB UTF8 nhưng ít hơn1M JS chars →200 | 413 theo byte; ASCII exact-limit/over-limit tests vẫn giữ |
| HTTP-D04 / H08, H09-conflict | Same observation đổi giá+1 →200 silent-ignore; mixed new+conflict ghi sibling | 409 conflict, giữ original; toàn batch rollback |
| HTTP-D05 / H09-storage | Mixed valid + thiếu completenessStatus →500 và đã ghi first offer | Validate completeness/required storage fields →400; zero partial writes |
| HTTP-D06 / H10-nooffer | Matching hardware chưa có offers →NO_FIT | NO_VERIFIED_OFFER; NO_FIT dành cho hard failure đã chứng minh |
| HTTP-D07 / H10-unknown | Unknown shipping →SUCCESS | NO_VERIFIED_OFFER. Candidate total=null và isVerifiedAffordable=false đã đúng, không sửa thành claim lỗi affordability |

Evidence gốc: `docs/hackathon/integration/A1-HTTP-02/run-02/{report,http-suite,http-failure,http-hang}.json` và9logs trên Agent1taskbranch. Mỗi case có request/response + DB before/after + cleanup; large payload có generation/hash/bytes.

### Routing vào A3-DATA-02 đang chạy

Không tạo task sửa trùng: Agent3 nhận7defects như acceptance/repro cụ thể trong task implementation raw/unknown semantics hiện hữu. Owner BE tự sửa `services/adviser-backend/**`, giữ pipeline harness/expectations của Agent1 nguyên vẹn. Trước/sau phải chạy actual HTTP suite từ ref4ab33ca, BE tests/typecheck/build và các tests raw boundary hiện có. Ghi full consumer SHA/tree; sửa source taskbranch trước, không merge contract mới vào dev trước coordinator nhận evidence theo brief round02.

Gate: 30/30 existing HTTP cases pass trên consumer sửa, accepted/raw stores không lẫn, raw API/migration tests riêng pass; không skip cases, không đổi expected cho xanh. Nếu cần thay hợp đồng có lý do, báo rõ trước; không tự làm yếu oracle. Agent1 chưa mở raw adapter hoặc revalidation task trước khi có contract/source SHA mới; coordinator sẽ giao sau owner handoff.

## Agent 2: implementation authority confirmed, artifact acceptance pending

Coordinator đã đọc history source thread và xác nhận user trực tiếp mở implementation từ attachment `UIUX_FRONTEND_BACKEND_IMPLEMENTATION.md`, sau đó thay fixed forest-green bằng Material You + user-configurable palette. Planning-only cũ không còn là giới hạn của phần UI được user giao này.

Workspace báo cáo `D:\Lua - Pickem\Lua`, branch `codex/qa/resume-2026-11-14`, HEAD b979575. Source mới `apps/adviser/**`, `PRODUCT.md`, `DESIGN.md` chưa track/commit/push. Không có SHA source UI để coordinator nghiệm thu từ Git.

Theo báo cáo: Expo58/RN0.88.1/React19.3, theme package1.4.0, một entry, intake3/3, catalog/detail/compare≤4, saved/share/recovery, appearance system/light/dark/custom seed, recommend client revision/cancel/timeout. Seed4variants/0offers/0facts không có fabricated prices/fits/AI. Tests reported11/11, typecheck/web/AndroidJSexports, doctor20/20, compact/expanded Chromiumjourney và static detector pass; đây là reported evidence cho tới khi có source/lock/log artifacts.

Native APK/device MaterialYou/TalkBack/IME/Back/rotation/performance, real backend HTTP E2E và liveAI/Nano=not_run. Hermes JS export không là APK. Không coi attachments' FastAPI/LangGraph/signed-catalog/native AI services đã tồn tại.

### A2-HANDOFF-01 — đóng gói source/bằng chứng trên nhánh riêng

Owner Agent2, existing thread. Đây là packaging implementation handoff, không là delegated review và không mở tính năng mới.

1. Kiểm tra Git/status/HEAD và ownership, xác nhận không trộn tác nhân khác trên shared QA checkout. Không checkout/reset/clean/stash hoặc move/xóa source để đóng gói.
2. Tạo artifact commit chỉ từ `apps/adviser/**`, `PRODUCT.md`, `DESIGN.md` do Agent2 tạo. Bảo toàn checkout HEAD/branch/index hiện hữu nếu có nguy cơ dùng chung: có thể dùng temporary Git index/read-tree pinned base + stage allowlist + write-tree/commit-tree để tạo commit và task ref `codex/dev/agent-2/frontend-handoff`, không cần switch checkout. Không tạo checkout cho Agent khác hoặc thread mới. Nếu không bảo toàn được thì báo blocker, không commit lẫn/ghi đè.
3. Chỉ include source/config/manifests/lockfile/tests/runbook và evidence nhỏ liên quan. Exclude node_modules, dist, .expo/caches, local .env/secret, generated native build outputs, browser binaries và unrelated files. Rà staged tree/diff; root docs trùng ở ref mới phải báo conflict, không overwrite đơn phương.
4. Ghi source hashes/runtime/exact commands/logs trong `apps/adviser/verification/` và source SHA trong handoff. Lấy expected behavior từ user attachment/BRD; lưu hoặc reference attachment đủ để reviewer đọc, ghi scope khác biệt như compare4 nếu attachment mở rộng so với BRD lịch sử. Không tự đổi lại MaterialYou theo palette cũ.
5. Sau packaging source bất biến, kiểm tra commit tree tương ứng code đã test; run lại checks cần thiết nếu có changes. Push task ref riêng, verify remote SHA, không dev/main. Không tự merge vì backendHTTP còn7defects và actualclient E2E chưa xác minh.
6. Callback về coordinator: full source SHA/ref/base, file list, source/lock/evidence hashes, actual tests vs not_run và hướng dẫn chạy. Không mở UI task mới hoặc sửa BE/pipeline.

Sau đó coordinator có thể đọc source và quyết định integration/native acceptance riêng; chưa tuyên bố frontend production hoặc end-to-end accepted.
