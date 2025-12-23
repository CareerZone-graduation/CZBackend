import { z } from 'zod';
import { provinceNames } from '../constants/locations.enum.js';

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

export const getMapClustersSchema = z.object({
  // Tọa độ là bắt buộc và phải là số
  sw_lat: z.coerce.number().min(-95).max(95),
  sw_lng: z.coerce.number().min(-185).max(185),
  ne_lat: z.coerce.number().min(-95).max(95),
  ne_lng: z.coerce.number().min(-185).max(185),

  // Zoom là bắt buộc và là số nguyên
  zoom: z.coerce.number().int().min(1).max(20),

  // Các bộ lọc khác là tùy chọn
  query: z.string().trim().max(200).optional(),
  category: z.enum(jobCategoryEnum).optional(),
  type: z.enum(jobTypeEnum).optional(),
  workType: z.enum(workTypeEnum).optional(),
  experience: z.enum(experienceEnum).optional(),
  province: z.enum(provinceNames).optional(),
  district: z.string().optional(),
  minSalary: z.coerce.number().optional(),
  maxSalary: z.coerce.number().optional(),
});
