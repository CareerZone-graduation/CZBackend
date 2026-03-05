---
title: "Các điều khoản và Chính sách thanh toán dịch vụ CareerZone"
category: "POLICY"
tags: ["Khách hàng", "Thanh toán", "Nạp tiền", "Mua gói", "Hoàn tiền", "ZaloPay", "VNPAY", "Momo"]
---

# Chính sách Giao dịch & Thanh toán Dịch vụ

Bản cập nhật Điều khoản Thanh toán (Billing Policy) này chính thức có hiệu lực từ tháng 01 năm 2026. 
Áp dụng cho mọi Khách hàng Doanh nghiệp (B2B) và Khách hàng cá nhân (B2C) khi sử dụng các dịch vụ trả phí trên CareerZone, bao gồm:
1. Giao dịch nạp "Career Coin" (Xu hệ thống).
2. Xài Coin để mua CreditPack Unlock profile ứng viên tiềm năng.
3. Gói đăng tin tuyển dụng nổi bật (Premium Job Posting).
4. Các gói dịch vụ AI cao cấp giới hạn (Copilot Premium, Interview Auto-transcript).

## 1. Phương thức Thanh toán (Nhà Mạng Hỗ Trợ)

CareerZone Vietnam đã kí kết với các cổng thanh toán uy tín Quốc tế và Nội địa bao gồm:
*   **Ví điện tử & Payment Gateway Nội địa:** ZaloPay (Zion JSC), MoMo (Msie JSC), VNPAY (VNPay QR & thẻ ATM nội địa).
*   **Thẻ tín dụng Quốc tế (Bản Enterprise):** Stripe hoặc ZaloPay Credit.  Hệ thống CareerZone cam kết KHÔNG LƯU TRỮ bất cứ số thẻ tín dụng, mã CVV hay mật khẩu ngân hàng của khách hàng dưới dạng Plain text hay Hash local. Toàn bộ Token Request Payment được Off-load xử lý hoàn toàn qua Payment Gateway bên thứ ba đạt chuẩn PCI-DSS Level 1.

## 2. Tiền tệ và Tỉ giá quy đổi Career Coin

*   **Đơn vị Giao dịch gốc:** Việt Nam Đồng (VND). Báo giá trên hệ thống luôn làm tròn, đã bao gồm 10% Thuế giá trị gia tăng (VAT).  
*   **Hệ số chuyển đổi mặc định (Base Exchange Rate):** `1000 VND = 1 Career Coin`.
  *   Ví dụ: Nạp `500.000 VND` => `500 Coin`.  
*   Khuyến mãi (Bonus) sẽ được áp dụng trực tiếp dưới dạng "Hệ số X" hoặc "+Bonus Coin" tùy theo mỗi kỳ kinh doanh. Số dư (Balance) sẽ tự động tích lũy trong Object `RecruiterProfile.coinBalance`.

## 3. Quy trình thực hiện giao dịch

1.  **Tạo Đơn Hàng (Create Order):** Quý khách vào trang Nạp Tiền (Recharge) trên Cổng Recruiter, chọn Mệnh giá nạp (Denomination).
2.  **Redirect sang Cổng:** Hệ thống sinh mã `app_trans_id` nội bộ và đẩy người dùng sang trang thanh toán của đối tác (ví dụ cổng ZaloPay/Momo). Tại đây, nếu quá 15 phút (QR expiry time) không thao tác, giao dịch bị Server đánh dấu là Canceled.
3.  **Xác nhận Dữ liệu (IPN / Webhook Callback):** Khi đối tác nhận được tiền, họ lập tức bắn tín hiệu Server-to-server (IPN - Instant Payment Notification) về Gateway BE CareerZone. DB Controller xác nhận `mac / signature` hợp lệ sẽ tự động tiến hành `CoinRecharge.create` và nạp xu vào ví KH lập tức. Không cần f5 trang.

### Độ trễ mạng (Latency):
- Thông thường mất từ 1-3 giây.
- Trong trường hợp nhà mạng chốt sổ (ví dụ 0h đêm), có thể mất tới tối đa 15 phút để đối soát lô IPN mồ côi (Callback delayed). Người dùng vui lòng không thao tác nạp tiền đúp nhiều lần.

## 4. Các Loại Dịch vụ trừ Coin trong Ví

### 4.1. Mua Điểm Chạm (Credit Transaction)
Đây là cách phổ thông nhất. Doanh nghiệp cần đổi "Coin" sang "Credit" để mở khóa thông tin liên lạc ẩn của Ứng viên (Profile Unlock). Tỷ giá: `50 Coin = 1 Credit`. Điểm Credit này có hạn sử dụng (Expire Time) tùy gói nạp. Hết thời hạn, Credit bốc hơi, Coin thì tồn tại vĩnh viễn không reset.

### 4.2 Gói dịch vụ thuê bao (Subscriptions)
Mua các gói VIP hiển thị đầu trang kết quả tìm kiếm (Top Ranking), hoặc gắn Badge nổi bật (Featured Badge). Khoản này được trừ trực tiếp bằng "Coin". Nếu Coin hiện tại < Chi phí, giao dịch thất bại kèm thông báo `INSUFFICIENT_FUNDS`.

## 5. Xuất Hóa Đơn Điện Tử (VAT Invoice)

*   Khách hàng Doanh Nghiệp có thể yêu cầu xuất Hóa Đơn Đỏ điện tử (e-invoice) trong mọi giao dịch trị giá trên `200.000 VND`. 
*   Vui lòng truy cập "Lịch sử mua hàng" -> Chọn Giao dịch (Recharge Order) -> "Yêu cầu Hóa Đơn VAT". Điền đầy đủ Mã Số Thuế cá nhân/Công ty, Tên chính xác trên Đăng Ký Kinh Doanh, Địa chỉ công ty.
*   Bộ phận kế toán CareerZone đóng sổ và gửi hóa đơn dạng XML/PDF qua email đăng ký chậm nhất vào ngày mồng 5 của tháng kế tiếp của tháng phát sinh thanh toán. Yêu cầu báo xuất hoá đơn muộn qua 30 ngày giao dịch sẽ không được thụ lý.

## 6. Chính sách Hoàn tiền (Refund Policy)

Bởi vì sản phẩm CareerZone là Tài sản số / Ưu đãi cấp vốn (Digital Goods), nguyên tắc cốt lõi là **Không hoàn tiền mặt tự do** một khi giao dịch nạp Wallet đã thành công (Completed). Tuy nhiên, có những khung đặc thù sau được hỗ trợ hoàn toàn phần hoặc một phần Coin (Cashback of Coins):

### 6.1 Giao dịch bất thường hệ thống (System Error Refund)
- Khách hàng đã thanh toán qua QR, Bank trừ tiền nhưng sau 24h trạng thái đơn vẫn `PENDING` và App CareerZone chưa nhận xu do đứt cáp IPN.  
  - **Xử lý:** Đối soát bằng hóa đơn/sao kê chứng từ người dùng gửi lên Support Ticket. CareerZone sẽ (A) Bù xu vào tài khoản hoặc (B) Đề nghị cổng thanh toán tạo Refund Order (ví dụ `ZaloPay.refund()`) hoàn tiền về thẻ gốc (3-7 ngày làm việc tuỳ NH).

### 6.2 Lỗi Mua Hàng sai / Ứng viên Hủy Giao Dịch
- Doanh nghiệp sử dụng "Credit" để mở khoá một CV, nhưng số điện thoại hoặc Email hiển thị là hoàn toàn **Cố Ý SAI CẤU TRÚC / ẢO** (Ví dụ sdt: 000000000, email ảo test@test.com) nhằm trốn tránh.
  - **Xử lý:** HR bấm nút "Báo cáo Sai Thông Tin" ở Hồ Sơ ứng viên. Nhân sự Kiểm soát QA sẽ thẩm định (Gọi điện thoại trực tiếp để check). Nếu đúng sự thật rác, Cả hồ sơ ứng viên đó báo cờ Đỏ (Banned). Tài khoản HR được **hoàn lại 100% (1 Credit)** vào hạn mức, đồng thời gửi email Copilot xin lỗi.

### 6.3 Hủy tài khoản doanh nghiệp
- Khi phá sản hoặc không tiếp tục dùng dịch vụ, doanh nghiệp yêu cầu xóa Profile Vĩnh viễn. Số dư Coin còn lại **KHÔNG ĐƯỢC CHUYỂN ĐỔI** trả lại thành tiền mặt. Có thể nhượng lại quyền sở hữu Admin Workspace cho công ty khác để khai thác.

## 7. Giải Quyết Khiếu Nại (Dispute Resolution)

*   CareerZone đề cao tiêu chí Hợp tác sòng phẳng thương mại điện tử.
*   Bất kì khúc mắc tính phí nào trong báo cáo thống kê, hộp thoại CareerZone Copilot sẵn sàn xử lí tra cứu tự động lịch sử ví để HR tự nắm bắt `(Hỏi: "Hãy báo cáo tôi giao dịch tiêu xu tháng 5")`. 
*   Trường hợp khiếu nại gay gắt có gian lận trục lợi, hai bên thống nhất làm việc tại văn phòng dựa trên Dữ Liệu đối soát (Log file). Pháp luật cư trú tòa án TPHCM làm nơi phân xử tranh chấp cuối cùng. 
* Hotline Tín dụng: 1800-xxxx.
