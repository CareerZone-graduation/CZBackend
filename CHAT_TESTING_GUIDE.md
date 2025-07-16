# Hướng dẫn kiểm thử tính năng Chat 1-1

## 1. Khởi động server

```bash
npm run dev
```

## 2. Đăng ký 2 tài khoản test

### Tài khoản 1 (Candidate):
```http
POST http://localhost:5000/api/auth/register
Content-Type: application/json

{
  "username": "candidate_test",
  "email": "candidate@test.com",
  "password": "123456",
  "fullname": "Test Candidate",
  "role": "candidate"
}
```

### Tài khoản 2 (Recruiter):
```http
POST http://localhost:5000/api/auth/register
Content-Type: application/json

{
  "username": "recruiter_test",
  "email": "recruiter@test.com",
  "password": "123456",
  "fullname": "Test Recruiter",
  "role": "recruiter"
}
```

## 3. Đăng nhập để lấy token

### Đăng nhập Candidate:
```http
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "username": "candidate_test",
  "password": "123456"
}
```

### Đăng nhập Recruiter:
```http
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "username": "recruiter_test",
  "password": "123456"
}
```

## 4. Test REST API

### Lấy danh sách conversations:
```http
GET http://localhost:5000/api/chat/conversations
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4NWE3NjczYzkyM2IxYmI4MDczMTQ3YyIsInJvbGUiOiJyZWNydWl0ZXIiLCJpYXQiOjE3NTEzNjY0NDgsImV4cCI6MTE3NTEzNjY0NDd9.hyZCHs8HvPARSMvGe8fkAsYn_yIFQTCksAaveeEeESU
```

### Lấy tin nhắn với user khác:
```http
GET http://localhost:5000/api/chat/conversations/685a7673c923b1bb8073147b/messages?page=1&limit=20
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4NWE3NjczYzkyM2IxYmI4MDczMTQ3YyIsInJvbGUiOiJyZWNydWl0ZXIiLCJpYXQiOjE3NTEzNjY0NDgsImV4cCI6MTE3NTEzNjY0NDd9.hyZCHs8HvPARSMvGe8fkAsYn_yIFQTCksAaveeEeESU
```

## 5. Test WebSocket

Sử dụng công cụ như Postman hoặc Socket.IO client để test:

### Kết nối WebSocket:
- URL: `ws://localhost:5000`
- Auth Header: `Authorization: Bearer YOUR_ACCESS_TOKEN`

### Gửi tin nhắn:
```json
{
  "event": "chat:send",
  "data": {
    "recipientId": "OTHER_USER_ID",
    "content": "Hello từ WebSocket!"
  }
}
```

### Đánh dấu đã đọc:
```json
{
  "event": "chat:markRead",
  "data": {
    "messageIds": ["MESSAGE_ID_1", "MESSAGE_ID_2"],
    "senderId": "ORIGINAL_SENDER_ID"
  }
}
```

### Typing indicators:
```json
{
  "event": "chat:typing:start",
  "data": {
    "recipientId": "OTHER_USER_ID"
  }
}
```

```json
{
  "event": "chat:typing:stop",
  "data": {
    "recipientId": "OTHER_USER_ID"
  }
}
```

## 6. Events mà client sẽ nhận được

- `user:presence` - Thông báo user online/offline
- `chat:message` - Tin nhắn mới
- `chat:sent` - Xác nhận tin nhắn đã gửi
- `chat:messageRead` - Tin nhắn đã được đọc
- `chat:typing:start` - Bắt đầu gõ
- `chat:typing:stop` - Dừng gõ
- `chat:error` - Lỗi

## Ghi chú

- Đảm bảo MongoDB và Redis đang chạy
- Kiểm tra file .env có đúng cấu hình không
- Kiểm tra logs trong console khi test
