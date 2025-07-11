# Tính năng Tạo CV theo Template - CareerZone Backend

## Tổng quan

Tính năng này cho phép người dùng tạo và quản lý CV theo các template có sẵn. Hệ thống được thiết kế theo mô hình JSON-driven với template được lưu trữ trực tiếp trong code.

## Cấu trúc Dự án

```
src/
├── data/
│   └── cvTemplates.data.js      # Dữ liệu template (JSON)
├── services/
│   ├── template.service.js      # Logic xử lý template
│   └── cv.service.js           # Logic xử lý CV
├── controllers/
│   ├── template.controller.js   # Controller cho template
│   └── cv.controller.js        # Controller cho CV
├── routes/
│   ├── template.route.js        # Routes cho template
│   └── cv.route.js             # Routes cho CV
├── schemas/
│   └── cv.schema.js            # Validation schema cho CV
└── models/
    └── CV.js                   # MongoDB model (đã có sẵn)
```

## API Endpoints

### Template APIs (Công khai)

- `GET /api/templates` - Lấy danh sách tất cả template
- `GET /api/templates/:id` - Lấy chi tiết template theo ID

### CV APIs (Yêu cầu authentication)

- `GET /api/cvs` - Lấy tất cả CV của user hiện tại
- `POST /api/cvs` - Tạo CV mới với dữ liệu đầy đủ
- `GET /api/cvs/:id` - Lấy CV theo ID
- `PUT /api/cvs/:id` - Cập nhật CV
- `DELETE /api/cvs/:id` - Xóa CV
- `POST /api/cvs/from-template` - Tạo CV từ template (chỉ structure)
- `POST /api/cvs/:id/duplicate` - Sao chép CV

## Cấu trúc Template

Mỗi template trong `cvTemplates.data.js` có cấu trúc:

```javascript
{
  _id: 'template-id',              // ID duy nhất
  name: 'Template Name',           // Tên hiển thị
  previewUrl: 'image-url',         // URL ảnh preview
  theme: {                         // Cấu hình màu sắc và font
    primary: '#color',
    secondary: '#color',
    font: 'font-family'
  },
  sections: [                      // Cấu hình layout các section
    {
      key: 'personalInfo',         // Key để mapping với data
      order: 1,                    // Thứ tự hiển thị
      layout: { column: 1 },       // Cột hiển thị (cho 2-column layout)
      style: { /* CSS styles */ }  // Style tùy chỉnh
    }
  ]
}
```

## Cấu trúc CV Data

```javascript
{
  name: "Tên CV",
  templateId: "template-id",
  personalInfo: {
    firstName: "Tên",
    lastName: "Họ",
    email: "email@example.com",
    phone: "+84123456789",
    address: "Địa chỉ",
    linkedin: "URL",
    github: "URL",
    portfolio: "URL",
    avatar: "URL"
  },
  summary: "Tóm tắt bản thân",
  skills: [{ name: "Skill name" }],
  experiences: [{
    companyName: "Tên công ty",
    position: "Vị trí",
    startDate: "YYYY-MM-DD",
    endDate: "YYYY-MM-DD",
    description: "Mô tả công việc"
  }],
  educations: [{
    school: "Tên trường",
    major: "Chuyên ngành",
    degree: "Bằng cấp",
    startDate: "YYYY-MM-DD",
    endDate: "YYYY-MM-DD",
    gpa: "3.5/4.0",
    description: "Mô tả"
  }],
  projects: [{
    name: "Tên dự án",
    description: "Mô tả dự án",
    startDate: "YYYY-MM-DD",
    endDate: "YYYY-MM-DD",
    url: "URL",
    technologies: ["Tech1", "Tech2"]
  }],
  awardsAndCertifications: [{
    name: "Tên giải thưởng/chứng chỉ",
    issuer: "Đơn vị cấp",
    date: "YYYY-MM-DD",
    description: "Mô tả"
  }],
  references: [{
    name: "Tên người tham chiếu",
    title: "Chức danh",
    company: "Công ty",
    email: "email@example.com",
    phone: "+84123456789"
  }]
}
```

## Cách sử dụng

### 1. Frontend lấy danh sách template

```javascript
const response = await fetch('/api/templates');
const { data: templates } = await response.json();
```

### 2. Frontend lấy chi tiết template để render

```javascript
const response = await fetch('/api/templates/classic-professional');
const { data: template } = await response.json();
```

### 3. Frontend tạo CV từ template

```javascript
const response = await fetch('/api/cvs/from-template', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    templateId: 'classic-professional',
    name: 'My CV'
  })
});
```

### 4. Frontend lưu CV với dữ liệu đầy đủ

```javascript
const response = await fetch('/api/cvs', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify(cvData)
});
```

## Template có sẵn

1. **classic-professional** - Template cổ điển, 1 cột
2. **modern-sidebar-blue** - Template hiện đại, 2 cột, màu xanh
3. **minimal-clean** - Template tối giản
4. **creative-orange** - Template sáng tạo, màu cam

## Thêm Template mới

1. Mở file `src/data/cvTemplates.data.js`
2. Thêm object template mới vào mảng `templates`
3. Đảm bảo `_id` là duy nhất
4. Cấu hình `sections` theo layout mong muốn
5. Restart server để áp dụng

## Testing

Sử dụng file `httpdocs/cv.http` để test các API endpoints với VS Code REST Client extension.

## Frontend Integration

Frontend sẽ sử dụng templateData từ API để:

1. Render CV preview theo đúng style và layout
2. Áp dụng theme colors và fonts
3. Sắp xếp sections theo order và column layout
4. Áp dụng custom styles cho từng section

Tham khảo hướng dẫn chi tiết về cách implement phía frontend trong documentation riêng.
