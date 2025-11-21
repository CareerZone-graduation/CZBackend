# Thuật Toán Job Matching - Chi Tiết Kỹ Thuật

## Tổng Quan Kiến Trúc

Hệ thống matching sử dụng kết hợp **MongoDB Change Streams**, **Redis**, và **MongoDB queries** để thực hiện matching real-time với hiệu suất cao.

```
┌─────────────────┐
│   Job Created   │ (MongoDB Insert)
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│  MongoDB Change Stream  │ (Lắng nghe real-time)
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Extract Keywords       │ (Title, Skills, Description)
│  ["nodejs", "react"]    │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Query Redis Sets       │ (O(1) lookup)
│  job_alert:keyword:*    │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Get Matched User IDs   │ (Redis SUNION)
│  [userId1, userId2...]  │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Query MongoDB          │ (Batch query)
│  JobAlertSubscription   │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Filter & Score         │ (In-memory)
│  Calculate Relevance    │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Create Notifications   │ (Batch insert)
│  PendingNotification    │
└─────────────────────────┘
```

---

## Bước 1: Lắng Nghe Database Changes (MongoDB Change Streams)

### Code:
```javascript
const changeStream = Job.watch([
    {
        $match: {
            operationType: 'insert',
            'fullDocument.moderationStatus': 'APPROVED',
            'fullDocument.status': 'ACTIVE'
        }
    }
], {
    fullDocument: 'updateLookup'
});
```

### Cách Hoạt Động:
- **Change Stream** là tính năng của MongoDB Replica Set
- Lắng nghe mọi thay đổi trên collection `Job` theo thời gian thực
- Chỉ xử lý các job mới được insert (`operationType: 'insert'`)
- Filter ngay tại database level: chỉ lấy job `APPROVED` và `ACTIVE`
- `fullDocument: 'updateLookup'` đảm bảo nhận được toàn bộ document

### Ưu Điểm:
✅ Real-time: Phản ứng ngay lập tức khi có job mới  
✅ Reliable: MongoDB đảm bảo không bỏ sót event  
✅ Efficient: Filter tại database, giảm network traffic  
✅ Scalable: Có thể có nhiều worker cùng lắng nghe  

---

## Bước 2: Trích Xuất Keywords từ Job

### Code:
```javascript
const jobKeywords = [
    ...job.title.toLowerCase().split(/\s+/),
    ...(job.skills || []).map(s => s.toLowerCase()),
    ...(job.description || '').toLowerCase().split(/\s+/).slice(0, 10)
].filter((keyword, index, self) => 
    keyword.length > 2 && self.indexOf(keyword) === index
);
```

### Ví Dụ:
**Input Job:**
```json
{
  "title": "Senior NodeJS Developer",
  "skills": ["NodeJS", "React", "MongoDB"],
  "description": "We are looking for experienced backend developer..."
}
```

**Output Keywords:**
```javascript
[
  "senior", "nodejs", "developer",  // từ title
  "react", "mongodb",                // từ skills
  "looking", "experienced", "backend" // từ description (10 từ đầu)
]
```

### Logic:
1. **Tách từ**: Split theo whitespace (`\s+`)
2. **Lowercase**: Chuẩn hóa về chữ thường
3. **Filter ngắn**: Loại bỏ từ < 3 ký tự (như "we", "is", "a")
4. **Deduplicate**: Loại bỏ từ trùng lặp
5. **Limit description**: Chỉ lấy 10 từ đầu để tránh quá nhiều keywords

---

## Bước 3: Query Redis để Tìm Matched Users (QUAN TRỌNG!)

### Cấu Trúc Redis:

#### 3.1. Keyword Mapping (Redis Sets)
```
Key: job_alert:keyword:nodejs
Type: SET
Value: [userId1, userId2, userId3, ...]

Key: job_alert:keyword:react
Type: SET
Value: [userId2, userId4, userId5, ...]

Key: job_alert:keyword:mongodb
Type: SET
Value: [userId1, userId3, userId6, ...]
```

#### 3.2. Cách Redis Sets Được Populate

**Khi user tạo subscription:**
```javascript
// File: be/src/services/jobAlert.service.js

// Input từ user
const userInput = {
    keyword: "NodeJS",  // User nhập (có thể uppercase, có spaces...)
    location: { province: "HCM", district: "Q1" },
    // ... other filters
};

// Normalize keyword: trim, lowercase, validate single word
const normalizedData = {
    ...userInput,
    keyword: userInput.keyword.trim().toLowerCase()  // "nodejs"
};

// Validation tại Model level
// - Kiểm tra chỉ có 1 từ (không có khoảng trắng)
// - Tự động lowercase
const subscription = await JobAlertSubscription.create({
    ...normalizedData,
    candidateId: userId
});

// Thêm userId vào Redis Set cho keyword "nodejs"
await redisClient.sAdd(
    RedisKeys.getKeywordKey(subscription.keyword),  // "job_alert:keyword:nodejs"
    userId.toString()
);
```

**Validation Rules:**
```javascript
// Model: be/src/models/JobAlertSubscription.js
keyword: {
    type: String,
    trim: true,
    lowercase: true,  // ← Tự động lowercase
    validate: {
        validator: function(value) {
            // Chỉ cho phép 1 từ
            return value && value.trim().split(/\s+/).length === 1;
        },
        message: 'Keyword must be a single word without spaces'
    }
}

// Schema: be/src/schemas/jobAlert.schema.js
keyword: z.string()
    .min(1, 'Từ khóa không được để trống')
    .max(50, 'Từ khóa không được vượt quá 50 ký tự')
    .refine(
        (val) => val.trim().split(/\s+/).length === 1,
        'Từ khóa chỉ được phép là 1 từ duy nhất'
    )
    .transform((val) => val.trim().toLowerCase())
```

**Khi user update subscription:**
```javascript
// Nếu đổi keyword từ "nodejs" sang "react"
const multi = redisClient.multi();
multi.sRem('job_alert:keyword:nodejs', userId);  // Xóa khỏi set cũ
multi.sAdd('job_alert:keyword:react', userId);   // Thêm vào set mới
await multi.exec();
```

**Khi user delete subscription:**
```javascript
await redisClient.sRem('job_alert:keyword:nodejs', userId);
```

### 3.3. Query Redis với SUNION

```javascript
const redisKeys = jobKeywords.map(x => RedisKeys.getKeywordKey(x));
// ["job_alert:keyword:nodejs", "job_alert:keyword:react", "job_alert:keyword:mongodb"]

const matchedUserIds = await redisClient.sUnion(redisKeys);
// Kết quả: [userId1, userId2, userId3, userId4, userId5, userId6]
```

### Giải Thích SUNION:
- **SUNION** = Set Union (Hợp của các tập hợp)
- Lấy tất cả userId xuất hiện trong BẤT KỲ set nào
- Tự động loại bỏ duplicate

**Ví dụ:**
```
Set A (nodejs):  [user1, user2, user3]
Set B (react):   [user2, user4, user5]
Set C (mongodb): [user1, user3, user6]

SUNION(A, B, C) = [user1, user2, user3, user4, user5, user6]
```

### Tại Sao Dùng Redis?

| Phương Pháp | Độ Phức Tạp | Giải Thích |
|-------------|-------------|------------|
| **MongoDB Query** | O(n) | Phải scan toàn bộ subscriptions, filter theo keyword |
| **Redis Sets** | O(k) | k = số keywords, lookup O(1) cho mỗi set |

**Ví dụ thực tế:**
- 100,000 subscriptions trong MongoDB
- 5 keywords từ job
- MongoDB: Phải scan 100,000 documents → **chậm**
- Redis: Lookup 5 sets, mỗi set ~1000 users → **nhanh**

---

## Bước 4: Query MongoDB để Lấy Chi Tiết Subscriptions

```javascript
const allSubscriptions = await JobAlertSubscription.find({
    candidateId: { $in: allMatchedUserIds },  // Chỉ query users đã match
    active: true
}).lean();
```

### Tại Sao Cần Bước Này?
- Redis chỉ lưu **userId** (lightweight)
- Cần lấy **chi tiết subscription** từ MongoDB:
  - Location filters (province, district, commune)
  - Salary range
  - Job type, work type, experience
  - Category

### Optimization:
- Dùng `$in` operator → MongoDB query hiệu quả với index
- `.lean()` → Trả về plain JavaScript object (nhanh hơn Mongoose document)

---

## Bước 5: Filter & Scoring (In-Memory Processing)

### 5.1. Group Subscriptions by User
```javascript
const subsByUser = allSubscriptions.reduce((acc, sub) => {
    const userId = sub.candidateId.toString();
    if (!acc[userId]) acc[userId] = [];
    acc[userId].push(sub);
    return acc;
}, {});

// Kết quả:
// {
//   "user1": [subscription1, subscription2],
//   "user2": [subscription3],
//   ...
// }
```

**Tại sao?** Một user có thể có nhiều subscriptions với keywords khác nhau.

### 5.2. Filter: matchJobWithSubscription()

```javascript
const matchJobWithSubscription = (job, subscription) => {
    // 1. Salary matching
    const salaryMatch = (subRange) => {
        if (subRange === 'ALL') return true;
        const min = parseFloat(job.minSalary || '0');
        const max = parseFloat(job.maxSalary || '999999999');
        const ranges = {
            'UNDER_10M': max < 10000000,
            '10M_20M': min >= 10000000 && max <= 20000000,
            '20M_30M': min >= 20000000 && max <= 30000000,
            'OVER_30M': min > 30000000,
        };
        return ranges[subRange] || false;
    };

    // 2. Location matching (3 levels)
    const provinceMatch = subscription.location.province === 'ALL' || 
                          subscription.location.province === job.location.province;
    const districtMatch = !subscription.location.district || 
                          subscription.location.district === 'ALL' || 
                          subscription.location.district === job.location.district;
    const communeMatch = !subscription.location.commune || 
                         subscription.location.commune === job.location.commune;
    
    // 3. Category matching
    const categoryMatch = subscription.category === 'ALL' || 
                          subscription.category === job.category;
    
    // 4. Combine all filters (AND logic)
    return (
        provinceMatch &&
        districtMatch &&
        communeMatch &&
        categoryMatch &&
        (subscription.type === 'ALL' || subscription.type === job.type) &&
        (subscription.workType === 'ALL' || subscription.workType === job.workType) &&
        (subscription.experience === 'ALL' || subscription.experience === job.experience) &&
        salaryMatch(subscription.salaryRange)
    );
};
```

**Ví dụ:**
```javascript
Job: {
  location: { province: "HCM", district: "Q1", commune: "P.Bến Nghé" },
  category: "IT",
  type: "FULL_TIME",
  workType: "REMOTE",
  experience: "MID_LEVEL",
  minSalary: 15000000,
  maxSalary: 25000000
}

Subscription: {
  location: { province: "HCM", district: "ALL" },
  category: "IT",
  type: "ALL",
  workType: "REMOTE",
  experience: "ALL",
  salaryRange: "10M_20M"
}

Result: ✅ MATCH (tất cả điều kiện đều thỏa mãn)
```

### 5.3. Scoring: calculateJobRelevanceScore()

```javascript
const calculateJobRelevanceScore = async (job, subscription) => {
    let baseScore = 0;
    
    // 1. Keyword matching (0-40 points)
    const keywordInTitle = job.title.toLowerCase()
        .includes(subscription.keyword.toLowerCase());
    const keywordInSkills = job.skills?.some(skill => 
        skill.toLowerCase().includes(subscription.keyword.toLowerCase())
    );
    const keywordInDescription = job.description?.toLowerCase()
        .includes(subscription.keyword.toLowerCase());
    
    if (keywordInTitle) baseScore += 20;       // Quan trọng nhất
    if (keywordInSkills) baseScore += 15;      // Quan trọng thứ 2
    if (keywordInDescription) baseScore += 5;  // Ít quan trọng nhất
    
    // 2. Filter matching (0-30 points)
    if (matchJobWithSubscription(job, subscription)) {
        baseScore += 30;  // Bonus lớn nếu match tất cả filters
    } else {
        return 0;  // Không match filters → score = 0
    }
    
    // 3. Category exact match bonus (0-10 points)
    if (subscription.category !== 'ALL' && 
        subscription.category === job.category) {
        baseScore += 10;  // Bonus nếu category khớp chính xác
    }
    
    return Math.round(baseScore);  // Max: 70 points
};
```

**Bảng Điểm:**
| Tiêu Chí | Điểm | Giải Thích |
|----------|------|------------|
| Keyword in Title | 20 | Keyword xuất hiện trong tiêu đề job |
| Keyword in Skills | 15 | Keyword xuất hiện trong danh sách skills |
| Keyword in Description | 5 | Keyword xuất hiện trong mô tả |
| All Filters Match | 30 | Location, salary, type, experience đều khớp |
| Category Exact Match | 10 | Category khớp chính xác (không phải "ALL") |
| **TỔNG** | **70** | Điểm tối đa |

**Ví dụ:**
```javascript
Job: {
  title: "Senior NodeJS Developer",
  skills: ["NodeJS", "React"],
  description: "Looking for NodeJS expert...",
  category: "IT",
  // ... other fields match subscription
}

Subscription: {
  keyword: "nodejs",
  category: "IT"
}

Score Calculation:
- Keyword "nodejs" in title: +20
- Keyword "nodejs" in skills: +15
- Keyword "nodejs" in description: +5
- All filters match: +30
- Category exact match: +10
Total: 80 points (nhưng max là 70, nên = 70)
```

### 5.4. Chọn Best Subscription cho Mỗi User

```javascript
for (const subscription of userSubscriptions) {
    if (matchJobWithSubscription(job, subscription)) {
        const score = await calculateJobRelevanceScore(job, subscription);
        
        if (score > 30) {  // Threshold: phải > 30 mới được coi là match
            allMatchingSubs.push(subscription);
            if (score > bestScore) {
                bestScore = score;
                bestSubscription = subscription;  // Lưu subscription có điểm cao nhất
            }
        }
    }
}
```

**Tại sao threshold = 30?**
- 30 điểm = điểm của "All Filters Match"
- Đảm bảo job ít nhất phải match các filters cơ bản
- Tránh spam notifications với relevance thấp

---

## Bước 6: Duplicate Prevention (Redis Cache)

### 6.1. Check Duplicate
```javascript
const isDuplicateNotification = async (userId, jobId) => {
    const duplicateKey = RedisKeys.getDuplicateJobKey(userId, jobId);
    // Key: "job_alert:sent:userId:jobId"
    const exists = await redisClient.exists(duplicateKey);
    return exists === 1;
};
```

### 6.2. Mark as Sent
```javascript
const markJobAsSent = async (userId, jobId) => {
    const duplicateKey = RedisKeys.getDuplicateJobKey(userId, jobId);
    // Set với TTL 7 ngày
    await redisClient.setEx(duplicateKey, 7 * 24 * 60 * 60, '1');
};
```

### Cấu Trúc Redis:
```
Key: job_alert:sent:user123:job456
Type: STRING
Value: "1"
TTL: 604800 seconds (7 days)
```

### Tại Sao Cần?
- Tránh gửi cùng 1 job cho cùng 1 user nhiều lần
- TTL 7 ngày: Sau 7 ngày, key tự động xóa (job đã cũ)
- Lightweight: Chỉ lưu flag "1", không lưu data

---

## Bước 7: Batch Insert Notifications

```javascript
const pendingNotificationsToInsert = [];

for (const userId of allMatchedUserIds) {
    // ... matching logic ...
    
    if (bestSubscription) {
        const notificationData = {
            userId,
            jobId: job._id,
            subscriptionId: bestSubscription._id,
            matchingSubscriptionIds: allMatchingSubs.map(sub => sub._id)
        };
        pendingNotificationsToInsert.push(notificationData);
        await markJobAsSent(userId, job._id);
    }
}

// Batch insert một lần duy nhất
if (pendingNotificationsToInsert.length > 0) {
    await PendingNotification.insertMany(pendingNotificationsToInsert);
}
```

### Tại Sao Batch Insert?
| Phương Pháp | Số Queries | Hiệu Suất |
|-------------|------------|-----------|
| Loop + Create | n queries | Chậm, nhiều round-trips |
| insertMany | 1 query | Nhanh, 1 round-trip |

**Ví dụ:**
- 100 users match
- Loop: 100 INSERT queries → **chậm**
- insertMany: 1 INSERT query với 100 documents → **nhanh**

---

## Tổng Kết: Độ Phức Tạp Thuật Toán

### Time Complexity:
```
O(k) + O(u) + O(u × s × f)

Trong đó:
- k = số keywords từ job (~10-20)
- u = số users matched (~100-1000)
- s = số subscriptions per user (~1-5)
- f = filter complexity (constant)
```

### Space Complexity:
```
O(u × s)  // Lưu subscriptions trong memory
```

### Bottlenecks & Optimizations:

| Bước | Bottleneck | Optimization |
|------|------------|--------------|
| Keyword Lookup | MongoDB scan | ✅ Redis Sets (O(1)) |
| Subscription Query | Full table scan | ✅ Index on candidateId |
| Duplicate Check | MongoDB query | ✅ Redis cache |
| Notification Insert | Multiple queries | ✅ Batch insert |

---

## Ví Dụ Thực Tế End-to-End

### Input:
```javascript
// Job mới được tạo
{
  _id: "job123",
  title: "Senior NodeJS Developer",
  skills: ["NodeJS", "React", "MongoDB"],
  description: "We are looking for experienced backend developer...",
  location: { province: "HCM", district: "Q1" },
  category: "IT",
  type: "FULL_TIME",
  workType: "REMOTE",
  experience: "SENIOR_LEVEL",
  minSalary: 20000000,
  maxSalary: 30000000,
  moderationStatus: "APPROVED",
  status: "ACTIVE"
}
```

### Processing:

**1. Extract Keywords:**
```javascript
["senior", "nodejs", "developer", "react", "mongodb", "looking", "experienced", "backend"]
```

**2. Redis Lookup:**
```javascript
Redis Keys:
- job_alert:keyword:nodejs → [user1, user2, user3]
- job_alert:keyword:react → [user2, user4]
- job_alert:keyword:mongodb → [user1, user5]

SUNION Result: [user1, user2, user3, user4, user5]
```

**3. MongoDB Query:**
```javascript
JobAlertSubscription.find({
  candidateId: { $in: [user1, user2, user3, user4, user5] },
  active: true
})

Result: 7 subscriptions (một số users có nhiều subscriptions)
```

**4. Matching & Scoring:**
```javascript
user1:
  - subscription1 (keyword: "nodejs", location: HCM/Q1) → Score: 65 ✅
  - subscription2 (keyword: "react", location: HCM/Q2) → Score: 0 ❌ (district không match)
  → Best: subscription1 (65 points)

user2:
  - subscription3 (keyword: "nodejs", location: HCM/ALL) → Score: 70 ✅
  → Best: subscription3 (70 points)

user3:
  - subscription4 (keyword: "nodejs", location: HN/ALL) → Score: 0 ❌ (province không match)
  → No match

user4:
  - subscription5 (keyword: "react", location: HCM/Q1) → Score: 50 ✅
  → Best: subscription5 (50 points)

user5:
  - subscription6 (keyword: "mongodb", location: HCM/Q1) → Score: 45 ✅
  → Best: subscription6 (45 points)
```

**5. Create Notifications:**
```javascript
PendingNotification.insertMany([
  { userId: user1, jobId: job123, subscriptionId: subscription1, ... },
  { userId: user2, jobId: job123, subscriptionId: subscription3, ... },
  { userId: user4, jobId: job123, subscriptionId: subscription5, ... },
  { userId: user5, jobId: job123, subscriptionId: subscription6, ... }
])

// user3 không nhận notification vì không match filters
```

**6. Mark as Sent (Redis):**
```javascript
Redis SET:
- job_alert:sent:user1:job123 → "1" (TTL: 7 days)
- job_alert:sent:user2:job123 → "1" (TTL: 7 days)
- job_alert:sent:user4:job123 → "1" (TTL: 7 days)
- job_alert:sent:user5:job123 → "1" (TTL: 7 days)
```

### Output:
```
✅ 4 pending notifications created
✅ 4 users will receive job alerts
✅ Duplicate prevention enabled for 7 days
```

---

## Kết Luận

### Điểm Mạnh:
✅ **Real-time**: MongoDB Change Streams phản ứng ngay lập tức  
✅ **Scalable**: Redis Sets giúp lookup nhanh với hàng triệu subscriptions  
✅ **Accurate**: Multi-level filtering (keyword + location + salary + type...)  
✅ **Smart**: Relevance scoring để ưu tiên jobs phù hợp nhất  
✅ **Reliable**: Duplicate prevention, batch processing, error handling  

### Điểm Cần Cải Thiện:
⚠️ **Redis dependency**: Nếu Redis down, matching sẽ fail  
⚠️ **In-memory processing**: Nếu quá nhiều matched users, có thể tốn RAM  
⚠️ **No ML**: Chưa có machine learning để cải thiện relevance  

### Khả Năng Mở Rộng:
- Thêm **vector similarity** cho semantic matching
- Thêm **user behavior tracking** để cải thiện scoring
- Thêm **A/B testing** cho thuật toán scoring
- Thêm **rate limiting** để tránh spam
