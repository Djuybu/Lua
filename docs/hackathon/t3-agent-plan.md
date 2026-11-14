# Kế hoạch chia việc Agent trong T3

Ngày: 14/11/2026. Trạng thái: **planning_only** theo yêu cầu người dùng. Chưa khởi chạy Agent con, tạo worktree, sửa source, commit, merge hoặc push.

## 1. Cơ sở và kết quả khảo sát

- Áp dụng `.agents/skill/hackathon-agent-skill/SKILL.md` và cả bốn tài liệu trong `references/`. Agent hiện tại đảm nhận Agent 1; khi bước thực thi được mở sẽ có đúng hai Agent con, không có tầng con tiếp theo.
- Repo: `https://github.com/Djuybu/Lua.git`; nhánh hiện tại `dev`; HEAD `81014a760948071997679f1afb24e92ab80fda75`.
- Có `main`, `dev`, `test`, `origin/main`, `origin/dev`; chưa có `develop`. Chưa fetch trong vòng lập kế hoạch nên đây là thông tin refs local.
- Working tree có sẵn `docs/hackathon/` chưa được track. Giữ nguyên `team-bootstrap.md`; bản kế hoạch này bổ sung kết quả mới, không xóa lịch sử blocker cũ.
- Cây tracked ở HEAD gồm `.agents`, `README.md`, `brd.md`, `docs`. Không có `apps/adviser/package.json` hoặc thư mục `research`. Các mô tả đã build/test trong tài liệu chưa thể xác minh trên checkout này. Không khởi tạo lại ứng dụng trước khi xác định source đang ở nhánh/commit nào.
- Nguồn yêu cầu chính là `brd.md` gốc (v3.2 và ghi chú Demo 2). `docs/planning/BRD.md` là tài liệu cũ, không dùng để thay phạm vi Android hiện hành bằng Windows. Đọc kèm `IMPLEMENTATION_PLAN.md`, `FRONTEND_IMPLEMENTATION_PLAN.md`, traceability và prebuild packs.

## 2. Phân vai và máy đích

| Vai trò | Nơi chạy dự kiến | Trách nhiệm | Sản phẩm |
|---|---|---|---|
| Agent 1 / Lead | Thread hiện tại, repo local | Chốt baseline, yêu cầu, hợp đồng, test chấp nhận, tích hợp và QA | Backlog, quyết định interface, báo cáo kiểm thử |
| Agent 2 / UI + crawler | HCN_main | React Native Android, trạng thái UI, adapter thu thập/chuẩn hóa nguồn được phép | Kế hoạch UI/crawler; sau đó code và bằng chứng đúng phạm vi |
| Agent 3 / Backend + AI | mzuyyy | API, persistence, validation, nghiệp vụ, adapter AI | Kế hoạch backend/AI; sau đó code và bằng chứng đúng phạm vi |

Đã đọc danh sách project thành công từ cả hai máy ở lần kiểm tra này:

- HCN_main có hai project cùng identity `github.com/djuybu/lua`: `E:\Lựa\Lua` (project `e87c5efb-4f1c-46c4-a5f9-dfb2299df648`) và `D:\Lua - Pickem\Lua` (project `4c4f5734-5d63-49e9-9dca-10b29977e7f1`). Ưu tiên khảo sát project thứ nhất; chỉ chốt sau khi kiểm tra remote, SHA và trạng thái working tree.
- mzuyyy có project `7978190c-a502-4ba2-971b-e2bcbf39e701`, đường dẫn `D:\Coding\Lua`, đúng repo identity.
- Quyền liên kết đã ghi nhận là `approval-required`. Đọc project thành công không chứng minh đã có quyền sửa source, tạo worktree hoặc push. Chưa kiểm tra ghi trên hai máy.
- Provider/model của hai Agent chưa chốt; phải kiểm tra khả năng trên từng máy trước khi giao. Không suy ra provider khả dụng ở máy đích từ danh sách trên máy hiện tại.

## 3. Thứ tự thực hiện khi tiếp tục

1. **PLAN-01 / Lead:** đối chiếu remote refs và lịch sử để tìm mã nguồn được tài liệu nhắc đến; phân biệt code còn thiếu với đường dẫn tài liệu đã lỗi thời. Ghi một baseline SHA chung, scope còn thiếu và lệnh kiểm tra thực sự tồn tại.
2. **PLAN-02 / Agent 2:** khảo sát UI/crawler trên baseline chung; lập danh sách việc đã có/còn thiếu, file sở hữu, dependency và acceptance case. Chỉ báo cáo, chưa sửa source.
3. **PLAN-03 / Agent 3:** khảo sát backend/AI trên cùng baseline; đề xuất hợp đồng và backlog, phân biệt mock với tích hợp thật. Chỉ báo cáo, chưa sửa source. PLAN-02 và PLAN-03 chạy song song sau PLAN-01.
4. **PLAN-04 / Lead:** hợp nhất hai báo cáo, giải quyết chồng chéo schema/file, chốt test và thứ tự triển khai. Nếu không tìm thấy source thì lập một gói khởi tạo tối thiểu riêng, tránh coi toàn bộ các mục được tài liệu mô tả là đã có.
5. **DEV-BASE / Lead:** sau khi mở giai đoạn triển khai, thiết lập `develop` từ baseline đã xác minh, không mặc định dùng `origin/main` hoặc ghi đè `dev`. Hai worktree con cùng bắt đầu tại commit này.
6. **DEV-2 và DEV-3:** triển khai các lát cắt đã chốt, tự kiểm tra và bàn giao SHA; Lead review rồi merge tuần tự vào `develop`.
7. **QA / Lead:** kiểm tra chấp nhận và hồi quy trên SHA tích hợp; lỗi quay về Agent sở hữu. Phát hành `main` là giai đoạn sau, ngoài yêu cầu lập kế hoạch hiện tại.

Không gán thời gian triển khai trước khi tìm được source và kiểm tra toolchain. Không coi các gate G0–G5 là được chấp nhận chỉ vì test kỹ thuật đạt.

## 4. Brief chuẩn bị cho hai Agent

### PLAN-02 — HCN_main / Agent 2

- Đọc skill, `agent-2-frontend-crawler.md`, `collaboration-contract.md`, `brd.md`, frontend plan/status và app-flow.
- Input: baseline SHA do PLAN-01 cung cấp, danh sách file thực tế và các chênh lệch với tài liệu. SHA hiện tại chỉ là mốc tham chiếu, không phải cam kết đây là source đầy đủ.
- Output: bảng hiện trạng và backlog UI/crawler có ID, file, dependency, acceptance criteria và lệnh kiểm tra đã xác minh; đề xuất schema producer cho Agent 3 review.
- Vùng code sở hữu dự kiến nếu hiện diện: UI/theme/features/presentation dưới `apps/adviser`; adapter crawler được Lead chỉ định sau khảo sát. Chưa coi những đường dẫn này là file đã tồn tại.
- Không sửa backend, migration hoặc schema chung đơn phương. Không crawl live trong vòng khảo sát.
- Đạt khi: có đối chiếu từng việc với yêu cầu; phân biệt đã triển khai/thiếu/chưa xác minh; liệt kê loading/empty/error/success, accessibility, responsive và các lỗi crawler liên quan.

### PLAN-03 — mzuyyy / Agent 3

- Đọc skill, `agent-3-backend-ai.md`, `collaboration-contract.md`, `brd.md`, implementation plan, prebuild packs và traceability.
- Input: cùng baseline và kết quả PLAN-01 như Agent 2.
- Output: bảng hiện trạng backend/AI, đề xuất API/schema, backlog có ID, file, dependency, acceptance criteria và lệnh kiểm tra đã xác minh.
- Vùng code sở hữu dự kiến: API/service, persistence/migration, nghiệp vụ và adapter AI sau khi kiểm kê source. Shared domain types phải được Lead chỉ định chủ sở hữu.
- Không sửa UI hoặc tự duyệt hợp đồng chung. Không gọi API tính phí, chạy DB production hoặc migration trong vòng khảo sát.
- Đạt khi: nêu rõ validation, lỗi/timeout, idempotency, provenance, AI fallback và giới hạn bằng chứng thật; không báo mock là tích hợp provider đã đạt.

Hai brief đều chỉ cho phép báo cáo ở vòng đầu; output dự kiến được Lead tổng hợp trong `docs/hackathon/`. Nhánh/worktree/SHA thực tế phải được báo lại, không điền đường dẫn suy đoán thành tài nguyên đã tạo.

## 5. Hợp đồng phải chốt trước khi chia code

| Biên giao tiếp | Nội dung cần chốt | Chủ trì |
|---|---|---|
| Crawler → backend | Nguồn được phép, ID variant/offer, đơn vị tiền VND, điều kiện giá, nullable, provenance URL/time, trùng/missing/conflict, version | Agent 3 đề xuất consumer; Agent 2 đối chiếu producer; Lead chốt |
| Backend → UI | Request/response, ID ổn định, phân trang, mã lỗi, unavailable/stale/unknown, validation và trạng thái pending | Agent 3 + Agent 2; Lead chốt |
| AI → nghiệp vụ/UI | Input tối thiểu, output có cấu trúc, căn cứ, timeout/cancel, từ chối output lỗi, fallback và giới hạn chi phí | Agent 3; Agent 2 đối chiếu trạng thái UI |
| UI → domain | Phone/Tablet/PC; đúng ba mục đích có thứ tự và ba ưu tiên có thứ tự theo ghi chú Demo 2; budget, review/commit/cancel | Lead đối chiếu BRD; hai Agent xác nhận |

Đây là checklist hợp đồng, chưa phải API đã được thông qua. Chỉ dùng fixture theo schema đã chốt. Package manifest/lockfile, shared schema và CI có một chủ sở hữu tại mỗi thời điểm; Lead quyết định trước khi giao code.

## 6. Test case và điều kiện nhận việc

| ID | Tiền điều kiện / thao tác | Kết quả mong đợi | Mức / chủ trì |
|---|---|---|---|
| TC-P01 | Đọc remote, branch, SHA và status của ba checkout | Đúng repo; mọi mismatch/uncommitted change được ghi; chọn cùng baseline | Khảo sát / cả nhóm |
| TC-P02 | Đối chiếu tài liệu với tracked source, manifest và scripts | Chỉ rõ link/source thiếu; không nhận lại số test pass từ tài liệu làm bằng chứng mới | Khảo sát / cả nhóm |
| TC-P03 | Đọc hai brief và backlog | Mỗi task có owner, file, dependency, AC, test; không hai Agent sửa shared file đồng thời | Review / Lead |
| TC-P04 | So schema producer/consumer và fixture | Thống nhất kiểu/đơn vị/null/lỗi/version; bất đồng được ghi trước triển khai | Review / Lead |
| TC-P05 | Kiểm tra remote provider, runtime, worktree capability | Có đường chạy thực tế và isolation phù hợp; hạn chế được báo rõ | Khảo sát / Lead |
| TC-D01 | Nhập category, ba purposes/priorities, budget rồi review/confirm/cancel | Thứ tự được giữ, lỗi field rõ ràng, cancel không ghi draft vào hồ sơ đã xác nhận | Integration/native / Agent 2 + Lead |
| TC-D02 | Feed fixture thiếu/trùng/conflict, timeout crawler | Không tạo offer trùng, không biến dữ liệu mâu thuẫn thành fact tin cậy; lỗi được phân loại | Unit/integration / Agent 2 + 3 |
| TC-D03 | Payload sai, ingest lặp lại, persistence restart | Validation theo hợp đồng, idempotency, dữ liệu được khôi phục đúng | Integration / Agent 3 |
| TC-D04 | AI unavailable/timeout/output lỗi/cancel | Fallback có nhãn; không báo inference thành công giả hoặc dùng output lỗi như fact | Contract/integration / Agent 3 + 2 |
| TC-D05 | Luồng needs → shortlist → detail → compare → save/restart/delete | Trạng thái nhất quán, xác nhận xóa, provenance và nhãn sample đúng | Acceptance/native / Lead |

TC-D01–05 là khung kiểm tra dự kiến, chỉ kích hoạt theo lát cắt triển khai đã chốt. Ánh xạ ID U/AC và prebuild cases chính xác sau kiểm kê source. Không chạy các lệnh npm được tài liệu mô tả khi manifest chưa tồn tại. Vòng này chỉ thực hiện khảo sát; các test chức năng ở trên là **not_run**.

## 7. Isolation, bàn giao và tích hợp

- Dùng `delegate_task` cho máy đích, kiểm tra capabilities trên từng máy trước. Yêu cầu worktree do T3 quản lý, không tạo worktree bằng shell trong prompt của Agent.
- Nhánh dự kiến: `codex/dev/agent-2/<task-id>` và `codex/dev/agent-3/<task-id>`, cùng commit nền `develop`. Tên/path thực tế do T3 tạo phải được kiểm chứng.
- Hồ sơ bootstrap cũ ghi remote delegation từng từ chối worktree isolation. Chưa có bằng chứng giới hạn này đã hết. Nếu vẫn bị từ chối: vòng khảo sát có thể dùng checkout hiện hữu chỉ đọc; vòng sửa code chờ có isolation phù hợp, không âm thầm sửa chung checkout hoặc tự đổi provider.
- Gửi kèm brief, baseline, skill và role/contract cho từng Agent; yêu cầu tự làm, không sinh Agent tầng tiếp theo.
- Trạng thái sau khi bắt đầu: `ready → in_progress → review → integrated → verified → released`; thiếu dependency dùng `blocked`, lỗi review dùng `changes_requested`. Hiện toàn bộ nhiệm vụ vẫn ở bản kế hoạch, chưa `in_progress`.
- Bàn giao code gồm task ID, branch/worktree, SHA, diff, AC, lệnh và kết quả thật, cấu hình/migration, giới hạn. Lead sở hữu test chấp nhận và merge; Agent con không cập nhật `develop`/`main`.
- Lỗi được giao về đúng owner với SHA, bước tái hiện, expected/actual và điều kiện retest. Sau hai lần sửa cùng lỗi phải xem lại nguyên nhân/hợp đồng.

## 8. Điểm dừng hiện tại

Bản kế hoạch đã lưu; hai project đích đã xác minh có đăng ký đúng repo. Chưa tạo Agent con. Những mục còn cần xác minh ở lần tiếp tục: source baseline, chọn một checkout trên HCN_main, provider máy đích, isolation và quyền thao tác thực tế. Không có báo cáo Agent con hoặc kết quả test chức năng nào được giả định là đã có.
