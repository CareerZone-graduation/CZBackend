# Embedding Implementation Guide

## Overview

This implementation replaces the mock `generateQueryEmbedding` function with a real embedding generation system using Google's Gemini API. The system now supports both query embeddings for search and job content embeddings for vector search.

## What Was Implemented

### 1. Core Embedding Utility (`src/utils/embedding.js`)

- **`generateEmbedding(text)`**: Core function that calls Google Gemini API
- **`generateEmbeddingWithRetry(text, maxRetries)`**: Wrapper with retry logic and exponential backoff
- Proper error handling and logging
- Input validation and API response validation

### 2. Updated Job Service (`src/services/job.service.js`)

- Replaced mock `generateQueryEmbedding` with real implementation
- Now uses `generateEmbeddingWithRetry` from the utility module
- Proper error handling that throws user-friendly messages

### 3. Embedding Service (`src/services/embedding.service.js`)

- **`generateJobEmbeddings(jobId)`**: Generate embeddings for a specific job
- **`batchGenerateJobEmbeddings(jobIds, batchSize)`**: Process multiple jobs in batches
- **`regenerateOutdatedEmbeddings(daysOld)`**: Update old or missing embeddings
- Text chunking functionality for large job descriptions
- Batch processing with rate limiting

## Configuration

The system uses the existing `GEMINI_API_KEY` environment variable:

```env
GEMINI_API_KEY=AIzaSyBdnVWz42Suep-oi-PD800A0hSsZL201u8
```

## API Details

### Google Gemini Embedding API
- **Model**: `gemini-embedding-001`
- **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent`
- **Embedding Dimension**: 3072
- **Input**: Text string
- **Output**: Array of 3072 floating-point numbers

## Usage Examples

### 1. Query Embedding (Automatic)
```javascript
// This is now automatically used in hybrid search
const results = await hybridSearchJobs({
  query: "Software Engineer JavaScript React",
  page: 1,
  size: 10
});
```

### 2. Generate Job Embeddings
```javascript
import { generateJobEmbeddings } from './src/services/embedding.service.js';

// Generate embeddings for a specific job
await generateJobEmbeddings(jobId);
```

### 3. Batch Processing
```javascript
import { batchGenerateJobEmbeddings } from './src/services/embedding.service.js';

// Process multiple jobs
const jobIds = ['job1', 'job2', 'job3'];
const results = await batchGenerateJobEmbeddings(jobIds, 5);
console.log(`Success: ${results.success}, Failed: ${results.failed}`);
```

### 4. Update Outdated Embeddings
```javascript
import { regenerateOutdatedEmbeddings } from './src/services/embedding.service.js';

// Update embeddings older than 7 days
const results = await regenerateOutdatedEmbeddings(7);
```

## Error Handling

The system includes comprehensive error handling:

1. **API Errors**: Network issues, invalid API keys, rate limits
2. **Input Validation**: Empty text, invalid parameters
3. **Retry Logic**: Exponential backoff for transient failures
4. **Graceful Degradation**: User-friendly error messages

## Performance Considerations

1. **Rate Limiting**: Built-in delays between batch requests
2. **Chunking**: Large job descriptions are split into manageable chunks
3. **Caching**: Embeddings are stored in the database to avoid regeneration
4. **Batch Processing**: Multiple jobs processed concurrently with configurable batch size

## Database Schema

The Job model already includes the necessary fields:

```javascript
chunks: [{
  jobId: String,
  chunkIndex: Number,
  text: String,
  embedding: [Number] // 3072-dimensional vector
}],
embeddingsUpdatedAt: Date
```

## Integration Points

### Current Integration
- **Hybrid Search**: `hybridSearchJobs()` function now uses real embeddings
- **Vector Search**: MongoDB Atlas vector search on `chunks.embedding` field

### Future Integration Opportunities
- **Job Creation**: Automatically generate embeddings when jobs are created
- **Job Updates**: Regenerate embeddings when job content changes
- **Background Workers**: Process embedding generation asynchronously
- **Kafka Events**: Handle `JOB_CREATED` events to trigger embedding generation

## Testing

The implementation has been tested with:
- Real API calls to Google Gemini
- Retry functionality
- Error handling scenarios
- Embedding consistency verification

## Next Steps

1. **Automatic Embedding Generation**: Add embedding generation to job creation/update workflows
2. **Background Processing**: Implement Kafka event handlers for async embedding generation
3. **Monitoring**: Add metrics for embedding generation success/failure rates
4. **Optimization**: Implement embedding caching and deduplication strategies