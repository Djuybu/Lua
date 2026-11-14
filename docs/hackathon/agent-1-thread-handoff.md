# Agent 1 — context cho thread Lead riêng

Ngày bàn giao: 14/11/2026. Người dùng yêu cầu tạo một thread mới riêng cho Agent 1 trên **máy hiện tại**, model **GPT-6.1 Sol**, reasoning **medium**. Không chuyển thread này sang HCN_main/mzuyyy.

## Vai trò và ownership

- Agent 1: điều phối yêu cầu/hợp đồng, crawler/data pipeline, dữ liệu, QA/tích hợp và runbook. Người dùng đã giao crawler trực tiếp cho Lead, thay assignment crawler ban đầu của Agent 2.
- Agent 2: UI/client, HCN_main. PLAN-02 hoàn tất và bàn giao; vẫn planning_only, chưa mở bootstrap UI.
- Agent 3: backend/persistence/AI, mzuyyy. Đã làm backend và merge vào dev; đang được giao tiếp nhận dataset thật và xử lý unknown-fee staging boundary.
- Tiếp tục `.agents/skill/hackathon-agent-skill/SKILL.md` và bốn references. Không tự tạo thêm Agent/thread: hai Agent hiện hữu đã có; người dùng yêu cầu chuyển context Lead, không khởi tạo lại đội.

## Repository/baseline

Remote `https://github.com/Djuybu/Lua.git`. Project local ID `12d120c2-2188-4d11-839a-d16eececba45`, project root `D:\hobby_project\lua`. Working tree gốc sạch khi chuẩn bị bàn giao.

- `origin/dev` đã fetch = `579b719d92be8e68d00837c727113f08b84afc75`, merge backend `3f9389f0bf503533b74f1827a3c45fc3d09a37f8`.
- Nhánh pipeline `codex/dev/agent-1/data-pipeline` đã push: `b2f89e2` core; `d885e33837eab5d3cc473a27b69675f87944cc71` dataset; `df9aeac8b63db19598485a3cf0f03a8b0b35d697` PLAN-04-FE brief. File handoff này sẽ thêm commit riêng sau các mốc đó.
- Backend và pipeline đang trên hai refs khác nhau: không mặc định nhánh nào đã chứa cả hai. Thread mới cần T3-managed worktree xuất phát từ nhánh pipeline để có code/data/handoff, rồi khảo sát origin/dev trước tích hợp có chủ đích.
- Chưa có `apps/adviser` trên dev khảo sát; refs main/local main tại các máy có thể là README-only. Các docs nói đã build app/APK là lịch sử chưa đối chiếu source; không gọi các test counts đó là run mới.
- Có dev/main/test lịch sử; chưa chốt develop làm nhánh tích hợp. Người dùng đã cho Agent 3 merge/push backend vào dev. Không tự đổi tên hoặc ghi đè nhánh, không phát hành main/production từ yêu cầu tạo thread này.

## Quyết định sản phẩm

Root `brd.md` v3.2 + ghi chú Demo2 và IMPLEMENTATION_PLAN §26 là authoritative: Android React Native/Expo, Phone/Tablet/PC laptop/prebuilt, đúng 3 ordered purposes + 3 ordered priorities, intake/clarification/review riêng và result surface dùng chung. Không mở Windows/U19/quotation/PC assembly. HTML/CSS chỉ là preview. Phân biệt unit pack U06 và journey U06. UI bootstrapping chưa được duyệt qua PLAN-04-FE.

## Data và pipeline đã có

Đọc `tools/data-pipeline/README.md`, `VERIFICATION.md`, `datasets/retail-pilot-2026-11-14/README.md`, `docs/hackathon/data-pipeline*.md`.

- Python stdlib CLI, parser 1.1.0, eight source configs, robots/bounded fetch/discovery, JSON-LD/ProductGroup và DOM fallback, SQLite staging/history, atomic hashed export, explicit-review backend payload. Runtime đã chạy: Python3.15.2, SQLite3.53.4, Node22.19.0.
- 8 nguồn: CellphoneS, TGDD, FPTShop, Trung Trần, LaptopAZ, ShopDunk, Điện Máy Xanh, Oneway.
- HTTP smoke bị network/reset, nhưng T3 integrated browser đã capture thật cả8 nguồn. Không tuyên bố HTTP adapters live-qualified. Chrome addon/CUA host từng không khả dụng; browser T3 hoạt động sau preview_open. Khi cần browser dùng preview_status → preview_open; không dùng addon cho đến khi đã xác minh lại.
- Dataset có8 captures,10 observations (6ready-for-review/4quarantine), catalog4variants và provenance. Đây là rendered projections/retailer claims, không raw HTML toàn trang hay dữ liệu hãng đã duyệt. IDs source-bound, không cross-retailer equivalence.
- Giữ unknown phí=null; catalog offers/facts rỗng có chủ đích, factIds=[]; không fabricate affordability/performance facts.
- Real cases: FPT normal/special price khác; TGDD stock riêng theo3màu/SKU; TrungTrần AggregateOffer với validity2019; Oneway invalidJSONLD +region zp-a/X/A; ShopDunk stock/condition chưa xác minh.
- Đã chạy36Python tests pass; dataset rebuild/hash verify pass; actual backend origin/dev trên DBtạm import4variants/restart/rollback pass và reject10unknown-feeoffers đúng kỳ vọng. Chưa chạy backend HTTP import dataset/liveAI hoặc production publication.

Từ tools/data-pipeline: `python -m unittest discover -s tests -v`, `python -m scripts.build_retail_pilot`, `python -m lua_pipeline verify-export --input datasets/retail-pilot-2026-11-14/staging-bundle.json`. Node contract/persistence scripts cần backend source đầy đủ ở path chỉ định; các source copies đã dùng kiểm chứng ở .work là artifact local ignored, không có trong worktree mới. Cần đọc code thật từ ref/backend integration thay vì giả định các temp file tồn tại.

## Hai thread phối hợp hiện hữu

- Agent2 FE: environment HCN_main `7fc5aa4e-6e6f-4a91-80ef-84865493c0fa`, project `4c4f5734-5d63-49e9-9dca-10b29977e7f1`, thread `e375173a-6694-4e88-a50b-9a565fb0550f`. Workspace khảo sát `D:\Lua - Pickem\Lua`; chưa worktree triển khai.
- Agent3 AIBE: environment mzuyyy `d17951b0-5ef5-4ee0-99e2-63ff98327be0`, project `7978190c-a502-4ba2-971b-e2bcbf39e701`, thread `mcp:launch:e3e61225db7019452253ce430e8d1df56bea5a9cd5e710e8fcd4aca8ee45f1ee`. T3 worktree trên máyđích đã có; đừng tự tạo checkout cho nó.
- Thread bàn giao Lead cũ local: `8a87aa59-85d2-41db-8572-751ac87fd1b2`, environment `0d643e83-f77e-4710-96b0-3f8b4d2c8fc9`.

Luôn read thread trước khi báo trạng thái. Link trong reply phải dùng link T3 trả về. Không dùng thread_send thay delegate cho review mới; chỉ giao tiếp/handoff đã được người dùng yêu cầu với các thread hiện hữu. Không poll delegates; tuân next do tool trả về.

## Pending giao tiếp và việc kế tiếp

1. `docs/hackathon/plan-04-fe-brief.md` đã push, nhưng gửi trực tiếp Agent2 bị T3 runtime_mode_escalation_denied: linkHCN_main approval-required, targetthread full-access. Không tuyên bố đã giao thành công. Người dùng chưa cho đổi quyền HCN_main; không tự unlink/relink hoặc nâng quyền. Agent2 có thể đọc brief qua Git hoặc read Lead cũ. Brief chỉ yêu cầu DTO/APIgap, state/event, bootstrapdecision và acceptancepack, không sửa UI/code/commit/push.
2. Dataset đã push và thread_send tới Agent3 thành công, run ordinal7 khởi chạy. Linkmzuyyy full-access. Agent3 được yêu cầu fetch data branch, dùng catalog/staging, giữ unknown fees; ownbackend có thể thêm rawstaging/nullable contract thay ép0, chạy regression và merge/push dev sau test theo quyền người dùng. Chưa xác minh kết quả run này; read trước khi kết luận.
3. Actual backend schema1.0.0/rule2026.11, response `shortlist`, exclusion `reasonCode`, AIpatch `baseProfileRevision`/`reasoning`; actual HTTP chỉ health/ingest/recommend. Không invent search/detail/AI endpoints đã có. Pipeline bundle khác StagedCrawlerOffer payload; không POST nguyên bundle.
4. Lead tiếp theo nên nhận các handoff, hợp nhất PLAN-04 và chốt baseline tích hợp backend+pipeline; resolve nullable/rawstaging boundary với Agent3; chỉ mở UIbootstrap sau brief/ownership/manifests/managedworktree rõ. Không làm trùng crawler với Agent2.

Yêu cầu tạo thread chỉ cho phép khởi tạo context và khảo sát tiếp nhận. Bước đầu trong thread mới: đọc các tài liệu/ref cần thiết, xác minh Git/model/workspace, báo đã nhận cùng nextsteps/blockers. Chưa tự sửa source, merge/push hoặc phát hành chỉ vì được tạo thread; chờ task tiếp theo hoặc chỉ thị thực thi cụ thể của người dùng tại thread mới.
