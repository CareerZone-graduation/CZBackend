# 🔄 Cập nhật: Seed Script sử dụng Job Titles thực từ Database

## ✨ Thay đổi chính

### Trước đây
```javascript
const jobTitlesByCategory = {
  'IT': ['Senior Backend Developer', 'Frontend Developer', ...],
  // Hardcoded data
};
```

### Bây giờ
```javascript
const getJobTitlesFromDB = async () => {
  // Lấy job titles thực từ MongoDB
  const jobs = await Job.aggregate([
    { $group: { _id: '$category', titles: { $addToSet: '$title' } } }
  ]);
  // Auto fallback nếu database trống
};
```

## 🚀 Cách sử dụng

### 1. Kiểm tra job titles hiện có
```bash
node scripts/check-job-titles.js
```

### 2. Chạy seed script
```bash
node scripts/seed-q4-2025-full.js
```

## 💡 Lợi ích

✅ **Dữ liệu thực tế**: Lấy từ database production/staging  
✅ **Tự động cập nhật**: Không cần update code khi có job title mới  
✅ **Fallback thông minh**: Tự động dùng dữ liệu mẫu nếu DB trống  
✅ **Đa dạng hơn**: Nhiều job titles khác nhau cho mỗi category  

## 📋 Files đã tạo/sửa

1. ✅ `seed-q4-2025-full.js` - Script seed chính (đã sửa)
2. ✅ `check-job-titles.js` - Script kiểm tra job titles (mới)
3. ✅ `SEED_WITH_REAL_JOB_TITLES.md` - Hướng dẫn chi tiết (mới)

## 🎯 Kết quả

Khi chạy script, bạn sẽ thấy:

```
📋 Đang lấy job titles từ database...
✅ Lấy job titles từ database: 10 categories
📋 Sample job titles:
   - IT: Senior Backend Developer, Frontend Developer...
   - MARKETING: Marketing Manager, SEO Expert...
```

## 🔧 Troubleshooting

**Database trống?** → Script tự động dùng dữ liệu mẫu  
**Lỗi kết nối?** → Script tự động fallback  
**Job titles không đủ đa dạng?** → Tạo thêm jobs trong database  

---

**Tài liệu đầy đủ**: Xem `SEED_WITH_REAL_JOB_TITLES.md`
