import { z } from 'zod';

/**
 * Job related validation schemas
 */

/**
 * Job type enum values
 */
const jobTypeEnum = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY', 'VOLUNTEER', 'FREELANCE'];

/**
 * Experience level enum values
 */
const experienceEnum = ['ENTRY_LEVEL', 'MID_LEVEL', 'SENIOR_LEVEL', 'EXECUTIVE', 'NO_EXPERIENCE', 'INTERN', 'FRESHER'];

/**
 * Job category enum values
 */
const jobCategoryEnum = [
  'IT', 'SOFTWARE_DEVELOPMENT', 'DATA_SCIENCE', 'MACHINE_LEARNING', 'WEB_DEVELOPMENT',
  'SALES', 'MARKETING', 'ACCOUNTING', 'GRAPHIC_DESIGN', 'CONTENT_WRITING',
  'MEDICAL', 'TEACHING', 'ENGINEERING', 'PRODUCTION', 'LOGISTICS',
  'HOSPITALITY', 'REAL_ESTATE', 'LAW', 'FINANCE', 'HUMAN_RESOURCES',
  'CUSTOMER_SERVICE', 'ADMINISTRATION', 'MANAGEMENT', 'OTHER'
];

/**
 * Create job request validation schema
 * @typedef {Object} CreateJobRequest
 * @property {string} title - Job title (5-200 chars)
 * @property {string} description - Job description (20-5000 chars)
 * @property {string} location - Job location (max 200 chars)
 * @property {string} type - Job type (enum)
 * @property {string} minSalary - Minimum salary (optional, numeric string)
 * @property {string} maxSalary - Maximum salary (optional, numeric string)
 * @property {Date} deadline - Application deadline (future date)
 * @property {string} experience - Required experience level (enum)
 * @property {string} category - Job category (enum)
 * @property {string} area - Job area/region (optional, max 100 chars)
 * @property {boolean} active - Whether job is active (optional)
 */
export const createJobSchema = z.object({
  title: z.string()
    .min(5, 'Tiêu đề phải từ 5 đến 200 ký tự')
    .max(200, 'Tiêu đề phải từ 5 đến 200 ký tự')
    .trim(),
  description: z.string()
    .min(20, 'Mô tả phải từ 20 đến 5000 ký tự')
    .max(5000, 'Mô tả phải từ 20 đến 5000 ký tự')
    .trim(),
  location: z.string()
    .min(1, 'Địa điểm không được để trống')
    .max(200, 'Địa điểm không được dài quá 200 ký tự')
    .trim(),
  type: z.enum(jobTypeEnum, {
    errorMap: () => ({ message: 'Loại công việc không hợp lệ' })
  }),
  minSalary: z.string()
    .regex(/^\d+$/, 'Mức lương tối thiểu phải là số')
    .optional(),
  maxSalary: z.string()
    .regex(/^\d+$/, 'Mức lương tối đa phải là số')
    .optional(),
  deadline: z.string()
    .datetime('Hạn chót phải là ngày hợp lệ')
    .transform((str) => new Date(str))
    .refine((date) => date > new Date(), 'Hạn chót phải là trong tương lai'),
  experience: z.enum(experienceEnum, {
    errorMap: () => ({ message: 'Mức độ kinh nghiệm không hợp lệ' })
  }),
  category: z.enum(jobCategoryEnum, {
    errorMap: () => ({ message: 'Danh mục công việc không hợp lệ' })
  }),
  area: z.string()
    .max(100, 'Khu vực không được dài quá 100 ký tự')
    .trim()
    .optional(),
  active: z.boolean().default(true).optional()
});

/**
 * Update job request validation schema
 * Same as create but all fields are optional except id
 */
export const updateJobSchema = z.object({
  title: z.string()
    .min(5, 'Tiêu đề phải từ 5 đến 200 ký tự')
    .max(200, 'Tiêu đề phải từ 5 đến 200 ký tự')
    .trim()
    .optional(),
  description: z.string()
    .min(20, 'Mô tả phải từ 20 đến 5000 ký tự')
    .max(5000, 'Mô tả phải từ 20 đến 5000 ký tự')
    .trim()
    .optional(),
  location: z.string()
    .min(1, 'Địa điểm không được để trống')
    .max(200, 'Địa điểm không được dài quá 200 ký tự')
    .trim()
    .optional(),
  type: z.enum(jobTypeEnum, {
    errorMap: () => ({ message: 'Loại công việc không hợp lệ' })
  }).optional(),
  minSalary: z.string()
    .regex(/^\d+$/, 'Mức lương tối thiểu phải là số')
    .optional(),
  maxSalary: z.string()
    .regex(/^\d+$/, 'Mức lương tối đa phải là số')
    .optional(),
  deadline: z.string()
    .datetime('Hạn chót phải là ngày hợp lệ')
    .transform((str) => new Date(str))
    .refine((date) => date > new Date(), 'Hạn chót phải là trong tương lai')
    .optional(),
  experience: z.enum(experienceEnum, {
    errorMap: () => ({ message: 'Mức độ kinh nghiệm không hợp lệ' })
  }).optional(),
  category: z.enum(jobCategoryEnum, {
    errorMap: () => ({ message: 'Danh mục công việc không hợp lệ' })
  }).optional(),
  area: z.string()
    .max(100, 'Khu vực không được dài quá 100 ký tự')
    .trim()
    .optional(),
  active: z.boolean().optional()
});

/**
 * Job search/filter query validation schema
 * @typedef {Object} JobSearchQuery
 * @property {string} keyword - Search keyword (optional)
 * @property {string} location - Location filter (optional)
 * @property {string} type - Job type filter (optional)
 * @property {string} category - Category filter (optional)
 * @property {string} experience - Experience filter (optional)
 * @property {number} page - Page number (default 1)
 * @property {number} limit - Items per page (default 10, max 100)
 */
export const jobSearchSchema = z.object({
  keyword: z.string().trim().optional(),
  location: z.string().trim().optional(),
  type: z.enum(jobTypeEnum).optional(),
  category: z.enum(jobCategoryEnum).optional(),
  experience: z.enum(experienceEnum).optional(),
  page: z.string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0, 'Page must be greater than 0')
    .default('1'),
  limit: z.string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0 && val <= 100, 'Limit must be between 1 and 100')
    .default('10')
});
