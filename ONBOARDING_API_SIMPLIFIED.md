# Onboarding API - Simplified (No Session Required)

## Tổng quan

API onboarding đã được đơn giản hóa để không cần quản lý phiên (session) nữa. Thay vào đó, hệ thống sẽ:

1. **Tự động kiểm tra profile completeness** mỗi khi user đăng nhập
2. **Hiển thị modal/banner** nếu profile completeness < 60%
3. **Cho phép cập nhật profile** bất cứ lúc nào mà không cần theo flow step-by-step

## Thay đổi chính

### ❌ Đã loại bỏ
- `POST /api/candidate/onboarding/start` - Không cần start session nữa
- `PUT /api/candidate/onboarding/step/:stepId` - Không cần update theo step
- `POST /api/candidate/onboarding/skip/:stepId` - Không cần skip step
- `POST /api/candidate/onboarding/complete` - Không cần complete session
- Model `OnboardingSession` - Không cần lưu session nữa

### ✅ API mới

#### 1. Kiểm tra trạng thái profile
```http
GET /api/candidate/onboarding/status
Authorization: Bearer {accessToken}
```

**Response:**
```json
{
  "success": true,
  "message": "Lấy trạng thái onboarding thành công",
  "data": {
    "needsOnboarding": true,
    "completeness": 45,
    "profileCompleteness": {
      "percentage": 45,
      "missingFields": ["skills", "expectedSalary", "preferredLocations"],
      "recommendations": [
        "⚠️ Hồ sơ chưa đủ để nhận gợi ý việc làm (cần tối thiểu 60%)",
        "Thêm ít nhất 3 kỹ năng của bạn",
        "Thiết lập mức lương mong muốn",
        "Chọn địa điểm làm việc ưa thích"
      ],
      "hasBasicInfo": true,
      "hasSkills": false,
      "hasPreferences": false,
      "hasExperience": false,
      "hasEducation": false,
      "hasCV": false,
      "canGenerateRecommendations": false,
      "isWellCompleted": false,
      "isFullyCompleted": false
    },
    "canGenerateRecommendations": false,
    "isWellCompleted": false,
    "isFullyCompleted": false
  }
}
```

#### 2. Lấy gợi ý cải thiện profile
```http
GET /api/candidate/onboarding/recommendations
Authorization: Bearer {accessToken}
```

**Response:**
```json
{
  "success": true,
  "message": "Lấy gợi ý cải thiện hồ sơ thành công",
  "data": {
    "completeness": 45,
    "canGenerateRecommendations": false,
    "recommendations": {
      "critical": [
        {
          "field": "skills",
          "message": "Thêm ít nhất 3 kỹ năng",
          "action": "Cập nhật kỹ năng",
          "impact": "Cần thiết để hệ thống gợi ý việc làm phù hợp"
        }
      ],
      "important": [
        {
          "field": "expectedSalary",
          "message": "Thiết lập mức lương mong muốn",
          "action": "Cập nhật thông tin lương",
          "impact": "Giúp lọc việc làm phù hợp với kỳ vọng của bạn"
        }
      ],
      "optional": [
        {
          "field": "experiences",
          "message": "Thêm kinh nghiệm làm việc",
          "action": "Cập nhật kinh nghiệm",
          "impact": "Tăng cơ hội được tuyển dụng"
        }
      ]
    },
    "summary": {
      "critical": 1,
      "important": 2,
      "optional": 3,
      "total": 6
    }
  }
}
```

#### 3. Cập nhật thông tin profile
```http
PUT /api/candidate/onboarding/update
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "profileData": {
    "fullname": "Nguyễn Văn A",
    "phone": "0123456789",
    "bio": "Tôi là một developer...",
    "skills": [
      { "name": "JavaScript" },
      { "name": "React" },
      { "name": "Node.js" }
    ],
    "expectedSalary": {
      "min": 15000000,
      "max": 25000000,
      "currency": "VND"
    },
    "preferredLocations": ["Hà Nội", "TP.HCM"],
    "workPreferences": {
      "workTypes": ["REMOTE", "HYBRID"],
      "contractTypes": ["FULL_TIME"]
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Cập nhật thông tin hồ sơ thành công",
  "data": {
    "profile": { /* updated profile */ },
    "profileCompleteness": {
      "percentage": 75,
      "missingFields": ["experiences", "educations"],
      "canGenerateRecommendations": true,
      "isWellCompleted": false,
      "isFullyCompleted": false
    }
  }
}
```

**Allowed Fields:**
- `fullname`
- `phone`
- `avatar`
- `bio`
- `address`
- `skills`
- `experiences`
- `educations`
- `certificates`
- `projects`
- `expectedSalary`
- `preferredLocations`
- `workPreferences`
- `experienceLevel`
- `linkedin`
- `github`
- `website`

#### 4. Bỏ qua nhắc nhở onboarding
```http
POST /api/candidate/onboarding/dismiss
Authorization: Bearer {accessToken}
```

**Response:**
```json
{
  "success": true,
  "message": "Đã bỏ qua nhắc nhở onboarding. Bạn có thể hoàn thiện hồ sơ bất cứ lúc nào.",
  "data": {
    "profileCompleteness": { /* current completeness */ },
    "canDismiss": true
  }
}
```

## Login Response với Profile Completeness

Khi user đăng nhập (cả login thường và Google login), response sẽ tự động bao gồm `profileCompleteness`:

```json
{
  "success": true,
  "message": "Đăng nhập thành công",
  "data": {
    "accessToken": "...",
    "id": "...",
    "role": "candidate",
    "email": "user@example.com",
    "active": true,
    "isEmailVerified": true
  },
  "profileCompleteness": {
    "percentage": 45,
    "needsOnboarding": true,
    "canGenerateRecommendations": false,
    "missingFieldsCount": 5
  }
}
```

## Frontend Implementation Guide

### 1. Kiểm tra khi đăng nhập

```javascript
// Sau khi login thành công
const loginResponse = await authService.login(credentials);

if (loginResponse.profileCompleteness?.needsOnboarding) {
  // Hiển thị modal/banner yêu cầu hoàn thiện profile
  showOnboardingModal({
    percentage: loginResponse.profileCompleteness.percentage,
    missingFieldsCount: loginResponse.profileCompleteness.missingFieldsCount
  });
}
```

### 2. Hiển thị modal onboarding

```javascript
// Component OnboardingModal.jsx
const OnboardingModal = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState(null);
  const [recommendations, setRecommendations] = useState(null);

  useEffect(() => {
    if (isOpen) {
      // Lấy status và recommendations
      Promise.all([
        apiClient.get('/candidate/onboarding/status'),
        apiClient.get('/candidate/onboarding/recommendations')
      ]).then(([statusRes, recRes]) => {
        setStatus(statusRes.data.data);
        setRecommendations(recRes.data.data);
      });
    }
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2>Hoàn thiện hồ sơ của bạn</h2>
      <ProgressBar value={status?.completeness} />
      
      {/* Hiển thị recommendations theo priority */}
      <div>
        <h3>Cần thiết</h3>
        {recommendations?.recommendations.critical.map(rec => (
          <RecommendationItem key={rec.field} {...rec} />
        ))}
      </div>
      
      <Button onClick={() => navigate('/profile/edit')}>
        Hoàn thiện ngay
      </Button>
      <Button variant="ghost" onClick={handleDismiss}>
        Để sau
      </Button>
    </Modal>
  );
};
```

### 3. Cập nhật profile

```javascript
// Trong form edit profile
const handleSubmit = async (formData) => {
  const response = await apiClient.put('/candidate/onboarding/update', {
    profileData: formData
  });
  
  // Hiển thị completeness mới
  toast.success(`Hồ sơ đã hoàn thiện ${response.data.data.profileCompleteness.percentage}%`);
  
  // Nếu đạt 60%, có thể nhận gợi ý việc làm
  if (response.data.data.profileCompleteness.canGenerateRecommendations) {
    toast.success('Bạn đã có thể nhận gợi ý việc làm!');
  }
};
```

### 4. Kiểm tra định kỳ

```javascript
// Hook để kiểm tra profile completeness
const useProfileCompleteness = () => {
  const { data, refetch } = useQuery({
    queryKey: ['profileCompleteness'],
    queryFn: () => apiClient.get('/candidate/onboarding/status'),
    staleTime: 5 * 60 * 1000, // 5 phút
  });

  return {
    completeness: data?.data.data,
    refetch
  };
};

// Sử dụng trong component
const { completeness, refetch } = useProfileCompleteness();

// Sau khi update profile
await updateProfile(data);
refetch(); // Refresh completeness
```

## Profile Completeness Calculation

### Trọng số các phần (Total = 100%)

**3 Bước bắt buộc (70%):**
- **Basic Info (25%)**: fullname, phone, preferredLocations
- **Skills (25%)**: Ít nhất 3 kỹ năng
- **Preferences (20%)**: expectedSalary, workTypes, contractTypes

**Bước tùy chọn (30%):**
- **Bio (5%)**: Giới thiệu bản thân
- **Avatar (5%)**: Ảnh đại diện
- **Experience (5%)**: Kinh nghiệm làm việc
- **Education (5%)**: Học vấn
- **Certificates (5%)**: Chứng chỉ chuyên môn
- **Projects (5%)**: Dự án đã thực hiện

**Không tính điểm:**
- Social Links (linkedin, github, website)
- CV uploads

### Ngưỡng quan trọng

- **< 70%**: Chưa hoàn thành 3 bước bắt buộc (needsOnboarding = true)
- **70-79%**: Có thể nhận gợi ý việc làm (canGenerateRecommendations = true)
- **80-89%**: Hồ sơ tốt (isWellCompleted = true)
- **90-99%**: Hồ sơ rất tốt
- **100%**: Hoàn thiện (isFullyCompleted = true)

## Migration từ API cũ

### Thay đổi trong Frontend

1. **Loại bỏ logic session management**
   - Không cần lưu `sessionId`
   - Không cần track `currentStep`

2. **Đơn giản hóa flow**
   - Thay vì step-by-step wizard → Form edit profile tự do
   - User có thể update bất kỳ field nào, bất kỳ lúc nào

3. **Kiểm tra tự động**
   - Mỗi lần login → Check completeness
   - Hiển thị banner/modal nếu < 60%

4. **Update API calls**
   ```javascript
   // Cũ
   await api.post('/onboarding/start');
   await api.put('/onboarding/step/1', { stepData, completed: true });
   await api.post('/onboarding/complete');
   
   // Mới
   await api.put('/onboarding/update', { profileData });
   ```

## Testing

### Test Cases

1. **Login với profile chưa hoàn thiện**
   - Expect: `needsOnboarding: true` trong response

2. **Update profile từ 40% → 65%**
   - Expect: `canGenerateRecommendations` thay đổi từ false → true

3. **Dismiss onboarding**
   - Expect: Response thành công, không ảnh hưởng completeness

4. **Get recommendations**
   - Expect: Recommendations được phân loại theo critical/important/optional

## Notes

- Profile completeness được tính toán real-time mỗi khi gọi API
- Không cần lo về session timeout hay abandoned sessions
- User có thể update profile từ nhiều nơi (settings, onboarding modal, profile page)
- Completeness được cache trong profile document để tối ưu performance
