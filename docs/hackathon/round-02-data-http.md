# Round 02 — tiếp nhận A1-INT-01 và nối HTTP/data boundary

Coordinator vẫn là thread `8a87aa59-85d2-41db-8572-751ac87fd1b2`, environment local `0d643e83-f77e-4710-96b0-3f8b4d2c8fc9`. Mọi completion/blocked phải callback về đây, không tự mở task khác.

## Tiếp nhận có giới hạn

A1-INT-01 **accepted for pinned scope**: remote task HEAD `b704dfb9237fe918b541a24eb3947ac5003ed115`, source harness `42039a44dec7772e6c48440a274d4be887efaece`, consumer `579b719d92be8e68d00837c727113f08b84afc75`.

Coordinator đã fetch và kiểm tra report status/consumer/productionWrites; hash hai source harness khớp committed bytes (có đối chiếu LF/CRLF), toàn bộ 18 logs tồn tại và expected exits/negative exit đúng. Log 08 xác nhận 37 Python tests; log 12 xác nhận 35 backend tests; typecheck/build và integration log đạt. Backend subtree trên task branch bằng consumer pin `ef1c425415d202def79011268c9008e136b7984f`. Diff sau integration merge chỉ nằm trong harness/tests/docs/logs được giao. Không chạy lại các test pin cũ khi không có thay đổi mới cần xác minh.

Không mở rộng kết luận sang consumer mới: current origin/dev `b979575aeb9f522565e53c69da777f37b8eb323c` đã có thay đổi BE/AI. Dataset vẫn 8 captures / 10 observations / 4 variants, manifest `6b6c6cc13730bf375324b246de99a31acb25054b580e87b060f9b9d4928de963`.

Source audit tại b979575: HTTP có health/ingest/recommend, accepted ingest gọi saveOffers trực tiếp; chưa có raw observation store/route. In-memory StagingIngestStore nhận accepted-offer shape, không phải raw boundary. Type mandatoryFees nullable không tự tạo persistence boundary cho 10 raw rows. Recommendation trả NO_FIT khi shortlist rỗng, kể cả chưa có offers. Fallback luôn thêm performance advantage và budget-fit claim dù không có fact/price evidence. Đây là đầu vào task implementation tiếp theo, không là kết luận từ việc đếm test pass.

## A1-HTTP-02 — Agent 1, implement HTTP integration runner

- Existing local worktree/branch `codex/dev/agent-1/lead-tasks`; base own HEAD b704dfb. Tích hợp consumer current b979575 vào task branch có chủ đích, ghi full SHA/tree. Không sửa backend hoặc push dev/main.
- Ownership: `tools/data-pipeline/scripts/`, pipeline integration tests/docs và `docs/hackathon/integration/A1-HTTP-02/`. Không sửa capture/dataset để làm assertion đạt, không root/shared manifests.
- Sản phẩm mới: runner khởi động actual createHttpServer trên `127.0.0.1` ephemeral port, dùng internal temp DB và consumer source explicit. Tương tác qua HTTP thật; không chỉ gọi validator/module và gọi đó là HTTP E2E. Dừng server/cleanup khi fail.
- Cases existing protocol: health/schema; real raw rows bị accepted ingest từ chối và không ghi accepted offers; malformed/null/scalar JSON; semantically invalid/unknown variant; UTF-8 payload byte limit; accepted synthetic approved offer (label rõ) qua HTTP → persistence/replay/restart; conflicting replay không âm thầm success; mixed batch error không ghi nửa batch; recommendation no-data/no-verified-offer/unknown và không false affordable. Positive purchase dùng fixture có nhãn, không phí 0 bịa cho real rows.
- A3-DATA-02 sẽ bổ sung route raw. Thiết kế adapter/test tách riêng: chỉ bật raw-route assertions khi có consumer contract/source thật bàn giao. Không tự invent endpoint đang có hoặc sửa backend để tests xanh. Nếu current b979575 fail semantic assertions, giữ test đỏ và gửi defect/repro về coordinator; không sửa expected về hành vi sai.
- Test Python runner subprocess/timeout/nonzero propagation và Node HTTP/temp DB, chạy manifest checks tương ứng. Log source tree, command, IDs, counters, assertions, fixture/live mode; zero paid providers/production writes. Push task branch/report và callback khi completed hoặc khi cần BE fix.

## A3-DATA-02 — Agent 3, implement durable raw boundary và truthful unknown semantics

- Đây là task implementation mới sau bàn giao A3-RAW-01; không yêu cầu chạy lại review trong thread hay tạo Agent khác. Base current dev b979575; làm nhánh/worktree task hiện hữu, giữ thay đổi người dùng.
- Ownership `services/adviser-backend/**`, BE tests/docs riêng; không sửa pipeline/captures/UI. Làm commit/push nhánh task trước; coordinator nhận contract cuối và integration evidence trước merge đợt contract mới vào dev. Không main/production/force.
- Implement durable raw observation staging tách accepted offers, giữ nguyên 10 real observations kể cả nullable fees, unmapped IDs/UNKNOWN enums/conflicts/provenance; không promote tự động hoặc đổi null thành 0.
- Contract Lead chốt cho slice: additive POST `/advisor/v1/raw-staging`, body pipeline `lua.staging.v1` bundle với manifest/records. Validate shape/hash/count và invariants trước write; bounded bytes; 10 structurally valid raw rows được lưu ở raw table, 0 accepted offers. Preserve producer ready_for_review/quarantine labels và thêm consumer readiness/reasons riêng, không biến label producer thành approved. Reply có counts + acceptedOffers=0; malformed body/hash/collision có safe error và zero partial writes. Không có search/AI/public publishing endpoint mới trong slice.
- Raw table khóa observationId, payload canonical bất biến: replay identical idempotent, cùng ID khác content báo conflict/409 và batch rollback, restart giữ observations. Migration additive trên DB baseline có dữ liệu, không reset/erase existing variants/offers/decisions. Cung cấp public raw query seam cho integration tests hoặc read-only route bounded nếu thực sự cần, ghi rõ contract.
- Sửa semantic defects đã có source evidence: (1) no offer/unknown costs trả trạng thái không có verified offer/evidence, không khẳng định NO_FIT phần cứng khi chưa có giá; giữ NO_FIT cho hard mismatch thật; (2) fallback/mocked AI không tạo performance/budget-fit advantage khi facts rỗng hoặc chưa có validated affordability. Unknown claim phải có wording/kind trung thực; không đổi thành invented fact IDs. Fact fallback phải đúng domain, không dùng variant.factIds[0] bất kỳ thay performance evidence.
- Rà đường accepted ingest để raw store không bypass known variant/validation/transaction/duplicate reporting. Validate null/scalar body thành 400; giới hạn 1MB theo bytes, không JS string length. Không yêu cầu rewrite ngoài slice; nếu cần breaking change thì version/document rõ trước khi bàn giao.
- Tests trước/sau theo risk: real 10-row raw HTTP ingest + restart + replay + malformed manifest + same-ID changed payload + partial batch rollback + baseline DB migration; accepted store unchanged; null fees incomplete; no-offer vs hard-fail status; no-fact/no-offer AI fallback; positive grounded fixture riêng; cancellation/timeout và existing regressions. Typecheck/build/BE tests, pipeline suite sau integration. Không paid/live AI, không production DB.
- Bàn giao full source/consumer SHA, schema/API examples/error codes/readiness meanings, migration/test evidence; callback về coordinator. Nếu hash canonicalization khác Python phải báo/fix contract cùng fixture, không bỏ hash để pass.

## Agent 2

A2-FE-C01 còn đang chạy và chưa bàn giao đầy đủ tại lúc chốt vòng này. Không mở implementation UI hoặc task trùng. Bảo lưu đề xuất no-offer/unknown/fallback states, đợi handoff để chốt bootstrap. Agent2 không đổi shared checkout đã bị tác nhân khác chuyển branch; cần T3-managed isolated worktree trước gói UI code sau.

## Callback

Gửi `t3_thread_send` về coordinator local nêu trên khi completed/blocked: task/status, branch/worktree, base/head SHA, files/AC, từng command/exit/result, positive fixture vs real-data coverage, defects và next dependencies. Không tự giao task kế tiếp. Nếu reverse link vẫn approval-required gây runtime_mode_escalation_denied, lưu report trên task branch và báo lỗi trong thread; không tự nâng quyền hoặc tuyên bố coordinator đã nhận.
