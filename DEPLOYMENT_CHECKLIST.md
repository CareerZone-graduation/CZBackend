# 📋 Deployment Checklist - Keyword Single Word Update

## Pre-Deployment

### 1. Code Review
- [ ] Review all changed files
- [ ] Run `npm run test` (nếu có tests)
- [ ] Check no syntax errors: `npm run lint` (nếu có)
- [ ] Review migration script logic

### 2. Backup
- [ ] Backup MongoDB database
  ```bash
  mongodump --uri="mongodb://localhost:27017/careerzone" --out=./backup-$(date +%Y%m%d)
  ```
- [ ] Backup Redis (optional)
  ```bash
  redis-cli SAVE
  cp /var/lib/redis/dump.rdb ./backup-redis-$(date +%Y%m%d).rdb
  ```
- [ ] Document current state
  ```bash
  mongo careerzone --eval 'db.jobalertsubscriptions.count()' > pre-migration-stats.txt
  redis-cli DBSIZE >> pre-migration-stats.txt
  ```

### 3. Environment Check
- [ ] Verify MongoDB is running
- [ ] Verify Redis is running
- [ ] Check disk space (migration cần ~10% free space)
- [ ] Check server load (migration tốt nhất khi load thấp)

## Deployment Steps

### Step 1: Deploy Code (5 min)
- [ ] Pull latest code
  ```bash
  git pull origin main
  ```
- [ ] Install dependencies (nếu có)
  ```bash
  npm install
  ```
- [ ] Verify files changed
  ```bash
  git diff HEAD~1 --name-only
  ```

### Step 2: Run Migration (5-10 min)
- [ ] Run migration script
  ```bash
  npm run normalize:keywords
  ```
- [ ] Check migration output
  - [ ] No errors in console
  - [ ] Updated count > 0 (nếu có data cũ)
  - [ ] Skipped count matches single-word keywords
- [ ] Save migration log
  ```bash
  npm run normalize:keywords > migration-log-$(date +%Y%m%d).txt 2>&1
  ```

### Step 3: Verification (5 min)
- [ ] Check MongoDB
  ```bash
  # Không còn keywords với spaces
  mongo careerzone --eval 'db.jobalertsubscriptions.find({ keyword: /\s/ }).count()'
  # Expected: 0
  
  # Tất cả keywords đều lowercase
  mongo careerzone --eval 'db.jobalertsubscriptions.find({ keyword: /[A-Z]/ }).count()'
  # Expected: 0
  ```
- [ ] Check Redis
  ```bash
  # Kiểm tra keys format
  redis-cli KEYS "job_alert:keyword:*" | head -10
  # Tất cả phải là single word, lowercase
  
  # Kiểm tra một key cụ thể
  redis-cli SMEMBERS "job_alert:keyword:nodejs"
  # Phải có userIds
  ```
- [ ] Check logs
  ```bash
  tail -f logs/app.log
  # Không có errors liên quan đến keywords
  ```

### Step 4: Restart Services (2 min)
- [ ] Restart API server
  ```bash
  pm2 restart api-server
  # hoặc
  npm run prod
  ```
- [ ] Restart workers
  ```bash
  pm2 restart matching-worker
  pm2 restart notification-worker
  ```
- [ ] Verify services running
  ```bash
  pm2 status
  ```

## Post-Deployment Testing

### API Testing (10 min)

#### Test 1: Create Valid Subscription
- [ ] Test single word keyword
  ```bash
  curl -X POST http://localhost:3000/api/candidate/job-alerts \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "keyword": "nodejs",
      "location": {"province": "HCM", "district": "Q1"},
      "category": "IT",
      "type": "ALL",
      "workType": "ALL",
      "experience": "ALL",
      "salaryRange": "ALL",
      "frequency": "daily"
    }'
  ```
  **Expected:** 201 Created, keyword saved as "nodejs"

#### Test 2: Create Invalid Subscription (Multiple Words)
- [ ] Test multiple words keyword
  ```bash
  curl -X POST http://localhost:3000/api/candidate/job-alerts \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "keyword": "nodejs developer",
      ...
    }'
  ```
  **Expected:** 400 Bad Request, error message about single word

#### Test 3: Keyword Normalization
- [ ] Test uppercase keyword
  ```bash
  curl -X POST http://localhost:3000/api/candidate/job-alerts \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "keyword": "  NodeJS  ",
      ...
    }'
  ```
  **Expected:** 201 Created, keyword saved as "nodejs" (lowercase, trimmed)

#### Test 4: Update Subscription
- [ ] Update keyword
  ```bash
  curl -X PUT http://localhost:3000/api/candidate/job-alerts/:id \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "keyword": "react"
    }'
  ```
  **Expected:** 200 OK, Redis updated correctly

#### Test 5: Get Subscriptions
- [ ] List user subscriptions
  ```bash
  curl -X GET http://localhost:3000/api/candidate/job-alerts \
    -H "Authorization: Bearer $TOKEN"
  ```
  **Expected:** 200 OK, all keywords are single word + lowercase

### Worker Testing (10 min)

#### Test 1: Create Test Job
- [ ] Create a new job (as recruiter)
  ```bash
  curl -X POST http://localhost:3000/api/recruiter/jobs \
    -H "Authorization: Bearer $RECRUITER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "title": "Senior NodeJS Developer",
      "skills": ["NodeJS", "React", "MongoDB"],
      "description": "Looking for experienced backend developer...",
      ...
    }'
  ```

#### Test 2: Check Matching Worker Logs
- [ ] Monitor matching worker
  ```bash
  tail -f logs/matching-worker.log
  ```
  **Expected output:**
  ```
  Processing job 123: Senior NodeJS Developer
  Matched X users for job 123
  Batch inserted X pending notifications
  ```

#### Test 3: Verify Pending Notifications
- [ ] Check database
  ```bash
  mongo careerzone --eval 'db.pendingnotifications.find().limit(5).pretty()'
  ```
  **Expected:** New notifications created for matched users

### Performance Testing (5 min)

- [ ] Check API response time
  ```bash
  time curl -X GET http://localhost:3000/api/candidate/job-alerts \
    -H "Authorization: Bearer $TOKEN"
  ```
  **Expected:** < 200ms

- [ ] Check worker processing time
  ```bash
  grep "Processing job" logs/matching-worker.log | tail -10
  ```
  **Expected:** Similar or faster than before

- [ ] Check Redis memory usage
  ```bash
  redis-cli INFO memory | grep used_memory_human
  ```
  **Expected:** Similar or less than before

## Monitoring (24 hours)

### Hour 1-2 (Critical)
- [ ] Monitor error logs every 15 minutes
  ```bash
  tail -f logs/app.log | grep -i error
  ```
- [ ] Check API success rate
  ```bash
  grep "POST /api/candidate/job-alerts" logs/access.log | grep -c "201"
  grep "POST /api/candidate/job-alerts" logs/access.log | grep -c "400"
  ```
- [ ] Monitor worker health
  ```bash
  pm2 status
  pm2 logs matching-worker --lines 50
  ```

### Hour 3-8 (Important)
- [ ] Check every hour
- [ ] Monitor user feedback/complaints
- [ ] Check notification delivery rate

### Hour 9-24 (Normal)
- [ ] Check every 4 hours
- [ ] Review daily metrics
- [ ] Collect performance data

## Success Criteria

Migration thành công khi:

- [x] ✅ Không còn keywords với spaces trong DB
- [x] ✅ Tất cả keywords đều lowercase
- [x] ✅ Redis keys đều hợp lệ
- [x] ✅ API validation hoạt động đúng
- [x] ✅ Workers hoạt động bình thường
- [x] ✅ Không có errors trong logs
- [x] ✅ Performance không giảm
- [x] ✅ Users có thể tạo subscriptions mới

## Rollback Triggers

Rollback ngay lập tức nếu:

- ❌ Error rate > 5%
- ❌ API response time tăng > 50%
- ❌ Workers crash liên tục
- ❌ Data corruption detected
- ❌ Critical bugs reported

## Rollback Procedure

### 1. Stop Services
```bash
pm2 stop all
```

### 2. Restore Database
```bash
mongorestore --uri="mongodb://localhost:27017/careerzone" --drop ./backup-YYYYMMDD
```

### 3. Revert Code
```bash
git revert <commit-hash>
git push origin main
```

### 4. Clear Redis
```bash
redis-cli FLUSHDB
```

### 5. Rebuild Redis (if needed)
```bash
node scripts/rebuild-redis-from-mongodb.js
```

### 6. Restart Services
```bash
pm2 restart all
```

### 7. Verify Rollback
```bash
# Check old keywords are back
mongo careerzone --eval 'db.jobalertsubscriptions.findOne()'

# Check services running
pm2 status
```

## Communication

### Before Deployment
- [ ] Notify team about deployment window
- [ ] Prepare rollback plan
- [ ] Have backup contact ready

### During Deployment
- [ ] Update team on progress
- [ ] Report any issues immediately
- [ ] Document unexpected behaviors

### After Deployment
- [ ] Send deployment summary
- [ ] Share metrics/results
- [ ] Document lessons learned

## Notes

- **Best time to deploy:** Low traffic hours (2-4 AM)
- **Estimated downtime:** 0 minutes (zero-downtime deployment)
- **Estimated total time:** 30-40 minutes
- **Risk level:** 🟡 Medium (có rollback plan)
- **Team required:** 1-2 people

## Contact

- **Primary:** [Your Name/Team]
- **Backup:** [Backup Contact]
- **Emergency:** [Emergency Contact]

---

**Deployment Date:** _______________  
**Deployed By:** _______________  
**Status:** ⬜ Success / ⬜ Rollback / ⬜ Partial  
**Notes:** _______________
