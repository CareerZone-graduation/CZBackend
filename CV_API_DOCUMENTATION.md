# 📋 API Documentation - Chức năng tạo CV từ Template

## 🚀 API Endpoints mới đã được thêm:

### 1. **Lấy danh sách Templates**
```http
GET /api/templates
Authorization: Bearer <your_access_token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "classic-professional",
      "name": "Classic Professional",
      "previewUrl": "https://i.imgur.com/2OFa2B1.png",
      "theme": {
        "primary": "#2d3748",
        "secondary": "#718096"
      }
    },
    {
      "_id": "modern-creative",
      "name": "Modern Creative",
      "previewUrl": "https://i.imgur.com/3F8k2L9.png",
      "theme": {
        "primary": "#4299e1",
        "secondary": "#63b3ed"
      }
    }
  ]
}
```

### 2. **Tạo CV từ Template** ⭐ NEW
```http
POST /api/cvs/from-template
Authorization: Bearer <your_access_token>
Content-Type: application/json

{
  "templateId": "classic-professional",
  "name": "CV Marketing Manager"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Tạo CV từ template thành công.",
  "data": {
    "_id": "60f3b2b3c8e8f40015f4d2a1",
    "userId": "60f3b2b3c8e8f40015f4d2a0",
    "name": "CV Marketing Manager",
    "templateId": "classic-professional",
    "personalInfo": {},
    "summary": "",
    "skills": [],
    "educations": [],
    "experiences": [],
    "awardsAndCertifications": [],
    "projects": [],
    "references": [],
    "createdAt": "2025-10-01T10:30:00.000Z",
    "updatedAt": "2025-10-01T10:30:00.000Z"
  }
}
```

### 3. **Lấy chi tiết Template**
```http
GET /api/templates/:templateId
Authorization: Bearer <your_access_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "classic-professional",
    "name": "Classic Professional",
    "previewUrl": "https://i.imgur.com/2OFa2B1.png",
    "layoutType": "single-column",
    "theme": {
      "primary": "#2d3748",
      "secondary": "#718096",
      "background": "#FFFFFF",
      "font": "'Georgia', serif"
    },
    "sections": [
      {
        "key": "personalInfo",
        "order": 1,
        "layout": { "column": 1 },
        "style": { "textAlign": "center", "marginBottom": "2rem" }
      }
    ]
  }
}
```

## 🧪 Cách test API:

### 1. **Sử dụng Postman:**

1. **Đăng nhập trước để lấy token:**
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "your-email@gmail.com",
  "password": "your-password"
}
```

2. **Copy accessToken từ response**

3. **Test API tạo CV từ template:**
```http
POST http://localhost:3000/api/cvs/from-template
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "templateId": "classic-professional",
  "name": "CV Software Engineer"
}
```

### 2. **Sử dụng curl:**

```bash
# 1. Đăng nhập
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your-email@gmail.com","password":"your-password"}'

# 2. Lấy danh sách templates
curl -X GET http://localhost:3000/api/templates \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 3. Tạo CV từ template
curl -X POST http://localhost:3000/api/cvs/from-template \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"templateId":"classic-professional","name":"CV Software Engineer"}'
```

### 3. **Sử dụng VS Code REST Client:**

Tạo file `test-cv-api.http`:

```http
### Đăng nhập
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "your-email@gmail.com",
  "password": "your-password"
}

### Lấy danh sách templates
GET http://localhost:3000/api/templates
Authorization: Bearer YOUR_ACCESS_TOKEN

### Tạo CV từ template
POST http://localhost:3000/api/cvs/from-template
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "templateId": "classic-professional",
  "name": "CV Marketing Manager"
}

### Lấy tất cả CV của user
GET http://localhost:3000/api/cvs
Authorization: Bearer YOUR_ACCESS_TOKEN
```

## 📝 Templates có sẵn:

1. **classic-professional** - CV phong cách cổ điển
2. **modern-creative** - CV hiện đại, sáng tạo  
3. **minimal-clean** - CV tối giản, gọn gàng
4. **tech-developer** - CV chuyên cho developer
5. **business-executive** - CV cho quản lý

## 🔄 Workflow hoàn chỉnh:

1. **Frontend** gọi `/api/templates` để hiển thị danh sách template
2. **User** chọn template và nhập tên CV
3. **Frontend** gọi `/api/cvs/from-template` để tạo CV mới
4. **User** có thể edit CV qua `/api/cvs/:id` (PUT)
5. **User** có thể xem CV qua `/api/cvs/:id` (GET)

## ⚠️ Lưu ý:

- Tất cả API đều yêu cầu authentication (Bearer token)
- `templateId` phải tồn tại trong danh sách templates
- `name` CV không được để trống và tối đa 200 ký tự
- API trả về CV trống (chỉ có structure), user cần điền thông tin sau
