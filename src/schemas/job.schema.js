import { z } from 'zod';
import { provinceNames, locationMap } from '../constants/locations.enum.js';

const jobTypeEnum = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY', 'VOLUNTEER', 'FREELANCE'];
const workTypeEnum = ['ON_SITE', 'REMOTE', 'HYBRID'];
const experienceEnum = ['ENTRY_LEVEL', 'MID_LEVEL', 'SENIOR_LEVEL', 'EXECUTIVE', 'NO_EXPERIENCE', 'INTERN', 'FRESHER'];
const jobCategoryEnum = [
  'IT', 'SOFTWARE_DEVELOPMENT', 'DATA_SCIENCE', 'MACHINE_LEARNING', 'WEB_DEVELOPMENT',
  'SALES', 'MARKETING', 'ACCOUNTING', 'GRAPHIC_DESIGN', 'CONTENT_WRITING',
  'MEDICAL', 'TEACHING', 'ENGINEERING', 'PRODUCTION', 'LOGISTICS',
  'HOSPITALITY', 'REAL_ESTATE', 'LAW', 'FINANCE', 'HUMAN_RESOURCES',
  'CUSTOMER_SERVICE', 'ADMINISTRATION', 'MANAGEMENT', 'OTHER'
];
const jobStatusEnum = ['ACTIVE', 'INACTIVE', 'EXPIRED'];

// Helper function to parse salary strings with thousand separators (dots)
const parseSalary = (value) => {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Remove dots (thousand separators) and parse as number
    const cleaned = value.replace(/\./g, '');
    const num = Number(cleaned);
    return isNaN(num) ? undefined : num;
  }
  return undefined;
};

// Custom salary schema that handles Vietnamese number format
const salarySchema = z.preprocess((val) => {
  return parseSalary(val);
}, z.number().min(0, 'Mức lương không thể là số âm').optional());

const locationSchema = z.object({
  province: z.enum(provinceNames, { required_error: 'Tỉnh/Thành phố là bắt buộc' }),
  district: z.string({ required_error: 'Quận/Huyện là bắt buộc' }),
  commune: z.string({ required_error: 'Phường/Xã là bắt buộc' }),
  coordinates: z.object({
    type: z.literal('Point').default('Point'),
    coordinates: z.array(z.number()).length(2, 'Coordinates phải có đúng 2 số [longitude, latitude]')
      .refine(coords => coords[0] >= -180 && coords[0] <= 180, 'Longitude phải trong khoảng -180 đến 180')
      .refine(coords => coords[1] >= -90 && coords[1] <= 90, 'Latitude phải trong khoảng -90 đến 90')
  }).optional()
});

// Schema for flexible user location input (accepts string format [106.23,24.23])
const userLocationFlexible = z.string().transform((val, ctx) => {
  if (!val) return undefined;

  try {
    // Parse string format [106.23,24.23] to array
    const parsed = JSON.parse(val);

    if (!Array.isArray(parsed) || parsed.length !== 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'userLocation phải có định dạng [longitude, latitude]'
      });
      return z.NEVER;
    }

    const [longitude, latitude] = parsed.map(Number);

    if (isNaN(longitude) || isNaN(latitude)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'userLocation phải chứa số hợp lệ'
      });
      return z.NEVER;
    }

    if (longitude < -180 || longitude > 180) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Longitude phải trong khoảng -180 đến 180'
      });
      return z.NEVER;
    }

    if (latitude < -90 || latitude > 90) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Latitude phải trong khoảng -90 đến 90'
      });
      return z.NEVER;
    }

    return {
      type: 'Point',
      coordinates: [longitude, latitude]
    };
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'userLocation phải có định dạng JSON hợp lệ: [longitude, latitude]'
    });
    return z.NEVER;
  }
});


export const createJobSchema = z.object({
  title: z.string().trim().min(5, 'Tiêu đề phải có ít nhất 5 ký tự').max(200),
  description: z.string().trim().min(20, 'Mô tả phải có ít nhất 20 ký tự').max(5000),
  requirements: z.string().trim().min(10, 'Yêu cầu phải có ít nhất 10 ký tự').max(2000),
  benefits: z.string().trim().min(10, 'Quyền lợi phải có ít nhất 10 ký tự').max(2000),
  location: locationSchema.optional(),
  address: z.string().trim().min(1, 'Địa chỉ chi tiết là bắt buộc').max(200).optional(),
  useCompanyAddress: z.boolean().optional(),
  type: z.enum(jobTypeEnum),
  workType: z.enum(workTypeEnum),
  minSalary: salarySchema,
  maxSalary: salarySchema,
  deadline: z.coerce.date().refine((date) => date > new Date(), 'Hạn chót phải là một ngày trong tương lai'),
  experience: z.enum(experienceEnum),
  category: z.enum(jobCategoryEnum),
  skills: z.array(z.string().trim().max(50, 'Kỹ năng không được vượt quá 50 ký tự')).optional(),
})
  .refine(data => !data.minSalary || !data.maxSalary || data.maxSalary >= data.minSalary, {
    message: 'Lương tối đa phải lớn hơn hoặc bằng lương tối thiểu',
    path: ['maxSalary'],
  })
  .refine(data => {
    // Nếu không sử dụng địa chỉ công ty, thì location và address phải có
    if (!data.useCompanyAddress) {
      return data.location && data.address;
    }
    return true;
  }, {
    message: 'Vui lòng cung cấp địa chỉ hoặc chọn sử dụng địa chỉ công ty',
    path: ['location'],
  })
  .refine(data => {
    if (!data.location) return true;
    const provinceData = locationMap.get(data.location.province);
    if (!provinceData) return false;
    return provinceData.districts.some(d => d.name === data.location.district);
  }, {
    message: 'Quận/Huyện không thuộc Tỉnh/Thành phố đã chọn.',
    path: ['location', 'district'],
  })
  .refine(data => {
    if (!data.location) return true;
    const provinceData = locationMap.get(data.location.province);
    // The district is already validated to be in the province by the previous refine.
    const districtData = provinceData.districts.find(d => d.name === data.location.district);
    if (!districtData || !districtData.communes) return false; // Commune list must exist
    return districtData.communes.includes(data.location.commune);
  }, {
    message: 'Phường/Xã không thuộc Quận/Huyện đã chọn.',
    path: ['location', 'commune'],
  });

export const updateJobSchema = z.object({
  title: z.string().trim().min(5, 'Tiêu đề phải có ít nhất 5 ký tự').max(200).optional(),
  description: z.string().trim().min(20, 'Mô tả phải có ít nhất 20 ký tự').max(5000).optional(),
  requirements: z.string().trim().min(10, 'Yêu cầu phải có ít nhất 10 ký tự').max(2000).optional(),
  benefits: z.string().trim().min(10, 'Quyền lợi phải có ít nhất 10 ký tự').max(2000).optional(),
  location: locationSchema.optional(),
  address: z.string().trim().min(1, 'Địa chỉ chi tiết là bắt buộc').max(200).optional(),
  useCompanyAddress: z.boolean().optional(),
  type: z.enum(jobTypeEnum).optional(),
  workType: z.enum(workTypeEnum).optional(),
  minSalary: salarySchema,
  maxSalary: salarySchema,
  deadline: z.coerce.date().refine((date) => date > new Date(), 'Hạn chót phải là một ngày trong tương lai').optional(),
  experience: z.enum(experienceEnum).optional(),
  category: z.enum(jobCategoryEnum).optional(),
  status: z.enum(jobStatusEnum).optional(),
  skills: z.array(z.string().trim().max(50, 'Kỹ năng không được vượt quá 50 ký tự')).optional(),
})
  .refine(data => !data.minSalary || !data.maxSalary || data.maxSalary >= data.minSalary, {
    message: 'Lương tối đa phải lớn hơn hoặc bằng lương tối thiểu',
    path: ['maxSalary'],
  })
  .refine(data => {
    if (!data.location) return true;
    const provinceData = locationMap.get(data.location.province);
    if (!provinceData) return false;
    return provinceData.districts.some(d => d.name === data.location.district);
  }, {
    message: 'Quận/Huyện không thuộc Tỉnh/Thành phố đã chọn.',
    path: ['location', 'district'],
  })
  .refine(data => {
    if (!data.location) return true;
    // If location is provided, all fields are required by locationSchema.
    // The previous refine validates the district.
    const provinceData = locationMap.get(data.location.province);
    const districtData = provinceData.districts.find(d => d.name === data.location.district);
    if (!districtData || !districtData.communes) return false;
    return districtData.communes.includes(data.location.commune);
  }, {
    message: 'Phường/Xã không thuộc Quận/Huyện đã chọn.',
    path: ['location', 'commune'],
  });

export const jobQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.enum(jobStatusEnum).optional(),
  sortBy: z.string().optional(),
  search: z.string().optional(),
});

export const getSavedJobsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.string().optional(),
  search: z.string().optional(),
});

export const applyToJobSchema = z.object({
  // CV ID
  cvId: z.string().trim().optional(),
  cvTemplateId: z.string().trim().optional(),

  // Thư xin việc
  coverLetter: z.string().trim().max(2000, 'Thư xin việc không được vượt quá 2000 ký tự').optional(),

  // Thông tin cá nhân từ form
  candidateName: z.string({ required_error: "Họ tên là bắt buộc" }).trim().min(2, 'Họ tên phải có ít nhất 2 ký tự').max(100, 'Họ tên không được vượt quá 100 ký tự'),
  candidateEmail: z.string({ required_error: "Email là bắt buộc" }).trim().email('Email không hợp lệ'),
  candidatePhone: z.string({ required_error: "Số điện thoại là bắt buộc" }).trim().regex(/^[\+]?[\d]{1,15}$/, 'Số điện thoại không hợp lệ'),
}).refine(data => {
  // Điều kiện XOR: một trong hai trường phải tồn tại, nhưng không phải cả hai.
  return (data.cvId && !data.cvTemplateId) || (!data.cvId && data.cvTemplateId);
}, {
  message: 'Bạn phải cung cấp `cvId` (cho CV tải lên) hoặc `cvTemplateId` (cho CV tạo từ mẫu). Không thể cung cấp cả hai hoặc không cung cấp trường nào.',
  path: ['cvId'], // Báo lỗi ở trường đầu tiên để dễ xử lý
});

// Update the getMyJobs query schema to include search parameter
export const getMyJobsQuerySchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(10),
  status: z.enum(['ACTIVE', 'INACTIVE', 'EXPIRED', 'PENDING']).optional(),
  sortBy: z.string().optional(),
  search: z.string().optional(), // Add this line
});

// Schema for hybrid search request
export const hybridSearchJobSchema = z.object({
  query: z.string().trim().max(200, 'Query không được vượt quá 200 ký tự').optional(),
  page: z.coerce.number().int().min(1, 'Trang phải lớn hơn 0').default(1),
  size: z.coerce.number().int().min(1, 'Kích thước trang phải lớn hơn 0').max(50, 'Kích thước trang không được vượt quá 50').default(10),
  // Filters cho tìm kiếm
  category: z.enum(jobCategoryEnum).optional(),
  type: z.enum(jobTypeEnum).optional(),
  workType: z.enum(workTypeEnum).optional(),
  experience: z.enum(experienceEnum).optional(),
  province: z.enum(provinceNames).optional(),
  district: z.string().optional(),
  // Salary range filters
  minSalary: salarySchema,
  maxSalary: salarySchema,

  // Weight parameters for RRF
  textWeight: z.coerce.number().min(0).max(1).default(0.4),
  vectorWeight: z.coerce.number().min(0).max(1).default(0.6),
  
  // Location filter by distance (exact radius filtering)
  latitude: z.coerce.number().min(-90, 'Latitude phải trong khoảng -90 đến 90').max(90, 'Latitude phải trong khoảng -90 đến 90').optional(),
  longitude: z.coerce.number().min(-180, 'Longitude phải trong khoảng -180 đến 180').max(180, 'Longitude phải trong khoảng -180 đến 180').optional(),
  distance: z.coerce.number().min(1, 'Khoảng cách phải lớn hơn 0 km').optional(), // Bán kính lọc (km)
})
  .refine(data => !data.minSalary || !data.maxSalary || data.maxSalary >= data.minSalary, {
    message: 'Mức lương tối đa phải lớn hơn hoặc bằng mức lương tối thiểu',
    path: ['maxSalary'],
  })
  .refine(data => Math.abs((data.textWeight + data.vectorWeight) - 1) < 0.001, {
    message: 'Tổng trọng số text và vector phải bằng 1',
    path: ['vectorWeight'],
  })
  .refine(data => {
    // Nếu có distance, phải có cả latitude và longitude
    if (data.distance && (!data.latitude || !data.longitude)) {
      return false;
    }
    return true;
  }, {
    message: 'Để lọc theo khoảng cách, bạn phải cung cấp cả latitude và longitude',
    path: ['distance'],
  })
  .refine(data => {
    // Nếu có district nhưng không có province, thì không hợp lệ
    if (data.district && !data.province) {
      return false;
    }
    // Nếu có cả province và district, kiểm tra district có thuộc province không
    if (data.province && data.district) {
      const provinceData = locationMap.get(data.province);
      if (!provinceData) return false;
      return provinceData.districts.some(d => d.name === data.district);
    }
    return true;
  }, {
    message: 'Quận/Huyện không thuộc Tỉnh/Thành phố đã chọn hoặc thiếu thông tin Tỉnh/Thành phố',
    path: ['district'],
  });
// Schema for autocomplete request
export const autocompleteJobSchema = z.object({
  query: z.string({
    required_error: 'Query là bắt buộc cho autocomplete'
  }).trim().min(1, 'Query không được để trống').max(100, 'Query không được vượt quá 100 ký tự'),
  limit: z.coerce.number().int().min(1, 'Limit phải lớn hơn 0').max(20, 'Limit không được vượt quá 20').default(10),
});

// Schema for map bounding box search
export const mapBoundsSchema = z.object({
  sw_lat: z.coerce.number().min(-90, 'Latitude phải trong khoảng -90 đến 90').max(90, 'Latitude phải trong khoảng -90 đến 90'),
  sw_lng: z.coerce.number().min(-180, 'Longitude phải trong khoảng -180 đến 180').max(180, 'Longitude phải trong khoảng -180 đến 180'),
  ne_lat: z.coerce.number().min(-90, 'Latitude phải trong khoảng -90 đến 90').max(90, 'Latitude phải trong khoảng -90 đến 90'),
  ne_lng: z.coerce.number().min(-180, 'Longitude phải trong khoảng -180 đến 180').max(180, 'Longitude phải trong khoảng -180 đến 180'),
  limit: z.coerce.number().int().min(1).max(500).default(500).optional(),
});

// Schema for map clustering
export const mapClusterSchema = z.object({
  sw_lat: z.coerce.number().min(-90, 'Latitude phải trong khoảng -90 đến 90').max(90, 'Latitude phải trong khoảng -90 đến 90'),
  sw_lng: z.coerce.number().min(-180, 'Longitude phải trong khoảng -180 đến 180').max(180, 'Longitude phải trong khoảng -180 đến 180'),
  ne_lat: z.coerce.number().min(-90, 'Latitude phải trong khoảng -90 đến 90').max(90, 'Latitude phải trong khoảng -90 đến 90'),
  ne_lng: z.coerce.number().min(-180, 'Longitude phải trong khoảng -180 đến 180').max(180, 'Longitude phải trong khoảng -180 đến 180'),
  zoom: z.coerce.number().int().min(1, 'Zoom phải lớn hơn 0').max(20, 'Zoom không được vượt quá 20'),
  // Các bộ lọc tùy chọn
  category: z.enum(jobCategoryEnum).optional(),
  type: z.enum(jobTypeEnum).optional(),
  workType: z.enum(workTypeEnum).optional(),
  experience: z.enum(experienceEnum).optional(),
  province: z.enum(provinceNames).optional(),
  district: z.string().optional(),
});

// Schema for candidate suggestions query parameters
export const candidateSuggestionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Trang phải lớn hơn 0').default(1),
  limit: z.coerce.number().int().min(1, 'Limit phải lớn hơn 0').max(50, 'Limit không được vượt quá 50').default(10),
  minScore: z.coerce.number().min(0, 'minScore phải từ 0 đến 1').max(1, 'minScore phải từ 0 đến 1').default(0.5),
});

// Schema for getting jobs by IDs (for job alert notifications)
export const getJobsByIdsSchema = z.object({
  ids: z.array(
    z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID không hợp lệ')
  ).min(1, 'Cần ít nhất 1 ID').max(50, 'Tối đa 50 IDs'),
});
