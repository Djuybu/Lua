---
name: hackathon-agent-skill
description: Điều phối nhóm hackathon gồm ba Agent với trưởng nhóm phụ trách yêu cầu, test và tích hợp; Agent giao diện/crawler; Agent backend/AI. Dùng khi giao việc, triển khai song song hoặc kiểm thử và phát hành theo quy trình dev → develop → main.
---

# Nhóm phát triển hackathon gồm ba Agent

## Phân vai và tài liệu

- **Agent 1 — Trưởng nhóm:** chuyển yêu cầu thành nhiệm vụ và test case, điều phối hai Agent con, tích hợp, kiểm thử và phát hành. Đọc [agent-1-lead.md](references/agent-1-lead.md).
- **Agent 2 — Giao diện và data crawler:** triển khai UI và thu thập dữ liệu. Đọc [agent-2-frontend-crawler.md](references/agent-2-frontend-crawler.md).
- **Agent 3 — Backend và AI:** triển khai API, dữ liệu, nghiệp vụ và tính năng AI. Đọc [agent-3-backend-ai.md](references/agent-3-backend-ai.md).
- Mọi Agent đọc [collaboration-contract.md](references/collaboration-contract.md) trước khi nhận hoặc bàn giao việc.

Khi được yêu cầu điều phối cả nhóm, Agent hiện tại đóng vai Agent 1 và tạo đúng hai Agent con nếu môi trường hỗ trợ. Gửi cho mỗi Agent đường dẫn skill, vai trò, task brief và worktree riêng. Không tạo thêm tầng Agent. Nếu không có công cụ đa Agent, thông báo giới hạn và lần lượt thực hiện các vai trò, không giả lập báo cáo của Agent không tồn tại.

## Quy ước nhánh

`main` là nhánh phát hành; `develop` là nhánh tích hợp; “nhánh dev” là nhánh làm việc riêng của từng Agent, mặc định `codex/dev/agent-2/<task-id>` và `codex/dev/agent-3/<task-id>`. Cách đặt tên này tránh hai Agent cùng ghi vào một nhánh. Nếu dự án có quy ước khác, Agent 1 ghi rõ ánh xạ trong kế hoạch trước khi giao việc.

Mỗi Agent dùng worktree riêng xuất phát từ cùng commit nền của `develop`. Chỉ Agent 1 cập nhật `develop` và `main`. Không checkout/chuyển nhánh trên thư mục đang được Agent khác sử dụng. Nếu thiếu nhánh, xác định nhánh nền của dự án trước khi tạo; không mặc định ghi đè nhánh có sẵn.

## Chu trình bắt buộc

1. Agent 1 khảo sát repository, hướng dẫn dự án, trạng thái Git và lệnh kiểm tra; làm rõ phạm vi, acceptance criteria và hợp đồng UI/crawler/backend/AI.
2. Agent 1 viết test case trước khi giao việc, phân quyền sở hữu file và giao nhiệm vụ có thể chạy song song.
3. Agent 2 và 3 triển khai, tự kiểm tra, commit và bàn giao bằng SHA cùng bằng chứng kiểm thử.
4. Agent 1 kiểm tra bàn giao, đưa các commit được nhận vào `develop`, đồng bộ nhánh đó về worktree tích hợp và chạy kiểm thử toàn bộ phạm vi thay đổi.
5. Có lỗi hoặc yêu cầu chỉnh sửa: Agent 1 tạo yêu cầu sửa, giao lại đúng Agent, nhận commit mới, tích hợp và kiểm thử lại. Không phát hành bản còn lỗi chặn.
6. Khi mọi tiêu chí đạt và không còn yêu cầu chỉnh sửa chưa xử lý, Agent 1 đưa đúng phiên bản đã kiểm thử lên `main` và push trực tiếp theo quyền được cấp.

Skill này mô tả quy trình; việc chỉ yêu cầu viết hoặc chỉnh skill không phải yêu cầu chạy Git hay phát hành ứng dụng. Khi áp dụng quy trình cho một nhiệm vụ triển khai, tiếp tục theo quyền người dùng đã cấp, không hỏi lại nếu đã được phép push. Nếu quyền công cụ hoặc branch protection chặn thao tác, báo chính xác trở ngại; không bypass hoặc force-push.
