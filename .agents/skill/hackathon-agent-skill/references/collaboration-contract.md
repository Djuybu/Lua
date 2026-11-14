# Hợp đồng cộng tác

## Task brief do Agent 1 viết

Mỗi nhiệm vụ phải chứa:

- ID, Agent phụ trách, mục tiêu gắn với yêu cầu người dùng và phần ngoài phạm vi.
- Commit nền, tên nhánh, đường dẫn worktree, vùng file được sửa và file dùng chung cần phối hợp.
- Đầu vào/đầu ra, dependency và hợp đồng API/schema: trường, kiểu, đơn vị, giá trị rỗng, lỗi và phiên bản khi cần.
- Acceptance criteria có ID, test case tương ứng và lệnh kiểm tra dự kiến.
- Sản phẩm bàn giao, điều kiện hoàn thành và các giả định chưa được xác nhận.

Ví dụ phân chia: Agent 2 sở hữu UI và adapter crawler; Agent 3 sở hữu API và migration. Agent 1 chốt schema dữ liệu crawler trước khi cả hai triển khai. Người sửa schema chung phải thông báo thay đổi cho bên tiêu thụ trước khi merge.

## Trạng thái và bàn giao

Luồng trạng thái: `ready → in_progress → review → integrated → verified → released`; dùng `blocked` khi thiếu dependency và `changes_requested` khi cần sửa. Agent 1 quản lý trạng thái trong tài liệu kế hoạch của nhiệm vụ theo quy ước dự án, mặc định `docs/hackathon/<task-id>.md`.

Agent con báo ngay khi có blocker, thay đổi hợp đồng hoặc nguy cơ vượt phạm vi. Không tự ý chuyển việc sang Agent khác. Bàn giao gồm task ID, nhánh/worktree, SHA commit, thay đổi chính, acceptance criteria đã đáp ứng, lệnh test và kết quả thực tế, migration/cấu hình cần thiết, rủi ro và phần còn thiếu. Phân biệt rõ kiểm tra đã chạy, chưa chạy và thất bại; không suy diễn test thành công.

Yêu cầu sửa gồm: ID lỗi và task liên quan, SHA bị lỗi, mức độ ảnh hưởng, cách tái hiện, expected/actual, log tối thiểu đã bỏ bí mật, Agent phụ trách và điều kiện kiểm tra lại. Yêu cầu mới của người dùng phải được cập nhật vào acceptance criteria/test case trước khi giao sửa.

## Kỷ luật Git và phạm vi

- Kiểm tra trạng thái working tree trước thao tác. Giữ nguyên thay đổi sẵn có của người dùng; chỉ stage file/hunk thuộc nhiệm vụ, không dùng `git add .` thiếu kiểm tra.
- Agent con commit trên nhánh riêng và có thể push nhánh dev để bàn giao khi workflow đã được cho phép. Nếu dùng chung repository, SHA local cũng đủ để Agent 1 tích hợp; báo rõ trạng thái chưa push.
- Agent 1 merge tuần tự các nhánh dev vào `develop`; ưu tiên giữ lịch sử bàn giao. Khi conflict liên quan nghiệp vụ, giao chủ sở hữu giải quyết, không chọn hàng loạt “ours/theirs”.
- Không force-push, reset phá hủy, xóa nhánh hoặc ghi đè công việc không thuộc nhiệm vụ. Không commit secret, dữ liệu cá nhân hay artifact lớn ngoài yêu cầu.
- Không tự sửa lockfile, schema, cấu hình dùng chung cùng lúc: Agent 1 chỉ định một chủ sở hữu và thứ tự cập nhật.

## Hợp đồng kiểm thử

Test case ghi ID, acceptance criterion, tiền điều kiện/dữ liệu, thao tác, kết quả mong đợi, mức unit/integration/E2E/manual, người thực hiện và kết quả kèm bằng chứng. Chọn kiểm tra theo rủi ro: luồng chính, lỗi có khả năng xảy ra và hồi quy liên quan; không chạy dịch vụ tính phí hay ghi dữ liệu production chỉ để test.

Agent 1 sở hữu test chấp nhận và xác minh độc lập; Agent con bổ sung unit/integration test cần thiết cho phần mình. Dùng fixture/mock cho mạng, crawler và AI khi phù hợp, nhưng ghi rõ giới hạn so với kiểm tra thật. Không giảm assertion hoặc bỏ qua test chỉ để pipeline xanh.
