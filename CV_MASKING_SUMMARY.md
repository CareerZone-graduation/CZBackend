# Tóm tắt Tính năng CV Masking với Chọn CV

## Thay đổi chính

### 1. Model Updates
- **User.js**: Thêm trường `selectedCvId` để lưu CV được chọn khi bật tìm việc

### 2. API Endpoints Mới

#### Candidate APIs
```
GET    /api/v1/candidates/settings/allow-search      # Lấy cài đặt hiện tại
PATCH  /api/v1/candidates/settings/allow-search      # Bật/tắt tìm việc + chọn CV
```

#### Recruiter APIs
```
GET    /api/v1/recruiters/candidates/:candidateId/cv/:cvId    # Xem CV (masked/original)
```

### 3. Luồng hoạt động

**Candidate:**
1. Upload nhiều CV
2. Bật tìm việc + chọn 1 CV: `{ allowSearch: true, selectedCvId: "..." }`
3. Chỉ CV được chọn sẽ hiển thị cho recruiter chưa unlock

**Recruiter (chưa unlock):**
1. Xem profile → Chỉ thấy 1 CV (CV được chọn)
2. Xem CV được chọn → PDF bị che email/SĐT
3. Thử xem CV khác → 403 Forbidden

**Recruiter (đã unlock):**
1. Xem profile → Thấy TẤT CẢ CV
2. Xem bất kỳ CV nào → PDF gốc (không che)

## Files đã tạo/sửa

### Tạo mới:
- `be/src/utils/cvMasker.js` - Helper che PDF
- `be/src/services/cvMask.service.js` - Service xử lý CV
- `be/src/controllers/cvMask.controller.js` - Controller phục vụ CV
- `be/test-cv-masking.http` - File test API
- `be/CV_MASKING_GUIDE.md` - Hướng dẫn chi tiết

### Cập nhật:
- `be/src/models/User.js` - Thêm `selectedCvId`
- `be/src/services/candidate.service.js` - Thêm `toggleAllowSearch()`, `getAllowSearchSettings()`
- `be/src/services/recruiter.service.js` - Cập nhật `getCandidateProfile()`
- `be/src/controllers/candidate.controller.js` - Thêm controllers
- `be/src/routes/candidate.route.js` - Thêm routes
- `be/src/routes/recruiter.route.js` - Thêm route CV

## Bảo mật

✅ Chỉ hiển thị CV được chọn cho recruiter chưa unlock
✅ Che email/SĐT trong PDF bằng hình chữ nhật xám
✅ Kiểm tra `allowSearch` trước khi cho phép xem
✅ Kiểm tra CV có phải là CV được chọn không
✅ Sau khi unlock mới xem được tất cả CV

## Test nhanh

```bash
# 1. Candidate bật tìm việc
PATCH /api/v1/candidates/settings/allow-search
Body: { "allowSearch": true, "selectedCvId": "cv_id" }

# 2. Recruiter xem profile (chỉ thấy 1 CV)
GET /api/v1/recruiters/candidates/{candidateId}

# 3. Recruiter xem CV (bị che)
GET /api/v1/recruiters/candidates/{candidateId}/cv/{selectedCvId}

# 4. Recruiter unlock
POST /api/v1/recruiters/candidates/{candidateId}/unlock

# 5. Recruiter xem lại (thấy tất cả CV, không bị che)
GET /api/v1/recruiters/candidates/{candidateId}
```

## Dependencies

```bash
pnpm add pdfjs-dist pdf-lib
```

## Lưu ý

- Khi bật `allowSearch = true`, **bắt buộc** phải có `selectedCvId`
- Khi tắt `allowSearch = false`, `selectedCvId` tự động set về `null`
- Regex pattern có thể cần điều chỉnh tùy format CV
- PDF processing diễn ra real-time (không cache)
