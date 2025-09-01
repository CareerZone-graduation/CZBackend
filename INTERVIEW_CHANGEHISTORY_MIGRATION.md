# 📝 InterviewRoom ChangeHistory - Migration Guide

## 🎯 Thay đổi chính

Trường `notes` trong model `InterviewRoom` đã được thay đổi thành `changeHistory` - một mảng lưu trữ lịch sử thay đổi của cuộc phỏng vấn.

## 🔄 Cấu trúc mới: changeHistory

```javascript
changeHistory: [{
  timestamp: Date,        // Thời gian thực hiện thay đổi
  action: String,         // Loại hành động: 'CREATED', 'RESCHEDULED', 'CANCELLED', 'STARTED', 'COMPLETED', 'NOTE_ADDED'
  fromTime: Date,         // Thời gian cũ (chỉ cho RESCHEDULED)
  toTime: Date,           // Thời gian mới (chỉ cho RESCHEDULED)
  reason: String,         // Lý do thay đổi (tùy chọn)
  notes: String,          // Ghi chú (tùy chọn)
  actor: ObjectId         // ID của người thực hiện hành động
}]
```

## 🛠️ Các thay đổi trong API

### ✅ Endpoints mới:
- `PATCH /api/interviews/:id/add-note` - Thêm ghi chú vào cuộc phỏng vấn

### 🔄 Endpoints đã cập nhật:
- `GET /api/interviews/my-interviews` - Response bao gồm `changeHistory`
- `GET /api/interviews/my-scheduled-interviews` - Response bao gồm `changeHistory`
- `GET /api/interviews/:id/details` - Response bao gồm `changeHistory`
- `PATCH /api/interviews/:id/reschedule` - Tự động ghi vào `changeHistory`
- `PATCH /api/interviews/:id/cancel` - Tự động ghi vào `changeHistory`
- `PATCH /api/interviews/:id/start` - Tự động ghi vào `changeHistory`
- `PATCH /api/interviews/:id/complete` - Tự động ghi vào `changeHistory`

## 📋 Các loại action trong changeHistory

| Action | Mô tả | Trường bổ sung |
|--------|-------|----------------|
| `CREATED` | Cuộc phỏng vấn được tạo | - |
| `RESCHEDULED` | Dời lịch phỏng vấn | `fromTime`, `toTime`, `reason` |
| `CANCELLED` | Hủy cuộc phỏng vấn | `reason` |
| `STARTED` | Bắt đầu phỏng vấn | - |
| `COMPLETED` | Kết thúc phỏng vấn | `notes` |
| `NOTE_ADDED` | Thêm ghi chú | `notes` |

## 🗃️ Migration

**Chạy migration script:**
```bash
node migration-interview-notes-to-changehistory.js
```

Script này sẽ:
1. Chuyển đổi tất cả `notes` hiện có thành `changeHistory`
2. Thêm entry `CREATED` cho các interview chưa có lịch sử
3. Xóa trường `notes` cũ

## 📊 Response mẫu

```json
{
  "success": true,
  "message": "Lấy thông tin cuộc phỏng vấn thành công.",
  "data": {
    "id": "interview_id",
    "roomName": "Phỏng vấn Frontend Developer",
    "scheduledTime": "2025-09-15T14:30:00.000Z",
    "status": "RESCHEDULED",
    "changeHistory": [
      {
        "timestamp": "2025-08-29T08:00:00.000Z",
        "action": "CREATED",
        "actor": "recruiter_id"
      },
      {
        "timestamp": "2025-08-29T10:15:00.000Z",
        "action": "RESCHEDULED",
        "fromTime": "2025-09-15T10:00:00.000Z",
        "toTime": "2025-09-15T14:30:00.000Z",
        "reason": "Ứng viên yêu cầu dời lịch do có việc đột xuất",
        "actor": "recruiter_id"
      },
      {
        "timestamp": "2025-08-29T11:00:00.000Z",
        "action": "NOTE_ADDED",
        "notes": "Ứng viên có kinh nghiệm tốt về React và Node.js.",
        "actor": "recruiter_id"
      }
    ],
    "candidate": {...},
    "application": {...}
  }
}
```

## 🔍 Frontend Integration

### Hiển thị lịch sử thay đổi:
```javascript
const renderChangeHistory = (changeHistory) => {
  return changeHistory.map(entry => {
    switch(entry.action) {
      case 'CREATED':
        return `Cuộc phỏng vấn được tạo vào ${formatDate(entry.timestamp)}`;
      case 'RESCHEDULED':
        return `Dời lịch từ ${formatDate(entry.fromTime)} sang ${formatDate(entry.toTime)}. Lý do: ${entry.reason}`;
      case 'NOTE_ADDED':
        return `Ghi chú: ${entry.notes} (${formatDate(entry.timestamp)})`;
      // ... other cases
    }
  });
};
```

## ⚠️ Breaking Changes

1. **Trường `notes`** không còn tồn tại ở level root của InterviewRoom
2. **API Response** giờ trả về `changeHistory` thay vì `notes`
3. **Frontend** cần cập nhật để hiển thị `changeHistory`

## 🧪 Testing

Sử dụng file test: `httpdocs/interview-changehistory.http`

## 🎯 Benefits

1. **Truy vết đầy đủ**: Theo dõi toàn bộ lịch sử thay đổi
2. **Audit Trail**: Biết ai làm gì, khi nào
3. **Transparency**: Ứng viên có thể thấy lịch sử dời lịch
4. **Analytics**: Phân tích pattern dời lịch, hủy lịch
5. **Compliance**: Đáp ứng yêu cầu audit và compliance