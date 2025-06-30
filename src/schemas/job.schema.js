import { z } from 'zod';

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
  city: z.string().trim().min(1, 'Tên thành phố là bắt buộc').max(100),
  district: z.string().trim().min(1, 'Tên quận/huyện là bắt buộc').max(100),
  address: z.string().trim().min(1, 'Địa chỉ chi tiết là bắt buộc').max(200),
});

export const createJobSchema = z.object({
  title: z.string().trim().min(5, 'Tiêu đề phải có ít nhất 5 ký tự').max(200),
  description: z.string().trim().min(20, 'Mô tả phải có ít nhất 20 ký tự').max(5000),
  requirements: z.string().trim().min(10, 'Yêu cầu phải có ít nhất 10 ký tự').max(2000),
  benefits: z.string().trim().min(10, 'Quyền lợi phải có ít nhất 10 ký tự').max(2000),
  location: locationSchema,
  type: z.nativeEnum(Object.fromEntries(jobTypeEnum.map(v => [v, v]))),
  workType: z.nativeEnum(Object.fromEntries(workTypeEnum.map(v => [v, v]))),
  minSalary: z.coerce.number().min(0, 'Mức lương không thể là số âm').optional(),
  maxSalary: z.coerce.number().min(0, 'Mức lương không thể là số âm').optional(),
  deadline: z.coerce.date().refine((date) => date > new Date(), 'Hạn chót phải là một ngày trong tương lai'),
  experience: z.nativeEnum(Object.fromEntries(experienceEnum.map(v => [v, v]))),
  category: z.nativeEnum(Object.fromEntries(jobCategoryEnum.map(v => [v, v]))),
}).refine(data => !data.minSalary || !data.maxSalary || data.maxSalary >= data.minSalary, {
  message: 'Lương tối đa phải lớn hơn hoặc bằng lương tối thiểu',
  path: ['maxSalary'],
});

export const updateJobSchema = z.object({
  title: z.string().trim().min(5, 'Tiêu đề phải có ít nhất 5 ký tự').max(200).optional(),
  description: z.string().trim().min(20, 'Mô tả phải có ít nhất 20 ký tự').max(5000).optional(),
  requirements: z.string().trim().min(10, 'Yêu cầu phải có ít nhất 10 ký tự').max(2000).optional(),
  benefits: z.string().trim().min(10, 'Quyền lợi phải có ít nhất 10 ký tự').max(2000).optional(),
  location: locationSchema.optional(),
  type: z.nativeEnum(Object.fromEntries(jobTypeEnum.map(v => [v, v]))).optional(),
  workType: z.nativeEnum(Object.fromEntries(workTypeEnum.map(v => [v, v]))).optional(),
  minSalary: z.coerce.number().min(0, 'Mức lương không thể là số âm').optional(),
  maxSalary: z.coerce.number().min(0, 'Mức lương không thể là số âm').optional(),
  deadline: z.coerce.date().refine((date) => date > new Date(), 'Hạn chót phải là một ngày trong tương lai').optional(),
  experience: z.nativeEnum(Object.fromEntries(experienceEnum.map(v => [v, v]))).optional(),
  category: z.nativeEnum(Object.fromEntries(jobCategoryEnum.map(v => [v, v]))).optional(),
  status: z.nativeEnum(Object.fromEntries(jobStatusEnum.map(v => [v, v]))).optional(),
}).refine(data => !data.minSalary || !data.maxSalary || data.maxSalary >= data.minSalary, {
    message: 'Lương tối đa phải lớn hơn hoặc bằng lương tối thiểu',
    path: ['maxSalary'],
});

export const jobQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.nativeEnum(Object.fromEntries(jobStatusEnum.map(v => [v, v]))).optional(),
  sortBy: z.string().optional(),
});

export const applyToJobSchema = z.object({
  cvId: z.string().trim().optional(),
  cvTemplateId: z.string().trim().optional(),
  coverLetter: z.string().trim().max(2000, 'Thư xin việc không được vượt quá 2000 ký tự').optional(),
}).refine(data => {
  // Điều kiện XOR: một trong hai trường phải tồn tại, nhưng không phải cả hai.
  return (data.cvId && !data.cvTemplateId) || (!data.cvId && data.cvTemplateId);
}, {
  message: 'Bạn phải cung cấp `cvId` (cho CV tải lên) hoặc `cvTemplateId` (cho CV tạo từ mẫu). Không thể cung cấp cả hai hoặc không cung cấp trường nào.',
  path: ['cvId'], // Báo lỗi ở trường đầu tiên để dễ xử lý
});
