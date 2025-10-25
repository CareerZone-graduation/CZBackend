# Backend - Lịch sử Xem Tin Tuyển Dụng - Quick Start

## 🚀 Triển khai nhanh

### 1. Files đã tạo

```
CareerZone-BE/
├── src/
│   ├── models/
│   │   └── JobViewHistory.js          ✅ Model
│   ├── services/
│   │   └── viewHistory.service.js     ✅ Business logic
│   ├── controllers/
│   │   └── viewHistory.controller.js  ✅ Request handlers
│   └── routes/
│       └── viewHistory.route.js       ✅ API routes
```

### 2. Đã tích hợp vào hệ thống

- ✅ Export model trong `models/index.js`
- ✅ Import và đăng ký routes trong `app.js`
- ✅ Endpoint: `/api/job-view-history`

## 📡 API Endpoints

### Base URL: `/api/job-view-history`

#### 1. **Lưu lịch sử xem**
```http
POST /api/job-view-history
Authorization: Bearer {token}
Content-Type: application/json

{
  "jobId": "507f1f77bcf86cd799439011"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Đã lưu lịch sử xem",
  "data": {
    "_id": "...",
    "userId": "...",
    "jobId": "...",
    "viewedAt": "2025-10-25T10:30:00Z"
  }
}
```

#### 2. **Lấy lịch sử xem**
```http
GET /api/job-view-history?page=1&limit=10
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "message": "Lấy lịch sử xem thành công",
  "data": [
    {
      "_id": "entry_id",
      "job": {
        "_id": "job_id",
        "title": "Frontend Developer",
        "company": {
          "_id": "company_id",
          "name": "Tech Company",
          "logo": "https://..."
        },
        "location": "Hà Nội",
        "salary": { "min": 15000000, "max": 25000000, "currency": "VND" },
        "workType": "FULL_TIME",
        "status": "active"
      },
      "viewedAt": "2025-10-25T10:30:00Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 50,
    "limit": 10
  }
}
```

#### 3. **Lấy thống kê**
```http
GET /api/job-view-history/stats
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "message": "Lấy thống kê thành công",
  "data": {
    "totalViews": 50,
    "viewsThisWeek": 12,
    "viewsThisMonth": 38,
    "uniqueJobs": 35
  }
}
```

#### 4. **Xóa một mục**
```http
DELETE /api/job-view-history/:entryId
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "message": "Đã xóa lịch sử xem"
}
```

#### 5. **Xóa tất cả**
```http
DELETE /api/job-view-history
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "message": "Đã xóa toàn bộ lịch sử xem",
  "data": {
    "deletedCount": 50
  }
}
```

## 🔒 Authentication

Tất cả endpoints yêu cầu:
- JWT token trong header
- Role: `candidate` (chỉ ứng viên mới có lịch sử xem)

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 🗄️ Database Schema

### Collection: `jobviewhistories`

```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: User, indexed),
  jobId: ObjectId (ref: Job, indexed),
  viewedAt: Date (indexed),
  createdAt: Date,
  updatedAt: Date
}
```

### Indexes

1. `{ userId: 1, viewedAt: -1 }` - Query user history sorted by time
2. `{ userId: 1, jobId: 1 }` - Check if user viewed job (unique)
3. `{ jobId: 1 }` - Stats per job
4. `{ viewedAt: 1 }` - Cleanup old data

## 🔧 Features

### Auto-deduplication
- Nếu user xem lại cùng 1 job → cập nhật `viewedAt`
- Không tạo entry duplicate

### Auto-cleanup
- Giữ tối đa 100 lịch sử gần nhất mỗi user
- Tự động xóa entries cũ nhất khi vượt giới hạn

### Validation
- Kiểm tra jobId hợp lệ
- Kiểm tra job còn tồn tại
- Kiểm tra quyền sở hữu khi xóa

### Population
- Auto-populate job details
- Bao gồm company info (name, logo)
- Filter out deleted jobs

## 🧪 Testing

### 1. Test với cURL

```bash
# Lưu lịch sử
curl -X POST http://localhost:5000/api/job-view-history \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jobId":"507f1f77bcf86cd799439011"}'

# Lấy lịch sử
curl -X GET "http://localhost:5000/api/job-view-history?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Thống kê
curl -X GET http://localhost:5000/api/job-view-history/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 2. Test với file .http

Tạo file `test-view-history.http`:

```http
### Variables
@baseUrl = http://localhost:5000
@token = your_jwt_token_here
@jobId = 507f1f77bcf86cd799439011
@entryId = 507f1f77bcf86cd799439012

### Save view history
POST {{baseUrl}}/api/job-view-history
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "jobId": "{{jobId}}"
}

### Get view history
GET {{baseUrl}}/api/job-view-history?page=1&limit=10
Authorization: Bearer {{token}}

### Get statistics
GET {{baseUrl}}/api/job-view-history/stats
Authorization: Bearer {{token}}

### Delete one entry
DELETE {{baseUrl}}/api/job-view-history/{{entryId}}
Authorization: Bearer {{token}}

### Clear all history
DELETE {{baseUrl}}/api/job-view-history
Authorization: Bearer {{token}}
```

## ⚡ Performance Tips

### 1. Indexes
Đã tạo sẵn các indexes cần thiết:
- Compound unique index cho deduplication
- Index cho sorting và filtering

### 2. Pagination
- Limit tối đa: 50 items/page
- Default: 10 items/page

### 3. Population
Chỉ populate các fields cần thiết:
```javascript
.populate({
  path: 'jobId',
  select: 'title location salary workType company skills status',
  populate: {
    path: 'company',
    select: 'name logo'
  }
})
```

## 🐛 Error Handling

### Common Errors

1. **400 Bad Request**
```json
{
  "success": false,
  "message": "Job ID không hợp lệ"
}
```

2. **404 Not Found**
```json
{
  "success": false,
  "message": "Không tìm thấy tin tuyển dụng"
}
```

3. **403 Forbidden**
```json
{
  "success": false,
  "message": "Bạn không có quyền xóa lịch sử này"
}
```

4. **401 Unauthorized**
```json
{
  "success": false,
  "message": "Unauthorized"
}
```

## 🔄 Integration với Frontend

Frontend đã được setup sẵn:
- Service: `viewHistoryService.js`
- Page: `ViewHistory.jsx`
- Widget: `ViewHistoryWidget.jsx`
- Auto-save trong `JobDetail.jsx`

## 📊 Monitoring & Analytics

### Useful Queries

```javascript
// Top viewed jobs
db.jobviewhistories.aggregate([
  { $group: { _id: "$jobId", count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 10 }
])

// User activity
db.jobviewhistories.aggregate([
  { $group: { _id: "$userId", views: { $sum: 1 } } },
  { $sort: { views: -1 } }
])

// Views per day
db.jobviewhistories.aggregate([
  {
    $group: {
      _id: { $dateToString: { format: "%Y-%m-%d", date: "$viewedAt" } },
      count: { $sum: 1 }
    }
  },
  { $sort: { _id: -1 } }
])
```

## 🔐 Security

### Implemented
- ✅ JWT Authentication
- ✅ Role-based access (candidate only)
- ✅ User ownership validation
- ✅ Input validation
- ✅ Rate limiting (inherited from app)

### Best Practices
- Chỉ user xem được lịch sử của chính mình
- Validate tất cả ObjectIds
- Sanitize pagination params
- Handle deleted jobs gracefully

## 🚀 Deployment Checklist

- [ ] Chạy migrations (không cần - Mongoose auto-create)
- [ ] Kiểm tra indexes đã được tạo
- [ ] Test tất cả endpoints
- [ ] Setup monitoring
- [ ] Configure rate limiting nếu cần
- [ ] Setup cron job cleanup (optional)

## 🔧 Maintenance

### Cleanup Old Data (Optional)

Tạo cron job để xóa data cũ:

```javascript
// In cron/cleanupViewHistory.js
import { cleanupOldViewHistory } from '../services/viewHistory.service.js';

export const cleanupViewHistoryCron = async () => {
  try {
    const deletedCount = await cleanupOldViewHistory(180); // 6 months
    console.log(`Cleaned up ${deletedCount} old view history entries`);
  } catch (error) {
    console.error('Error in view history cleanup:', error);
  }
};

// Schedule: 0 0 * * 0 (Every Sunday at midnight)
```

## 📝 Logs

Service tự động log:
- Khi save view history
- Khi delete entries
- Khi cleanup data
- Errors

Check logs:
```bash
tail -f logs/app.log | grep "view history"
```

## 🎯 Next Steps

1. ✅ Backend đã hoàn thành
2. ✅ Frontend đã hoàn thành
3. 🔲 Test integration E2E
4. 🔲 Deploy to production
5. 🔲 Monitor usage
6. 🔲 Optional: Add analytics dashboard

## 💡 Tips

- Auto-save silent để không làm phiền user
- Cleanup old data để tránh database quá lớn
- Use indexes hiệu quả
- Consider adding view count to Job model
- Analytics về popular jobs

## 🆘 Troubleshooting

**Q: Duplicate key error?**
A: Đã handle bằng `upsert` trong `recordView` method

**Q: Slow queries?**
A: Check indexes: `db.jobviewhistories.getIndexes()`

**Q: Memory issues?**
A: Implement cleanup cron job để xóa old data

**Q: Frontend không nhận được data?**
A: Check CORS settings và JWT token
