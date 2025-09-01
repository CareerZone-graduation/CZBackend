# 🚀 CareerZone Notification System - Quick Start Guide

## 📋 Tóm Tắt Thay Đổi

Hệ thống thông báo đã được refactor hoàn toàn để cung cấp metadata chi tiết, tối ưu performance và tuân thủ quy chuẩn dự án CareerZone-BE.

### ✨ Tính Năng Mới

1. **Metadata Chi Tiết**: Mỗi loại thông báo có cấu trúc metadata cụ thể
2. **API Tối Ưu**: Validation đầy đủ, pagination, filtering
3. **Performance**: Database indexes, lean queries, bulk operations
4. **Type Safety**: Zod schemas cho validation
5. **Documentation**: Hướng dẫn chi tiết cho frontend integration

## 🔄 Migration

### Chạy Migration Script
```bash
# Migrate metadata cho notifications hiện có
node scripts/migrate-notification-metadata.js

# Rollback nếu cần
node scripts/migrate-notification-metadata.js rollback
```

### Kiểm Tra API
```bash
# Test API với file mới
# Mở httpdocs/notification-refactored.http trong VS Code
# Sử dụng REST Client extension để test
```

## 📚 Tài Liệu Chi Tiết

- **[NOTIFICATION_SYSTEM_METADATA_GUIDE.md](./docs/NOTIFICATION_SYSTEM_METADATA_GUIDE.md)**: Hướng dẫn đầy đủ về metadata structure và best practices
- **[notification-refactored.http](./httpdocs/notification-refactored.http)**: Test cases cho tất cả API endpoints

## 🛠️ Các File Đã Thay Đổi

### Models
- `src/models/Notification.js`: Thêm timestamps, optimize indexes

### Schemas  
- `src/schemas/notification.schema.js`: **[MỚI]** Validation schemas

### Services
- `src/services/notification.service.js`: 
  - Refactor theo quy chuẩn import
  - Thêm metadata enhancement
  - Optimize queries với lean()
  - Thêm unread count API

### Controllers
- `src/controllers/notification.controller.js`: Thêm unread count endpoint

### Routes
- `src/routes/notification.route.js`: Thêm validation middleware

### Scripts
- `scripts/migrate-notification-metadata.js`: **[MỚI]** Migration script

### Documentation
- `docs/NOTIFICATION_SYSTEM_METADATA_GUIDE.md`: **[MỚI]** Hướng dẫn chi tiết
- `httpdocs/notification-refactored.http`: **[MỚI]** API test cases

## 🎯 Metadata Structure Summary

| Type | Key Metadata Fields |
|------|-------------------|
| `application` | `applicationId`, `jobId`, `jobTitle`, `companyName`, `newStatus` |
| `interview` | `interviewId`, `actionType`, `scheduledTime`, `jobTitle` |
| `job_alert` | `keyword`, `jobCount`, `jobIds` |
| `recommendation` | `reason`, `source`, `jobIds` |
| `profile_view` | `recruiterProfileId`, `companyId`, `companyName` |
| `system` | `actionType`, `entityId`, `entityTitle`, `icon` |

## 🔧 Frontend Integration

### Lấy Thông Báo
```javascript
// Basic
GET /api/v1/notifications

// With filters
GET /api/v1/notifications?type=application&isRead=false&page=1&limit=10

// Unread count
GET /api/v1/notifications/unread-count
```

### Sử Dụng Metadata
```javascript
const notification = {
  type: 'application',
  metadata: {
    applicationId: '...',
    jobTitle: 'Senior Developer',
    companyName: 'Tech Corp',
    newStatus: 'REVIEWING'
  }
};

// Điều hướng
router.push(`/applications/${notification.metadata.applicationId}`);

// Hiển thị
const statusColor = getStatusColor(notification.metadata.newStatus);
```

## ⚡ Performance Improvements

1. **Database Indexes**: Compound indexes cho queries phức tạp
2. **Lean Queries**: Sử dụng `.lean()` cho read operations  
3. **Pagination Limit**: Giới hạn max 50 items per request
4. **TTL Index**: Auto-delete notifications sau 30 ngày
5. **Bulk Operations**: Migration sử dụng bulkWrite()

## 🔐 Security Enhancements

1. **Validation**: Zod schemas cho tất cả inputs
2. **Authorization**: Strict user-based filtering
3. **Data Sanitization**: Clean metadata before storage
4. **Rate Limiting**: Built-in pagination limits

---

**🎉 Hệ thống thông báo mới đã sẵn sàng để sử dụng!**

Để biết thêm chi tiết, vui lòng tham khảo [NOTIFICATION_SYSTEM_METADATA_GUIDE.md](./docs/NOTIFICATION_SYSTEM_METADATA_GUIDE.md).