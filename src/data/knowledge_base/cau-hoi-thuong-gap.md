---
title: "Câu hỏi thường gặp tổng hợp về hệ thống CareerZone và AI Copilot (FAQ)"
category: "FAQ"
tags: ["Câu hỏi", "Giải đáp", "AI", "Trợ lý", "Tài khoản", "Coin", "Lỗi"]
---

# Danh Sách Câu Hỏi Thường Gặp (Cập nhật T3/2026)

Tài liệu nội bộ này tập hợp một loạt hơn 20 câu hỏi giải đáp khó khăn điển hình trong quá trình sử dụng hệ thống **CareerZone Recruitment Platform**, đặc biệt xoay quanh nhóm các tính năng có sự can thiệp của Trí tuệ Nhân tạo - CareerZone Copilot. 

## [Nhóm: Trợ lý thông minh Copilot AI]

### Q1: Copilot lấy Dữ liệu từ đâu để trả lời tôi?
**Trả lời:** Công cụ CareerZone Copilot đóng vai trò như một tác tử AI siêu Việt được tích hợp trực tiếp và an toàn vào backend hệ thống. Copilot được xây dựng với kỹ thuật **Retrieval-Augmented Generation (RAG)** và **Function Calling (Tools)** thông qua lõi GPT-4o của OpenAI Azure. Khi User đặt câu hỏi phân lớp tìm kiếm (VD "Tôi muốn tìm việc.."), Copilot không dựa vào Google mà kích hoạt Gọi Lệnh Nội Bộ truy xuất thẳng tới Database MongoDB Cluster của chúng ta.
Mọi dữ liệu trả ra đảm bảo không "Bịa đặt, Halucination" bởi nó khớp 100% với giao diện hiện có nhưng trả dứoi dạng Stream-text siêu tốc độ. 

### Q2: Copilot có phân tích được tệp PDF tôi mới up lên tài khoản hôm qua không?
**Trả lời:** Có. Cơ chế trích xuất dữ liệu "Tóm tắt ứng viên" chạy ngầm ngay từ lúc Ứng viên bấm Submit file CV. Nodejs Parser tự động convert layout PDF ra văn bản và lưu nháp. AI lúc này chỉ cần lấy văn bản có sẵn ra làm bảng phân tích đối trọng năng lực `compare_candidates`. Bạn không cần copy+paste thủ công. Tuy nhiên tính năng này hiện chưa quét được 100% Data từ hình chụp mờ bằng điện thoại. Khuyến nghị xài PDF Font Chuẩn máy tính xuất ra từ Word, Canva, TopCV.

### Q3: Tôi thấy Copilot gợi ý "Điểm phù hợp" (Match Score) quá thấp, dù tôi kinh nghiệm đầy mình?
**Trả lời:** Mô hình Gợi Ý (LightFM Collaborative Filtering Machine learning engine) chấm điểm Matching Score **0 đến 100%**. Cách tính lấy Trọng Số Không Chỉ Dựa Vào Keyword! Nó dựa vào Véc-tơ tương tác của bạn. (Bạn ít bấm vào nhóm IT, hệ thống tự hiểu bạn không chuộng nhóm này. Tuy nhiên, một số Job bắt buộc yêu cầu bằng Cử Nhân Đại Học (Education Requirement), nếu trong CV hay form khai báo nền tảng bạn mới điền Level: HIGHT_SCHOOL (Cấp 3), thuật toán Hard-Filter tự đánh văng bạn ra để nhường chỗ các bạn thỏa mốc bằng cấp). Cách giải quyết: Kêu Copilot nâng cấp hồ sơ cho chuẩn.

### Q4: Vì sao Trợ lý Copilot lại yêu cầu nạp nâng cấp Copilot Premium sau 5 câu ?
**Trả lời:** Ở Phiên bản Miễn phí (Candidate Basic), hệ thống cho phép quota miễn phí thực hiện tổng hợp 50 Token-Request tới LLM mỗi ngày để tiết kiệm Resource hạ tầng GPU FastAPI.
Để mở khoá, nâng cấp gói VIP bằng cách thanh toán (Xem Chính Sách Thanh Toán). Bản Premium không giới hạn số lượng Context chat dài và hỗ trợ công cụ Generate Cover-letter tự động siêu mượt không cần sửa. 


## [Nhóm: Quản Lý Đơn Xin Việc & Phỏng Vấn]

### Q5: Nếu tôi gửi nhầm CV, tôi có rút lại (Recall) được không?
**Trả lời:** Được quyền thu hồi (Withdraw Application) NHƯNG với điều kiện duy nhất: Trạng thái của biểu mẫu nộp đang ở mốc `PENDING` (Nhà tuyển dụng chưa mở email hồ sơ của bạn ra coi và phần mềm chưa báo chuyển sang Reviewing). Nếu lỡ chuyển Reviewing, bạn phải chấp nhận sống chung với sai lầm đó, hoặc chủ động gọi Hot-Line xin tự túc huỷ đơn xin với nhân viên phòng Nhân Sự công ty đó. Xem mục Hủy Đơn Ứng Tuyển trong văn bản Chính sách Ứng Tuyển. 

### Q6: Tôi dùng tính năng Phòng Phỏng vấn (Interview Room). Tại sao Video bị lag đơ trên ĐTDĐ?
**Trả lời:** CareerZone tích hợp giao thức WebRTC peer-to-peer (Trình duyệt nối trình duyệt) và máy chủ trung chuyển luồng STUN/TURN quốc tế tự động. 90% lỗi "Lag" xuất phát từ băng thông Upload (3G/4G quá yếu hoặc chia sẻ wifi nội bộ). Mẹo khắc phục:
1. Đảm bảo Wifi từ 15Mbps download / 5Mbps upload.
2. Cấp quyền Camera/Microphone trên thanh địa chỉ HTTPs.
3. HR nên chia sẻ Slide PDF thay vì Share Toàn Bộ Màn Hình độ phân giải 4K (Dễ bị overload Video Encoder). Nếu rớt mạng quá 3 phút, phòng họp kích hoạt Trigger cảnh báo rớt kết nối cho đối tác yên tâm.

### Q7: Nhà tuyển dụng hẹn lịch phỏng vấn sai lệch múi giờ? (Timezone Bug) 
**Trả lời:** Toàn bộ Core Data lưu trên Database MongoDB theo chuẩn giờ GMT+0 (UTC). Khi người dùng đăng nhập trình duyệt (Ví dụ bạn ở VN (GMT+7) và HR ở Nhật (GMT+9)), các component ReactJS sẽ tự động thông dịch ngày hẹn "10:00 Sáng" của Cả 2 phía dưới dạng hiển thị (Local format hiển thị). "Ví dụ: 10:00 ở HR bên Nhật lập phiếu = Hiển thị ra máy bạn là 08:00 Sáng ở VN". Copilot khi được hỏi "Lịch tôi ngày nào" luôn tuân thủ dịch Output ra giờ địa phương của User_ID để báo lại cho bạn tự tin nhất. Đừng sợ nhầm!.


## [Nhóm: Vấn Đề Nhà Tuyển Dụng Thường Gặp]

### Q8: Tôi khóa (Deactivate) và Xóa thẳng tin đăng việc vì công ty đã tuyển đủ, tại sao vẫn bị Trừ 1 "Credit Tin Tuyển Dụng Tiêu Chuẩn"?
**Trả lời:** Gói Post-job Credits đánh phí trên NGÀY PHÁT HÀNH (Publish Event) của 1 Job. Chỉ cần bạn set Status Job từ `DRAFT` chuyển qua `ACTIVE` và duyệt thành công ra Public Domain 1 giây. Coin & Credit của hệ thống đã thanh toán xong với Service vì hạ tầng đã kích hoạt (Indexing search elastic, push rabbitMQ notice to followers candidate). Do đó bạn xóa giữa chừng hay ngưng không tuyển thì số dư cũng không thể đảo ngược (Non-refundable item). Lời khuyên: Xài kĩ nháp (Sandbox) cho tới khi nắm chắc KPI.

### Q9: Làm sao ẩn tên Công ty tôi vì đây là Dịch vụ Tuyển headhunter "Tuyển kín" cho khách VIP?
**Trả lời:** Có tính năng "Confidential Mode" (Bảo mật thương hiệu). Lúc tạo form công việc đoạn đầu tiên dùng Copilot Tool, hãy yêu cầu: "Gắn thẻ Bảo mật, giấu tên thương hiệu". Hoặc tick vào checkbox ẩn tên. Kết quả ngoài Front-end sẽ hiển thị: "Một tổ chức tài chính tín dụng quy mô lớn đang tìm nhân tài.." thay vì hiển thị "Ngân Hàng V..". Lúc này Logo cũng bị xóa mờ xám.

### Q10: Ứng Viên bỏ thi, không tới phỏng vấn (No-show) bị đánh giá sao xuống hạng ra sao?
**Trả lời:** CareerZone ghi hình danh tiếng ứng viên (Trust Score Behavior). Nếu ứng viên nhấn "Chấp nhận Lịch Phỏng Vấn" nhưng khi Interview Room mở lên tới tận 30 phút mà chả thấy online (Dù gửi email nhắc nhở 3 lần). HR được quyền cấp nút (Hủy Lịch với lý do No-Show Ghosting). Ứng viên này bị phạt trừ Điểm Tin cậy trầm trọng. Hệ quả là tháng sau hồ sơ nộp sẽ bị rớt thẳng xuống thùng rác trong List tìm kiếm tự động do RAG ưu tiên giới thiệu người khác uy tín hơn. CareerZone lên án Ghosting!.


## [Nhóm Tài Khoản Xóa Chặn Security]

### Q11: "Tài khoản của bạn đã bị khóa bởi hệ thống kiểm duyệt AI Anti-Spam". Phải làm sao đây?
**Trả lời:** Xin chia buồn. Tần suất 1 giây bấm 5 nút ứng tuyển, gửi loạt 200 tin nhắn rác gạ chat nội bộ, hoặc dùng tool auto-crawl Dữ liệu trang web là vi phạm Điều khoản Sử dụng Nền tảng (Term of Services). Tính năng Rate-limiting WAF khoá nhốt User ID vào danh sách đen. Xin email khiếu nại (Apeal Request) tới ban giám đốc `sec-admin@careerzone.vn`. Chờ 7 ngày xem xét ân xá phục hồi.
