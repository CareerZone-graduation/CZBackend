# Data Integrity Scripts

Các script này giúp kiểm tra và dọn dẹp dữ liệu không hợp lệ (orphaned data) trong database MongoDB của CareerZone.

## 📋 Tổng quan

Khi phát triển và test, đôi khi dữ liệu bị tạo cứng hoặc không đồng bộ, dẫn đến các tham chiếu (references) không hợp lệ giữa các collections. Ví dụ:
- `RecruiterProfile.userId` tham chiếu đến một `User._id` không tồn tại
- `Job.recruiterProfileId` tham chiếu đến một `RecruiterProfile._id` không tồn tại
- `Application.candidateProfileId` tham chiếu đến một `CandidateProfile._id` không tồn tại

## 🔍 Script 1: Kiểm tra tính toàn vẹn dữ liệu

### Mục đích
Quét toàn bộ database và tìm các tham chiếu không hợp lệ mà KHÔNG xóa dữ liệu.

### Cách chạy
```bash
cd be
npm run check:integrity
```

hoặc

```bash
cd be
node scripts/check-data-integrity.js
```

### Các collection được kiểm tra

1. **CandidateProfile**
   - Kiểm tra `userId` có tồn tại trong `User` collection không

2. **RecruiterProfile**
   - Kiểm tra `userId` có tồn tại trong `User` collection không

3. **Job**
   - Kiểm tra `recruiterProfileId` có tồn tại trong `RecruiterProfile` collection không

4. **Application**
   - Kiểm tra `jobId` có tồn tại trong `Job` collection không
   - Kiểm tra `candidateProfileId` có tồn tại trong `CandidateProfile` collection không

5. **SavedJob**
   - Kiểm tra `candidateId` có tồn tại trong `User` collection không
   - Kiểm tra `jobId` có tồn tại trong `Job` collection không

6. **SearchHistory**
   - Kiểm tra `userId` có tồn tại trong `User` collection không

7. **Notification**
   - Kiểm tra `userId` có tồn tại trong `User` collection không

8. **ChatMessage**
   - Kiểm tra `senderId` có tồn tại trong `User` collection không
   - Kiểm tra `recipientId` có tồn tại trong `User` collection không
   - Kiểm tra `conversationId` có tồn tại trong `Conversation` collection không

9. **Conversation**
   - Kiểm tra `participant1` có tồn tại trong `User` collection không
   - Kiểm tra `participant2` có tồn tại trong `User` collection không

### Kết quả mẫu

```
🔍 Bắt đầu kiểm tra tính toàn vẹn dữ liệu...

📋 Kiểm tra CandidateProfile...
   ✓ Đã kiểm tra 150 CandidateProfile
   ⚠️  Tìm thấy 3 vấn đề

📋 Kiểm tra RecruiterProfile...
   ✓ Đã kiểm tra 45 RecruiterProfile
   ⚠️  Tìm thấy 2 vấn đề

...

================================================================================
📊 KẾT QUẢ KIỂM TRA TÍNH TOÀN VẸN DỮ LIỆU
================================================================================

❌ CANDIDATEPROFILES - Tìm thấy 3 vấn đề:
--------------------------------------------------------------------------------

1. Document ID: 507f1f77bcf86cd799439011
   Vấn đề: userId không tồn tại trong collection User
   Chi tiết: {
     "userId": "507f1f77bcf86cd799439010",
     "fullname": "Nguyễn Văn A"
   }

...

================================================================================
⚠️  TỔNG CỘNG: 5 vấn đề cần được xử lý.
================================================================================
```

## 🧹 Script 2: Dọn dẹp dữ liệu orphaned

### Mục đích
Tìm và XÓA các dữ liệu có tham chiếu không hợp lệ.

### ⚠️ CẢNH BÁO
Script này sẽ **XÓA VĨNH VIỄN** dữ liệu không hợp lệ. Hãy chắc chắn bạn:
1. Đã backup database
2. Đã chạy script kiểm tra trước (`check:integrity`)
3. Hiểu rõ dữ liệu nào sẽ bị xóa

### Cách chạy
```bash
cd be
npm run cleanup:orphaned
```

hoặc

```bash
cd be
node scripts/cleanup-orphaned-data.js
```

### Quy trình hoạt động

1. **Bước 1: Dry Run (Kiểm tra)**
   - Script sẽ tự động chạy ở chế độ dry run trước
   - Hiển thị tất cả dữ liệu sẽ bị xóa
   - KHÔNG xóa dữ liệu thực tế

2. **Bước 2: Xác nhận**
   - Script hỏi bạn có muốn xóa thực tế không
   - Nhập `yes` để xóa
   - Nhập `no` hoặc bất kỳ ký tự nào khác để hủy

3. **Bước 3: Xóa thực tế** (nếu bạn chọn yes)
   - Xóa tất cả dữ liệu orphaned
   - Hiển thị kết quả cuối cùng

### Kết quả mẫu

```
⚠️  CẢNH BÁO: Script này sẽ xóa dữ liệu orphaned (dữ liệu tham chiếu không hợp lệ)

Bước 1: Chạy kiểm tra (Dry Run)...

🔍 CHẾ ĐỘ KIỂM TRA (Dry Run) - Không xóa dữ liệu thực tế

📋 Xử lý CandidateProfile...
   ⚠️  Tìm thấy orphaned CandidateProfile: 507f1f77bcf86cd799439011 (userId: 507f1f77bcf86cd799439010)
   Sẽ xóa 3 CandidateProfile

...

================================================================================
📊 KẾT QUẢ KIỂM TRA (DRY RUN)
================================================================================

   candidateProfiles: 3 sẽ bị xóa
   recruiterProfiles: 2 sẽ bị xóa
   applications: 5 sẽ bị xóa

================================================================================
   TỔNG CỘNG: 10 documents sẽ bị xóa
================================================================================

Bạn có muốn XÓA THỰC TẾ các dữ liệu này không? (yes/no): yes

⚠️  Bắt đầu xóa dữ liệu thực tế...

...

✅ Hoàn thành việc dọn dẹp dữ liệu!
```

## 🛠️ Khi nào nên sử dụng

### Sử dụng `check:integrity` khi:
- Sau khi import dữ liệu test
- Sau khi chạy migration
- Định kỳ kiểm tra sức khỏe database
- Trước khi deploy production
- Khi gặp lỗi liên quan đến tham chiếu không hợp lệ

### Sử dụng `cleanup:orphaned` khi:
- Đã xác nhận có dữ liệu orphaned qua script `check:integrity`
- Cần dọn dẹp database test/development
- Sau khi xóa users/profiles và muốn xóa dữ liệu liên quan
- **KHÔNG** nên chạy trên production mà không backup trước

## 📝 Best Practices

1. **Luôn backup trước khi cleanup**
   ```bash
   mongodump --uri="mongodb://localhost:27017/careerzone" --out=backup-$(date +%Y%m%d)
   ```

2. **Chạy check trước cleanup**
   ```bash
   npm run check:integrity
   # Xem kết quả, đánh giá
   npm run cleanup:orphaned
   ```

3. **Test trên môi trường development trước**
   - Không chạy trực tiếp trên production
   - Test trên bản copy của database production

4. **Kiểm tra lại sau khi cleanup**
   ```bash
   npm run check:integrity
   # Kết quả phải là: "Không tìm thấy vấn đề nào"
   ```

## 🔧 Troubleshooting

### Lỗi kết nối MongoDB
```
❌ MongoDB connection error: ...
```
**Giải pháp**: Kiểm tra file `.env` có đúng `MONGODB_URI` không

### Script chạy quá lâu
**Nguyên nhân**: Database có quá nhiều documents
**Giải pháp**: Bình thường, script cần thời gian để quét toàn bộ database

### Không tìm thấy vấn đề nhưng vẫn có lỗi
**Giải pháp**: 
- Kiểm tra indexes của các collections
- Chạy `db.collection.validate()` trong MongoDB shell
- Xem logs của application để tìm lỗi cụ thể

## 📚 Tham khảo

- [Mongoose Population](https://mongoosejs.com/docs/populate.html)
- [MongoDB Data Integrity](https://www.mongodb.com/docs/manual/core/data-integrity/)
- [Referential Integrity in MongoDB](https://www.mongodb.com/docs/manual/core/data-modeling-introduction/)
