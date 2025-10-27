# Tích hợp Profile và CV - Hướng dẫn Refactor

## Tổng quan

Tài liệu này mô tả các thay đổi được thực hiện để bổ sung thông tin vào Profile ứng viên cho khớp với dữ liệu CV, cho phép tạo CV tự động từ hồ sơ cá nhân.

## 1. Các trường mới được thêm vào CandidateProfile

### 1.1. Thông tin liên hệ & Mạng xã hội
```javascript
{
  address: String,        // Địa chỉ chi tiết
  website: String,        // Website/Portfolio cá nhân
  linkedin: String,       // Link LinkedIn
  github: String          // Link Github
}
```

### 1.2. Chứng chỉ (Certificates)
```javascript
certificates: [{
  name: String,           // Tên chứng chỉ
  issuer: String,         // Đơn vị cấp
  issueDate: String,      // Ngày cấp
  expiryDate: String,     // Ngày hết hạn
  credentialId: String,   // Mã chứng chỉ
  url: String            // Link chứng chỉ
}]
```

### 1.3. Dự án (Projects)
```javascript
projects: [{
  name: String,           // Tên dự án
  description: String,    // Mô tả dự án
  url: String,           // Link dự án
  startDate: String,     // Ngày bắt đầu
  endDate: String,       // Ngày kết thúc
  technologies: [String] // Công nghệ sử dụng
}]
```

### 1.4. Cải tiến Skills
```javascript
skills: [{
  name: String,           // Tên kỹ năng
  level: String,          // Cấp độ: Beginner, Intermediate, Advanced, Expert
  category: String        // Phân loại: Technical, Soft Skills, Language, Other
}]
```

### 1.5. Cải tiến Education
```javascript
educations: [{
  // ... các trường hiện có
  location: String,       // Địa điểm trường
  honors: [String]       // Giải thưởng, danh hiệu
}]
```

### 1.6. Cải tiến Experience
```javascript
experiences: [{
  // ... các trường hiện có
  location: String,       // Địa điểm làm việc
  isCurrentJob: Boolean,  // Đánh dấu công việc hiện tại
  achievements: [String]  // Thành tựu cụ thể
}]
```

## 2. API Endpoints mới

### 2.1. Tạo CV từ Profile
**Endpoint:** `POST /api/cvs/from-profile`

**Request Body:**
```json
{
  "templateId": "modern-blue",
  "title": "My Professional CV"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Tạo CV từ hồ sơ thành công.",
  "data": {
    "_id": "...",
    "userId": "...",
    "templateId": "modern-blue",
    "title": "My Professional CV",
    "cvData": {
      "personalInfo": { ... },
      "professionalSummary": "...",
      "workExperience": [...],
      "education": [...],
      "skills": [...],
      "projects": [...],
      "certificates": [...]
    }
  }
}
```

**Mô tả:**
- API này tự động lấy dữ liệu từ CandidateProfile của user
- Map các trường từ Profile sang format CV
- Tạo CV mới với dữ liệu đã được điền sẵn

### 2.2. Cập nhật Profile (đã mở rộng)
**Endpoint:** `PUT /api/candidate/profile`

**Request Body (các trường mới):**
```json
{
  "address": "123 Nguyễn Huệ, Q1, TP.HCM",
  "website": "https://myportfolio.com",
  "linkedin": "https://linkedin.com/in/username",
  "github": "https://github.com/username",
  "certificates": [
    {
      "name": "AWS Certified Solutions Architect",
      "issuer": "Amazon Web Services",
      "issueDate": "2024-01",
      "expiryDate": "2027-01",
      "credentialId": "ABC123",
      "url": "https://..."
    }
  ],
  "projects": [
    {
      "name": "E-commerce Platform",
      "description": "Built a full-stack e-commerce platform",
      "url": "https://github.com/...",
      "startDate": "2023-01",
      "endDate": "2023-06",
      "technologies": ["React", "Node.js", "MongoDB"]
    }
  ]
}
```

## 3. Cập nhật Profile Completeness

### 3.1. Trọng số mới
```javascript
const weights = {
  basicInfo: 30%,      // Thông tin cơ bản (fullname, phone, preferredLocations)
  skills: 30%,         // Kỹ năng (>= 3 skills)
  preferences: 20%,    // Lương & điều kiện làm việc
  bio: 5%,            // Giới thiệu bản thân
  avatar: 5%,         // Ảnh đại diện
  experience: 3%,     // Kinh nghiệm làm việc
  education: 3%,      // Học vấn
  certificates: 2%,   // Chứng chỉ (MỚI)
  projects: 2%,       // Dự án (MỚI)
  socialLinks: 0%,    // LinkedIn, Github, Website (không tính điểm)
  cv: 0%             // CV upload (không bắt buộc)
}
```

### 3.2. Recommendations mới
Hệ thống sẽ gợi ý thêm:
- "Thêm chứng chỉ chuyên môn (không bắt buộc)"
- "Thêm dự án đã thực hiện (không bắt buộc)"
- "Thêm liên kết mạng xã hội (LinkedIn, Github, Website)"

## 4. Mapping Profile → CV

### 4.1. Personal Info
```javascript
Profile → CV
fullname → personalInfo.fullName
user.email → personalInfo.email
phone → personalInfo.phone
address → personalInfo.address
website → personalInfo.website
linkedin → personalInfo.linkedin
github → personalInfo.github
avatar → personalInfo.profileImage
```

### 4.2. Work Experience
```javascript
Profile.experiences → CV.workExperience
company → company
position → position
location → location
startDate → startDate
endDate → endDate
isCurrentJob → isCurrentJob
description → description
achievements/responsibilities → achievements
```

### 4.3. Education
```javascript
Profile.educations → CV.education
degree → degree
school → institution
major → fieldOfStudy
location → location
startDate → startDate
endDate → endDate
gpa → gpa
honors → honors
description → description
```

### 4.4. Skills
```javascript
Profile.skills → CV.skills
name → name
level → level
category → category
```

### 4.5. Projects (MỚI)
```javascript
Profile.projects → CV.projects
name → name
description → description
url → url
startDate → startDate
endDate → endDate
technologies → technologies
```

### 4.6. Certificates (MỚI)
```javascript
Profile.certificates → CV.certificates
name → name
issuer → issuer
issueDate → issueDate
expiryDate → expiryDate
credentialId → credentialId
url → url
```

## 5. Cập nhật Frontend (Cần thực hiện)

### 5.1. Trang Profile - Thêm sections mới

#### Section Chứng chỉ
```jsx
<CertificatesSection>
  <CertificateCard>
    - Tên chứng chỉ
    - Đơn vị cấp
    - Ngày cấp / Ngày hết hạn
    - Mã chứng chỉ
    - Link xác thực
    - Nút: Thêm / Sửa / Xóa
  </CertificateCard>
</CertificatesSection>
```

#### Section Dự án
```jsx
<ProjectsSection>
  <ProjectCard>
    - Tên dự án
    - Mô tả
    - Link dự án
    - Thời gian thực hiện
    - Công nghệ sử dụng (tags)
    - Nút: Thêm / Sửa / Xóa
  </ProjectCard>
</ProjectsSection>
```

#### Section Liên kết mạng xã hội
```jsx
<SocialLinksSection>
  - Website/Portfolio
  - LinkedIn
  - Github
  - Nút: Cập nhật
</SocialLinksSection>
```

### 5.2. Cập nhật Skills Section
```jsx
<SkillCard>
  - Tên kỹ năng
  - Cấp độ (Beginner/Intermediate/Advanced/Expert) - Dropdown
  - Phân loại (Technical/Soft Skills/Language/Other) - Dropdown
</SkillCard>
```

### 5.3. Cập nhật Education Section
```jsx
<EducationCard>
  // ... các trường hiện có
  - Địa điểm trường (mới)
  - Giải thưởng/Danh hiệu (mới) - Array input
</EducationCard>
```

### 5.4. Cập nhật Experience Section
```jsx
<ExperienceCard>
  // ... các trường hiện có
  - Địa điểm làm việc (mới)
  - Checkbox: Đây là công việc hiện tại (mới)
  - Thành tựu (mới) - Array input, tách biệt với responsibilities
</ExperienceCard>
```

### 5.5. Trang tạo CV - Thêm nút "Điền từ Profile"
```jsx
<CreateCVPage>
  <TemplateSelector />
  <Button onClick={createFromProfile}>
    Tạo CV từ hồ sơ cá nhân
  </Button>
</CreateCVPage>
```

**Logic:**
```javascript
const createFromProfile = async (templateId) => {
  try {
    const response = await api.post('/api/cvs/from-profile', {
      templateId,
      title: 'My CV'
    });
    
    // Redirect to CV editor
    navigate(`/cv/edit/${response.data.data._id}`);
  } catch (error) {
    // Handle error
  }
};
```

## 6. Validation Rules

### 6.1. Certificates
- `name`: Required, max 200 chars
- `issuer`: Required, max 200 chars
- `issueDate`: Required, date string
- `expiryDate`: Optional, date string
- `credentialId`: Optional, max 100 chars
- `url`: Optional, max 500 chars, valid URL

### 6.2. Projects
- `name`: Required, max 200 chars
- `description`: Optional, max 1000 chars
- `url`: Optional, max 500 chars, valid URL
- `startDate`: Optional, date string
- `endDate`: Optional, date string
- `technologies`: Optional, array of strings (max 100 chars each)

### 6.3. Social Links
- `address`: Optional, max 300 chars
- `website`: Optional, max 200 chars, valid URL
- `linkedin`: Optional, max 200 chars, valid URL
- `github`: Optional, max 200 chars, valid URL

## 7. Migration (Nếu cần)

Nếu database đã có dữ liệu, không cần migration vì:
- Tất cả các trường mới đều optional
- MongoDB sẽ tự động thêm các trường khi update
- Các profile cũ vẫn hoạt động bình thường

## 8. Testing Checklist

### Backend
- [ ] Test tạo CV từ profile với đầy đủ dữ liệu
- [ ] Test tạo CV từ profile với dữ liệu thiếu
- [ ] Test tạo CV khi chưa có profile
- [ ] Test update profile với certificates
- [ ] Test update profile với projects
- [ ] Test update profile với social links
- [ ] Test profile completeness calculation với trường mới
- [ ] Test validation cho các trường mới

### Frontend
- [ ] Hiển thị section Certificates trong profile
- [ ] CRUD operations cho Certificates
- [ ] Hiển thị section Projects trong profile
- [ ] CRUD operations cho Projects
- [ ] Hiển thị section Social Links trong profile
- [ ] Update Social Links
- [ ] Cập nhật Skills với level và category
- [ ] Cập nhật Education với location và honors
- [ ] Cập nhật Experience với location, isCurrentJob, achievements
- [ ] Nút "Tạo CV từ hồ sơ" hoạt động đúng
- [ ] CV được tạo có đầy đủ dữ liệu từ profile
- [ ] Profile completeness hiển thị đúng với trường mới

## 9. Ví dụ sử dụng

### 9.1. Tạo CV từ Profile (Frontend)
```javascript
// 1. User chọn template
const templateId = 'modern-blue';

// 2. Gọi API tạo CV từ profile
const response = await fetch('/api/cvs/from-profile', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    templateId,
    title: 'My Professional CV'
  })
});

const { data } = await response.json();

// 3. Redirect đến trang edit CV
window.location.href = `/cv/edit/${data._id}`;
```

### 9.2. Cập nhật Profile với Certificates
```javascript
const updateProfile = async () => {
  await fetch('/api/candidate/profile', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      certificates: [
        {
          name: 'AWS Certified Solutions Architect',
          issuer: 'Amazon Web Services',
          issueDate: '2024-01',
          expiryDate: '2027-01',
          credentialId: 'ABC123XYZ',
          url: 'https://aws.amazon.com/verification/ABC123XYZ'
        }
      ]
    })
  });
};
```

## 10. Lưu ý quan trọng

1. **Backward Compatibility**: Tất cả thay đổi đều backward compatible, profile cũ vẫn hoạt động bình thường.

2. **Optional Fields**: Certificates, Projects, Social Links đều là optional, không bắt buộc phải điền.

3. **Profile Completeness**: Các trường mới chỉ đóng góp 4% vào tổng điểm (2% certificates + 2% projects), không ảnh hưởng nhiều đến onboarding.

4. **Data Mapping**: Khi tạo CV từ profile, hệ thống sẽ tự động map dữ liệu, user có thể chỉnh sửa sau trong CV editor.

5. **Validation**: Frontend cần validate dữ liệu trước khi gửi lên backend để tránh lỗi.

## 11. Roadmap tiếp theo

1. **Phase 1** (Hoàn thành): Backend refactor
   - ✅ Update CandidateProfile model
   - ✅ Update candidate service
   - ✅ Update profile completeness logic
   - ✅ Add API endpoint tạo CV từ profile

2. **Phase 2** (Cần thực hiện): Frontend implementation
   - [ ] UI cho Certificates section
   - [ ] UI cho Projects section
   - [ ] UI cho Social Links section
   - [ ] Cập nhật Skills/Education/Experience forms
   - [ ] Nút "Tạo CV từ hồ sơ"

3. **Phase 3** (Tương lai): Enhancements
   - [ ] AI suggestions cho skills/projects
   - [ ] Import từ LinkedIn
   - [ ] Verify certificates tự động
   - [ ] Template recommendations dựa trên profile
