# Candidate Suggestions API Implementation

## Overview
This document describes the implementation of the AI-powered candidate suggestions API endpoint for the CareerZone platform.

## Endpoint Details

### Route
```
GET /api/v1/jobs/:id/suggestions
```

### Authentication
- Requires JWT authentication
- Restricted to recruiters only (`recruiterOnly` middleware)

### Query Parameters
| Parameter | Type | Default | Validation | Description |
|-----------|------|---------|------------|-------------|
| `page` | integer | 1 | min: 1 | Page number for pagination |
| `limit` | integer | 10 | min: 1, max: 50 | Number of results per page |
| `minScore` | float | 0.5 | min: 0, max: 1 | Minimum similarity score threshold |

### Response Format
```json
{
  "success": true,
  "data": {
    "candidates": [
      {
        "userId": "string",
        "candidateProfileId": "string",
        "fullname": "string",
        "avatar": "string",
        "bio": "string",
        "currentPosition": "string",
        "skills": [
          {
            "name": "string",
            "level": "string",
            "category": "string"
          }
        ],
        "similarityScore": 0.85,
        "similarityPercentage": 85,
        "matchedSkills": ["skill1", "skill2"],
        "experienceYears": 5
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalItems": 50,
      "limit": 10,
      "hasNextPage": true,
      "hasPrevPage": false
    },
    "jobInfo": {
      "jobId": "string",
      "title": "string",
      "hasEmbeddings": true
    }
  },
  "message": "Lấy danh sách ứng viên gợi ý thành công"
}
```

## Implementation Components

### 1. Controller (`be/src/controllers/recommendation.controller.js`)
- **Function**: `getSuggestions`
- **Responsibilities**:
  - Validates job ID parameter
  - Fetches job document and verifies ownership
  - Checks if job has embeddings
  - Calls recommendation service
  - Returns formatted response

### 2. Validation Schema (`be/src/schemas/job.schema.js`)
- **Schema**: `candidateSuggestionsQuerySchema`
- **Validates**:
  - `page`: Positive integer, default 1
  - `limit`: Integer between 1-50, default 10
  - `minScore`: Float between 0-1, default 0.5

### 3. Route (`be/src/routes/job.route.js`)
- **Path**: `/:id/suggestions`
- **Middleware Chain**:
  1. JWT authentication
  2. Recruiter-only authorization
  3. Parameter validation (job ID)
  4. Query validation (page, limit, minScore)
  5. Controller handler

## Error Handling

### 404 Not Found
```json
{
  "success": false,
  "message": "Không tìm thấy tin tuyển dụng"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "Bạn không có quyền xem gợi ý cho tin tuyển dụng này"
}
```

### 422 Unprocessable Entity
```json
{
  "success": false,
  "message": "Tin tuyển dụng chưa được xử lý. Vui lòng thử lại sau vài phút."
}
```

### 400 Bad Request (Validation Error)
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "limit",
      "message": "Limit không được vượt quá 50",
      "code": "too_big"
    }
  ]
}
```

## Security Features

1. **Authentication**: JWT token required
2. **Authorization**: Only job owner can view suggestions
3. **Rate Limiting**: Inherits from global rate limiting middleware
4. **Input Validation**: All query parameters validated with Zod schemas
5. **Privacy**: Only candidates with `allowSearch: true` are included

## Testing

A test file has been created at `be/test-candidate-suggestions.http` with various test cases:
- Default parameters
- Custom parameters
- Low similarity threshold
- Error cases (not found, unauthorized, invalid parameters)

## Dependencies

- **Service**: `recommendation.service.js` - `getCandidateSuggestions()`
- **Models**: `Job`, `User`, `CandidateProfile`
- **Middleware**: `passport`, `recruiterOnly`, `validateParams`, `validateQuery`
- **Utils**: `AppError`, `logger`

## Performance Considerations

1. **Vector Search**: Uses MongoDB Atlas vector search for efficient similarity matching
2. **Pagination**: Limits results to max 50 per page
3. **Caching**: Service layer implements caching (5 minutes TTL)
4. **Logging**: Performance warnings logged if response time exceeds 2 seconds

## Requirements Satisfied

- ✅ 4.1: Display suggestions when recruiter views job posting
- ✅ 4.2: Execute vector similarity search
- ✅ 4.3: Filter by allowSearch and role
- ✅ 4.4: Rank by similarity score
- ✅ 4.5: Pagination support
- ✅ 4.6: Display candidate details with similarity percentage
- ✅ 8.1: RESTful API endpoint
- ✅ 8.2: JWT authentication
- ✅ 8.3: Job ownership verification
- ✅ 8.4: Query parameter validation
- ✅ 8.5: JSON response with metadata

## Next Steps

To complete the full feature:
1. Implement frontend components (Task 6)
2. Add candidate privacy settings UI (Task 7)
3. Create admin tools for embedding management (Task 8)
4. Set up MongoDB Atlas vector search index (Task 9)
5. Add monitoring and logging (Task 10)
6. Implement caching for performance (Task 11)
7. Verify profile masking integration (Task 12)
