# Tài liệu Tính năng Tìm kiếm Công việc trên Bản đồ

## 📋 Tổng quan

Tính năng này cho phép người dùng tìm kiếm và khám phá các công việc dựa trên vị trí địa lý thông qua giao diện bản đồ tương tác. Hệ thống hỗ trợ hai chế độ:

1. **Bounding Box Search**: Tìm kiếm tất cả công việc trong khung nhìn bản đồ
2. **Server-Side Clustering**: Nhóm các công việc gần nhau thành cụm để tối ưu hiệu suất

## 🏗️ Kiến trúc

### Backend (Node.js + Express + MongoDB)

#### 1. Database Schema

Model `Job` đã có sẵn cấu trúc GeoJSON và index 2dsphere:

```javascript
location: {
  province: String,
  district: String,
  commune: String,
  coordinates: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: [Number] // [longitude, latitude]
  }
}

// Index
jobSchema.index({ 'location.coordinates': '2dsphere' });
```

#### 2. API Endpoints

**a) Tìm kiếm theo Bounding Box**

```
GET /api/v1/jobs/map-search
```

**Query Parameters:**
- `sw_lat` (required): Latitude góc Tây-Nam
- `sw_lng` (required): Longitude góc Tây-Nam
- `ne_lat` (required): Latitude góc Đông-Bắc
- `ne_lng` (required): Longitude góc Đông-Bắc
- `limit` (optional): Giới hạn số kết quả (default: 500, max: 500)

**Response:**
```json
{
  "success": true,
  "message": "Lấy danh sách công việc trên bản đồ thành công.",
  "data": [
    {
      "_id": "60d...",
      "title": "Senior Frontend Developer",
      "coordinates": [106.6297, 10.8231],
      "address": "123 Nguyễn Huệ, Q1, TP.HCM",
      "minSalary": "20000000",
      "maxSalary": "35000000",
      "type": "FULL_TIME",
      "workType": "HYBRID",
      "company": {
        "name": "Tech Corp",
        "logo": "https://..."
      }
    }
  ]
}
```

**b) Tìm kiếm với Clustering**

```
GET /api/v1/jobs/map-clusters
```

**Query Parameters:**
- `sw_lat`, `sw_lng`, `ne_lat`, `ne_lng` (required): Tương tự như trên
- `zoom` (required): Mức zoom của bản đồ (1-20)

**Response:**
```json
{
  "success": true,
  "message": "Lấy cụm công việc trên bản đồ thành công.",
  "data": [
    {
      "count": 15,
      "coordinates": [106.702, 10.777],
      "cluster": true
    },
    {
      "count": 1,
      "coordinates": [106.695, 10.781],
      "cluster": false,
      "jobId": "60d...aeb",
      "title": "Backend Developer"
    }
  ]
}
```

#### 3. Service Layer Logic

**Bounding Box Query:**

```javascript
export const findJobsInBounds = async (bounds) => {
  const { sw_lng, sw_lat, ne_lng, ne_lat, limit = 500 } = bounds;

  const jobs = await Job.find({
    status: 'ACTIVE',
    approved: true,
    'location.coordinates': {
      $geoWithin: {
        $box: [
          [parseFloat(sw_lng), parseFloat(sw_lat)],
          [parseFloat(ne_lng), parseFloat(ne_lat)]
        ]
      }
    }
  })
    .limit(parseInt(limit))
    .select('title location.coordinates address minSalary maxSalary type workType')
    .populate('recruiterProfileId', 'company.name company.logo')
    .lean();

  return jobs;
};
```

**Clustering Algorithm:**

Sử dụng Geohash để nhóm các công việc:

```javascript
export const getClustersFromDb = async (bounds, zoom) => {
  // Xác định độ chính xác của lưới dựa trên zoom level
  const getPrecision = (zoomLevel) => {
    if (zoomLevel >= 15) return 8;  // Chi tiết cao
    if (zoomLevel >= 12) return 7;
    if (zoomLevel >= 10) return 6;
    if (zoomLevel >= 7) return 5;
    return 4;  // Tổng quan
  };

  const precision = getPrecision(parseInt(zoom));

  // Aggregation pipeline:
  // 1. Lọc jobs trong bounds
  // 2. Tạo geohash cho mỗi job
  // 3. Nhóm theo geohash
  // 4. Tính toán tọa độ trung tâm và số lượng
};
```

### Frontend (React + Google Maps)

#### 1. Service Layer

```javascript
// src/services/jobService.js

export const searchJobsOnMap = async (bounds) => {
  const queryParams = new URLSearchParams();
  queryParams.append('sw_lat', bounds.sw_lat);
  queryParams.append('sw_lng', bounds.sw_lng);
  queryParams.append('ne_lat', bounds.ne_lat);
  queryParams.append('ne_lng', bounds.ne_lng);
  
  const response = await apiClient.get(`/jobs/map-search?${queryParams}`);
  return response.data;
};

export const getJobClusters = async (bounds, zoom) => {
  const queryParams = new URLSearchParams();
  queryParams.append('sw_lat', bounds.sw_lat);
  queryParams.append('sw_lng', bounds.sw_lng);
  queryParams.append('ne_lat', bounds.ne_lat);
  queryParams.append('ne_lng', bounds.ne_lng);
  queryParams.append('zoom', zoom);
  
  const response = await apiClient.get(`/jobs/map-clusters?${queryParams}`);
  return response.data;
};
```

#### 2. Map Component

```jsx
// src/components/jobs/JobMapView.jsx

const JobMapView = ({ useCluster = true }) => {
  const [map, setMap] = useState(null);
  const [bounds, setBounds] = useState(null);
  const [zoom, setZoom] = useState(12);

  // Fetch data với TanStack Query
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['mapJobs', bounds, zoom, useCluster],
    queryFn: async () => {
      if (!bounds) return { data: [] };
      
      if (useCluster) {
        return await getJobClusters(bounds, zoom);
      } else {
        return await searchJobsOnMap(bounds);
      }
    },
    enabled: !!bounds,
    staleTime: 30000,
  });

  // Lắng nghe sự kiện thay đổi bounds
  const handleBoundsChanged = useCallback(() => {
    if (!map) return;
    const mapBounds = map.getBounds();
    // Cập nhật bounds state
  }, [map]);

  return (
    <GoogleMap
      onLoad={setMap}
      onIdle={handleBoundsChanged}
    >
      {/* Render markers hoặc clusters */}
    </GoogleMap>
  );
};
```

## 🚀 Cài đặt và Sử dụng

### Backend

1. **Đảm bảo dữ liệu có coordinates:**

Khi tạo hoặc cập nhật Job, đảm bảo trường `location.coordinates` được điền:

```javascript
{
  location: {
    province: "Hồ Chí Minh",
    district: "Quận 1",
    commune: "Phường Bến Nghé",
    coordinates: {
      type: "Point",
      coordinates: [106.6297, 10.8231] // [longitude, latitude]
    }
  }
}
```

2. **Test API:**

Sử dụng file `test-map-search.http`:

```http
GET http://localhost:5000/api/v1/jobs/map-search?sw_lng=106.5&sw_lat=10.6&ne_lng=106.9&ne_lat=10.9
```

### Frontend

1. **Cài đặt dependencies:**

```bash
npm install @react-google-maps/api
```

2. **Cấu hình Google Maps API Key:**

Thêm vào `.env`:

```
VITE_GOOGLE_MAPS_API_KEY=your_api_key_here
```

3. **Sử dụng component:**

```jsx
import { LoadScript } from '@react-google-maps/api';
import JobMapView from '@/components/jobs/JobMapView';

function JobMapPage() {
  return (
    <LoadScript googleMapsApiKey={process.env.VITE_GOOGLE_MAPS_API_KEY}>
      <JobMapView useCluster={true} />
    </LoadScript>
  );
}
```

## 📊 Hiệu suất

### Tối ưu hóa đã áp dụng:

1. **Database Indexes:**
   - 2dsphere index trên `location.coordinates`
   - Compound indexes cho các truy vấn phổ biến

2. **Query Optimization:**
   - Sử dụng `.lean()` cho read-only queries
   - `.select()` để chỉ lấy các trường cần thiết
   - Giới hạn số lượng kết quả (max 500)

3. **Frontend Caching:**
   - TanStack Query với `staleTime: 30000` (30s)
   - Chỉ fetch khi bounds thay đổi đáng kể

4. **Clustering:**
   - Giảm số lượng markers cần render
   - Độ chi tiết tự động điều chỉnh theo zoom level

### Benchmark ước tính:

- **Bounding Box Query**: ~50-100ms cho 500 jobs
- **Clustering Query**: ~100-200ms (phụ thuộc vào số lượng jobs)
- **Frontend Render**: ~16ms/frame với 500 markers

## 🔧 Troubleshooting

### Lỗi thường gặp:

1. **"Invalid coordinates format"**
   - Kiểm tra coordinates phải là `[longitude, latitude]`
   - Longitude: -180 đến 180
   - Latitude: -90 đến 90

2. **Không có kết quả trả về**
   - Kiểm tra dữ liệu có `status: 'ACTIVE'` và `approved: true`
   - Kiểm tra coordinates có nằm trong bounds không

3. **Clustering không hoạt động**
   - Fallback tự động sang bounding box search
   - Kiểm tra logs để xem lỗi chi tiết

## 🎯 Tính năng mở rộng

Các tính năng có thể thêm trong tương lai:

1. **Filters trên bản đồ:**
   - Lọc theo category, salary, type
   - Tích hợp với hybrid search

2. **Heatmap:**
   - Hiển thị mật độ công việc theo khu vực

3. **Routing:**
   - Tính khoảng cách từ vị trí người dùng
   - Hiển thị thời gian di chuyển

4. **Real-time updates:**
   - WebSocket để cập nhật công việc mới
   - Notification khi có job mới trong khu vực

## 📝 Testing

Sử dụng file `test-map-search.http` để test các scenarios:

- ✅ Success cases: HCM, Hanoi areas
- ✅ Different zoom levels (5, 10, 15)
- ✅ Error cases: Invalid coordinates, missing parameters
- ✅ Edge cases: Out of range values

## 📚 Tài liệu tham khảo

- [MongoDB Geospatial Queries](https://docs.mongodb.com/manual/geospatial-queries/)
- [Google Maps JavaScript API](https://developers.google.com/maps/documentation/javascript)
- [Geohash Algorithm](https://en.wikipedia.org/wiki/Geohash)
