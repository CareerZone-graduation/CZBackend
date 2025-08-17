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

const locationSchema = z.object({
  province: z.enum(provinceNames, { required_error: 'Tỉnh/Thành phố là bắt buộc' }),
  // Tạm thời cho phép ward là string, sẽ validate trong .refine()
  ward: z.string({ required_error: 'Phường/Xã là bắt buộc' }),
});

export const createJobSchema = z.object({
  title: z.string().trim().min(5, 'Tiêu đề phải có ít nhất 5 ký tự').max(200),
  description: z.string().trim().min(20, 'Mô tả phải có ít nhất 20 ký tự').max(5000),
  requirements: z.string().trim().min(10, 'Yêu cầu phải có ít nhất 10 ký tự').max(2000),
  benefits: z.string().trim().min(10, 'Quyền lợi phải có ít nhất 10 ký tự').max(2000),
  location: locationSchema,
  address: z.string().trim().min(1, 'Địa chỉ chi tiết là bắt buộc').max(200),
  type: z.enum(jobTypeEnum),
  workType: z.enum(workTypeEnum),
  minSalary: z.coerce.number().min(0, 'Mức lương không thể là số âm').optional(),
  maxSalary: z.coerce.number().min(0, 'Mức lương không thể là số âm').optional(),
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
    const provinceData = locationMap.get(data.location.province);
    if (!provinceData) {
      return false; // Tỉnh không hợp lệ (dù enum đã check, đây là lớp bảo vệ thứ 2)
    }
    return provinceData.wards.includes(data.location.ward);
}, {
    message: 'Phường/Xã không thuộc Tỉnh/Thành phố đã chọn.',
    path: ['location', 'ward'],
});

export const updateJobSchema = z.object({
  title: z.string().trim().min(5, 'Tiêu đề phải có ít nhất 5 ký tự').max(200).optional(),
  description: z.string().trim().min(20, 'Mô tả phải có ít nhất 20 ký tự').max(5000).optional(),
  requirements: z.string().trim().min(10, 'Yêu cầu phải có ít nhất 10 ký tự').max(2000).optional(),
  benefits: z.string().trim().min(10, 'Quyền lợi phải có ít nhất 10 ký tự').max(2000).optional(),
  location: locationSchema.optional(),
  address: z.string().trim().min(1, 'Địa chỉ chi tiết là bắt buộc').max(200).optional(),
  type: z.enum(jobTypeEnum).optional(),
  workType: z.enum(workTypeEnum).optional(),
  minSalary: z.coerce.number().min(0, 'Mức lương không thể là số âm').optional(),
  maxSalary: z.coerce.number().min(0, 'Mức lương không thể là số âm').optional(),
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
    // Chỉ validate location nếu nó được cung cấp
    if (!data.location) {
      return true;
    }
    // Cả province và ward đều phải được cung cấp nếu location tồn tại
    if (!data.location.province || !data.location.ward) {
      return false; // Hoặc có thể đặt message cụ thể hơn
    }
    const provinceData = locationMap.get(data.location.province);
    if (!provinceData) {
      return false; // Tỉnh không hợp lệ
    }
    return provinceData.wards.includes(data.location.ward);
}, {
    message: 'Phường/Xã không thuộc Tỉnh/Thành phố đã chọn.',
    path: ['location', 'ward'],
});

export const jobQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.enum(jobStatusEnum).optional(),
  sortBy: z.string().optional(),
});

export const applyToJobSchema = z.object({
  // CV ID
  cvId: z.string().trim().optional(),
  cvTemplateId: z.string().trim().optional(),
  
  // Thư xin việc
  coverLetter: z.string().trim().max(2000, 'Thư xin việc không được vượt quá 2000 ký tự').optional(),
  
  // Thông tin cá nhân từ form
  candidateName: z.string({required_error: "Họ tên là bắt buộc"}).trim().min(2, 'Họ tên phải có ít nhất 2 ký tự').max(100, 'Họ tên không được vượt quá 100 ký tự'),
  candidateEmail: z.string({required_error: "Email là bắt buộc"}).trim().email('Email không hợp lệ'),
  candidatePhone: z.string({required_error: "Số điện thoại là bắt buộc"}).trim().regex(/^[\+]?[\d]{1,15}$/, 'Số điện thoại không hợp lệ'),
}).refine(data => {
  // Điều kiện XOR: một trong hai trường phải tồn tại, nhưng không phải cả hai.
  return (data.cvId && !data.cvTemplateId) || (!data.cvId && data.cvTemplateId);
}, {
  message: 'Bạn phải cung cấp `cvId` (cho CV tải lên) hoặc `cvTemplateId` (cho CV tạo từ mẫu). Không thể cung cấp cả hai hoặc không cung cấp trường nào.',
  path: ['cvId'], // Báo lỗi ở trường đầu tiên để dễ xử lý
});
