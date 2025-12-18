# CareerZone Backend API

Dịch vụ backend cho nền tảng CareerZone, được xây dựng với Node.js, Express và MongoDB. Cung cấp API mạnh mẽ cho các ứng dụng Candidate, Recruiter và Admin với các tính năng real-time và xử lý nền.

## Tổng Quan

CareerZone Backend là hệ thống API RESTful phục vụ cho nền tảng tuyển dụng việc làm. Hệ thống hỗ trợ 3 loại người dùng chính:
- **Ứng viên (Candidate)**: Tìm kiếm việc làm, tạo CV, ứng tuyển
- **Nhà tuyển dụng (Recruiter)**: Đăng tin tuyển dụng, quản lý ứng viên
- **Quản trị viên (Admin)**: Quản lý toàn bộ hệ thống

## 🚀 Tính Năng

### Xác thực & Phân quyền
- Đăng nhập/Đăng ký với email hoặc OAuth (Google)
- Xác thực JWT với Passport.js
- Phân quyền theo vai trò (Candidate, Recruiter, Admin)
- Quên mật khẩu và đặt lại mật khẩu

### Quản lý Việc làm
- CRUD việc làm với nhiều tiêu chí lọc
- Tìm kiếm việc làm theo vị trí địa lý
- Gợi ý việc làm dựa trên kỹ năng ứng viên
- Quản lý trạng thái việc làm (chờ duyệt, đang tuyển, đã đóng)

### Quản lý Ứng viên
- Tạo và quản lý hồ sơ ứng viên
- Xây dựng CV trực tuyến
- Theo dõi lịch sử ứng tuyển
- Lưu việc làm yêu thích

### Quản lý Nhà tuyển dụng
- Đăng ký và xác minh công ty
- Quản lý tin tuyển dụng
- Xem và lọc hồ sơ ứng viên
- Lên lịch phỏng vấn

### Tính năng Real-time
- Thông báo tức thời qua Socket.io
- Chat giữa ứng viên và nhà tuyển dụng
- Push notification qua Firebase

### Xử lý nền (Background Jobs)
- Gửi email tự động (xác nhận, thông báo)
- Nhắc nhở phỏng vấn
- Cập nhật trạng thái việc làm định kỳ
- Xử lý file và tạo PDF

## 🛠️ Công Nghệ Sử Dụng

| Thành phần | Công nghệ |
|------------|-----------|
| Runtime | Node.js (>=18.0.0) |
| Framework | Express.js v5.1 |
| Database | MongoDB + Mongoose |
| Cache | Redis |
| Xác thực | Passport.js, JWT, bcryptjs |
| Validation | Zod |
| Real-time | Socket.io |
| Push Notification | Firebase Admin SDK |
| File Storage | Cloudinary, AWS S3 |
| Logging | Winston |
| PDF Generation | Puppeteer |
| Queue | RabbitMQ |

## 📁 Cấu Trúc Dự Án

```
be/
├── src/
│   ├── config/           # Cấu hình (DB, Redis, Firebase, Passport)
│   ├── constants/        # Enum và hằng số
│   ├── controllers/      # Xử lý request HTTP
│   ├── cron/             # Tác vụ định kỳ
│   ├── data/             # Dữ liệu tĩnh (mẫu CV, danh sách địa điểm)
│   ├── embeddings/       # Vector embedding helpers
│   ├── middleware/       # Middleware (auth, validation, error)
│   ├── models/           # Mongoose schemas và models
│   ├── queues/           # Cấu hình RabbitMQ
│   ├── routes/           # Định nghĩa API routes
│   ├── schemas/          # Zod validation schemas
│   ├── services/         # Logic nghiệp vụ
│   ├── socket/           # Cấu hình Socket.io
│   ├── utils/            # Hàm tiện ích
│   ├── views/            # Template email (Pug)
│   ├── app.js            # Khởi tạo Express app
│   └── server.js         # Entry point
├── workers/              # Worker xử lý nền
├── scripts/              # Scripts tiện ích
├── __tests__/            # Unit tests
└── docs/                 # Tài liệu API
```

## 🚦 Hướng Dẫn Cài Đặt

### Yêu Cầu Hệ Thống

- **Node.js**: v18 trở lên
- **pnpm**: Package manager (khuyến nghị)
- **MongoDB**: Instance local hoặc MongoDB Atlas
- **Redis**: Instance local hoặc Redis Cloud

### Các Bước Cài Đặt

1. **Di chuyển vào thư mục backend**:
   ```bash
   cd be
   ```

2. **Cài đặt dependencies**:
   ```bash
   pnpm install
   ```

3. **Cấu hình môi trường**:
   ```bash
   copy .env.example .env
   ```
   
   Cập nhật các biến môi trường trong file `.env`

4. **Chạy server**:
   
   - **Chế độ Development**:
     ```bash
     pnpm run dev
     ```
   
   - **Chạy tất cả (Server + Workers)**:
     ```bash
     pnpm run start:all
     ```

   Server sẽ chạy tại `http://localhost:5000`

## 📚 API Documentation

### Các Endpoint Chính

| Prefix | Mô tả |
|--------|-------|
| `/api/auth` | Xác thực (đăng nhập, đăng ký, OAuth) |
| `/api/candidate` | API cho ứng viên |
| `/api/recruiter` | API cho nhà tuyển dụng |
| `/api/admin` | API cho quản trị viên |
| `/api/jobs` | Quản lý việc làm |
| `/api/companies` | Quản lý công ty |
| `/api/applications` | Quản lý đơn ứng tuyển |


## 🤝 Đóng Góp

### Quy Trình Đóng Góp

1. Fork repository
2. Tạo branch mới: `git checkout -b feature/ten-tinh-nang`
3. Commit changes: `git commit -m "feat: mô tả tính năng"`
4. Push branch: `git push origin feature/ten-tinh-nang`
5. Tạo Pull Request

### Commit Convention

- `feat`: Tính năng mới
- `fix`: Sửa lỗi
- `docs`: Cập nhật tài liệu
- `refactor`: Refactor code
- `test`: Thêm/sửa tests

## 📄 License

Dự án này được phát triển cho CareerZone Platform.
