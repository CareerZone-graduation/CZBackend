# Redis Subscription Sync - Summary

## Vấn Đề Đã Fix

**Trước đây:** Redis không được cập nhật khi user active/deactivate subscription

**Bây giờ:** Redis luôn sync với MongoDB trong mọi trường hợp

## Các Trường Hợp Được Xử Lý

| Hành Động | MongoDB | Redis | Kết Quả |
|-----------|---------|-------|---------|
| **Create (active=true)** | ✅ Created | ✅ Added | User nhận notifications |
| **Create (active=false)** | ✅ Created | ❌ Not added | User KHÔNG nhận notifications |
| **Update: Deactivate** | ✅ active=false | ✅ Removed | User KHÔNG nhận notifications |
| **Update: Activate** | ✅ active=true | ✅ Added | User nhận notifications |
| **Update: Change keyword** | ✅ Updated | ✅ Moved to new set | User nhận notifications cho keyword mới |
| **Update: Change keyword + Deactivate** | ✅ Updated | ✅ Removed from old, NOT added to new | User KHÔNG nhận notifications |
| **Delete** | ✅ Deleted | ✅ Removed | User KHÔNG nhận notifications |

## Code Changes

### File: `be/src/services/jobAlert.service.js`

#### 1. createJobAlert
```javascript
// Chỉ add vào Redis nếu active = true
if (subscription.active) {
  await redisClient.sAdd(
    RedisKeys.getKeywordKey(subscription.keyword), 
    candidateId.toString()
  );
}
```

#### 2. updateJobAlert
```javascript
const oldKeyword = subscription.keyword;
const oldActive = subscription.active;

// Apply updates
Object.assign(subscription, data);
await subscription.save();

// Case 1: Keyword changed
if (data.keyword && data.keyword !== oldKeyword) {
  multi.sRem(RedisKeys.getKeywordKey(oldKeyword), userId);
  
  if (subscription.active) {
    multi.sAdd(RedisKeys.getKeywordKey(subscription.keyword), userId);
  }
}
// Case 2: Active status changed
else if (data.active !== undefined && data.active !== oldActive) {
  if (subscription.active) {
    multi.sAdd(RedisKeys.getKeywordKey(subscription.keyword), userId);
  } else {
    multi.sRem(RedisKeys.getKeywordKey(subscription.keyword), userId);
  }
}
// Case 3: Ensure consistency
else if (subscription.active) {
  multi.sAdd(RedisKeys.getKeywordKey(subscription.keyword), userId);
}

await multi.exec();
```

## New Scripts

### 1. Rebuild Redis từ MongoDB
```bash
npm run rebuild:redis
```

**Khi nào dùng:**
- Redis bị clear/flush
- Phát hiện inconsistency giữa MongoDB và Redis
- Sau khi restore database từ backup

**Chức năng:**
1. Clear tất cả keys `job_alert:keyword:*`
2. Query tất cả active subscriptions từ MongoDB
3. Rebuild Redis sets
4. Verify consistency

### 2. Test Change Stream
```bash
npm run test:changestream
```

**Chức năng:**
- Test MongoDB Change Streams hoạt động
- Kiểm tra Replica Set
- Debug matching worker

## Testing

### Test 1: Create Active Subscription
```bash
curl -X POST /api/candidate/job-alerts \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "keyword": "nodejs",
    "active": true,
    ...
  }'

# Check Redis
redis-cli SMEMBERS "job_alert:keyword:nodejs"
# Expected: userId có trong set
```

### Test 2: Deactivate Subscription
```bash
curl -X PUT /api/candidate/job-alerts/:id \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "active": false }'

# Check Redis
redis-cli SMEMBERS "job_alert:keyword:nodejs"
# Expected: userId KHÔNG có trong set
```

### Test 3: Reactivate Subscription
```bash
curl -X PUT /api/candidate/job-alerts/:id \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "active": true }'

# Check Redis
redis-cli SMEMBERS "job_alert:keyword:nodejs"
# Expected: userId có trong set
```

### Test 4: Change Keyword
```bash
curl -X PUT /api/candidate/job-alerts/:id \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "keyword": "react" }'

# Check Redis
redis-cli SMEMBERS "job_alert:keyword:nodejs"
# Expected: userId KHÔNG có

redis-cli SMEMBERS "job_alert:keyword:react"
# Expected: userId có trong set
```

## Monitoring

### Check Consistency
```bash
# 1. Count active subscriptions in MongoDB
mongo careerzone --eval '
  db.jobalertsubscriptions.count({ keyword: "nodejs", active: true })
'

# 2. Count users in Redis
redis-cli SCARD "job_alert:keyword:nodejs"

# 3. Compare numbers
```

### Verify Specific User
```bash
# 1. Check MongoDB
mongo careerzone --eval '
  db.jobalertsubscriptions.find({
    candidateId: ObjectId("USER_ID"),
    active: true
  }).pretty()
'

# 2. Check Redis
redis-cli SMEMBERS "job_alert:keyword:nodejs" | grep "USER_ID"
```

## Troubleshooting

### Issue: User không nhận notifications

**Step 1: Check MongoDB**
```javascript
const sub = await JobAlertSubscription.findOne({
  candidateId: userId,
  keyword: "nodejs"
});

console.log('Active:', sub.active); // Should be true
```

**Step 2: Check Redis**
```bash
redis-cli SMEMBERS "job_alert:keyword:nodejs" | grep "USER_ID"
# Should return userId
```

**Step 3: Fix**
```bash
# If inconsistent, rebuild Redis
npm run rebuild:redis
```

### Issue: Redis có userId nhưng MongoDB không có subscription

**Cause:** Subscription đã bị delete nhưng Redis không được cleanup

**Fix:**
```bash
npm run rebuild:redis
```

### Issue: MongoDB có subscription active nhưng Redis không có userId

**Cause:** Redis bị clear hoặc update logic có bug

**Fix:**
```bash
npm run rebuild:redis
```

## Documentation

- **Chi tiết:** `be/docs/REDIS_SUBSCRIPTION_SYNC.md`
- **Troubleshooting:** `be/workers/TROUBLESHOOTING_CHANGE_STREAM.md`
- **Quick Start:** `be/workers/QUICK_START_CHANGE_STREAM.md`

## Summary

✅ **Fixed:** Redis sync với MongoDB trong mọi trường hợp  
✅ **Added:** Rebuild script để fix inconsistency  
✅ **Added:** Test script cho Change Streams  
✅ **Added:** Comprehensive documentation  

**Next Steps:**
1. Test tất cả scenarios
2. Monitor logs sau khi deploy
3. Run rebuild script nếu cần
