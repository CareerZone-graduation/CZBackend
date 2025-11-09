# Hướng dẫn Tính năng Che CV (CV Masking)

## Tổng quan

Tính năng này cho phép ứng viên bật/tắt chế độ cho phép nhà tuyển dụng tìm kiếm hồ sơ của mình. Khi bật, ứng viên **phải chọn 1 CV** để hiển thị cho nhà tuyển dụng. Nhà tuyển dụng có thể xem hồ sơ và CV đã chọn nhưng thông tin nhạy cảm (email, số điện thoại trong CV và cả trang profile ứng viên) sẽ bị che cho đến khi họ mở khóa hồ sơ.

## Luồng hoạt động

### 1. Ứng viên bật tìm việc với CV được chọn
- Ứng viên gọi API `PATCH /api/v1/candidates/settings/allow-search` với:
  - `allowSearch: true`
  - `selectedCvId: "cv_id_here"` (bắt buộc khi bật)
- Hệ thống:
  - Kiểm tra CV có tồn tại trong hồ sơ không
  - Cập nhật trường `allowSearch` và `selectedCvId` trong model `User`
- Hồ sơ của ứng viên giờ có thể được nhà tuyển dụng tìm thấy

### 2. Nhà tuyển dụng xem hồ sơ (chưa mở khóa)
- NTD gọi API `GET /api/v1/recruiters/candidates/:userId`
- Hệ thống kiểm tra:
  - Ứng viên có `allowSearch = true` không?
  - NTD đã mở khóa hồ sơ chưa? (kiểm tra `ProfileUnlock`)
- Nếu chưa mở khóa:
  - Email: `a***n@example.com`
  - Phone: `098****567`
  - **CV files: Chỉ trả về 1 CV duy nhất mà ứng viên đã chọn** (từ `selectedCvId`) và có che nội dung

### 3. Nhà tuyển dụng xem CV (chưa mở khóa)
- NTD gọi API `GET /api/v1/recruiters/candidates/:candidateId/cv/:cvId`
- Hệ thống kiểm tra:
  - **CV được yêu cầu có phải là CV được chọn không?** (so sánh `cvId` với `selectedCvId`)
  - Nếu không phải → Trả lỗi 403 Forbidden
  - Nếu đúng → Tiếp tục xử lý:
    1. Tải file PDF gốc từ Cloudinary
    2. Sử dụng `pdfjs-dist` để phân tích text trong PDF
    3. Tìm tất cả email và số điện thoại bằng regex
    4. Sử dụng `pdf-lib` để vẽ hình chữ nhật đen che các vị trí đó
    5. Trả về PDF đã che

### 4. Nhà tuyển dụng mở khóa hồ sơ
- NTD gọi API `POST /api/v1/recruiters/candidates/:userId/unlock`
- Hệ thống:
  - Kiểm tra số dư coin của NTD
  - Trừ coin (ví dụ: 10 coins)
  - Tạo bản ghi `ProfileUnlock`
- Từ giờ NTD có thể xem thông tin đầy đủ

### 5. Nhà tuyển dụng xem CV (đã mở khóa)
- NTD gọi lại API `GET /api/v1/recruiters/candidates/:candidateId/cv/:cvId`
- Hệ thống kiểm tra thấy đã có `ProfileUnlock`
- **Giờ có thể xem bất kỳ CV nào** (không chỉ CV được chọn)
- Trả về file PDF gốc (không che)

## Cấu trúc Code

### Backend Files

```
be/
├── src/
│   ├── utils/
│   │   └── cvMasker.js              # Helper che PDF
│   ├── services/
│   │   ├── cvMask.service.js        # Service xử lý CV masking
│   │   ├── candidate.service.js     # Thêm toggleAllowSearch()
│   │   └── recruiter.service.js     # Cập nhật getCandidateProfile()
│   ├── controllers/
│   │   ├── cvMask.controller.js     # Controller phục vụ CV
│   │   └── candidate.controller.js  # Thêm toggleAllowSearch()
│   ├── routes/
│   │   ├── recruiter.route.js       # Thêm route /candidates/:id/cv/:cvId
│   │   └── candidate.route.js       # Thêm route /settings/allow-search
│   └── models/
│       ├── User.js                  # Có trường allowSearch
│       ├── CandidateProfile.js      # Có trường cvs[]
│       └── ProfileUnlock.js         # Lưu lượt mở khóa
└── test-cv-masking.http             # File test API
```

### Các API Endpoints

#### Candidate APIs

**1. Bật cho phép tìm kiếm với CV được chọn**
```http
PATCH /api/v1/candidates/settings/allow-search
Authorization: Bearer <candidate_token>
Content-Type: application/json

{
  "allowSearch": true,
  "selectedCvId": "673abc123def456789"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Cập nhật cài đặt cho phép tìm kiếm thành công.",
  "data": {
    "allowSearch": true,
    "selectedCvId": "673abc123def456789"
  }
}
```

**2. Tắt cho phép tìm kiếm**
```http
PATCH /api/v1/candidates/settings/allow-search
Authorization: Bearer <candidate_token>
Content-Type: application/json

{
  "allowSearch": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Cập nhật cài đặt cho phép tìm kiếm thành công.",
  "data": {
    "allowSearch": false,
    "selectedCvId": null
  }
}
```

#### Recruiter APIs

**3. Xem hồ sơ ứng viên**
```http
GET /api/v1/recruiters/candidates/:userId
Authorization: Bearer <recruiter_token>
```

**Response (chưa mở khóa - chỉ hiển thị CV được chọn):**
```json
{
  "success": true,
  "data": {
    "fullname": "Nguyễn Văn A",
    "email": "n***a@example.com",
    "phone": "098****567",
    "isUnlocked": false,
    "cvs": [
      {
        "_id": "673abc123def456789",
        "name": "CV_NguyenVanA_2024.pdf",
        "path": "https://cloudinary.com/...",
        "uploadedAt": "2024-01-01",
        "isDefault": false
      }
    ]
  }
}
```

**Note:** Nếu ứng viên có 5 CV nhưng chỉ chọn 1 CV để tìm việc, recruiter chưa unlock chỉ thấy 1 CV đó.

**4. Xem CV (masked hoặc original)**
```http
GET /api/v1/recruiters/candidates/:candidateId/cv/:cvId
Authorization: Bearer <recruiter_token>
```

**Response:** File PDF (binary)
- Nếu chưa mở khóa: PDF với email/phone bị che
- Nếu đã mở khóa: PDF gốc

**5. Mở khóa hồ sơ**
```http
POST /api/v1/recruiters/candidates/:userId/unlock
Authorization: Bearer <recruiter_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Mở khóa hồ sơ thành công.",
  "data": {
    "remainingCoins": 90,
    "unlockedAt": "2024-01-01T10:00:00Z"
  }
}
```

## Cách test

### 1. Chuẩn bị
- Tạo 1 tài khoản candidate
- Tạo 1 tài khoản recruiter
- Upload **ít nhất 2 CV** cho candidate (có chứa email và số điện thoại)
- Lấy JWT token của cả 2 tài khoản
- Lấy ID của các CV đã upload

### 2. Test flow
1. **Candidate lấy danh sách CV:**
   ```bash
   GET /api/v1/candidates/cvs
   # Ghi lại ID của CV muốn chọn
   ```

2. **Candidate bật tìm việc với CV được chọn:**
   ```bash
   PATCH /api/v1/candidates/settings/allow-search
   Body: { 
     "allowSearch": true,
     "selectedCvId": "673abc123def456789"
   }
   ```

3. **Recruiter xem hồ sơ (chưa unlock):**
   ```bash
   GET /api/v1/recruiters/candidates/{candidateId}
   # Kiểm tra:
   # - email/phone bị mask
   # - cvs array chỉ có 1 CV (CV được chọn)
   ```

4. **Recruiter xem CV được chọn (chưa unlock):**
   ```bash
   GET /api/v1/recruiters/candidates/{candidateId}/cv/{selectedCvId}
   # Mở PDF, kiểm tra email/phone bị che bằng hình chữ nhật xám
   ```

5. **Recruiter thử xem CV khác (chưa unlock - should fail):**
   ```bash
   GET /api/v1/recruiters/candidates/{candidateId}/cv/{otherCvId}
   # Kỳ vọng: 403 Forbidden
   # Message: "Bạn chỉ có thể xem CV mà ứng viên đã chọn để tìm việc."
   ```

6. **Recruiter mở khóa:**
   ```bash
   POST /api/v1/recruiters/candidates/{candidateId}/unlock
   ```

7. **Recruiter xem lại hồ sơ (đã unlock):**
   ```bash
   GET /api/v1/recruiters/candidates/{candidateId}
   # Kiểm tra:
   # - email/phone hiển thị đầy đủ
   # - cvs array hiển thị TẤT CẢ CV của candidate
   ```

8. **Recruiter xem bất kỳ CV nào (đã unlock):**
   ```bash
   GET /api/v1/recruiters/candidates/{candidateId}/cv/{anyCvId}
   # Mở PDF, kiểm tra email/phone hiển thị đầy đủ (không bị che)
   ```

## Lưu ý kỹ thuật

### 1. Regex Pattern
- **Phone:** `/\b0?(?:[\s\-.]*\d){9,11}\b/g`
  - Bắt số điện thoại Việt Nam (9-11 chữ số)
  - Có thể có dấu cách, dấu gạch ngang
  
- **Email:** `/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g`
  - Bắt email chuẩn

### 2. PDF Processing
- Sử dụng `pdfjs-dist` để đọc text và vị trí
- Sử dụng `pdf-lib` để vẽ hình chữ nhật che
- Màu che: `rgb(0.2, 0.2, 0.2)` (xám đậm)

### 3. Performance
- File PDF được tải từ Cloudinary mỗi lần request
- Xử lý masking diễn ra real-time
- Không cache PDF đã che (để đảm bảo bảo mật)

### 4. Security
- Luôn kiểm tra `allowSearch` trước khi cho phép xem hồ sơ
- Nếu lỗi khi masking, throw error thay vì trả file gốc
- Chỉ recruiter được xác thực mới có thể gọi API

## Mở rộng trong tương lai

1. **Cache masked PDF:** Lưu PDF đã che vào Redis để tăng performance
2. **Thêm watermark:** Thêm watermark "Confidential" lên PDF đã che
3. **Tùy chỉnh regex:** Cho phép admin cấu hình regex pattern
4. **Mask thêm thông tin:** Địa chỉ, tên công ty cũ, v.v.
5. **Analytics:** Theo dõi số lượt xem CV, tỷ lệ unlock

## Troubleshooting

### Lỗi: "Cannot read properties of null"
- Kiểm tra `pdfjs-dist` và `pdf-lib` đã được cài đặt chưa
- Chạy: `pnpm add pdfjs-dist pdf-lib`

### Lỗi: "Không thể tải file CV từ Cloudinary"
- Kiểm tra URL Cloudinary có hợp lệ không
- Kiểm tra network timeout (mặc định 30s)

### PDF không bị che
- Kiểm tra regex pattern có khớp với format email/phone trong CV không
- Thêm log để debug vị trí text được tìm thấy

### Lỗi: "Ứng viên đã tắt tính năng tìm kiếm"
- Ứng viên đã set `allowSearch = false`
- Yêu cầu ứng viên bật lại tính năng
