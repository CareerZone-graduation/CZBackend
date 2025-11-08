# Testing the Embedding Backfill Script

## Pre-Test Checklist

Before running the backfill script, verify:

1. **Environment Variables**
   ```bash
   # Check .env file contains:
   DB_URI=mongodb://...
   GEMINI_API_KEY=your_key_here
   ```

2. **Database Connection**
   ```bash
   # Test MongoDB connection
   mongosh "your_connection_string"
   ```

3. **Check Current State**
   ```javascript
   // In MongoDB shell - count items needing embeddings
   
   // Candidates without embeddings
   db.users.countDocuments({
     role: 'candidate',
     $or: [
       { embedding: { $exists: false } },
       { embedding: { $size: 0 } },
       { embeddingUpdatedAt: { $exists: false } }
     ]
   })
   
   // Jobs without embeddings
   db.jobs.countDocuments({
     status: 'ACTIVE',
     $or: [
       { chunks: { $exists: false } },
       { chunks: { $size: 0 } },
       { embeddingsUpdatedAt: { $exists: false } }
     ]
   })
   ```

## Test Scenarios

### Test 1: Dry Run (Check What Would Be Processed)

Before running the actual script, check what would be processed:

```javascript
// In MongoDB shell
// This shows sample candidates that would be processed
db.users.find({
  role: 'candidate',
  $or: [
    { embedding: { $exists: false } },
    { embedding: { $size: 0 } }
  ]
}).limit(5).pretty()

// This shows sample jobs that would be processed
db.jobs.find({
  status: 'ACTIVE',
  $or: [
    { chunks: { $exists: false } },
    { chunks: { $size: 0 } }
  ]
}).limit(5).pretty()
```

### Test 2: Small Batch Test (Candidates Only)

Test with a small number of candidates first:

```bash
# Temporarily modify the script to limit processing
# Or manually set a limit in MongoDB query

cd be
MODE=candidates node scripts/backfill-embeddings.js
```

**Expected Output:**
```
🚀 Embedding Backfill Script — Start: ...
📋 Mode: CANDIDATES
✅ Connected to MongoDB
🎯 Starting candidate embedding backfill...
🔍 Finding candidates without embeddings...
📊 Found X candidates without embeddings
⚡ Processing X candidates in batches of 3...
...
📈 Candidate Embedding Results:
   ✅ Success: X
   ❌ Failed: 0
```

**Verify:**
```javascript
// Check that embeddings were created
db.users.find({
  role: 'candidate',
  embedding: { $exists: true, $ne: [] }
}).limit(5).forEach(user => {
  print(`User ${user._id}: embedding length = ${user.embedding.length}`);
  print(`  embeddingUpdatedAt: ${user.embeddingUpdatedAt}`);
})
```

### Test 3: Small Batch Test (Jobs Only)

Test with a small number of jobs:

```bash
cd be
MODE=jobs node scripts/backfill-embeddings.js
```

**Expected Output:**
```
🚀 Embedding Backfill Script — Start: ...
📋 Mode: JOBS
✅ Connected to MongoDB
🎯 Starting job embedding backfill...
🔍 Finding active jobs without embeddings...
📊 Found X active jobs without embeddings
⚡ Processing X jobs in batches of 5...
...
📈 Job Embedding Results:
   ✅ Success: X
   ❌ Failed: 0
```

**Verify:**
```javascript
// Check that job embeddings were created
db.jobs.find({
  status: 'ACTIVE',
  chunks: { $exists: true, $ne: [] }
}).limit(5).forEach(job => {
  print(`Job ${job._id}: ${job.chunks.length} chunks`);
  print(`  embeddingsUpdatedAt: ${job.embeddingsUpdatedAt}`);
  print(`  First chunk embedding length: ${job.chunks[0].embedding.length}`);
})
```

### Test 4: Full Run (Both Candidates and Jobs)

After successful small batch tests, run the full backfill:

```bash
cd be
node scripts/backfill-embeddings.js
```

**Monitor:**
- Watch console output for progress
- Check for any error messages
- Note success/failure counts

### Test 5: Idempotency Test

Run the script again to verify it skips items that already have embeddings:

```bash
cd be
node scripts/backfill-embeddings.js
```

**Expected Output:**
```
🔍 Finding candidates without embeddings...
📊 Found 0 candidates without embeddings
✅ No candidates need embedding generation

🔍 Finding active jobs without embeddings...
📊 Found 0 active jobs without embeddings
✅ No jobs need embedding generation
```

## Verification Queries

### Check Embedding Quality

```javascript
// Verify embedding dimensions (should be 768 for Gemini)
db.users.findOne({
  role: 'candidate',
  embedding: { $exists: true, $ne: [] }
}, { embedding: 1 }).embedding.length

// Should return: 768

// Check job chunk embeddings
db.jobs.findOne({
  chunks: { $exists: true, $ne: [] }
}, { chunks: 1 }).chunks[0].embedding.length

// Should return: 768
```

### Check Coverage

```javascript
// Total candidates
const totalCandidates = db.users.countDocuments({ role: 'candidate' })

// Candidates with embeddings
const candidatesWithEmbeddings = db.users.countDocuments({
  role: 'candidate',
  embedding: { $exists: true, $ne: [] }
})

// Coverage percentage
print(`Candidate embedding coverage: ${(candidatesWithEmbeddings / totalCandidates * 100).toFixed(2)}%`)

// Total active jobs
const totalJobs = db.jobs.countDocuments({ status: 'ACTIVE' })

// Jobs with embeddings
const jobsWithEmbeddings = db.jobs.countDocuments({
  status: 'ACTIVE',
  chunks: { $exists: true, $ne: [] }
})

// Coverage percentage
print(`Job embedding coverage: ${(jobsWithEmbeddings / totalJobs * 100).toFixed(2)}%`)
```

### Check Recent Updates

```javascript
// Candidates updated in last hour
db.users.find({
  role: 'candidate',
  embeddingUpdatedAt: { $gte: new Date(Date.now() - 3600000) }
}).count()

// Jobs updated in last hour
db.jobs.find({
  status: 'ACTIVE',
  embeddingsUpdatedAt: { $gte: new Date(Date.now() - 3600000) }
}).count()
```

## Troubleshooting

### Issue: "Missing MONGODB_URI or GEMINI_API_KEY"

**Solution:**
```bash
# Check .env file exists
ls -la be/.env

# Verify contents
cat be/.env | grep -E "DB_URI|GEMINI_API_KEY"
```

### Issue: High Failure Rate

**Check:**
1. API key validity
2. Network connectivity
3. MongoDB connection
4. API rate limits

**Debug:**
```bash
# Run with more verbose logging
cd be
NODE_ENV=development node scripts/backfill-embeddings.js
```

### Issue: Script Hangs

**Possible Causes:**
- Network timeout
- MongoDB connection lost
- API rate limiting

**Solution:**
- Check network connectivity
- Restart script
- Reduce batch sizes in script

## Performance Benchmarks

Expected performance (approximate):

| Items | Estimated Time | API Calls |
|-------|---------------|-----------|
| 100 candidates | 3-5 minutes | ~100 |
| 100 jobs | 5-8 minutes | ~150-200 |
| 1000 candidates | 30-40 minutes | ~1000 |
| 1000 jobs | 40-60 minutes | ~1500-2000 |

## Post-Test Validation

After successful backfill:

1. **Test Recommendation API**
   ```bash
   # Test the suggestions endpoint
   curl -X GET "http://localhost:5000/api/v1/employers/jobs/{jobId}/suggestions" \
     -H "Authorization: Bearer {token}"
   ```

2. **Verify Frontend Integration**
   - Open recruiter dashboard
   - Navigate to a job detail page
   - Check if candidate suggestions appear

3. **Monitor Change Stream**
   - Create a new candidate profile
   - Verify embedding is generated automatically
   - Check logs for change stream activity

## Cleanup (If Needed)

To remove all embeddings and start over:

```javascript
// WARNING: This removes all embeddings!
// Only use for testing purposes

// Remove candidate embeddings
db.users.updateMany(
  { role: 'candidate' },
  { 
    $unset: { 
      embedding: "",
      embeddingUpdatedAt: ""
    }
  }
)

// Remove job embeddings
db.jobs.updateMany(
  { status: 'ACTIVE' },
  {
    $unset: {
      chunks: "",
      embeddingsUpdatedAt: ""
    }
  }
)
```

## Success Criteria

The backfill is successful when:

- ✅ Script completes without fatal errors
- ✅ Success rate > 95%
- ✅ All embeddings have correct dimensions (768)
- ✅ embeddingUpdatedAt timestamps are set
- ✅ Re-running script finds 0 items to process
- ✅ Recommendation API returns results
- ✅ Frontend displays candidate suggestions
