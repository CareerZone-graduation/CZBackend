import { z } from 'zod';

/**
 * User profile related validation schemas
 */

/**
 * Skill request validation schema
 * @typedef {Object} SkillRequest
 * @property {string} name - Skill name
 */
export const skillSchema = z.object({
  name: z.string()
    .min(1, 'Tên kỹ năng không được để trống')
    .max(100, 'Tên kỹ năng không được dài quá 100 ký tự')
    .trim(),
  level: z.enum(['Beginner', 'Intermediate', 'Advanced', 'Expert']).nullable().optional(),
  category: z.enum(['Technical', 'Soft Skills', 'Language', 'Other']).nullable().optional()
});

/**
 * Education request validation schema
 * @typedef {Object} EducationRequest
 * @property {string} educationId - Education ID (optional for updates)
 * @property {string} school - School/University name
 * @property {string} major - Field of study/Major
 * @property {string} degree - Degree type
 * @property {string} startDate - Start date
 * @property {string} endDate - End date (optional)
 * @property {string} description - Additional description (optional)
 * @property {string} gpa - Grade Point Average (optional)
 * @property {string} type - Education type (optional)
 */
export const educationSchema = z.object({
  educationId: z.string().optional(),
  school: z.string()
    .min(1, 'Tên trường không được để trống')
    .max(200, 'Tên trường không được dài quá 200 ký tự')
    .trim(),
  major: z.string()
    .min(1, 'Chuyên ngành không được để trống')
    .max(200, 'Chuyên ngành không được dài quá 200 ký tự')
    .trim(),
  degree: z.string()
    .min(1, 'Bằng cấp không được để trống')
    .max(100, 'Bằng cấp không được dài quá 100 ký tự')
    .trim(),
  startDate: z.string()
    .min(1, 'Ngày bắt đầu không được để trống'),
  endDate: z.string().optional(),
  description: z.string()
    .max(1000, 'Mô tả không được dài quá 1000 ký tự')
    .trim()
    .optional(),
  gpa: z.string()
    .trim()
    .optional(),
  type: z.string()
    .max(50, 'Loại học vấn không được dài quá 50 ký tự')
    .trim()
    .optional(),
  location: z.string()
    .max(200, 'Địa điểm không được dài quá 200 ký tự')
    .trim()
    .optional(),
  honors: z.string()
    .max(500, 'Danh hiệu không được dài quá 500 ký tự')
    .trim()
    .optional()
});

/**
 * Experience request validation schema
 * @typedef {Object} ExperienceRequest
 * @property {string} experienceId - Experience ID (optional for updates)
 * @property {string} companyName - Company name
 * @property {string} position - Job position/title
 * @property {string} startDate - Start date
 * @property {string} endDate - End date (optional)
 * @property {string} description - Job description (optional)
 */
export const experienceSchema = z.object({
  experienceId: z.string().optional(),
  company: z.string()
    .min(1, 'Tên công ty không được để trống')
    .max(200, 'Tên công ty không được dài quá 200 ký tự')
    .trim(),
  position: z.string()
    .min(1, 'Vị trí công việc không được để trống')
    .max(200, 'Vị trí công việc không được dài quá 200 ký tự')
    .trim(),
  startDate: z.string()
    .min(1, 'Ngày bắt đầu không được để trống'),
  endDate: z.string().optional(),
  description: z.string()
    .max(2000, 'Mô tả không được dài quá 2000 ký tự')
    .trim()
    .optional(),
  responsibilities: z.array(z.string().max(500, 'Trách nhiệm không được dài quá 500 ký tự')).optional(),
  location: z.string().max(200, 'Địa điểm không được dài quá 200 ký tự').trim().optional(),
  isCurrentJob: z.boolean().optional(),
  achievements: z.array(z.string().max(500, 'Thành tựu không được dài quá 500 ký tự')).optional()
});

/**
 * CV request validation schema
 * @typedef {Object} CVRequest
 * @property {string} cvId - CV ID (optional for updates)
 * @property {string} name - CV name
 * @property {string} path - CV file path/URL
 * @property {boolean} active - Whether CV is active
 */
export const cvSchema = z.object({
  cvId: z.string().optional(),
  name: z.string()
    .min(1, 'Tên CV không được để trống')
    .max(200, 'Tên CV không được dài quá 200 ký tự')
    .trim(),
  path: z.string()
    .min(1, 'Đường dẫn CV không được để trống')
    .trim(),
  active: z.boolean().default(true).optional()
});

/**
 * Certificate request validation schema
 */
export const certificateSchema = z.object({
  certificateId: z.string().optional(),
  name: z.string()
    .min(1, 'Tên chứng chỉ không được để trống')
    .max(200, 'Tên chứng chỉ không được dài quá 200 ký tự')
    .trim(),
  issuer: z.string()
    .min(1, 'Tổ chức cấp không được để trống')
    .max(200, 'Tổ chức cấp không được dài quá 200 ký tự')
    .trim(),
  issueDate: z.string()
    .min(1, 'Ngày cấp không được để trống'),
  expiryDate: z.string().optional(),
  credentialId: z.string()
    .max(100, 'ID chứng chỉ không được dài quá 100 ký tự')
    .trim()
    .optional(),
  url: z.string()
    .max(500, 'URL không được dài quá 500 ký tự')
    .trim()
    .optional()
});

/**
 * Project request validation schema
 */
export const projectSchema = z.object({
  projectId: z.string().optional(),
  name: z.string()
    .min(1, 'Tên dự án không được để trống')
    .max(200, 'Tên dự án không được dài quá 200 ký tự')
    .trim(),
  description: z.string()
    .max(1000, 'Mô tả không được dài quá 1000 ký tự')
    .trim()
    .optional(),
  url: z.string()
    .max(500, 'URL không được dài quá 500 ký tự')
    .trim()
    .optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  technologies: z.array(z.string().max(100, 'Tên công nghệ không được dài quá 100 ký tự')).optional()
});

/**
 * Unified User profile request validation schema
 * @typedef {Object} UserProfileRequest
 * @property {string} fullname - Full name
 * @property {string} email - Email address
 * @property {string} avatar - Profile picture URL (optional, candidate-specific)
 * @property {string} phone - Phone number (optional, candidate-specific)
 * @property {string} bio - Biography/About section (optional, candidate-specific)
 * @property {Array<SkillRequest>} skills - Array of skills (optional, candidate-specific)
 * @property {Array<EducationRequest>} educations - Array of education records (optional, candidate-specific)
 * @property {Array<ExperienceRequest>} experiences - Array of work experiences (optional, candidate-specific)
 * @property {Array<CVRequest>} cvs - Array of CVs (optional, candidate-specific)
 * @property {string} contact - Contact information (optional, recruiter-specific)
 * @property {boolean} isRepresentative - Whether this recruiter is a company representative (optional, recruiter-specific)
 * @property {string} company - Company ID (optional, recruiter-specific)
 */
export const userProfileSchema = z.object({
  fullname: z.string()
    .min(1, 'Họ tên không được để trống')
    .max(100, 'Họ tên không được dài quá 100 ký tự')
    .trim(),
  email: z.string()
    .email('Email phải đúng định dạng')
    .toLowerCase()
    .trim(),
  // Candidate-specific fields
  avatar: z.string().trim().optional(),
  phone: z.string()
    .regex(/^[\+]?[\d]{1,15}$/, 'Số điện thoại không hợp lệ') // Cho phép bắt đầu bằng 0 và tối đa 15 chữ số
    .optional(),
  bio: z.string()
    .max(1000, 'Mô tả không được dài quá 1000 ký tự')
    .trim()
    .optional(),
  skills: z.array(skillSchema).optional(), // Changed to use skillSchema
  educations: z.array(educationSchema).optional(),
  experiences: z.array(experienceSchema).optional(),
  cvs: z.array(cvSchema).optional(),
  // Contact & Social Links
  address: z.string()
    .max(300, 'Địa chỉ không được dài quá 300 ký tự')
    .trim()
    .optional()
    .transform(val => val === '' ? undefined : val),
  website: z.string()
    .max(200, 'Website không được dài quá 200 ký tự')
    .trim()
    .optional()
    .transform(val => val === '' ? undefined : val),
  linkedin: z.string()
    .max(200, 'LinkedIn URL không được dài quá 200 ký tự')
    .trim()
    .optional()
    .transform(val => val === '' ? undefined : val),
  github: z.string()
    .max(200, 'Github URL không được dài quá 200 ký tự')
    .trim()
    .optional()
    .transform(val => val === '' ? undefined : val),
  // Recruiter-specific fields
  contact: z.string()
    .max(200, 'Thông tin liên hệ không được dài quá 200 ký tự')
    .trim()
    .optional(),
  isRepresentative: z.boolean().optional(),
  company: z.string().optional() // Assuming company ID is a string
});

/**
 * Candidate profile update validation schema (for PUT - full update)
 */
export const candidateProfileSchema = z.object({
  fullname: z.string()
    .min(2, 'Họ tên phải có ít nhất 2 ký tự')
    .max(100, 'Họ tên không được dài quá 100 ký tự')
    .trim(),
  phone: z.string()
    .regex(/^[\+]?[\d\-\s\(\)]{10,15}$/, 'Số điện thoại không hợp lệ')
    .trim(),
  bio: z.string()
    .max(1000, 'Mô tả không được dài quá 1000 ký tự')
    .trim()
    .default(''),
  skills: z.array(skillSchema)
    .max(50, 'Không được vượt quá 50 kỹ năng')
    .default([]),
  educations: z.array(educationSchema)
    .max(10, 'Không được vượt quá 10 học vấn')
    .default([]),
  experiences: z.array(experienceSchema)
    .max(15, 'Không được vượt quá 15 kinh nghiệm')
    .default([]),
  certificates: z.array(certificateSchema)
    .max(10, 'Không được vượt quá 10 chứng chỉ')
    .default([]),
  projects: z.array(projectSchema)
    .max(10, 'Không được vượt quá 10 dự án')
    .default([]),
  // Contact & Social Links
  address: z.string()
    .max(300, 'Địa chỉ không được dài quá 300 ký tự')
    .trim()
    .default(''),
  website: z.string()
    .max(200, 'Website không được dài quá 200 ký tự')
    .trim()
    .default(''),
  linkedin: z.string()
    .max(200, 'LinkedIn URL không được dài quá 200 ký tự')
    .trim()
    .default(''),
  github: z.string()
    .max(200, 'Github URL không được dài quá 200 ký tự')
    .trim()
    .default('')
}).strict();

/**
 * Candidate profile partial update validation schema (for PATCH)
 */
export const candidateProfilePartialSchema = candidateProfileSchema.partial();

/**
 * Update unified User profile schema (all fields optional)
 */
export const updateUserProfileSchema = z.object({
  fullname: z.string()
    .min(1, 'Họ tên không được để trống')
    .max(100, 'Họ tên không được dài quá 100 ký tự')
    .trim()
    .optional(),
  email: z.string()
    .email('Email phải đúng định dạng')
    .toLowerCase()
    .trim()
    .optional(),
  // Candidate-specific fields
  avatar: z.string().trim().optional(),
  phone: z.string()
    .regex(/^[\+]?[\d]{1,15}$/, 'Số điện thoại không hợp lệ')// Updated regex to match Mongoose schema
    .optional(),
  bio: z.string()
    .max(1000, 'Mô tả không được dài quá 1000 ký tự')
    .trim()
    .optional(),
  skills: z.array(skillSchema).optional(), // Changed to use skillSchema
  educations: z.array(educationSchema).optional(),
  experiences: z.array(experienceSchema).optional(),
  cvs: z.array(cvSchema).optional(),
  // Contact & Social Links
  address: z.string()
    .max(300, 'Địa chỉ không được dài quá 300 ký tự')
    .trim()
    .optional()
    .transform(val => val === '' ? undefined : val),
  website: z.string()
    .max(200, 'Website không được dài quá 200 ký tự')
    .trim()
    .optional()
    .transform(val => val === '' ? undefined : val),
  linkedin: z.string()
    .max(200, 'LinkedIn URL không được dài quá 200 ký tự')
    .trim()
    .optional()
    .transform(val => val === '' ? undefined : val),
  github: z.string()
    .max(200, 'Github URL không được dài quá 200 ký tự')
    .trim()
    .optional()
    .transform(val => val === '' ? undefined : val),
  // Recruiter-specific fields
  contact: z.string()
    .max(200, 'Thông tin liên hệ không được dài quá 200 ký tự')
    .trim()
    .optional(),
  isRepresentative: z.boolean().optional(),
  company: z.string().optional() // Assuming company ID is a string
});

export const getRechargeHistorySchema = z.object({
  page: z.string().regex(/^\d+$/, "Trang phải là một số").optional().default('1'),
  limit: z.string().regex(/^\d+$/, "Giới hạn phải là một số").optional().default('10'),
});

/**
 * Location schema for preferred locations
 */
export const locationSchema = z.object({
  province: z.string()
    .min(1, 'Tỉnh/Thành phố không được để trống')
    .trim(),
  district: z.string()
    .trim()
    .nullable()
    .optional()
});

/**
 * Expected salary schema
 */
export const expectedSalarySchema = z.object({
  min: z.number()
    .min(0, 'Mức lương tối thiểu không được âm')
    .optional(),
  max: z.number()
    .min(0, 'Mức lương tối đa không được âm')
    .optional(),
  currency: z.enum(['VND', 'USD'], {
    errorMap: () => ({ message: 'Đơn vị tiền tệ phải là VND hoặc USD' })
  }).default('VND')
}).refine(
  (data) => !data.min || !data.max || data.max >= data.min,
  {
    message: 'Mức lương tối đa phải lớn hơn hoặc bằng mức lương tối thiểu',
    path: ['max']
  }
);

/**
 * Work preferences schema
 */
export const workPreferencesSchema = z.object({
  workTypes: z.array(
    z.enum(['ON_SITE', 'REMOTE', 'HYBRID'], {
      errorMap: () => ({ message: 'Loại hình làm việc không hợp lệ' })
    })
  ).optional(),
  contractTypes: z.array(
    z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY', 'FREELANCE'], {
      errorMap: () => ({ message: 'Loại hợp đồng không hợp lệ' })
    })
  ).optional(),
  experienceLevel: z.enum(
    ['ENTRY_LEVEL', 'MID_LEVEL', 'SENIOR_LEVEL', 'EXECUTIVE', 'NO_EXPERIENCE', 'INTERN', 'FRESHER'],
    {
      errorMap: () => ({ message: 'Mức độ kinh nghiệm không hợp lệ' })
    }
  ).optional()
});

/**
 * Profile preferences schema
 * For PUT /api/candidate/profile/preferences
 */
export const profilePreferencesSchema = z.object({
  expectedSalary: expectedSalarySchema.optional(),
  preferredLocations: z.array(locationSchema)
    .max(10, 'Không được vượt quá 10 địa điểm ưa thích')
    .optional(),
  workPreferences: workPreferencesSchema.optional(),
  preferredCategories: z.array(
    z.enum([
      'IT', 'SOFTWARE_DEVELOPMENT', 'DATA_SCIENCE', 'MACHINE_LEARNING', 'WEB_DEVELOPMENT',
      'SALES', 'MARKETING', 'ACCOUNTING', 'GRAPHIC_DESIGN', 'CONTENT_WRITING',
      'MEDICAL', 'TEACHING', 'ENGINEERING', 'PRODUCTION', 'LOGISTICS',
      'HOSPITALITY', 'REAL_ESTATE', 'LAW', 'FINANCE', 'HUMAN_RESOURCES',
      'CUSTOMER_SERVICE', 'ADMINISTRATION', 'MANAGEMENT', 'OTHER'
    ])
  )
    .min(1, 'Vui lòng chọn ít nhất 1 ngành nghề')
    .max(5, 'Không được chọn quá 5 ngành nghề')
    .optional()
});

/**
 * Profile completeness query schema
 * For GET /api/candidate/profile/completeness
 */
export const profileCompletenessQuerySchema = z.object({
  recalculate: z.enum(['true', 'false'])
    .transform(val => val === 'true')
    .optional()
    .default('false')
});

/**
 * Privacy settings schema
 * For PATCH /api/v1/candidates/settings/privacy
 */
export const privacySettingsSchema = z.object({
  allowSearch: z.boolean({
    required_error: 'Trường allowSearch là bắt buộc',
    invalid_type_error: 'allowSearch phải là giá trị boolean'
  })
});
