# MongoDB Change Stream - Các Trường Hợp Xử Lý

## Tổng Quan

Matching Worker lắng nghe **2 loại events** từ MongoDB Change Streams:
1. **INSERT** - Job mới được tạo
2. **UPDATE** - Job được cập nhật (duyệt hoặc kích hoạt)

## Các Trường Hợp (Scenarios)

### Scenario 1: Job Được Tạo Và Duyệt Ngay (INSERT)

**Flow:**
```
Recruiter tạo job → moderationStatus = APPROVED (auto-approve hoặc pre-approved)
                  → status = ACTIVE
```

**Change Stream Event:**
```javascript
{
  operationType: 'insert',
  fullDocument: {
    _id: 'job123',
    title: 'NodeJS Developer',
    moderationStatus: 'APPROVED',  // ✅ Đã duyệt
    status: 'ACTIVE',               // ✅ Đang active
    ...
  }
}
```

**Kết quả:** ✅ Worker xử lý matching ngay lập tức

---

### Scenario 2: Job Được Tạo Chờ Duyệt, Sau Đó Admin Duyệt (UPDATE)

**Flow:**
```
Step 1: Recruiter tạo job → moderationStatus = PENDING
                          → status = ACTIVE

Step 2: Admin duyệt job → moderationStatus = APPROVED
```

**Change Stream Events:**

**Event 1 (INSERT):**
```javascript
{
  operationType: 'insert',
  fullDocument: {
    _id: 'job456',
    moderationStatus: 'PENDING',  // ❌ Chưa duyệt
    status: 'ACTIVE',
    ...
  }
}
```
→ **Bỏ qua** (không match filter)

**Event 2 (UPDATE):**
```javascript
{
  operationType: 'update',
  documentKey: { _id: 'job456' },
  updateDescription: {
    updatedFields: {
      moderationStatus: 'APPROVED'  // ✅ Vừa được duyệt
    }
  },
  fullDocument: {
    _id: 'job456',
    moderationStatus: 'APPROVED',   // ✅ Đã duyệt
    status: 'ACTIVE',               // ✅ Đang active
    ...
  }
}
```
→ **Xử lý matching** ✅

---

### Scenario 3: Job Bị Tạm Ngưng, Sau Đó Kích Hoạt Lại (UPDATE)

**Flow:**
```
Step 1: Job đang active → Recruiter tạm ngưng → status = INACTIVE

Step 2: Recruiter kích hoạt lại → status = ACTIVE
```

**Change Stream Event:**
```javascript
{
  operationType: 'update',
  updateDescription: {
    updatedFields: {
      status: 'ACTIVE'  // ✅ Vừa được kích hoạt
    }
  },
  fullDocument: {
    _id: 'job789',
    moderationStatus: 'APPROVED',  // ✅ Đã duyệt từ trước
    status: 'ACTIVE',              // ✅ Vừa active
    ...
  }
}
```
→ **Xử lý matching** ✅

---

### Scenario 4: Job Được Tạo Với Status PENDING (INSERT - Bỏ Qua)

**Flow:**
```
Recruiter tạo job → moderationStatus = PENDING
                  → status = ACTIVE
```

**Change Stream Event:**
```javascript
{
  operationType: 'insert',
  fullDocument: {
    moderationStatus: 'PENDING',  // ❌ Chưa duyệt
    status: 'ACTIVE',
    ...
  }
}
```
→ **Bỏ qua** ❌ (chờ admin duyệt)

---

### Scenario 5: Job Được Duyệt Nhưng INACTIVE (UPDATE - Bỏ Qua)

**Flow:**
```
Admin duyệt job → moderationStatus = APPROVED
                → status = INACTIVE (recruiter đã tạm ngưng)
```

**Change Stream Event:**
```javascript
{
  operationType: 'update',
  updateDescription: {
    updatedFields: {
      moderationStatus: 'APPROVED'
    }
  },
  fullDocument: {
    moderationStatus: 'APPROVED',  // ✅ Đã duyệt
    status: 'INACTIVE',            // ❌ Không active
    ...
  }
}
```
→ **Bỏ qua** ❌ (job không active)

---

## Change Stream Filter Logic

```javascript
$match: {
  $or: [
    // Case 1: INSERT với APPROVED + ACTIVE
    {
      operationType: 'insert',
      'fullDocument.moderationStatus': 'APPROVED',
      'fullDocument.status': 'ACTIVE'
    },
    
    // Case 2: UPDATE moderationStatus → APPROVED
    {
      operationType: 'update',
      'updateDescription.updatedFields.moderationStatus': 'APPROVED',
      'fullDocument.status': 'ACTIVE'
    },
    
    // Case 3: UPDATE status → ACTIVE
    {
      operationType: 'update',
      'updateDescription.updatedFields.status': 'ACTIVE',
      'fullDocument.moderationStatus': 'APPROVED'
    }
  ]
}
```

## Testing

### Test Case 1: INSERT với APPROVED
```bash
# Tạo job mới với status APPROVED
curl -X POST /api/recruiter/jobs \
  -d '{ "title": "NodeJS Dev", "moderationStatus": "APPROVED", ... }'

# Expected: Worker log "Received insert event for job..."
```

### Test Case 2: UPDATE PENDING → APPROVED
```bash
# Step 1: Tạo job với PENDING
curl -X POST /api/recruiter/jobs \
  -d '{ "title": "React Dev", "moderationStatus": "PENDING", ... }'

# Step 2: Admin duyệt
curl -X PUT /api/admin/jobs/:id/approve

# Expected: Worker log "Received update event for job..."
```

### Test Case 3: UPDATE INACTIVE → ACTIVE
```bash
# Step 1: Tạm ngưng job
curl -X PUT /api/recruiter/jobs/:id \
  -d '{ "status": "INACTIVE" }'

# Step 2: Kích hoạt lại
curl -X PUT /api/recruiter/jobs/:id \
  -d '{ "status": "ACTIVE" }'

# Expected: Worker log "Received update event for job..."
```

## Monitoring

```bash
# Xem logs của worker
tail -f logs/matching-worker.log | grep "Received"

# Expected output:
# Received insert event for job 123
# Received update event for job 456
# Received update event for job 789
```
