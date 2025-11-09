# Quick Start - Data Integrity Check

## 🚀 Cách sử dụng nhanh

### 1️⃣ Kiểm tra dữ liệu (An toàn - Không xóa gì)

```bash
cd be
npm run check:integrity
```

Script này sẽ:
- ✅ Quét toàn bộ database
- ✅ Tìm các tham chiếu không hợp lệ
- ✅ Hiển thị chi tiết các vấn đề
- ✅ **KHÔNG xóa** bất kỳ dữ liệu nào

### 2️⃣ Dọn dẹp dữ liệu không hợp lệ (Cẩn thận!)

```bash
cd be
npm run cleanup:orphaned
```

Script này sẽ:
- ⚠️ Hiển thị dữ liệu sẽ bị xóa (Dry run)
- ⚠️ Hỏi xác nhận từ bạn
- ⚠️ Xóa dữ liệu nếu bạn chọn `yes`

## 📊 Các collection được kiểm tra

| Collection | Trường kiểm tra | Tham chiếu đến |
|------------|----------------|----------------|
| CandidateProfile | `userId` | User |
| RecruiterProfile | `userId` | User |
| Job | `recruiterProfileId` | RecruiterProfile |
| Application | `jobId`, `candidateProfileId` | Job, CandidateProfile |
| SavedJob | `candidateId`, `jobId` | User, Job |
| SearchHistory | `userId` | User |
| Notification | `userId` | User |
| ChatMessage | `senderId`, `recipientId`, `conversationId` | User, User, Conversation |
| Conversation | `participant1`, `participant2` | User, User |

## ⚡ Ví dụ sử dụng

### Scenario 1: Kiểm tra định kỳ
```bash
# Chạy mỗi tuần để đảm bảo database sạch
npm run check:integrity
```

### Scenario 2: Sau khi import dữ liệu test
```bash
# Bước 1: Kiểm tra
npm run check:integrity

# Bước 2: Nếu có vấn đề, dọn dẹp
npm run cleanup:orphaned
# Nhập 'yes' khi được hỏi

# Bước 3: Kiểm tra lại
npm run check:integrity
# Kết quả phải là: "Không tìm thấy vấn đề nào"
```

### Scenario 3: Trước khi deploy
```bash
# Đảm bảo không có dữ liệu orphaned
npm run check:integrity

# Nếu có vấn đề, fix trước khi deploy
```

## 🔒 Lưu ý an toàn

1. **Luôn backup trước khi cleanup:**
   ```bash
   mongodump --uri="mongodb://localhost:27017/careerzone" --out=backup
   ```

2. **Test trên development trước:**
   - Không chạy cleanup trực tiếp trên production
   - Test trên bản copy của database

3. **Đọc kết quả dry run cẩn thận:**
   - Script sẽ hiển thị tất cả dữ liệu sẽ bị xóa
   - Chỉ chọn 'yes' nếu bạn chắc chắn

## 📖 Đọc thêm

Xem [DATA_INTEGRITY_README.md](./DATA_INTEGRITY_README.md) để biết chi tiết đầy đủ.
