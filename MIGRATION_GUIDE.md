# 🔄 Database Migration Guide

## Thêm field `hiddenSections` vào CV Schema

### 📋 Tổng quan

Migration này thêm field `hiddenSections` vào tất cả CV hiện có trong database để hỗ trợ tính năng ẩn/hiện sections.

### 🎯 Những gì đã thay đổi

#### 1. **CV Model** (`src/models/CV.js`)
```javascript
// Thêm field mới
hiddenSections: {
  type: [String],
  default: []
}
```

#### 2. **CV Controller** (`src/controllers/cv.controller.js`)
- Khi tạo CV mới, tự động thêm `hiddenSections: []`

#### 3. **Frontend DataMapper** (`src/utils/dataMapper.js`)
- `mapToBackend`: Map `hiddenSections` từ frontend sang backend
- `mapToFrontend`: Map `hiddenSections` từ backend sang frontend

### 🚀 Cách chạy Migration

#### Option 1: Chạy script migration (Khuyên dùng)

```bash
cd CareerZone-BE
node scripts/migrate-add-hidden-sections.js
```

**Output mẫu:**
```
🔄 Starting migration: Add hiddenSections field...
✅ Connected to MongoDB
📊 Found 15 CVs without hiddenSections field
✅ Updated CV: 68da98728ae1c8ab421b668d (Nguyễn Văn An)
✅ Updated CV: 68eb6f6b338b0fde5e4eae12 (Trần Thị Minh)
...

📊 Migration Summary:
   ✅ Successfully updated: 15 CVs
   ❌ Failed: 0 CVs
   📝 Total processed: 15 CVs

🎉 Migration completed successfully!
🔌 MongoDB connection closed
```

#### Option 2: Update thủ công qua MongoDB Shell

```javascript
// Connect to MongoDB
use careerzone_db

// Update all CVs
db.cvs.updateMany(
  { 'cvData.hiddenSections': { $exists: false } },
  { $set: { 'cvData.hiddenSections': [] } }
)

// Verify
db.cvs.find({ 'cvData.hiddenSections': { $exists: true } }).count()
```

#### Option 3: Update qua Mongoose (trong code)

```javascript
import CV from './src/models/CV.js';

// Update all CVs
await CV.updateMany(
  { 'cvData.hiddenSections': { $exists: false } },
  { $set: { 'cvData.hiddenSections': [] } }
);
```

### ✅ Kiểm tra sau khi Migration

#### 1. Kiểm tra trong MongoDB

```javascript
// Đếm CVs có hiddenSections
db.cvs.find({ 'cvData.hiddenSections': { $exists: true } }).count()

// Xem một CV mẫu
db.cvs.findOne({}, { 'cvData.hiddenSections': 1, title: 1 })
```

**Kết quả mong đợi:**
```json
{
  "_id": "68da98728ae1c8ab421b668d",
  "title": "Nguyễn Văn An",
  "cvData": {
    "hiddenSections": []
  }
}
```

#### 2. Kiểm tra qua API

```bash
# Get CV by ID
curl -X GET http://localhost:5555/api/cvs/YOUR_CV_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response mong đợi:**
```json
{
  "success": true,
  "data": {
    "_id": "68da98728ae1c8ab421b668d",
    "cvData": {
      "sectionOrder": ["summary", "experience", "education", "skills", "projects", "certificates"],
      "hiddenSections": [],
      ...
    }
  }
}
```

#### 3. Kiểm tra trong Frontend

1. Mở CV Builder
2. Vào tab "Bố cục & Thứ tự"
3. Ẩn một section (ví dụ: Projects)
4. Click "Lưu CV"
5. Reload trang
6. ✅ Section vẫn bị ẩn (không hiển thị trong preview)

### 🐛 Troubleshooting

#### Issue 1: Migration script không chạy

**Lỗi**: `Cannot find module '../src/models/CV.js'`

**Giải pháp**:
```bash
# Đảm bảo đang ở thư mục CareerZone-BE
cd CareerZone-BE

# Chạy với đúng path
node scripts/migrate-add-hidden-sections.js
```

#### Issue 2: Connection refused

**Lỗi**: `MongooseError: connect ECONNREFUSED`

**Giải pháp**:
- Kiểm tra MongoDB đang chạy: `mongosh` hoặc `mongo`
- Kiểm tra `MONGODB_URI` trong `.env`
- Đảm bảo MongoDB service đang chạy

#### Issue 3: CVs cũ vẫn không có hiddenSections

**Giải pháp**:
```bash
# Chạy lại migration
node scripts/migrate-add-hidden-sections.js

# Hoặc update thủ công
mongosh
use careerzone_db
db.cvs.updateMany({}, { $set: { 'cvData.hiddenSections': [] } })
```

#### Issue 4: Frontend không nhận hiddenSections

**Kiểm tra**:
1. Xem API response có `hiddenSections` không
2. Kiểm tra `dataMapper.js` đã map đúng chưa
3. Xem console log trong CVBuilder

**Debug**:
```javascript
// Trong CVBuilder.jsx
useEffect(() => {
  console.log('CVData:', {
    sectionOrder: cvData?.sectionOrder,
    hiddenSections: cvData?.hiddenSections
  });
}, [cvData]);
```

### 📊 Rollback (nếu cần)

Nếu muốn rollback migration:

```javascript
// MongoDB Shell
db.cvs.updateMany(
  {},
  { $unset: { 'cvData.hiddenSections': '' } }
)
```

Hoặc tạo script rollback:

```javascript
// scripts/rollback-hidden-sections.js
import mongoose from 'mongoose';
import CV from '../src/models/CV.js';
import config from '../src/config/index.js';

const rollback = async () => {
  await mongoose.connect(config.MONGODB_URI);
  
  await CV.updateMany(
    {},
    { $unset: { 'cvData.hiddenSections': '' } }
  );
  
  console.log('✅ Rollback completed');
  process.exit(0);
};

rollback();
```

### 📝 Notes

1. **Backward Compatibility**: Code đã được viết để tương thích ngược. Nếu CV không có `hiddenSections`, nó sẽ default là `[]`.

2. **No Downtime**: Migration có thể chạy trong khi app đang chạy. CVs mới sẽ tự động có field này.

3. **Safe to Re-run**: Script migration có thể chạy nhiều lần mà không gây lỗi.

4. **Performance**: Migration rất nhanh, mỗi CV chỉ mất vài milliseconds.

### 🎓 Best Practices

1. **Backup trước khi migrate**:
```bash
mongodump --db careerzone_db --out backup_before_migration
```

2. **Test trên staging trước**:
```bash
# Set staging DB
export MONGODB_URI="mongodb://localhost:27017/careerzone_staging"
node scripts/migrate-add-hidden-sections.js
```

3. **Monitor sau khi migrate**:
- Check logs
- Test một vài CVs
- Verify API responses

### 📞 Support

Nếu gặp vấn đề:
1. Check logs của migration script
2. Verify MongoDB connection
3. Test API endpoints
4. Check frontend console

---

**Migration Version**: 1.0.0  
**Date**: 2025-01-13  
**Status**: ✅ Ready to run
