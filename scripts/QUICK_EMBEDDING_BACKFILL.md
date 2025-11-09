# Quick Start: Embedding Backfill

## TL;DR

Generate embeddings for all candidates and jobs that don't have them:

```bash
cd be
node scripts/backfill-embeddings.js
```

## Common Use Cases

### 1. Initial Setup (First Time)
After deploying the AI recommendation feature, run this to generate embeddings for all existing data:

```bash
cd be
node scripts/backfill-embeddings.js
```

### 2. Candidates Only
If you only need to update candidate embeddings:

```bash
cd be
MODE=candidates node scripts/backfill-embeddings.js
```

### 3. Jobs Only
If you only need to update job embeddings:

```bash
cd be
MODE=jobs node scripts/backfill-embeddings.js
```

### 4. Check What Needs Processing
To see how many items need embeddings without processing them:

```javascript
// In MongoDB shell or Compass
db.users.countDocuments({
  role: 'candidate',
  $or: [
    { embedding: { $exists: false } },
    { embedding: { $size: 0 } }
  ]
})

db.jobs.countDocuments({
  status: 'ACTIVE',
  $or: [
    { chunks: { $exists: false } },
    { chunks: { $size: 0 } }
  ]
})
```

## Expected Runtime

- **Candidates**: ~1-2 seconds per candidate (including API calls and delays)
- **Jobs**: ~2-3 seconds per job (may have multiple chunks)

For 1000 candidates + 500 jobs:
- Estimated time: 30-45 minutes
- API calls: ~1500-2000 requests

## Monitoring Progress

The script outputs progress in real-time:

```
⚡ Processing 150 candidates in batches of 3...
✅ Completed batch 1-3 of 150
✅ Completed batch 4-6 of 150
...
```

## After Running

Verify embeddings were created:

```javascript
// Check candidates with embeddings
db.users.countDocuments({
  role: 'candidate',
  embedding: { $exists: true, $ne: [] }
})

// Check jobs with embeddings
db.jobs.countDocuments({
  status: 'ACTIVE',
  chunks: { $exists: true, $ne: [] }
})
```

## Troubleshooting

**Script fails immediately:**
- Check `.env` file has `DB_URI` and `GEMINI_API_KEY`
- Verify MongoDB is accessible

**High failure rate:**
- Check API key is valid
- Verify network connectivity
- Check Gemini API quota/limits

**Script is slow:**
- This is normal - API calls take time
- Don't interrupt the process
- Consider running in background: `nohup node scripts/backfill-embeddings.js &`

## Safety

✅ Safe to run multiple times (skips items that already have embeddings)
✅ Safe to interrupt (no data corruption, just incomplete processing)
✅ Safe to run in production (read-only queries, only updates missing data)

## Next Steps

After running the backfill:
1. Verify embeddings were created (see "After Running" above)
2. Test the recommendation API endpoint
3. Check the frontend displays suggestions correctly
4. Monitor the change stream watcher for automatic updates

For more details, see `EMBEDDING_BACKFILL_README.md`
