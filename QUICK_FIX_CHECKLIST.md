# ✅ Quick Fix Checklist - Hidden Sections

## Vấn đề
Sections bị ẩn nhưng khi reload lại thì không còn ẩn nữa.

## Nguyên nhân
Database thiếu field `hiddenSections`.

## ✅ Đã sửa

### 1. Backend Changes

- [x] **CV Model** - Thêm field `hiddenSections`
  ```javascript
  hiddenSections: {
    type: [String],
    default: []
  }
  ```

- [x] **CV Controller** - Thêm `hiddenSections: []` khi tạo CV mới

### 2. Frontend Changes

- [x] **dataMapper.js** - Map `hiddenSections` trong cả 2 hướng
  - `mapToBackend`: Gửi `hiddenSections` lên server
  - `mapToFrontend`: Nhận `hiddenSections` từ server

### 3. Migration Script

- [x] Tạo script `scripts/migrate-add-hidden-sections.js`
- [x] Tạo hướng dẫn `MIGRATION_GUIDE.md`

## 🚀 Cần làm gì bây giờ?

### Bước 1: Chạy Migration (BẮT BUỘC)

```bash
cd CareerZone-BE
node scripts/migrate-add-hidden-sections.js
```

### Bước 2: Restart Backend

```bash
# Stop backend nếu đang chạy (Ctrl+C)
# Start lại
npm run dev
```

### Bước 3: Test

1. Mở Frontend: `http://localhost:5173/editor`
2. Vào tab "Bố cục & Thứ tự"
3. Ẩn section "Projects" (click icon mắt)
4. Click "Lưu CV"
5. Reload trang (F5)
6. ✅ Section "Projects" vẫn bị ẩn

### Bước 4: Verify trong Database

```bash
mongosh
use careerzone_db
db.cvs.findOne({}, { 'cvData.hiddenSections': 1, title: 1 })
```

**Kết quả mong đợi:**
```json
{
  "_id": "...",
  "title": "CV Name",
  "cvData": {
    "hiddenSections": ["projects"]  // ✅ Có field này
  }
}
```

## 🧪 Test Cases

### Test 1: Ẩn section và reload
- [ ] Ẩn "Projects"
- [ ] Lưu CV
- [ ] Reload trang
- [ ] ✅ "Projects" vẫn ẩn

### Test 2: Ẩn nhiều sections
- [ ] Ẩn "Projects" và "Certificates"
- [ ] Lưu CV
- [ ] Reload trang
- [ ] ✅ Cả 2 sections vẫn ẩn

### Test 3: Hiện lại section
- [ ] Ẩn "Projects"
- [ ] Lưu CV
- [ ] Hiện lại "Projects"
- [ ] Lưu CV
- [ ] Reload trang
- [ ] ✅ "Projects" hiển thị lại

### Test 4: Template 2 cột
- [ ] Chọn template "Two Column Sidebar"
- [ ] Ẩn "Skills" (trong sidebar)
- [ ] Lưu CV
- [ ] Reload trang
- [ ] ✅ "Skills" vẫn ẩn

### Test 5: Export PDF
- [ ] Ẩn "Projects"
- [ ] Lưu CV
- [ ] Export PDF
- [ ] ✅ PDF không có section "Projects"

## 🐛 Nếu vẫn không hoạt động

### Debug 1: Check API Response

```bash
# Get CV
curl http://localhost:5555/api/cvs/YOUR_CV_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Tìm trong response:
```json
{
  "cvData": {
    "hiddenSections": ["projects"]  // ✅ Phải có field này
  }
}
```

### Debug 2: Check Frontend Console

Mở DevTools Console, tìm logs:
```
CVData: {
  sectionOrder: [...],
  hiddenSections: ["projects"]  // ✅ Phải có
}
```

### Debug 3: Check Database

```bash
mongosh
use careerzone_db

# Check một CV cụ thể
db.cvs.findOne({ _id: ObjectId("YOUR_CV_ID") })

# Tìm field hiddenSections
```

### Debug 4: Force Update

Nếu vẫn không có, force update:

```javascript
// Trong MongoDB Shell
db.cvs.updateOne(
  { _id: ObjectId("YOUR_CV_ID") },
  { $set: { 'cvData.hiddenSections': ["projects"] } }
)
```

## 📊 Files đã thay đổi

### Backend
- ✅ `src/models/CV.js` - Thêm field
- ✅ `src/controllers/cv.controller.js` - Init field khi tạo CV
- ✅ `scripts/migrate-add-hidden-sections.js` - Migration script

### Frontend
- ✅ `src/utils/dataMapper.js` - Map hiddenSections
- ✅ `src/components/CVPreview/CVPreview.jsx` - Filter hidden sections
- ✅ `src/components/buildCV/SimpleSectionOrderManager.jsx` - UI component

## 🎯 Expected Behavior

### Trước khi sửa
```
1. Ẩn section "Projects"
2. Lưu CV
3. Reload trang
4. ❌ "Projects" hiển thị lại (BUG)
```

### Sau khi sửa
```
1. Ẩn section "Projects"
2. Lưu CV
3. Reload trang
4. ✅ "Projects" vẫn ẩn (FIXED)
```

## 📝 Data Flow

```
User clicks "Hide Projects"
  ↓
SimpleSectionOrderManager
  ↓ onHiddenChange(['projects'])
CVBuilder: setCVData({...cvData, hiddenSections: ['projects']})
  ↓
User clicks "Lưu CV"
  ↓
mapToBackend(cvData)
  ↓ cvData.hiddenSections = ['projects']
API: PUT /api/cvs/:id
  ↓ body: { cvData: { hiddenSections: ['projects'] } }
MongoDB: Update CV document
  ↓
Reload page
  ↓
API: GET /api/cvs/:id
  ↓ response: { cvData: { hiddenSections: ['projects'] } }
mapToFrontend(response)
  ↓ cvData.hiddenSections = ['projects']
CVPreview filters sections
  ↓
✅ "Projects" không hiển thị
```

## ✨ Bonus: Verify Script

Tạo script để verify tất cả CVs:

```javascript
// scripts/verify-hidden-sections.js
import mongoose from 'mongoose';
import CV from '../src/models/CV.js';
import config from '../src/config/index.js';

const verify = async () => {
  await mongoose.connect(config.MONGODB_URI);
  
  const totalCVs = await CV.countDocuments();
  const cvsWithHiddenSections = await CV.countDocuments({
    'cvData.hiddenSections': { $exists: true }
  });
  
  console.log(`Total CVs: ${totalCVs}`);
  console.log(`CVs with hiddenSections: ${cvsWithHiddenSections}`);
  console.log(`Missing: ${totalCVs - cvsWithHiddenSections}`);
  
  if (totalCVs === cvsWithHiddenSections) {
    console.log('✅ All CVs have hiddenSections field!');
  } else {
    console.log('⚠️  Some CVs are missing hiddenSections field. Run migration!');
  }
  
  process.exit(0);
};

verify();
```

Run:
```bash
node scripts/verify-hidden-sections.js
```

---

**Status**: ✅ Ready to deploy  
**Priority**: HIGH  
**Impact**: Fixes data persistence issue
