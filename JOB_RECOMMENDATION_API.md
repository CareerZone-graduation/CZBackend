# Job Recommendation API Documentation

## Overview

The Job Recommendation System provides personalized job suggestions for candidates based on their profile information including skills, location preferences, salary expectations, and work preferences. The system uses manual filtering algorithms to match candidates with suitable jobs.

## Prerequisites

- Candidate must have a profile with at least 60% completeness
- Profile should include:
  - Skills (minimum 3 recommended)
  - Preferred locations
  - Expected salary range
  - Work preferences (work type, contract type, experience level)

## API Endpoints

### 1. Generate Job Recommendations

Generates fresh job recommendations based on the candidate's current profile.

**Endpoint:** `POST /api/candidate/recommendations/generate`

**Authentication:** Required (JWT Bearer Token)

**Request Body:**
```json
{
  "maxDistance": 50,  // Optional: Maximum distance in km for location matching (default: 50, max: 200)
  "limit": 20         // Optional: Maximum number of recommendations to return (default: 20, max: 100)
}
```

**Response:**
```json
{
  "success": true,
  "message": "Đã tạo 15 gợi ý việc làm phù hợp.",
  "data": {
    "recommendations": [
      {
        "job": {
          "_id": "job_id",
          "title": "Senior Backend Developer",
          "description": "...",
          "location": {
            "province": "Hồ Chí Minh",
            "district": "Quận 1",
            "coordinates": {
              "type": "Point",
              "coordinates": [106.7, 10.8]
            }
          },
          "type": "FULL_TIME",
          "workType": "HYBRID",
          "minSalary": "20000000",
          "maxSalary": "35000000",
          "experience": "MID_LEVEL",
          "skills": ["Node.js", "MongoDB", "Express.js"],
          "deadline": "2025-12-31T00:00:00.000Z"
        },
        "score": 85,
        "reasons": [
          {
            "type": "skill_match",
            "value": "Khớp 3 kỹ năng: Node.js, MongoDB, Express.js",
            "weight": 30
          },
          {
            "type": "location_match",
            "value": "Cách 5.2km từ Hồ Chí Minh",
            "weight": 25
          },
          {
            "type": "salary_match",
            "value": "Mức lương trong khoảng mong muốn",
            "weight": 30
          }
        ]
      }
    ],
    "total": 15,
    "profileCompleteness": 85
  }
}
```

### 2. Get Job Recommendations (Paginated)

Retrieves previously generated recommendations with pagination support.

**Endpoint:** `GET /api/candidate/recommendations`

**Authentication:** Required (JWT Bearer Token)

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 50)
- `refresh` (optional): Set to 'true' to regenerate recommendations before fetching (default: 'false')

**Example Request:**
```
GET /api/candidate/recommendations?page=1&limit=20&refresh=false
```

**Response:**
```json
{
  "success": true,
  "message": "Lấy danh sách gợi ý việc làm thành công.",
  "data": [
    {
      "_id": "job_id",
      "title": "Senior Backend Developer",
      "description": "...",
      "location": {...},
      "type": "FULL_TIME",
      "workType": "HYBRID",
      "minSalary": "20000000",
      "maxSalary": "35000000",
      "recommendationScore": 85,
      "recommendationReasons": [
        {
          "type": "skill_match",
          "value": "Khớp 3 kỹ năng: Node.js, MongoDB, Express.js",
          "weight": 30
        }
      ],
      "recommendedAt": "2025-10-26T10:00:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalItems": 45,
    "limit": 20,
    "hasMore": true
  },
  "lastUpdated": "2025-10-26T10:00:00.000Z"
}
```

## Recommendation Algorithm

The system uses multiple filtering criteria to calculate a match score (0-100):

### 1. Skill Matching (Max 40 points)
- **Exact Match:** 10 points per matching skill
- **Partial Match:** 5 points per partially matching skill
- Compares candidate skills with job required skills

### 2. Location Matching (Max 30 points)
- **Province Match:** 30 points base score
- **District Match:** Additional 20 points
- **Distance-based:** Up to 30 points based on proximity (using Haversine formula)
- Considers all preferred locations and picks the best match

### 3. Salary Matching (Max 30 points)
- **Within Range:** 30 points if job salary is within candidate's expected range
- **Higher Than Expected:** 25 points if job offers more
- **Overlap:** 20 points if there's any salary range overlap

### 4. Work Preferences (Max 40 points)
- **Work Type Match:** 15 points (ON_SITE, REMOTE, HYBRID)
- **Contract Type Match:** 15 points (FULL_TIME, PART_TIME, etc.)
- **Experience Level Match:** 10 points

### Final Score Calculation
The final score is the sum of all matching criteria, capped at 100 points. Jobs are sorted by score in descending order.

## Error Responses

### Profile Not Found
```json
{
  "success": false,
  "message": "Không tìm thấy hồ sơ ứng viên."
}
```

### Insufficient Profile Completeness
```json
{
  "success": false,
  "message": "Hồ sơ chưa đủ 60% để tạo gợi ý việc làm. Vui lòng hoàn thiện hồ sơ."
}
```

### No Matching Jobs
```json
{
  "success": true,
  "message": "Không tìm thấy việc làm phù hợp. Vui lòng cập nhật thông tin hồ sơ hoặc mở rộng tiêu chí.",
  "data": {
    "recommendations": [],
    "total": 0,
    "profileCompleteness": 75
  }
}
```

## Usage Examples

### Example 1: Generate Recommendations with Custom Distance
```bash
curl -X POST https://api.careerzone.com/api/candidate/recommendations/generate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "maxDistance": 30,
    "limit": 10
  }'
```

### Example 2: Get Paginated Recommendations
```bash
curl -X GET "https://api.careerzone.com/api/candidate/recommendations?page=2&limit=15" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Example 3: Refresh and Get Recommendations
```bash
curl -X GET "https://api.careerzone.com/api/candidate/recommendations?refresh=true&limit=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Database Schema

### JobRecommendation Model
```javascript
{
  candidateId: ObjectId,        // Reference to CandidateProfile
  jobId: ObjectId,              // Reference to Job
  score: Number,                // Match score (0-100)
  reasons: [{
    type: String,               // skill_match, location_match, etc.
    value: String,              // Description of the match
    weight: Number              // Contribution to total score
  }],
  generatedAt: Date,            // When recommendation was created
  viewed: Boolean,              // Has candidate viewed this job
  applied: Boolean              // Has candidate applied to this job
}
```

## Performance Considerations

1. **Caching:** Recommendations are stored in the database and reused until refresh is requested
2. **TTL:** Old recommendations are automatically deleted after 30 days
3. **Pagination:** Use pagination to avoid loading too many results at once
4. **Indexing:** Database indexes are optimized for fast queries on candidateId and score

## Best Practices

1. **Generate Once:** Generate recommendations after profile completion or significant updates
2. **Use Pagination:** Fetch recommendations in pages rather than all at once
3. **Refresh Strategically:** Only refresh when profile changes significantly
4. **Monitor Completeness:** Ensure profile is at least 60% complete for best results
5. **Update Profile:** Encourage users to keep their profile updated for better matches

## Future Enhancements

- AI-based recommendation using machine learning
- Collaborative filtering based on similar candidates
- Real-time updates when new matching jobs are posted
- Personalized ranking based on user behavior
- A/B testing for recommendation algorithms
