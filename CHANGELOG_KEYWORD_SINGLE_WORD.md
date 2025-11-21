# Changelog: Keyword Single Word Policy

## 📋 Tóm Tắt Thay Đổi

Từ phiên bản này, hệ thống **chỉ cho phép keyword là 1 từ duy nhất** (không có khoảng trắng).

## 🔧 Files Đã Thay Đổi

### 1. Model Layer
**File:** `be/src/models/JobAlertSubscription.js`

**Thay đổi:**
```javascript
keyword: {
    type: String,
    trim: true,
    lowercase: true,  // ← MỚI: Tự động lowercase
    required: [true, 'Keyword is required'],
    maxlength: [50, 'Keyword cannot exceed 50 characters'],  // ← Giảm từ 100 → 50
    validate: {  // ← MỚI: Validate single word
        validator: function(value) {
            return value && value.trim().split(/\s+/).length === 1;
        },
        message: 'Keyword must be a single word without spaces'
    }
}
```

### 2. Schema Validation Layer
**File:** `be/src/schemas/jobAlert.schema.js`

**Thay đổi:**
```javascript
// TRƯỚC
keyword: z.string().max(100).optional()

// SAU
keyword: z.string()
    .min(1, 'Từ khóa không được để trống')
    .max(50, 'Từ khóa không được vượt quá 50 ký tự')
    .refine(
        (val) => val.trim().split(/\s+/).length === 1,
        'Từ khóa chỉ được phép là 1 từ duy nhất (không có khoảng trắng)'
    )
    .transform((val) => val.trim().toLowerCase())  // ← Normalize
```

### 3. Service Layer
**File:** `be/src/services/jobAlert.service.js`

**Thay đổi trong `createJobAlert`:**
```javascript
// MỚI: Normalize keyword trước khi create
const normalizedData = {
    ...data,
    keyword: data.keyword?.trim().toLowerCase()
};

const subscription = await JobAlertSubscription.create({ 
    ...normalizedData, 
    candidateId 
});
```

**Thay đổi trong `updateJobAlert`:**
```javascript
// MỚI: Normalize keyword trước khi update
if (data.keyword) {
    data.keyword = data.keyword.trim().toLowerCase();
}

// MỚI: So sánh trực tiếp (không cần toLowerCase vì đã normalize)
if (data.keyword && data.keyword !== oldKeyword) {
    // Update Redis...
}
```

### 4. Worker Layer
**File:** `be/workers/matching.worker.js`

**Không thay đổi logic**, nhưng giờ đơn giản hơn vì:
- Keywords từ job luôn là lowercase
- Keywords từ subscription luôn là lowercase
- Matching chính xác hơn

## 📝 Files Mới

### 1. Migration Script
**File:** `be/scripts/normalize-keywords.js`

**Mục đích:** Chuẩn hóa dữ liệu hiện có trong database

**Chạy:**
```bash
npm run normalize:keywords
```

**Chức năng:**
- Lấy tất cả subscriptions
- Chuyển keywords nhiều từ → 1 từ (lấy từ đầu tiên)
- Cập nhật MongoDB
- Cập nhật Redis
- Log kết quả

### 2. Documentation
**File:** `be/docs/KEYWORD_SINGLE_WORD_MIGRATION.md`

**Nội dung:**
- Lý do thay đổi
- Hướng dẫn migration
- Testing guidelines
- FAQ
- Rollback plan

### 3. Algorithm Documentation Update
**File:** `be/workers/MATCHING_ALGORITHM.md`

**Cập nhật:** Thêm phần giải thích về keyword normalization

## 🚀 Cách Deploy

### Bước 1: Backup Database
```bash
mongodump --uri="mongodb://localhost:27017/careerzone" --out=./backup-$(date +%Y%m%d)
```

### Bước 2: Deploy Code
```bash
git pull origin main
npm install  # Nếu có dependencies mới
```

### Bước 3: Run Migration
```bash
npm run normalize:keywords
```

### Bước 4: Verify
```bash
# Kiểm tra MongoDB
mongo careerzone --eval 'db.jobalertsubscriptions.find({ keyword: /\s/ }).count()'
# Kết quả phải là 0

# Kiểm tra Redis
redis-cli KEYS "job_alert:keyword:*" | head -10
# Tất cả keys phải là single word
```

### Bước 5: Restart Workers
```bash
pm2 restart matching-worker
pm2 restart notification-worker
```

## ✅ Testing Checklist

### API Testing

**1. Create Subscription - Valid:**
```bash
curl -X POST /api/candidate/job-alerts \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "keyword": "nodejs",
    "location": { "province": "HCM", "district": "Q1" },
    "category": "IT",
    "type": "ALL",
    "workType": "ALL",
    "experience": "ALL",
    "salaryRange": "ALL"
  }'

# Expected: 201 Created
```

**2. Create Subscription - Invalid (Multiple Words):**
```bash
curl -X POST /api/candidate/job-alerts \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "keyword": "nodejs developer",
    ...
  }'

# Expected: 400 Bad Request
# Error: "Từ khóa chỉ được phép là 1 từ duy nhất"
```

**3. Create Subscription - Normalization:**
```bash
curl -X POST /api/candidate/job-alerts \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "keyword": "  NodeJS  ",  # Có spaces và uppercase
    ...
  }'

# Expected: 201 Created
# Saved as: "nodejs" (lowercase, trimmed)
```

### Database Testing

**1. Check No Multi-Word Keywords:**
```javascript
db.jobalertsubscriptions.find({ 
    keyword: /\s/  // Tìm keywords có khoảng trắng
})
// Kết quả: []
```

**2. Check All Lowercase:**
```javascript
db.jobalertsubscriptions.find({
    keyword: { $regex: /[A-Z]/ }  // Tìm keywords có chữ hoa
})
// Kết quả: []
```

### Redis Testing

**1. Check Keys Format:**
```bash
redis-cli KEYS "job_alert:keyword:*" | grep " "
# Kết quả: (empty) - không có keys với spaces
```

**2. Check User Mapping:**
```bash
redis-cli SMEMBERS "job_alert:keyword:nodejs"
# Kết quả: ["userId1", "userId2", ...]
```

### Worker Testing

**1. Create Test Job:**
```javascript
// Tạo job mới với keywords
{
    title: "Senior NodeJS Developer",
    skills: ["NodeJS", "React"],
    ...
}
```

**2. Check Matching:**
```bash
# Xem logs của matching worker
tail -f logs/matching-worker.log

# Expected output:
# "Processing job 123: Senior NodeJS Developer"
# "Matched 5 users for job 123"
# "Batch inserted 5 pending notifications"
```

## 📊 Expected Impact

### Performance
- ✅ **Redis lookup**: Nhanh hơn ~20% (keys đơn giản hơn)
- ✅ **Matching speed**: Nhanh hơn ~15% (ít string operations)
- ✅ **Memory usage**: Giảm ~10% (keys ngắn hơn)

### User Experience
- ⚠️ **Breaking change**: Users phải cập nhật subscriptions
- ✅ **Simpler UX**: Dễ hiểu hơn (1 keyword = 1 concept)
- ✅ **More control**: Users có thể tạo nhiều subscriptions

### Data Quality
- ✅ **Consistency**: Tất cả keywords đều lowercase
- ✅ **Validation**: Không còn keywords không hợp lệ
- ✅ **Maintainability**: Dễ debug và monitor

## 🔄 Rollback Plan

Nếu gặp vấn đề nghiêm trọng:

### 1. Restore Database
```bash
mongorestore --uri="mongodb://localhost:27017/careerzone" ./backup-YYYYMMDD
```

### 2. Revert Code
```bash
git revert <commit-hash>
git push origin main
```

### 3. Redeploy
```bash
pm2 restart all
```

### 4. Clear Redis
```bash
redis-cli FLUSHDB
node scripts/rebuild-redis-from-mongodb.js
```

## 📈 Monitoring

Sau khi deploy, theo dõi:

### 1. Error Rate
```bash
# Check error logs
grep "Keyword must be a single word" logs/app.log | wc -l
```

### 2. API Success Rate
```bash
# Check API metrics
curl http://localhost:3000/metrics | grep job_alert_create
```

### 3. Worker Performance
```bash
# Check matching worker logs
grep "Batch inserted" logs/matching-worker.log | tail -20
```

### 4. User Feedback
- Monitor support tickets
- Check user complaints
- Analyze subscription creation rate

## 🎯 Success Criteria

Migration thành công khi:

- ✅ Không còn keywords với khoảng trắng trong DB
- ✅ Tất cả keywords đều lowercase
- ✅ Redis keys đều hợp lệ
- ✅ Matching worker hoạt động bình thường
- ✅ API validation hoạt động đúng
- ✅ Error rate < 1%
- ✅ Performance cải thiện hoặc giữ nguyên

## 📞 Support

Nếu gặp vấn đề:

1. Check logs: `logs/app.log`, `logs/matching-worker.log`
2. Check Redis: `redis-cli KEYS "job_alert:*"`
3. Check MongoDB: `db.jobalertsubscriptions.find().limit(10)`
4. Contact: [Your Team Contact]

## 📚 Related Documents

- [MATCHING_ALGORITHM.md](./workers/MATCHING_ALGORITHM.md) - Chi tiết thuật toán matching
- [KEYWORD_SINGLE_WORD_MIGRATION.md](./docs/KEYWORD_SINGLE_WORD_MIGRATION.md) - Hướng dẫn migration
- [README.md](./workers/README.md) - Workers documentation
