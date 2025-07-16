## ✅ Lỗi Duplicate Key đã được GIẢI QUYẾT!

### 🔧 Các thay đổi đã thực hiện:

1. **Sửa Model Conversation**:
   - Thêm trường `participant1` và `participant2` riêng biệt
   - Tạo unique index trên `{ participant1: 1, participant2: 1 }`
   - Thêm pre-save hook để đảm bảo `participant1 < participant2`

2. **Cập nhật Service**:
   - Sửa hàm `getOrCreatePrivateConversation` để sử dụng trường mới
   - Đảm bảo logic sắp xếp participants nhất quán

### 🎯 Kết quả:
- ✅ Server khởi động thành công
- ✅ Conversation được tạo thành công: `6877149a95f698310dd3674b`
- ✅ Không còn lỗi E11000 duplicate key

### 🧪 Test tiếp theo:
Bạn có thể test các API chat bằng file `test-chat-quick.http` hoặc WebSocket client.

### 📚 Cấu trúc Model mới:
```javascript
{
  participants: [ObjectId, ObjectId],  // Mảng tương thích
  participant1: ObjectId,              // Trường riêng cho unique index
  participant2: ObjectId,              // Trường riêng cho unique index
  lastMessage: ObjectId,
  lastMessageAt: Date,
  // ... timestamps
}
```

Unique Index: `{ participant1: 1, participant2: 1 }` đảm bảo chỉ có 1 conversation giữa 2 user.
