# CV Masking - Fixes & Troubleshooting

## 🐛 Lỗi đã sửa

### 1. Error: "Please provide binary data as `Uint8Array`, rather than `Buffer`"

**Nguyên nhân:**
- `pdfjs-dist` v5.x yêu cầu `Uint8Array` thay vì Node.js `Buffer`
- Khi download PDF từ Cloudinary, axios trả về `Buffer`

**Giải pháp:**
```javascript
// be/src/utils/cvMasker.js
async function extractTextPositions(pdfBuffer, regex) {
  // Convert Buffer to Uint8Array
  const uint8Array = pdfBuffer instanceof Uint8Array 
    ? pdfBuffer 
    : new Uint8Array(pdfBuffer);
  
  const loadingTask = getDocument({ data: uint8Array });
  // ...
}
```

### 2. Error: "Unauthorized" khi mở CV trong tab mới

**Nguyên nhân:**
- `window.open(url)` không gửi Authorization header
- Backend yêu cầu JWT token

**Giải pháp:**
```javascript
// fe-recruiter/src/pages/candidates/CandidateProfile.jsx
onClick={async () => {
  // Gọi API với token
  const response = await candidateService.getCandidateCv(userId, cv._id);
  
  // Tạo blob URL
  const blob = new Blob([response], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(blob);
  window.open(url, '_blank');
  
  // Cleanup
  setTimeout(() => window.URL.revokeObjectURL(url), 60000);
}
```

**Service:**
```javascript
// fe-recruiter/src/services/candidateService.js
export const getCandidateCv = async (userId, cvId) => {
  const response = await apiClient.get(
    `/recruiters/candidates/${userId}/cv/${cvId}`, 
    { responseType: 'arraybuffer' }
  );
  return response;
};
```

**API Client:**
```javascript
// fe-recruiter/src/services/apiClient.js
apiClient.interceptors.response.use(
  (res) => {
    // Nếu responseType là arraybuffer, trả về data gốc
    if (res.config.responseType === 'arraybuffer') {
      return res.data;
    }
    const { data } = res;
    return data;
  },
  // ...
);
```

### 3. Regex không tìm thấy email/phone

**Nguyên nhân:**
- Regex ban đầu quá đơn giản
- Không bắt được các format khác nhau

**Giải pháp:**
```javascript
// be/src/utils/cvMasker.js

// Phone: Bắt nhiều format
const phoneRegex = /(\+84|84|0)[\s\-.]?[1-9][\s\-.]?\d{1,2}[\s\-.]?\d{3}[\s\-.]?\d{3,4}/g;

// Email: Bắt email chuẩn
const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
```

**Test:**
```bash
node be/test-regex.js
```

## 🔍 Debug Tips

### 1. Kiểm tra PDF có được tải không

```javascript
// be/src/services/cvMask.service.js
try {
  const response = await axios.get(cv.path, { 
    responseType: 'arraybuffer',
    timeout: 30000
  });
  originalBuffer = Buffer.from(response.data);
  console.log('PDF downloaded, size:', originalBuffer.length);
} catch (err) {
  console.error('Error downloading PDF:', err.message);
}
```

### 2. Kiểm tra regex có tìm thấy không

```javascript
// be/src/utils/cvMasker.js
console.log(`Found ${phonePositions.length} phone numbers`);
console.log(`Found ${emailPositions.length} emails`);
console.log('Positions:', allPositions);
```

### 3. Kiểm tra PDF có được che không

```javascript
// be/src/utils/cvMasker.js
if (allPositions.length === 0) {
  console.log('⚠️ Không tìm thấy email/phone để che');
  // Có thể PDF không có text layer
  // Hoặc regex không khớp
}
```

### 4. Test với Postman

```http
GET http://localhost:5000/api/v1/recruiter/candidates/{userId}/cv/{cvId}
Authorization: Bearer {token}
```

**Kiểm tra:**
- Response type: `application/pdf`
- File size: > 0
- Mở file PDF → Kiểm tra có hình chữ nhật xám không

## 🧪 Testing Checklist

### Backend
- [ ] PDF được download từ Cloudinary
- [ ] Buffer được convert sang Uint8Array
- [ ] Regex tìm thấy email/phone
- [ ] Hình chữ nhật được vẽ đúng vị trí
- [ ] PDF được trả về đúng format

### Frontend
- [ ] API call có Authorization header
- [ ] Response type là arraybuffer
- [ ] Blob được tạo thành công
- [ ] PDF mở trong tab mới
- [ ] Blob URL được cleanup

## 📝 Common Issues

### Issue 1: "Không tìm thấy email/phone để che"

**Nguyên nhân:**
- PDF không có text layer (scan/image)
- Email/phone có format đặc biệt
- Regex không khớp

**Giải pháp:**
1. Kiểm tra PDF có text layer:
   ```javascript
   const content = await page.getTextContent();
   console.log('Text items:', content.items.length);
   content.items.forEach(item => console.log(item.str));
   ```

2. Cải thiện regex để bắt thêm format

3. Nếu PDF là scan → Cần OCR (future enhancement)

### Issue 2: "Hình chữ nhật không đúng vị trí"

**Nguyên nhân:**
- Tọa độ Y trong PDF tính từ dưới lên
- Font size khác nhau
- Padding không đủ

**Giải pháp:**
```javascript
positions.push({
  page: i,
  x: matchStartX - 2,        // Thêm padding trái
  y: y - 2,                  // Thêm padding dưới
  width: matchWidth + 4,     // Thêm padding phải
  height: item.height + 4,   // Thêm padding trên
});
```

### Issue 3: "PDF bị lỗi sau khi che"

**Nguyên nhân:**
- PDF gốc có vấn đề
- pdf-lib không tương thích

**Giải pháp:**
```javascript
try {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  // ...
} catch (error) {
  console.error('Error loading PDF:', error);
  // Trả về PDF gốc
  return pdfBuffer;
}
```

## 🔮 Future Improvements

### 1. Cache Masked PDF
```javascript
// Cache trong Redis
const cacheKey = `masked-cv:${userId}:${cvId}`;
const cached = await redis.get(cacheKey);
if (cached) {
  return Buffer.from(cached, 'base64');
}

// Generate và cache
const maskedPdf = await maskPdfBuffer(originalBuffer);
await redis.setex(cacheKey, 3600, maskedPdf.toString('base64'));
```

### 2. OCR cho PDF scan
```javascript
import Tesseract from 'tesseract.js';

// Convert PDF to images
// Run OCR
// Find email/phone positions
// Mask
```

### 3. Watermark
```javascript
page.drawText('CONFIDENTIAL', {
  x: 50,
  y: 50,
  size: 50,
  color: rgb(0.8, 0.8, 0.8),
  opacity: 0.3,
  rotate: degrees(45)
});
```

### 4. Smart Masking
```javascript
// Chỉ che email/phone của candidate
// Không che email/phone của công ty cũ
const candidateEmail = profile.email;
const candidatePhone = profile.phone;

// Chỉ mask nếu khớp với thông tin candidate
if (match === candidateEmail || match === candidatePhone) {
  positions.push(/* ... */);
}
```

## 📚 References

- [pdfjs-dist Documentation](https://mozilla.github.io/pdf.js/)
- [pdf-lib Documentation](https://pdf-lib.js.org/)
- [Regex101 - Test Regex](https://regex101.com/)

---

**Last Updated**: 2024-01-15
**Status**: ✅ Fixed
