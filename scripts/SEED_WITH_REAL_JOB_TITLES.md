# Hướng dẫn sử dụng Script Seed với Job Titles thực từ Database

## Mục đích

Script `seed-q4-2025-full.js` đã được cập nhật để **lấy job titles thực tế từ MongoDB** thay vì dùng dữ liệu hardcode. Điều này giúp:

- ✅ Dữ liệu seed gần với thực tế hơn
- ✅ Tận dụng dữ liệu có sẵn trong database
- ✅ Dễ dàng mở rộng khi có job titles mới
- ✅ Tự động fallback sang dữ liệu mẫu nếu database trống

## Cách hoạt động

### 1. Kiểm tra Job Titles hiện có

Trước khi chạy script seed, hãy kiểm tra xem database có job titles nào:

```bash
node scripts/check-job-titles.js
```

Script này sẽ hiển thị:
- Tổng số job postings trong database
- Job titles theo từng category
- Top 10 job titles phổ biến nhất
- Các job titles có thể cần chuẩn hóa

### 2. Chạy Script Seed

```bash
node scripts/seed-q4-2025-full.js
```

Script sẽ:
1. **Kết nối database** và lấy job titles thực tế
2. **Nhóm job titles theo category**
3. **Sử dụng job titles thực** khi tạo job postings mới
4. **Fallback** sang dữ liệu mẫu nếu database trống

### 3. Xem Kết quả

Khi script chạy, bạn sẽ thấy log như sau:

```
✅ Connected to MongoDB

📋 Đang lấy job titles từ database...
✅ Lấy job titles từ database: 10 categories
📋 Số lượng categories có job titles: 10
📋 Sample job titles:
   - IT: Senior Backend Developer, Frontend Developer, Full Stack Developer...
   - MARKETING: Marketing Manager, Digital Marketing Specialist, SEO Expert...
   - SOFTWARE_DEVELOPMENT: Software Engineer, Mobile Developer, QA Engineer...

📅 Đang seed dữ liệu cho Tháng 10/2025...
🔍 Creating 80 job postings...
```

## Cơ chế Fallback

### Khi nào sử dụng fallback?

Script sẽ dùng dữ liệu mẫu (fallback) khi:
- Database chưa có job postings nào
- Không kết nối được database
- Có lỗi khi query job titles
- Category cụ thể không có job titles

### Dữ liệu Fallback

Nếu database trống, script sẽ dùng các job titles sau:

```javascript
{
  'IT': ['Senior Backend Developer', 'Frontend Developer', 'Full Stack Developer', 'DevOps Engineer'],
  'SOFTWARE_DEVELOPMENT': ['Software Engineer', 'Mobile Developer', 'QA Engineer', 'System Architect'],
  'DATA_SCIENCE': ['Data Analyst', 'Data Engineer', 'ML Engineer', 'BI Developer'],
  'WEB_DEVELOPMENT': ['Web Developer', 'React Developer', 'Vue.js Developer', 'Node.js Developer'],
  'MARKETING': ['Marketing Manager', 'Digital Marketing Specialist', 'SEO Expert', 'Content Marketing Lead'],
  // ... và các categories khác
}
```

## Lợi ích

### 1. Dữ liệu thực tế hơn
- Job titles được lấy từ database production/staging
- Phản ánh đúng những gì recruiters đang đăng
- Không bị giới hạn bởi danh sách hardcode

### 2. Tự động cập nhật
- Khi có job titles mới trong database, script tự động sử dụng
- Không cần update code mỗi khi có job title mới
- Dễ dàng maintain và scale

### 3. Đa dạng hóa
- Mỗi category có thể có nhiều job titles khác nhau
- Tránh việc lặp lại job titles giống nhau
- Tạo dữ liệu test phong phú hơn

## Ví dụ Output

```
📋 Đang lấy job titles từ database...
✅ Lấy job titles từ database: 10 categories
📋 Số lượng categories có job titles: 10
📋 Sample job titles:
   - IT: Senior Backend Developer, Frontend Developer, Full Stack Developer...
   - MARKETING: Marketing Manager, Digital Marketing Specialist, SEO Expert...
   - SOFTWARE_DEVELOPMENT: Software Engineer, Mobile Developer, QA Engineer...

📅 Đang seed dữ liệu cho Tháng 10/2025...
✅ Tạo 150 users (105 candidates, 45 recruiters)
✅ Tạo 45 recruiter profiles
✅ Tạo 105 candidate profiles
🔍 Creating 80 job postings...
✅ Tạo 80 jobs
🔍 Creating 200 applications...
✅ Tạo 200 applications
🔍 Creating 45 coin recharges...
✅ Tạo 45 coin recharges

📅 Đang seed dữ liệu cho Tháng 11/2025...
...

🎉 HOÀN THÀNH SEED DỮ LIỆU Q4/2025!
📊 Tổng kết:
   - Users: 550
   - Jobs: 285
   - Applications: 750
   - Coin Recharges: 157
```

## Troubleshooting

### Vấn đề: "Database chưa có job titles, sử dụng dữ liệu mẫu"

**Nguyên nhân**: Database chưa có job postings nào

**Giải pháp**:
1. Tạo một vài job postings thủ công từ UI
2. Hoặc chấp nhận dùng dữ liệu mẫu cho lần đầu
3. Lần chạy tiếp theo sẽ dùng job titles thực

### Vấn đề: "Lỗi khi lấy job titles từ database"

**Nguyên nhân**: Lỗi kết nối hoặc query database

**Giải pháp**:
1. Kiểm tra kết nối MongoDB
2. Kiểm tra permissions của database user
3. Script sẽ tự động fallback sang dữ liệu mẫu

### Vấn đề: Job titles không đa dạng

**Nguyên nhân**: Database chỉ có ít job postings

**Giải pháp**:
1. Tạo thêm job postings với titles khác nhau
2. Import dữ liệu từ nguồn khác
3. Thêm thủ công các job titles mẫu vào database

## Best Practices

1. **Kiểm tra trước khi seed**
   ```bash
   node scripts/check-job-titles.js
   ```

2. **Backup database trước khi seed large data**
   ```bash
   mongodump --uri="your-mongodb-uri" --out=backup-$(date +%Y%m%d)
   ```

3. **Test với số lượng nhỏ trước**
   - Sửa số lượng users, jobs, apps trong script
   - Test xem job titles có đúng không
   - Sau đó mới chạy full scale

4. **Monitor logs**
   - Xem console log để biết job titles được lấy
   - Kiểm tra có warning/error không
   - Verify dữ liệu sau khi seed

## Tham khảo

- `seed-q4-2025-full.js` - Script seed chính
- `check-job-titles.js` - Script kiểm tra job titles
- `../src/models/Job.js` - Model definition của Job
