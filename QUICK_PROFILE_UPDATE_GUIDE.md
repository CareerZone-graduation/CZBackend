# Hướng dẫn nhanh: Cập nhật Profile & Tạo CV từ Profile

## Tóm tắt thay đổi

Đã bổ sung các trường mới vào Profile ứng viên để khớp với dữ liệu CV:
- ✅ Chứng chỉ (Certificates)
- ✅ Dự án (Projects)  
- ✅ Liên kết mạng xã hội (LinkedIn, Github, Website, Address)
- ✅ Cải tiến Skills (thêm level và category)
- ✅ Cải tiến Education (thêm location và honors)
- ✅ Cải tiến Experience (thêm location, isCurrentJob, achievements)

## API mới

### 1. Tạo CV từ Profile
```bash
POST /api/cvs/from-profile
Authorization: Bearer {token}

Body:
{
  "templateId": "modern-blue",
  "title": "My CV"
}
```

### 2. Cập nhật Profile (mở rộng)
```bash
PUT /api/candidate/profile
Authorization: Bearer {token}

Body:
{
  "certificates": [...],
  "projects": [...],
  "address": "...",
  "website": "...",
  "linkedin": "...",
  "github": "..."
}
```

## Cấu trúc dữ liệu mới

### Certificates
```javascript
{
  name: "AWS Certified",
  issuer: "Amazon",
  issueDate: "2024-01",
  expiryDate: "2027-01",
  credentialId: "ABC123",
  url: "https://..."
}
```

### Projects
```javascript
{
  name: "E-commerce Platform",
  description: "Built a full-stack...",
  url: "https://github.com/...",
  startDate: "2023-01",
  endDate: "2023-06",
  technologies: ["React", "Node.js"]
}
```

## Frontend cần làm

1. **Profile Page - Thêm sections:**
   - Certificates (CRUD)
   - Projects (CRUD)
   - Social Links (Update)

2. **Cập nhật forms:**
   - Skills: thêm dropdown level & category
   - Education: thêm location & honors
   - Experience: thêm location, checkbox isCurrentJob, achievements

3. **CV Creation Page:**
   - Thêm nút "Tạo CV từ hồ sơ"
   - Gọi API `/api/cvs/from-profile`

## Test nhanh

```bash
# 1. Cập nhật profile với certificates
curl -X PUT http://localhost:5000/api/candidate/profile \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "certificates": [{
      "name": "Test Certificate",
      "issuer": "Test Org",
      "issueDate": "2024-01"
    }]
  }'

# 2. Tạo CV từ profile
curl -X POST http://localhost:5000/api/cvs/from-profile \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "templateId": "modern-blue",
    "title": "My CV"
  }'
```

## Lưu ý

- Tất cả trường mới đều **optional**
- Profile cũ vẫn hoạt động bình thường
- Không cần migration database
- Profile completeness: certificates (2%), projects (2%)

## Chi tiết đầy đủ

Xem file `PROFILE_CV_INTEGRATION.md` để biết chi tiết đầy đủ về:
- Mapping Profile → CV
- Validation rules
- Testing checklist
- Ví dụ code frontend
