# Agent 3 — Báo cáo Triển khai Backend & AI Feature (PLAN-03 / DEV-3)

**Ngày cập nhật:** 14/11/2026  
**Nhánh công việc:** `codex/dev/agent-3/plan-03`  
**Worktree:** `C:\Users\duyhg\.t3\worktrees\Lua\codex-dev-agent-3-plan--38c9fd12caa9adf7`  
**Commit cơ sở (Base SHA):** `90d43528810a96c4a0acb4fb5cf43a1b2cf71709` (trên `origin/dev`)  
**Thư mục sở hữu (Ownership):**
- `services/adviser-backend/**` (Mã nguồn backend, hợp đồng chia sẻ, SQLite persistence, AI adapter, unit/integration tests, README, package manifest)
- `docs/hackathon/agent-3-backend.md` (Tài liệu này)
- **Không can thiệp:** `tools/data-pipeline/**`, `docs/hackathon/data-pipeline.md`, UI frontend `apps/adviser/**`, root package lockfile.

---

## 1. Phạm vi Triển khai & Cập nhật Hợp đồng sau Review từ Agent 1

Tuân thủ nghiêm ngặt các điều chỉnh giao tiếp đã được Agent 1 phê duyệt:

### 1.1. Thứ tự & Tính hợp lệ của Purposes & Priorities (Taxonomy Rule)
- `orderedPurposes` và `orderedPriorities` **bắt buộc chứa chính xác đúng 3 giá trị** (đối với profile đã xác nhận - confirmed profile), không trùng lặp, giữ nguyên thứ tự ưu tiên giảm dần (1 > 2 > 3).
- Giá trị phải thuộc danh mục chuẩn hoá cho từng thiết bị (`phone`, `tablet`, `pc_laptop`, `pc_desktop`). Nếu profile vi phạm (thiếu, thừa, trùng, sai danh mục) hệ thống từ chối tính toán với mã lỗi `ERR_INVALID_PROFILE`.

### 1.2. Tiền tệ & Phí (VND Integer, Safe Arithmetic, Phí tách bạch)
- Đơn vị tiền tệ: **Số nguyên không âm (VND Integer >= 0)**, kiểm tra `Number.isSafeInteger()`, bảo vệ chống tràn số (overflow).
- **Tách bạch phí vận chuyển:** `mandatoryFeesVnd` là các chi phí bắt buộc (thuế, phụ phí dịch vụ) nhưng **tuyệt đối không bao gồm `shippingVnd`** nhằm tránh tính phí ship hai lần.
- **Quy tắc tính tổng (`totalVnd`):**
  $$\text{totalVnd} = \text{basePriceVnd} + \text{mandatoryFeesVnd} + \text{shippingVnd} - \text{confirmedDiscountVnd}$$
- **Quy tắc giá trị chưa biết (Unknown Shipping):** Nếu `shippingVnd === null`, thì $\text{totalVnd} = \text{null}$. Hệ thống không được tự ý coi phí ship bằng 0; offer đó **không bao giờ được nhận huy hiệu `isVerifiedAffordable`** (Bảo toàn BR-04 & BR-05).

### 1.3. Định danh Offer Ổn định vs. Bản ghi Quan sát Giá (Stable Offer ID vs. Observation ID)
- **Stable Offer Key:** `(sourceId, externalOfferId)` — đại diện cho link bán/chào hàng của một đại lý.
- **Observation Key:** `(sourceId, externalOfferId, observedAt)` — đại diện cho một lần ghi nhận giá tại thời điểm cụ thể.
- **Idempotency:** Nạp lại cùng một observation key không làm trùng lặp bản ghi, không sinh sai lệch lịch sử giá. Các observation mới được lưu lại vào bảng lịch sử giá để phục vụ đối chiếu và audit.

### 1.4. Hợp đồng Đề xuất Sửa đổi của AI (Discriminated Union & Stale Revision)
- Patch đề xuất từ AI phải là một danh sách các thao tác có kiểu xác định (`discriminated union` theo `path` và `op`):
  - Khi `op: 'SET'`: bắt buộc có `value` hợp lệ theo schema của từng trường (`category`, `hardCeilingVnd`, `orderedPurposes`, `orderedPriorities`).
  - Khi `op: 'CLEAR'`: **không có thuộc tính `value`**.
- Đề xuất của AI **không bao giờ tự ý áp dụng** lên confirmed profile; phải gửi kèm `baseProfileRevision`. Nếu revision này khác phiên bản hiện tại của phiên làm việc, hệ thống từ chối áp dụng (`ERR_STALE_REVISION`).

### 1.5. Cấu trúc Envelope Đối Xứng & Mã Lỗi An Toàn
- Cả Request và Response đều có: `schemaVersion`, `requestId`, `decisionId`, `profileRevision`, `catalogVersion`, `ruleVersion`.
- Mã lỗi trả về chuẩn hoá: `ERR_INVALID_PROFILE`, `ERR_STALE_REVISION`, `ERR_AI_TIMEOUT`, `ERR_AI_INVALID_OUTPUT`, `ERR_CATALOG_UNAVAILABLE`, `ERR_OVERFLOW`. Không để lộ stack trace nội bộ hay API secret.

### 1.6. Offline-first & Deterministic Domain là Trọng Tâm
- Thuật toán sàng lọc và xếp hạng hoàn toàn định nghiệm (deterministic).
- AI chỉ đóng vai trò phân tích ngôn ngữ tự nhiên thành patch và diễn giải kết quả từ fact bundle có thật; không được bịa thông số, giá, URL hay ghi đè ràng buộc cứng.

---

## 2. Tiêu chí Chấp nhận (Acceptance Criteria - AC)

* **AC-BE-01 (Toàn vẹn Số học VND & Unknown Fee):**
  * Tiền là số nguyên không âm `<= Number.MAX_SAFE_INTEGER`. Phát hiện và chặn tràn số.
  * Phí ship `null` dẫn tới `totalVnd = null` và `isVerifiedAffordable = false`.
* **AC-BE-02 (Ràng buộc cứng & Xếp hạng Định nghiệm):**
  * Vượt trần ngân sách (`hardCeilingVnd`) dù chỉ 1 VND thì `isEligible = false`, chuyển vào `excludedVariants`.
  * Không đủ RAM hoặc sai hệ điều hành (OS) bắt buộc thì kết quả là loại trừ (`NO_FIT`).
  * Fact năng lực bị thiếu/mâu thuẫn trả về `UNKNOWN`, không bao giờ được ngầm gán đạt.
  * Xếp hạng tuân thủ thứ tự 3 priorities của người dùng mà không tạo điểm số ảo ngẫu nhiên.
* **AC-BE-03 (Idempotent Ingest & Nhận diện Biến thể Chính xác):**
  * Khảo sát dữ liệu crawler lặp lại cùng `(sourceId, externalOfferId, observedAt)` không sinh dòng thừa.
  * Offer không đúng chính xác `variantId` bị loại bỏ (chống nhầm lẫn dòng máy tương tự nhưng khác cấu hình).
* **AC-BE-04 (Lưu trữ Bền vững, Kích hoạt Nguyên tử & Rollback SQLite):**
  * Nhập snapshot catalog vào staging table; chỉ kích hoạt khi toàn bộ kiểm tra hợp lệ thành công.
  * Lỗi giữa chừng trong quá trình nạp snapshot tự động rollback 100%, bảo toàn catalog và lịch sử đang hoạt động.
  * Khởi động lại ứng dụng (restart) khôi phục nguyên vẹn trạng thái đã lưu.
* **AC-AI-01 (Validator Độc lập & Chống Ảo giác):**
  * Chặn các patch vi phạm schema (nhập số âm, sai op/path, thừa value trong CLEAR).
  * Chặn claim giải thích viện dẫn `factId` không tồn tại trong catalog hoặc gán fact sai biến thể.
* **AC-AI-02 (Fallback Định nghiệm khi AI Lỗi/Timeout/Cancel):**
  * Khi AI mock/provider gặp timeout (>= timeoutConfig), lỗi hoặc huỷ, tự động fallback về mẫu giải thích rule-based, gắn cờ `isFallback: true` và `fallbackReason`.
* **AC-NET-01 (Kiểm thử Biên giới HTTP Thực):**
  * Chạy server HTTP thực tế trên localhost; gửi request envelope thật qua client HTTP và nhận response chuẩn.

---

## 3. Nhật ký Công việc & Kết quả Thực thi

1. [x] Khởi tạo worktree độc lập `codex/dev/agent-3/plan-03` tại `C:\Users\duyhg\.t3\worktrees\Lua\codex-dev-agent-3-plan--38c9fd12caa9adf7`.
2. [x] Lập tài liệu hợp đồng và AC (`docs/hackathon/agent-3-backend.md`).
3. [x] **BE-01:** Khởi tạo `services/adviser-backend`, xây dựng `contracts/` (`taxonomy.ts`, `money.ts`, `crawler.ts`, `catalog.ts`, `envelope.ts`, `ai.ts`), `domain/money.ts`, `data/ingest.ts`.
4. [x] **BE-02:** Xây dựng lõi `domain/eligibility.ts`, `domain/ranking.ts`.
5. [x] **BE-03:** Triển khai SQLite persistence bền vững (`data/sqlite.ts`), quản lý snapshot nguyên tử và rollback.
6. [x] **AI-01:** Xây dựng AI contract validator (`ai/validator.ts`) và deterministic fallback engine (`ai/fallback.ts`).
7. [x] **AI-02:** Xây dựng Bounded Adapter (`ai/adapter.ts`) và HTTP Server boundary (`server/http-app.ts`).
8. [x] Chạy bộ kiểm thử toàn diện (Unit, Integration, HTTP boundary) và TypeScript check.

---

## 4. Kết quả Kiểm thử Thực tế (35/35 Tests Passing)

Lệnh thực thi:
```powershell
node --experimental-strip-types --test tests/*.test.ts
npm.cmd run typecheck
```

Chi tiết kết quả:
- **Tiền tệ & Số học VND (`tests/money.test.ts` - 6 tests):**
  - Kiểm tra `isValidVnd` với safe integer, số âm, số thực (pass).
  - Phép tính với đầy đủ thành phần: 20M base + 300k fees + 200k ship - 500k discount = 20.000.000 VND (pass).
  - Phí ship `null` -> `totalVnd = null` và `isComplete = false` (pass).
  - Biên ngân sách: Đúng trần 20.000.000 VND -> pass; vượt đúng 1 VND (20.000.001 VND) -> fail (pass).
  - Bắt lỗi và chặn tràn số `MoneyOverflowError` (pass).
  - Chặn số âm và kiểu dữ liệu sai `InvalidMoneyError` (pass).
- **Hợp đồng & Phân loại (`tests/contracts.test.ts` - 5 tests):**
  - Profile xác nhận với đúng 3 purposes và 3 priorities hợp lệ (pass).
  - Từ chối profile chỉ có 2 mục đích hoặc 4 ưu tiên (pass).
  - Từ chối profile có mục đích hoặc ưu tiên trùng lặp (pass).
  - Từ chối mục đích không thuộc danh mục thiết bị đã chọn (pass).
  - Kiểm định schema `StagedCrawlerOffer` hợp lệ (pass).
- **Khảo sát Crawler & Idempotency (`tests/ingest.test.ts` - 4 tests):**
  - Nhận offer hợp lệ và tăng số lượng quan sát (pass).
  - Tính bất biến (idempotent): Nạp lại cùng observation `(sourceId, externalOfferId, observedAt)` bỏ qua bản ghi trùng (pass).
  - Cập nhật offer mới nhất khi có quan sát mới hơn theo mốc thời gian (pass).
  - Từ chối offer có `matchedVariantId` không tồn tại trong danh mục catalog (pass).
- **Ràng buộc cứng & Sàng lọc (`tests/eligibility.test.ts` - 5 tests):**
  - Đạt điều kiện khi thoả mãn toàn bộ ràng buộc cứng và ngân sách (pass).
  - Vượt trần ngân sách đúng 1 VND bị loại với mã `EXCEED_BUDGET` (pass).
  - RAM không đủ mức yêu cầu bị loại với mã `RAM_INSUFFICIENT` (pass).
  - Hệ điều hành (OS) không khớp bị loại với mã `OS_MISMATCH` (pass).
  - Phí ship `null` cho phép qua vòng sàng lọc nếu giá niêm yết trong ngân sách, nhưng không cấp huy hiệu xác minh giá (pass).
- **Xếp hạng Ưu tiên (`tests/ranking.test.ts` - 2 tests):**
  - Ưu tiên tiết kiệm (`priority_budget_savings`) xếp máy rẻ hơn lên đầu (pass).
  - Ưu tiên hiệu năng (`priority_performance_cpu`) xếp máy cấu hình cao lên đầu (pass).
- **Lưu trữ Bền vững & Rollback SQLite (`tests/persistence.test.ts` - 3 tests):**
  - Kích hoạt snapshot catalog và truy vấn biến thể / ưu đãi (pass).
  - Rollback 100% khi kích hoạt snapshot mới gặp lỗi giữa chừng, bảo toàn nguyên vẹn snapshot cũ (pass).
  - Phục hồi sau khởi động lại: đóng database và mở lại từ file bảo toàn quyết định đã lưu và danh mục active (pass).
- **Kiểm định AI & Chống Ảo giác (`tests/ai-validator.test.ts` - 5 tests):**
  - Patch hợp lệ theo discriminated union `SET` và `CLEAR` (pass).
  - Từ chối patch có `baseProfileRevision` cũ hơn revision hiện tại (`ERR_STALE_REVISION`) (pass).
  - Chặn thao tác `CLEAR` có kèm thuộc tính `value` (pass).
  - Chặn thao tác `SET` có giá trị âm hoặc sai kiểu (pass).
  - Chặn lời giải thích viện dẫn `factId` ảo tưởng không có trong catalog (pass).
- **Bộ chuyển mạch AI & Fallback (`tests/ai-adapter.test.ts` - 4 tests):**
  - Provider hợp lệ trả về lời giải thích được xác minh (`isFallback: false`) (pass).
  - Provider timeout (quá 50ms trong test / ≤5000ms thực tế) tự động chuyển sang fallback rule-based gắn nhãn `AI_TIMEOUT` (pass).
  - Lỗi từ provider (429 rate limit) tự động fallback gắn nhãn `AI_PROVIDER_ERROR` (pass).
  - Output sai schema / ảo tưởng tự động fallback gắn nhãn `AI_OUTPUT_REJECTED` (pass).
- **Biên mạng HTTP Thực tế (`tests/http-server.test.ts` - 1 test suite tích hợp):**
  - Khởi động server HTTP thật trên cổng ngẫu nhiên 127.0.0.1.
  - `GET /health` trả về HTTP 200, status `ok`, đúng active catalog version (pass).
  - `POST /advisor/v1/recommend` với profile hợp lệ trả về HTTP 200, danh sách shortlist được chấm điểm và xác minh giá (pass).
  - `POST /advisor/v1/recommend` với profile sai trả về HTTP 400 kèm mã lỗi chuẩn `ERR_INVALID_PROFILE` (pass).
  - `POST /advisor/v1/ingest` nạp dữ liệu crawler thành công qua HTTP (pass).

---

## 5. Tiếp nhận & Kiểm chứng Dữ liệu Thật (Retail Pilot Dataset 2026-11-14)

### 5.1. Tiếp nhận Dataset từ Agent 1
- **Branch nguồn:** `origin/codex/dev/agent-1/data-pipeline` (Commit `d885e33837eab5d3cc473a27b69675f87944cc71`).
- **Thư mục dataset:** `tools/data-pipeline/datasets/retail-pilot-2026-11-14/`.
- **Cấu trúc dữ liệu thật:**
  - 8 browser product captures thật (không dữ liệu giả).
  - 10 staging observations: 6 `ready_for_review`, 4 `quarantine`.
  - 4 catalog variants chuẩn (`catalog-snapshot.json`) với đầy đủ typed fields.
  - `facts: []` và `offers: []` (chưa có fee approvals).
- **Edge cases thực tế được kiểm chứng:**
  1. FPT price mismatch giữa JSON-LD và HTML niêm yết.
  2. Thế Giới Di Động 3 màu sắc, RAM unobserved (không tự động đoán RAM).
  3. Trung Trần AggregateOffer hết hạn từ 2019.
  4. Oneway JSON-LD parse error kèm xung đột tiền tố `X/A` vs `zp-a`.
  5. ShopDunk tình trạng máy và tồn kho chưa xác định (unknown condition/stock).

### 5.2. Kết quả Chạy Kiểm thử Toàn diện (45/45 Backend Tests Passing)

1. **Python Pipeline Tests (`tools/data-pipeline/tests/`):**
   - Lệnh: `python -m unittest discover tests`
   - Kết quả: **36/36 tests passed** (thời gian: 3.948s).
2. **Agent 1 Verification Script (`verify-retail-backend.mjs`):**
   - Lệnh: `node tools/data-pipeline/scripts/verify-retail-backend.mjs services/adviser-backend tools/data-pipeline/datasets/retail-pilot-2026-11-14`
   - Kết quả: **Passed 100%**:
     `{"variantsImported":4,"restart":"passed","rollback":"passed","observationsChecked":10,"unknownFeeOffersRejected":10,"providerCalls":0,"productionWrites":0}`
3. **Backend Node Tests (`services/adviser-backend/tests/`):**
   - Lệnh: `node --experimental-strip-types --test tests/**/*.test.ts`
   - Kết quả: **45/45 tests passed** (45 passed, 0 failed, duration: ~1.3s).
   - Chi tiết các nhóm kiểm thử hoàn tất theo A3-RAW-01:
     - **Malformed fields / URLs / Timestamps (`tests/contracts.test.ts`):** Kiểm định scheme `http:/https:`, chặn URL hỏng/gãy cú pháp, kiểm tra ISO 8601 string có `T`, kiểm tra enum `condition` và `stockStatus`.
     - **Money boundaries & overflow (`tests/money.test.ts`):** Safe integer >= 0, biên ngân sách, chặn tràn số `MoneyOverflowError` và số âm `InvalidMoneyError`.
     - **Conflicting duplicates & provenance (`tests/ingest.test.ts`):** Phát hiện duplicate trùng observation key nhưng khác giá/tình trạng, ghi nhận `conflictsReported` và `conflictDetails` mà không nuốt lỗi âm thầm.
     - **Exact identity & stock constraints (`tests/eligibility.test.ts`):** Không có offer hoặc offer hết hàng (`OUT_OF_STOCK`), offer lệch `matchedVariantId` đều bị loại với `NO_OFFERS`.
     - **Database migration on baseline data (`tests/persistence.test.ts`):** Khởi động lại store trên DB SQLite đã có sẵn dữ liệu và schema baseline, bảo toàn nguyên vẹn 100% các biến thể và chào hàng lịch sử.
     - **Bounded HTTP payload & semantic rejection (`tests/http-server.test.ts`):** Chặn payload > 1MB với mã `413 Payload Too Large` (`ERR_PAYLOAD_TOO_LARGE`), bắt lỗi JSON malformed với mã `400 Bad Request` (`ERR_INVALID_JSON`), và kiểm tra semantic validation trên route `/advisor/v1/ingest`.
     - **AI prompt injection & privileged paths (`tests/ai-validator.test.ts`):** Chặn các nỗ lực inject path lạ (`adminRole`), payload phá vỡ schema (SQL injection string), và từ chối `factId` bịa đặt.
     - **Real dataset regression (`tests/retail-pilot.test.ts`):** Đọc trực tiếp 8 captures, 10 staging observations, 4 variants thật từ dataset của Agent 1; kiểm thử atomic rollback và phục hồi restart.
4. **TypeScript Typecheck:**
   - Lệnh: `npm.cmd run typecheck`
   - Kết quả: **0 errors**, clean typecheck.

---

## 6. Phạm vi Merge & Tích hợp vào dev (A3-RAW-01)

- Merge có chủ đích nhánh `codex/dev/agent-3/plan-03` vào `dev` theo ngoại lệ được người dùng cho phép.
- Chỉ bao gồm các thay đổi trong:
  - `services/adviser-backend/**`
  - `docs/hackathon/agent-3-backend.md`
- Giữ nguyên toàn bộ mã nguồn pipeline của Agent 1 (`tools/data-pipeline/**`).
- Không tương tác hay thay đổi các nhánh `main` hoặc `develop`.
- Báo cáo kết quả trực tiếp về thread điều phối gốc (`environmentId: "0d643e83-f77e-4710-96b0-3f8b4d2c8fc9"`, `threadId: "8a87aa59-85d2-41db-8572-751ac87fd1b2"`).

---

## 7. Khắc phục Triệt để 7 Nhóm Lỗi HTTP (D01 -> D07) theo A1-HTTP-02

**Nhánh triển khai:** `codex/dev/agent-3/data-02`  
**Bộ kiểm thử chuẩn:** `tools/data-pipeline/scripts/http_backend.mjs` (30 ca kiểm thử thực tế trên loopback ephemeral ports và disposable SQLite).

### 7.1. Bảng Đối chiếu Before / After Sửa Lỗi

| Defect ID | Nhóm Lỗi & Test Cases | Hiện trạng Trước Sửa (Baseline) | Giải pháp & Trạng thái Sau Sửa |
|---|---|---|---|
| **D01** | `H03-ingest-null`, `H03-recommend-null`, scalar JSON (`42`, `"scalar"`, `false`) | Crash / trả về 500 do `body.offers` trên non-object scalar (`FAILED`) | Bổ sung guard `!body \|\| typeof body !== 'object'` ở cả 2 routes; trả về HTTP 400 `ERR_INVALID_PAYLOAD` / `ERR_INVALID_PROFILE`, zero writes (`PASSED`). |
| **D02** | `H04`, `H09-unknown`: Variant chưa biết trong danh mục catalog | Ingest nhận offer rác của variant không tồn tại, ghi vào DB (`FAILED`) | Đối chiếu `matchedVariantId` của từng offer với `store.getVariantsForActiveCatalog()`; nếu có variant chưa biết -> trả HTTP 400 `ERR_UNKNOWN_VARIANT`, zero writes (`PASSED`). |
| **D03** | `H06-utf8`: Multi-byte UTF-8 payload boundary | Chỉ đếm ký tự JS (`str.length`), payload 1.2MB UTF-8 (400k ký tự) lọt qua kiểm tra (`FAILED`) | Đệm `Buffer` nhị phân, kiểm tra `totalBytes += chunk.length` theo UTF-8 byte length thật; chặn chính xác > 1,000,000 bytes với HTTP 413 `ERR_PAYLOAD_TOO_LARGE`, cho phép đúng 1,000,000 bytes (`PASSED`). |
| **D04** | `H08`, `H09-conflict`: Duplicate observations có xung đột dữ liệu | Không phát hiện xung đột intra-batch và ghi đè âm thầm trong DB (`FAILED`) | Dùng SQLite `SAVEPOINT save_offers_batch`, kiểm tra observation key cả intra-batch lẫn DB: nếu trùng khớp giá trị -> idempotent ignore; nếu xung đột giá/tình trạng -> ném HTTP 409 `ERR_CONFLICT` và atomic rollback toàn bộ batch (`PASSED`). |
| **D05** | `H09-storage`: Enum `completenessStatus` lạ | Không validate enum `completenessStatus`, chấp nhận giá trị rác như `INVALID` (`FAILED`) | Bổ sung validation bắt buộc `completenessStatus` thuộc `['COMPLETE', 'PARTIAL_UNKNOWN']` trong `contracts/crawler.ts`; vi phạm trả về HTTP 400 `ERR_SEMANTIC_VALIDATION` (`PASSED`). |
| **D06** | `H10-nooffer`: Biến thể phù hợp nhu cầu nhưng không có offer | Trả về `status: "NO_FIT"` sai ngữ nghĩa dù cấu hình phần cứng đạt yêu cầu (`FAILED`) | Cập nhật logic: khi shortlist rỗng nhưng có variant bị loại chỉ vì `NO_OFFERS` -> trả về `status: "NO_VERIFIED_OFFER"`, giữ `NO_FIT` riêng cho trường hợp không đạt phần cứng/ngân sách (`PASSED`). |
| **D07** | `H10-unknown`: Shortlist có sản phẩm nhưng phí ship chưa biết | Trả về `status: "SUCCESS"` dù chưa xác minh được tổng chi phí (`FAILED`) | Cập nhật logic: nếu không có candidate nào đạt `isVerifiedAffordable === true` (do phí ship null) -> trả về `status: "NO_VERIFIED_OFFER"` (`PASSED`). |

### 7.2. Kết quả Đo kiểm Toàn diện

1. **Suite 30-case HTTP Runner (`tools/data-pipeline/scripts/http_backend.mjs`):**
   - Lệnh: `node tools/data-pipeline/scripts/http_backend.mjs services/adviser-backend tools/data-pipeline/datasets/retail-pilot-2026-11-14 tools/data-pipeline/tests/fixtures/http-approved-synthetic.json .work/test-scratch .work/test-scratch/result.json suite`
   - Kết quả: **30 passed / 0 failed / status: "passed"** (trước sửa: 20 passed / 10 failed).
   - Hạ tầng mạng: Actual `createHttpServer` trên IPv4 loopback ephemeral ports, disposable SQLite.
   - External provider calls: 0, production writes: 0.
2. **Backend Unit & Integration Tests (`services/adviser-backend/tests/`):**
   - Lệnh: `npm.cmd test --prefix services/adviser-backend`
   - Kết quả: **45 passed / 0 failed / duration: ~1.3s**.
3. **Python Pipeline Tests (`tools/data-pipeline/tests/`):**
   - Lệnh: `$env:PYTHONPATH="tools/data-pipeline;tools/data-pipeline/src"; python -m unittest discover -s tools/data-pipeline/tests`
   - Kết quả: **41 passed / 0 failed / duration: ~9.5s**.
4. **Retail Verification Script (`verify-retail-backend.mjs`):**
   - Lệnh: `node tools/data-pipeline/scripts/verify-retail-backend.mjs services/adviser-backend tools/data-pipeline/datasets/retail-pilot-2026-11-14`
   - Kết quả: `{"variantsImported":4,"restart":"passed","rollback":"passed","observationsChecked":10,"unknownFeeOffersRejected":10,"providerCalls":0,"productionWrites":0}` (100% Passed).
5. **TypeScript Typecheck:**
   - Lệnh: `npm.cmd run typecheck --prefix services/adviser-backend`
   - Kết quả: **0 errors**.

