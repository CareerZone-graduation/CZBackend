# 🔧 Fix Job Categories Chart - Lấy dữ liệu thực từ MongoDB

## Vấn đề
Biểu đồ "Những ngành nghề phổ biến nhất" không hiển thị dữ liệu đúng từ MongoDB.

## ✅ Đã sửa

### 1. Backend Query (analytics.service.js)
```javascript
// TRƯỚC (SAI):
{ $match: { status: "ACTIVE", approved: true } }

// SAU (ĐÚNG):
{ $match: { status: "ACTIVE", moderationStatus: "APPROVED" } }
```

**Lý do**: Job model sử dụng `moderationStatus` (enum: PENDING/APPROVED/REJECTED), không phải `approved` (boolean).

### 2. Kiểm tra dữ liệu

Chạy script test để xem database có dữ liệu đúng không:

```bash
node scripts/test-job-categories.js
```

Script này sẽ hiển thị:
- ✅ Tổng số jobs trong database
- ✅ Jobs theo status (ACTIVE/INACTIVE/CLOSED)
- ✅ Jobs theo moderationStatus (APPROVED/PENDING/REJECTED)
- ✅ Top 10 categories
- ✅ Sample jobs để kiểm tra

### 3. Nếu không có dữ liệu

**Nguyên nhân**: Database chưa có jobs với `moderationStatus: "APPROVED"`

**Giải pháp**:

#### Option 1: Update jobs hiện có
```javascript
// Trong MongoDB shell hoặc Compass
db.jobs.updateMany(
  { status: "ACTIVE" },
  { $set: { moderationStatus: "APPROVED" } }
)
```

#### Option 2: Chạy script seed
```bash
node scripts/seed-q4-2025-full.js
```

Script seed sẽ tạo jobs với:
- `status: 'ACTIVE'`
- `moderationStatus: 'APPROVED'`
- Các categories: IT, SOFTWARE_DEVELOPMENT, WEB_DEVELOPMENT, MARKETING, etc.

## 📊 Dữ liệu được lấy

API `/api/analytics/job-categories` sẽ trả về:

```json
[
  { "name": "SOFTWARE_DEVELOPMENT", "value": 120 },
  { "name": "WEB_DEVELOPMENT", "value": 85 },
  { "name": "IT", "value": 75 },
  { "name": "MARKETING", "value": 45 },
  { "name": "DATA_SCIENCE", "value": 32 },
  ...
]
```

Trong đó:
- `name`: Tên category
- `value`: Số lượng jobs ACTIVE + APPROVED trong category đó

## 🧪 Test

### 1. Test Backend API
```bash
# Với token admin
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/analytics/job-categories
```

### 2. Test Frontend
1. Mở Dashboard Admin
2. Xem phần "Những ngành nghề phổ biến nhất"
3. Kiểm tra console log: `📊 Job categories from MongoDB:`

### 3. Debug
Nếu vẫn không có dữ liệu:

```bash
# Kiểm tra jobs trong database
node scripts/test-job-categories.js

# Xem chi tiết
node scripts/check-job-titles.js
```

## ✨ Kết quả

Sau khi fix, biểu đồ sẽ hiển thị:
- ✅ Dữ liệu thực từ MongoDB
- ✅ Top 10 categories có nhiều jobs nhất
- ✅ Chỉ tính jobs ACTIVE và APPROVED
- ✅ Tự động cập nhật khi có jobs mới

## 📝 Files đã sửa

1. ✅ `src/services/analytics.service.js` - Fix query
2. ✅ `scripts/test-job-categories.js` - Script test (mới)
3. ✅ `JOB_CATEGORIES_FIX.md` - Documentation (file này)

## 🔗 Liên quan

- Model: `src/models/Job.js`
- API: `GET /api/analytics/job-categories`
- Component: `src/components/analytics/Charts.jsx` (JobCategoriesChart)
- Service: `src/services/analyticsService.js`
