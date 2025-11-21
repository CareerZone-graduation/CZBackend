# 🎯 Keyword Single Word - Quick Summary

## Thay Đổi Chính

**Trước:** Keyword có thể nhiều từ (`"nodejs developer"`, `"senior react"`)  
**Sau:** Keyword chỉ được **1 từ duy nhất** (`"nodejs"`, `"react"`, `"senior"`)

## Lý Do

✅ Matching đơn giản, chính xác hơn  
✅ Performance tốt hơn (Redis lookup nhanh hơn)  
✅ Dễ quản lý và debug  
✅ User có thể tạo nhiều subscriptions với keywords khác nhau  

## Files Đã Thay Đổi

1. ✅ `be/src/models/JobAlertSubscription.js` - Thêm validation single word + lowercase
2. ✅ `be/src/schemas/jobAlert.schema.js` - Thêm Zod validation + transform
3. ✅ `be/src/services/jobAlert.service.js` - Normalize keyword trước khi save

## Files Mới

1. 📝 `be/scripts/normalize-keywords.js` - Script migration
2. 📚 `be/docs/KEYWORD_SINGLE_WORD_MIGRATION.md` - Hướng dẫn chi tiết
3. 📊 `be/CHANGELOG_KEYWORD_SINGLE_WORD.md` - Changelog đầy đủ

## Cách Deploy (3 Bước)

### 1. Backup Database
```bash
mongodump --uri="mongodb://localhost:27017/careerzone" --out=./backup-$(date +%Y%m%d)
```

### 2. Run Migration Script
```bash
cd be
npm run normalize:keywords
```

**Script sẽ:**
- Lấy tất cả subscriptions
- Chuyển keywords nhiều từ → 1 từ (lấy từ đầu tiên)
- Cập nhật MongoDB + Redis
- Log kết quả

**Ví dụ:**
```
"nodejs developer" → "nodejs"
"senior react engineer" → "senior"
"python" → "python" (không đổi)
```

### 3. Restart Workers
```bash
pm2 restart matching-worker
pm2 restart notification-worker
```

## Validation Rules

### ✅ Valid Keywords
```javascript
"nodejs"     // OK
"react"      // OK
"python"     // OK
"senior"     // OK
"fullstack"  // OK (viết liền)
```

### ❌ Invalid Keywords
```javascript
"nodejs developer"      // Error: Chỉ được 1 từ
"senior react"          // Error: Chỉ được 1 từ
"full stack"            // Error: Chỉ được 1 từ
""                      // Error: Không được để trống
```

### 🔄 Auto Normalization
```javascript
Input: "NodeJS"    → Saved: "nodejs"
Input: "  React  " → Saved: "react"
Input: "PYTHON"    → Saved: "python"
```

## API Response

### Success (201 Created)
```json
{
  "success": true,
  "data": {
    "keyword": "nodejs",  // ← Đã lowercase
    "location": { ... },
    "active": true
  }
}
```

### Error (400 Bad Request)
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "keyword",
      "message": "Từ khóa chỉ được phép là 1 từ duy nhất (không có khoảng trắng)"
    }
  ]
}
```

## Testing

### Quick Test
```bash
# 1. Test valid keyword
curl -X POST /api/candidate/job-alerts \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"keyword": "nodejs", ...}'
# Expected: 201 Created

# 2. Test invalid keyword
curl -X POST /api/candidate/job-alerts \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"keyword": "nodejs developer", ...}'
# Expected: 400 Bad Request

# 3. Check database
mongo careerzone --eval 'db.jobalertsubscriptions.find({ keyword: /\s/ }).count()'
# Expected: 0 (không còn keywords có spaces)
```

## Rollback (Nếu Cần)

```bash
# 1. Restore database
mongorestore --uri="mongodb://localhost:27017/careerzone" ./backup-YYYYMMDD

# 2. Revert code
git revert <commit-hash>

# 3. Restart
pm2 restart all
```

## Hướng Dẫn Cho Users

### Cách Theo Dõi Nhiều Keywords

**Trước (không còn hỗ trợ):**
```javascript
{ keyword: "nodejs developer" }  // ❌
```

**Sau (tạo nhiều subscriptions):**
```javascript
// Subscription 1
{ keyword: "nodejs", location: "HCM", category: "IT" }

// Subscription 2
{ keyword: "developer", location: "HCM", category: "IT" }

// Subscription 3
{ keyword: "senior", location: "HCM", category: "IT" }
```

**Giới hạn:** Tối đa 3 subscriptions/user

## Monitoring

Sau khi deploy, kiểm tra:

```bash
# 1. Error logs
grep "Keyword must be a single word" logs/app.log

# 2. Worker logs
tail -f logs/matching-worker.log

# 3. Redis keys
redis-cli KEYS "job_alert:keyword:*" | head -10
```

## Support

📚 **Docs đầy đủ:**
- [MATCHING_ALGORITHM.md](./workers/MATCHING_ALGORITHM.md)
- [KEYWORD_SINGLE_WORD_MIGRATION.md](./docs/KEYWORD_SINGLE_WORD_MIGRATION.md)
- [CHANGELOG_KEYWORD_SINGLE_WORD.md](./CHANGELOG_KEYWORD_SINGLE_WORD.md)

🐛 **Nếu gặp lỗi:**
1. Check logs
2. Check Redis/MongoDB
3. Contact team

---

**Status:** ✅ Ready to deploy  
**Breaking Change:** ⚠️ Yes (requires migration)  
**Estimated Time:** ~10 minutes  
**Risk Level:** 🟡 Medium (có rollback plan)
