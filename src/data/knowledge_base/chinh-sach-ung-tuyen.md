---
title: "Quy trình ứng tuyển và phản hồi kết quả trên hệ thống CareerZone"
category: "POLICY"
tags: ["Ứng viên", "Ứng tuyển", "Quy trình", "Phản hồi", "Interview"]
---

# Chính sách và Quy trình Ứng tuyển & Phản hồi Kết quả

Tài liệu này hướng dẫn chi tiết về vòng đời của một Đơn ứng tuyển (Application), từ lúc Ứng viên (Candidate) bắt đầu gửi hồ sơ cho tới khi hoàn tất hành trình gia nhập tổ chức (Onboarding). Toàn bộ các bước đều được tối ưu hóa theo thời gian thực (real-time) thông qua ứng dụng công nghệ Web Socket, email và CareerZone Copilot AI.

## 1. Giai đoạn Ứng tuyển (Apply)

Ứng viên có thể nộp đơn ứng tuyển cho một vị trí (Job Posting) theo hai cách chính:
1.  **Chủ động nộp CV (Manual Apply):** Mở trang chi tiết việc làm, nhấn nút "Ứng tuyển ngay", tùy chọn tải lên (upload) file PDF/DOCX từ thiết bị hoặc sử dụng Profile CV mặc định (trường hợp đã tích hợp AI tạo CV).
2.  **Thông qua Lời mời (Job Invitation):** Nhà tuyển dụng gửi lời mời làm việc trực tiếp dựa trên sự phù hợp từ Talent Pool. Ứng viên xác nhận đồng ý kết nối.

### Các điều kiện ràng buộc:
-   Ứng viên chỉ có thể ứng tuyển **1 lần** cho mỗi tin tuyển dụng đang mở. Nếu trạng thái là Inactive (ngừng tuyển) hoặc Expired (đã hết hạn), nút ứng tuyển sẽ bị vô hiệu hóa.
-   Hệ thống khuyến khích sử dụng tính năng **CareerZone Copilot AI** để tóm tắt các yêu cầu cốt lõi (Core Requirements) và đề xuất những kỹ năng cần nhấn mạnh thêm vào Cover Letter trước khi gửi đi.

## 2. Các trạng thái Đơn ứng tuyển (Application Statuses)

Mỗi hồ sơ ứng tuyển (Application) trên hệ thống CareerZone trải qua một chuỗi các trạng thái tiêu chuẩn hóa:

1.  **`PENDING` (Chờ xem xét):** Trạng thái mặc định ngay sau khi nộp thành công. Phản ánh hồ sơ đã vào hệ thống ATS (Applicant Tracking System) của Nhà tuyển dụng nhưng chưa được mở ra.
2.  **`REVIEWING` (Đang xem xét):** Đánh dấu vòng sơ loại CV. Khi Nhà tuyển dụng click vào đơn đăng ký của bạn lần đầu tiên, hệ thống sẽ tự động gửi email báo "Hồ sơ của bạn vừa được nhà tuyển dụng xem".
3.  **`SUITABLE` (Phù hợp):** Được HR đưa vào vòng ngắn danh sách chọn lọc (Shortlisted) để liên hệ sắp xếp phỏng vấn.
4.  **`SCHEDULED_INTERVIEW` (Đã lên lịch phỏng vấn):** Bước kích hoạt tính năng Video Call / Interview Room tích hợp. Lịch gửi thẳng đến email và Notification Center của cả 2 phía.
5.  **`INTERVIEW_FAILED` (Không vượt qua phỏng vấn):** Ứng viên thực hiện phỏng vấn nhưng không đạt yêu cầu ở các bài kiểm tra kỹ thuật/kỹ năng tương thích với doanh nghiệp.
6.  **`OFFER_SENT` (Đã gửi Offer):** Nhà tuyển dụng tải file Offer Letter, thiết lập lương lên hệ thống và ứng viên nhận được email đính kèm mã xác nhận (Acceptance Code).
7.  **`ACCEPTED` (Đã nhận việc):** Ứng viên bấm "Đồng ý" (Accept) đề nghị tuyển dụng.
8.  **`OFFER_DECLINED` (Từ chối Offer):** Nếu ứng viên rớt thỏa thuận hoặc đổi ý sau khi có offer.
9.  **`REJECTED` (Bị từ chối tự động/thủ công):** CV không thỏa tiêu chí ngay tại vòng sơ loại hoặc sau thời gian quá hạn không có phản hồi tự nhiên.

## 3. Chính sách Phản hồi ứng viên (Feedback SLA)

Với sứ mệnh "Không để ứng viên chờ đợi một sự im lặng", hệ thống CareerZone áp đặt một SLA (Service Level Agreement) nghiêm ngặt đối với nhóm tài khoản Nhà tuyển dụng:

*   **Thời gian phản hồi tiêu chuẩn:** Nhà tuyển dụng có trách nhiệm thay đổi trạng thái hồ sơ (Review, Interview, Reject) **trong vòng tối đa 7 ngày làm việc** kể từ ngày ứng tuyển. Nếu không, CareerZone sẽ gắn cờ "Pending Action" lên Dashboard nhắc nhở.
*   **Tự động loại hồ sơ (Auto-Reject):** Nếu Nhà tuyển dụng cấu hình bộ lọc AI, hồ sơ quá lệch chuyên môn sẽ được gửi thư từ chối tự động (Auto-reject) mang tính chất xây dựng, đi kèm danh sách **Công việc gợi ý** thay thế từ thuật toán LightFM.
*   **Giải thích lý do từ chối:** Khi HR đổi sang trạng thái `REJECTED`, hộp thoại CareerZone Copilot cung cấp mẫu câu từ chối nhẹ nhàng chuyên nghiệp (Template), HR có thể viết kèm theo: "Yêu cầu Tiếng anh IELTs lớn hơn 6.5 chưa thỏa", "Kinh nghiệm Node.js cần tối thiểu 3 năm". Việc này nhằm đảm bảo tính minh bạch, hạn chế cảm giác hụt hẫng cho ứng viên trẻ (Gen Z).

## 4. Báo cáo, Đánh giá và Hủy nộp đơn

### Hủy ứng tuyển (Withdraw Application):
- Trợ lý Copilot AI sẽ hướng dẫn quá trình: Ứng viên chỉ có quyền rút lui đơn ứng tuyển (withdraw application) đối với những đơn đang mang trạng thái `PENDING`. Sau khi hệ thống chuyển "REVIEWING", ứng viên **KHÔNG THỂ HỦY**, mà cần trao đổi trực tiếp qua thanh công cụ CareerZone Message Chat cho HR.
- Để rút hồ sơ: Mở tab "Việc làm đã ứng tuyển" -> Chọn công việc -> Click "Thu hồi đơn".

### Khiếu nại và Chống lừa đảo (Anti-scam reports)
- Hệ thống duy trì mục "Report Job" ở mỗi tin tuyển dụng.
- Nếu bạn gặp trường hợp: (1) Nhà tuyển dụng (HR) gạ gẫm thu phí ký quỹ, (2) Tin tuyển giả danh thương hiệu lớn (Ví dụ mạo danh VNG, FPT, CMC..), (3) Nội dung trao đổi phỏng vấn đồi trụy đa cấp lừa đảo.
- **Biện pháp:** Bộ phận Chăm sóc Khách hàng (Admin) sẽ tạm khóa tin tuyển dụng (Status: Inactive / Tạm dừng), khóa ví giao dịch ZaloPay nạp tiền của công ty, tiến hành xử lý hình sự, cảnh báo đồng loạt (Broadcast) cho tất cả ứng viên đã apply rút hồ sơ sớm. 

## 5. Sử dụng Hệ thống Phỏng vấn trực tuyến (Interview Room)

Tính năng `InterviewRoom` là cốt lõi trong thời đại Hybrid/Remote model hiện nay.
- Thông tin phòng gồm URL tham gia sẽ không còn bị phụ thuộc hoàn toàn vào Zoom hay MS Teams.
- Hệ thống có chức năng chia sẻ màn hình, cửa sổ code từ xa (IDE Code collaboration).
- Hai bên cần tự trang bị thiết bị Camera, Microphone ổ định. Cảnh báo quá hạn (Late Arrival): Quá 15 phút so với giờ hẹn nếu HR/Ứng viên không login, buổi hẹn xem như `CANCELLED`.
- Phái sinh: Trợ lý AI Copilot có chức năng nhắc hẹn giờ bằng âm thanh tại App di động khi gần đến giờ họp. 

## 6. Lưu trữ thông tin và Snapshot Tin Tuyển

Để đảm bảo pháp lý cho Hợp đồng lao động, CareerZone thực thi tính năng **Job Snapshot**.
Mọi tin tuyển dụng (Job Description) tại khoảnh khắc ứng viên nộp hồ sơ đều được chụp lại bản sao dữ liệu gốc và ghim vào lịch sử (History Object).
Dù cho tương lai nhà tuyển dụng có **Sửa (Edit)** hay **Xóa (Delete)** tin tức này để trốn tránh các quyền lợi đã hứa hẹn (Ví dụ: Thưởng tháng 13, BHXH đầy đủ, PC ăn trưa), Ứng viên vẫn nắm giữ toàn bộ Snapshot không thể làm giả từ máy chủ hệ thống nhằm cung cấp cơ sở để làm việc lại với luật sư thanh tra.

## 7. Liên kết Hỗ trợ

Tham khảo thêm:
- Hướng dẫn viết Cover Letter chuyên nghiệp, tạo lập profile chuẩn ATS bằng Copilot Tool: Sử dụng Trigger "free_chat" và yêu cầu: *"Giúp tôi viết mục tiêu nghề nghiệp"*.
- Hỏi đáp trạng thái CV: "Tại sao công ty ABC lâu chưa phản hồi?".

Mọi đóng góp nhằm hoàn thiện quy trình này, xin gửi thư tới: quytrinh@careerzone.vn.
Quy định này áp dụng mặc định cho tất cả thành viên trên nền tảng.
Cập nhật: Mùa Xuân 2026.
