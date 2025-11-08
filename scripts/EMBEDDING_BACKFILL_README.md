# Embedding Backfill Script

This script generates vector embeddings for candidates and jobs that don't have them yet. It's designed for initial data backfill or catching up on missing embeddings.

## Overview

The script finds all users with `role='candidate'` and active jobs that are missing embeddings, then generates embeddings in batches using the Gemini API.

## Prerequisites

- MongoDB connection configured in `.env` file
- `GEMINI_API_KEY` configured in `.env` file
- Node.js environment with all dependencies installed

## Usage

### Run for Both Candidates and Jobs (Default)

```bash
cd be
node scripts/backfill-embeddings.js
```

### Run for Candidates Only

```bash
cd be
MODE=candidates node scripts/backfill-embeddings.js
```

### Run for Jobs Only

```bash
cd be
MODE=jobs node scripts/backfill-embeddings.js
```

## Configuration

The script uses the following configuration from environment variables:

- `DB_URI` - MongoDB connection string (default: `mongodb://localhost:27017/careerzone2`)
- `GEMINI_API_KEY` - API key for Gemini embedding generation (required)
- `MODE` - Processing mode: `candidates`, `jobs`, or `both` (default: `both`)

### Batch Sizes

The script processes items in batches to respect API rate limits:

- **Candidates**: 3 concurrent requests per batch
- **Jobs**: 5 concurrent requests per batch

These values are configured in the script and can be adjusted if needed.

## What It Does

### For Candidates

1. Finds all users with `role='candidate'` that have:
   - No `embedding` field
   - Empty `embedding` array
   - No `embeddingUpdatedAt` timestamp

2. For each candidate:
   - Extracts text from CandidateProfile (name, bio, skills, experiences, education, etc.)
   - Generates vector embedding using Gemini API
   - Updates User document with embedding and timestamp

3. Processes candidates in batches of 3 with delays between batches

### For Jobs

1. Finds all jobs with `status='ACTIVE'` that have:
   - No `chunks` field
   - Empty `chunks` array
   - No `embeddingsUpdatedAt` timestamp

2. For each job:
   - Extracts text from job fields (title, description, requirements, benefits, skills, etc.)
   - Splits text into chunks if needed
   - Generates vector embeddings for each chunk
   - Updates Job document with chunks and timestamp

3. Processes jobs in batches of 5 with delays between batches

## Output

The script provides detailed console output:

```
🚀 Embedding Backfill Script — Start: 2025-11-09T10:30:00.000Z
📋 Mode: BOTH
🔗 MongoDB: mongodb://***:***@cluster.mongodb.net/careerzone
✅ Connected to MongoDB

🎯 Starting candidate embedding backfill...
🔍 Finding candidates without embeddings...
📊 Found 150 candidates without embeddings
⚡ Processing 150 candidates in batches of 3...
✅ Completed batch 1-3 of 150
...

📈 Candidate Embedding Results:
   ✅ Success: 145
   ❌ Failed: 5

🎯 Starting job embedding backfill...
🔍 Finding active jobs without embeddings...
📊 Found 200 active jobs without embeddings
⚡ Processing 200 jobs in batches of 5...
✅ Completed batch 1-5 of 200
...

📈 Job Embedding Results:
   ✅ Success: 198
   ❌ Failed: 2

============================================================
🎉 BACKFILL COMPLETE!
============================================================

👥 Candidates:
   ✅ Success: 145
   ❌ Failed: 5

💼 Jobs:
   ✅ Success: 198
   ❌ Failed: 2

📊 Total:
   ✅ Success: 343
   ❌ Failed: 7
============================================================
```

## Error Handling

- The script includes retry logic (up to 3 attempts) for API failures
- Failed items are logged with error details
- The script continues processing even if individual items fail
- All errors are logged to the application log file

## Performance Considerations

- **Rate Limiting**: Batches are processed with delays to respect API rate limits
- **Concurrent Processing**: Multiple items are processed concurrently within each batch
- **Memory Usage**: Items are processed in batches to avoid memory issues with large datasets
- **API Costs**: Be aware that generating embeddings for many items will consume API quota

## Monitoring

The script logs progress to:
- Console output (stdout)
- Application log file via Winston logger

Check the logs for:
- Success/failure counts
- Error details for failed items
- Processing timestamps
- API response times

## Troubleshooting

### "Missing MONGODB_URI or GEMINI_API_KEY"

Ensure your `.env` file contains:
```
DB_URI=mongodb://...
GEMINI_API_KEY=your_api_key_here
```

### High Failure Rate

- Check API key validity
- Verify network connectivity
- Check API rate limits
- Review error messages in logs

### Slow Processing

- Adjust batch sizes in the script
- Check network latency
- Verify API response times

## Re-running the Script

The script is safe to re-run multiple times. It only processes items that are missing embeddings, so items that already have embeddings will be skipped.

## Related Files

- `be/src/services/embedding.service.js` - Core embedding generation logic
- `be/src/watchers/candidateEmbedding.watcher.js` - Automatic embedding generation for new/updated profiles
- `be/scripts/update-job-embeddings.js` - Alternative job embedding script

## Requirements Reference

This script implements requirements:
- **2.5**: Batch embedding generation with rate limiting
- **3.4**: Automatic embedding generation for profile changes
- **7.4**: Admin tools for embedding management
