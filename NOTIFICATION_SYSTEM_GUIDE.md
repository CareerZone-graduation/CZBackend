# Hướng Dẫn Vận Hành Hệ Thống Thông Báo Việc Làm Định Kỳ

## 🚀 Tổng quan

Hệ thống thông báo việc làm định kỳ được thiết kế theo kiến trúc Event-Driven + Batch Processing với các thành phần chính:

1. **API Server**: Xử lý các request từ client
2. **Matching Worker**: Xử lý sự kiện job mới từ Kafka
3. **Cron Job**: Gom nhóm và gửi thông báo định kỳ
4. **Notification Worker**: Xử lý việc gửi email/thông báo

## 📦 Cài Đặt và Khởi Chạy

### 1. Cài đặt dependencies (nếu chưa có)

Đảm bảo các package sau đã được cài đặt:
- kafkajs
- node-cron
- lodash (cho uniq function)

### 2. Khởi chạy các service

```bash
# Terminal 1: API Server
npm run dev

# Terminal 2: Matching Worker
npm run worker:matching

# Terminal 3: Notification Worker
npm run worker:notification
```

### 3. Kiểm tra kết nối

Đảm bảo các service sau đang chạy:
- MongoDB
- Redis
- Kafka
- RabbitMQ

## 🧪 Kiểm Thử Hệ Thống

### 1. Chạy script test tự động

```bash
node test-job-notification-system.js
```

### 2. Kiểm thử thủ công

#### Bước 1: Tạo Job Alert Subscription
```bash
# Sử dụng API để tạo subscription
POST /api/job-alerts
{
  "keyword": "nodejs",
  "location": {
    "city": "Ho Chi Minh",
    "district": "District 1"
  },
  "frequency": "daily",
  "salaryRange": "10M_20M",
  "type": "FULL_TIME",
  "workType": "REMOTE",
  "experience": "MID_LEVEL"
}
```

#### Bước 2: Tạo Job mới phù hợp
```bash
# Sử dụng API để tạo job mới có chứa keyword "nodejs"
POST /api/jobs
{
  "title": "Senior NodeJS Developer",
  "description": "We need an experienced NodeJS developer...",
  "requirements": "NodeJS, MongoDB, Redis experience required",
  "benefits": "Competitive salary, flexible hours",
  "skills": ["nodejs", "mongodb", "redis"],
  "category": "SOFTWARE_DEVELOPMENT",
  "type": "FULL_TIME",
  "workType": "REMOTE",
  "experience": "MID_LEVEL",
  "location": {
    "city": "Ho Chi Minh",
    "district": "District 1",
    "address": "123 Test Street"
  },
  "minSalary": 15000000,
  "maxSalary": 25000000,
  "deadline": "2025-08-25"
}
```

#### Bước 3: Kiểm tra kết quả
```bash
# Kiểm tra Redis
redis-cli
> SMEMBERS job_alert:keyword:nodejs

# Kiểm tra MongoDB
use careerzone
db.pendingnotifications.find()

# Kiểm tra log của matching worker
# Phải thấy message "Inserted X pending notifications for job..."
```

#### Bước 4: Test Cron Job (thủ công)
```bash
# Tạm thời thay đổi cron schedule thành mỗi phút để test
# Trong src/cron/jobAlert.cron.js:
# cron.schedule('*/1 * * * *', async () => {

# Kiểm tra RabbitMQ Management UI
# http://localhost:15672 (guest/guest)
# Phải thấy message trong queue "digest-notifications"

# Kiểm tra log của notification worker
# Phải thấy message xử lý email/notification
```

## 📊 Monitoring và Debug

### 1. Log Files
- **API Server**: Terminal chạy `npm run dev`
- **Matching Worker**: Terminal chạy `npm run worker:matching`
- **Notification Worker**: Terminal chạy `npm run worker:notification`

### 2. Database Queries

```javascript
// Kiểm tra pending notifications
db.pendingnotifications.find().limit(10)

// Kiểm tra job alert subscriptions
db.jobalertsubscriptions.find({ active: true }).limit(10)

// Kiểm tra aggregation pipeline của cron job
db.pendingnotifications.aggregate([
  { $group: { _id: "$userId", jobIds: { $addToSet: "$jobId" } } }
])
```

### 3. Redis Commands

```bash
# Xem tất cả keys job alert
redis-cli KEYS "job_alert:*"

# Xem members của một keyword
redis-cli SMEMBERS "job_alert:keyword:nodejs"

# Xóa test data
redis-cli FLUSHDB
```

### 4. Kafka Topics

```bash
# List topics
kafka-topics.sh --list --bootstrap-server localhost:9092

# Check job-events topic
kafka-console-consumer.sh --topic job-events --from-beginning --bootstrap-server localhost:9092
```

## 🔧 Cấu Hình

### 1. Thay đổi lịch chạy Cron Job

Trong file `src/cron/jobAlert.cron.js`:
```javascript
// Hiện tại: 8h sáng mỗi ngày
cron.schedule('0 8 * * *', async () => {

// Thay đổi thành 6h sáng:
cron.schedule('0 6 * * *', async () => {

// Test mode (mỗi phút):
cron.schedule('*/1 * * * *', async () => {
```

### 2. Giới hạn số lượng job trong email

Trong file `src/cron/jobAlert.cron.js`:
```javascript
// Hiện tại: tối đa 10 jobs
.limit(10)

// Thay đổi thành 5 jobs:
.limit(5)
```

### 3. TTL cho Pending Notifications

Trong file `src/models/PendingNotification.js`:
```javascript
// Hiện tại: 7 ngày
expires: '7d'

// Thay đổi thành 3 ngày:
expires: '3d'
```

## 🚨 Troubleshooting

### Problem: Matching Worker không nhận được events

**Solution:**
1. Kiểm tra Kafka đang chạy: `ps aux | grep kafka`
2. Kiểm tra topic tồn tại: `kafka-topics.sh --list --bootstrap-server localhost:9092`
3. Restart matching worker: `npm run worker:matching`

### Problem: Không có Pending Notifications

**Solution:**
1. Kiểm tra Redis có user IDs: `redis-cli SMEMBERS "job_alert:keyword:nodejs"`
2. Kiểm tra job event có đúng format không
3. Kiểm tra matching logic trong worker

### Problem: Cron Job không gửi notifications

**Solution:**
1. Kiểm tra RabbitMQ đang chạy
2. Kiểm tra queue service hoạt động
3. Kiểm tra notification worker đang chạy

### Problem: Performance chậm

**Solution:**
1. Thêm index cho MongoDB collections
2. Tối ưu Redis queries
3. Tăng số consumer cho Kafka
4. Batch size cho email sending

## 📈 Scaling

### 1. Horizontal Scaling
- Chạy nhiều instance của matching worker
- Sử dụng Kafka partitions
- Load balancer cho API servers

### 2. Performance Optimization
- Redis clustering
- MongoDB sharding
- Kafka partitioning by keyword hash

### 3. Monitoring
- Prometheus + Grafana
- Kafka metrics
- Application performance monitoring

