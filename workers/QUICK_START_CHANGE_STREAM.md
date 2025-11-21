# Quick Start: Testing Change Stream

## Bước 1: Kiểm tra MongoDB Replica Set

```bash
# Chạy test script
node scripts/test-change-stream.js
```

**Expected output:**
```
✅ Connected to MongoDB
✅ Replica Set detected: rs0
📡 Creating simple Change Stream...
✅ Change Stream created!
👂 Listening for ALL changes on Job collection...
```

**Nếu thấy error "NOT a Replica Set":**
- Sử dụng MongoDB Atlas (khuyến nghị)
- Hoặc convert local MongoDB sang Replica Set (xem TROUBLESHOOTING.md)

---

## Bước 2: Test Change Stream (Terminal 1)

```bash
# Giữ terminal này chạy
node scripts/test-change-stream.js
```

---

## Bước 3: Tạo Job Mới (Terminal 2)

### Option A: Qua API
```bash
curl -X POST http://localhost:3000/api/recruiter/jobs \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test NodeJS Developer",
    "description": "Test job for change stream",
    "requirements": "NodeJS, React",
    "benefits": "Good salary",
    "location": {
      "province": "HCM",
      "district": "Q1",
      "commune": "P.Bến Nghé"
    },
    "address": "123 Test Street",
    "type": "FULL_TIME",
    "workType": "REMOTE",
    "minSalary": 20000000,
    "maxSalary": 30000000,
    "deadline": "2025-12-31",
    "experience": "MID_LEVEL",
    "category": "IT",
    "skills": ["NodeJS", "React"],
    "moderationStatus": "APPROVED",
    "status": "ACTIVE"
  }'
```

### Option B: Qua MongoDB Shell
```bash
mongo careerzone

db.jobs.insertOne({
  title: "Test Job",
  moderationStatus: "APPROVED",
  status: "ACTIVE",
  // ... other required fields
})
```

---

## Bước 4: Kiểm tra Terminal 1

**Expected output:**
```
=== 🎉 CHANGE DETECTED ===
Operation: insert
Document ID: 507f1f77bcf86cd799439011
New job: Test NodeJS Developer
Status: APPROVED / ACTIVE
=========================
```

**Nếu thấy output này → Change Stream hoạt động! ✅**

---

## Bước 5: Test UPDATE Event

### Terminal 2:
```bash
# Update job status
curl -X PUT http://localhost:3000/api/recruiter/jobs/JOB_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "moderationStatus": "APPROVED"
  }'
```

### Terminal 1 Expected:
```
=== 🎉 CHANGE DETECTED ===
Operation: update
Document ID: 507f1f77bcf86cd799439011
Updated fields: {
  "moderationStatus": "APPROVED"
}
=========================
```

---

## Bước 6: Start Matching Worker

```bash
# Stop test script (Ctrl+C in Terminal 1)

# Start matching worker
npm run worker:matching
```

**Expected output:**
```
✅ Connected to MongoDB
✅ MongoDB Replica Set detected: rs0
Matching worker started. Listening to Job collection changes...
Change Stream pipeline: [...]
✅ Change Stream created successfully. Waiting for events...
```

---

## Bước 7: Test Matching Worker

### Terminal 2: Tạo job mới
```bash
curl -X POST http://localhost:3000/api/recruiter/jobs \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{ ... }'  # Same as step 3
```

### Worker Expected Output:
```
=== CHANGE STREAM EVENT RECEIVED ===
Operation: insert
Document ID: 507f1f77bcf86cd799439011
Job 507f1f77bcf86cd799439011: moderationStatus=APPROVED, status=ACTIVE
✅ Processing insert event for job 507f1f77bcf86cd799439011: Test NodeJS Developer
Processing job 507f1f77bcf86cd799439011: Test NodeJS Developer
Matched 5 users for job 507f1f77bcf86cd799439011
Found 7 active subscriptions for matched users.
Queued pending notification for user 123, job 507f1f77bcf86cd799439011 (score: 65)
Batch inserted 5 pending notifications for job 507f1f77bcf86cd799439011
```

---

## Troubleshooting

### Không thấy "CHANGE DETECTED"?
→ Xem `TROUBLESHOOTING_CHANGE_STREAM.md`

### Thấy "CHANGE DETECTED" nhưng worker không xử lý?
→ Kiểm tra filter pipeline (có thể quá strict)

### Worker crash?
→ Check logs: `pm2 logs matching-worker`

---

## Summary

✅ **Working:** Test script nhận events + Worker xử lý matching  
❌ **Not Working:** Xem TROUBLESHOOTING_CHANGE_STREAM.md  

**Next Steps:**
1. Deploy worker to production
2. Monitor logs
3. Test với real jobs
