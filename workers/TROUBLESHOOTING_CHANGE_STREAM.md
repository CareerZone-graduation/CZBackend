# Troubleshooting: Change Stream Không Hoạt Động

## Vấn Đề: Change Stream Không Nhận Events

### Nguyên Nhân Phổ Biến

#### 1. MongoDB Không Phải Replica Set ⚠️

**Triệu chứng:**
```
Error: The $changeStream stage is only supported on replica sets
```

**Giải thích:**
- Change Streams **CHỈ** hoạt động trên MongoDB Replica Set
- Standalone MongoDB **KHÔNG** hỗ trợ Change Streams

**Kiểm tra:**
```bash
# Kết nối MongoDB shell
mongo

# Chạy lệnh
rs.status()

# Nếu thấy error "not running with --replSet" → KHÔNG phải Replica Set
```

**Giải pháp:**

**Option 1: Sử dụng MongoDB Atlas (Khuyến nghị)**
```
1. Tạo free cluster tại https://cloud.mongodb.com
2. Atlas tự động cấu hình Replica Set
3. Copy connection string
4. Update .env file
```

**Option 2: Convert Local MongoDB sang Replica Set**
```bash
# 1. Stop MongoDB
sudo systemctl stop mongod

# 2. Edit config file
sudo nano /etc/mongod.conf

# 3. Thêm vào file:
replication:
  replSetName: "rs0"

# 4. Start MongoDB
sudo systemctl start mongod

# 5. Initialize Replica Set
mongo --eval "rs.initiate()"

# 6. Verify
mongo --eval "rs.status()"
```

---

#### 2. Filter Quá Strict

**Triệu chứng:**
- Worker chạy nhưng không log gì khi tạo/update job
- Không có error

**Kiểm tra:**
```bash
# Chạy test script (không có filter)
node scripts/test-change-stream.js

# Tạo job mới
# Nếu test script nhận được event → Filter bị sai
```

**Giải pháp:**
```javascript
// Tạm thời bỏ filter để test
const changeStream = Job.watch(); // Không có pipeline

// Nếu nhận được events → Vấn đề là filter
// Kiểm tra lại pipeline
```

---

#### 3. Worker Không Chạy

**Triệu chứng:**
- Không thấy log "Matching worker started..."

**Kiểm tra:**
```bash
# Check process
ps aux | grep matching.worker

# Check PM2 (nếu dùng)
pm2 list
pm2 logs matching-worker
```

**Giải pháp:**
```bash
# Start worker
npm run worker:matching

# Hoặc với PM2
pm2 start workers/matching.worker.js --name matching-worker
```

---

#### 4. Multiple Change Streams Conflict ❌ (KHÔNG ĐÚNG!)

**Lầm tưởng:**
> "Một collection chỉ có thể có 1 Change Stream"

**Sự thật:**
- Một collection có thể có **NHIỀU** Change Streams
- Mỗi Change Stream độc lập
- Không conflict với nhau

**Ví dụ:**
```javascript
// Worker 1: Lắng nghe INSERT
const stream1 = Job.watch([{ $match: { operationType: 'insert' } }]);

// Worker 2: Lắng nghe UPDATE
const stream2 = Job.watch([{ $match: { operationType: 'update' } }]);

// Worker 3: Lắng nghe tất cả
const stream3 = Job.watch();

// ✅ Tất cả đều hoạt động bình thường!
```

---

#### 5. Connection Issues

**Triệu chứng:**
```
MongoNetworkError: connection timed out
```

**Kiểm tra:**
```bash
# Test connection
mongo "mongodb://localhost:27017/careerzone"

# Check MongoDB running
sudo systemctl status mongod
```

**Giải pháp:**
```bash
# Restart MongoDB
sudo systemctl restart mongod

# Check logs
sudo tail -f /var/log/mongodb/mongod.log
```

---

## Debugging Steps

### Step 1: Kiểm tra Replica Set
```bash
node scripts/test-change-stream.js
```

**Expected output:**
```
✅ Connected to MongoDB
✅ Replica Set detected: rs0
📡 Creating simple Change Stream...
✅ Change Stream created!
👂 Listening for ALL changes...
```

**Nếu thấy error:** MongoDB không phải Replica Set → Xem giải pháp ở trên

---

### Step 2: Test Simple Change Stream
```bash
# Terminal 1: Chạy test script
node scripts/test-change-stream.js

# Terminal 2: Tạo job mới
curl -X POST http://localhost:3000/api/recruiter/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "title": "Test Job", ... }'
```

**Expected:** Terminal 1 log "🎉 CHANGE DETECTED"

**Nếu không thấy:** Vấn đề với MongoDB hoặc connection

---

### Step 3: Test Với Filter
```javascript
// Trong matching.worker.js, tạm thời đơn giản hóa filter
const changeStream = Job.watch([
    {
        $match: {
            operationType: 'insert'  // Chỉ lắng nghe INSERT
        }
    }
]);
```

**Test:**
```bash
# Restart worker
npm run worker:matching

# Tạo job mới
curl -X POST /api/recruiter/jobs ...
```

**Expected:** Worker log "Received insert event"

---

### Step 4: Kiểm tra Logs Chi Tiết
```javascript
// Thêm logging vào worker
changeStream.on('change', (change) => {
    console.log('RAW CHANGE EVENT:', JSON.stringify(change, null, 2));
    // ... rest of code
});
```

**Restart worker và xem logs:**
```bash
npm run worker:matching 2>&1 | tee worker-debug.log
```

---

## Common Mistakes

### ❌ Mistake 1: Sai Field Path
```javascript
// SAI
'fullDocument.moderationStatus': 'APPROVED'

// ĐÚNG (nếu field là nested)
'fullDocument.moderation.status': 'APPROVED'
```

**Fix:** Kiểm tra lại schema của Job model

---

### ❌ Mistake 2: Quên fullDocument Option
```javascript
// SAI - fullDocument có thể null với UPDATE
const changeStream = Job.watch(pipeline);

// ĐÚNG
const changeStream = Job.watch(pipeline, {
    fullDocument: 'updateLookup'  // Lấy full document
});
```

---

### ❌ Mistake 3: Filter UPDATE Sai
```javascript
// SAI - Field path không đúng
'updateDescription.updatedFields.moderationStatus': 'APPROVED'

// ĐÚNG - Kiểm tra exact field name
'updateDescription.updatedFields.moderationStatus': 'APPROVED'
```

**Debug:** Log `change.updateDescription.updatedFields` để xem exact fields

---

## Testing Checklist

- [ ] MongoDB là Replica Set
- [ ] Worker đang chạy (check process)
- [ ] Connection string đúng (.env)
- [ ] Test script nhận được events
- [ ] Filter pipeline đúng
- [ ] Logs chi tiết được enable
- [ ] Job được tạo với đúng status

---

## Quick Fix Commands

```bash
# 1. Check Replica Set
mongo --eval "rs.status()"

# 2. Test Change Stream
node scripts/test-change-stream.js

# 3. Restart worker
pm2 restart matching-worker

# 4. View logs
pm2 logs matching-worker --lines 100

# 5. Test create job
curl -X POST http://localhost:3000/api/recruiter/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @test-job.json
```

---

## Still Not Working?

### Enable Maximum Logging
```javascript
// matching.worker.js
logger.level = 'debug';

changeStream.on('change', (change) => {
    console.log('='.repeat(80));
    console.log('FULL CHANGE EVENT:');
    console.log(JSON.stringify(change, null, 2));
    console.log('='.repeat(80));
});
```

### Check MongoDB Logs
```bash
# MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log

# Look for:
# - Connection errors
# - Replica Set issues
# - Change Stream errors
```

### Contact Support
Nếu vẫn không hoạt động, cung cấp:
1. Output của `rs.status()`
2. Output của test script
3. Worker logs
4. MongoDB version: `mongo --version`
5. Node version: `node --version`
