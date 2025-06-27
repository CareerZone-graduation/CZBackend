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
    .trim()
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
  companyName: z.string()
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
    .optional()
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
    .regex(/^[\+]?[1-9][\d]{0,15}$/, 'Số điện thoại không hợp lệ') // Updated regex to match Mongoose schema
    .optional(),
  bio: z.string()
    .max(1000, 'Mô tả không được dài quá 1000 ký tự')
    .trim()
    .optional(),
  skills: z.array(skillSchema).optional(), // Changed to use skillSchema
  educations: z.array(educationSchema).optional(),
  experiences: z.array(experienceSchema).optional(),
  cvs: z.array(cvSchema).optional(),
  // Recruiter-specific fields
  contact: z.string()
    .max(200, 'Thông tin liên hệ không được dài quá 200 ký tự')
    .trim()
    .optional(),
  isRepresentative: z.boolean().optional(),
  company: z.string().optional() // Assuming company ID is a string
});

/**
 * Candidate profile update validation schema
 */
export const candidateProfileSchema = z.object({
  fullname: z.string()
    .min(1, 'Họ tên không được để trống')
    .max(100, 'Họ tên không được dài quá 100 ký tự')
    .trim()
    .optional(),
  avatar: z.string().trim().optional(),
  phone: z.string()
    .regex(/^[\+]?[1-9][\d]{0,15}$/, 'Số điện thoại không hợp lệ')
    .optional(),
  bio: z.string()
    .max(1000, 'Mô tả không được dài quá 1000 ký tự')
    .trim()
    .optional(),
  skills: z.array(z.string()).optional(),
  educations: z.array(educationSchema).optional(),
  experiences: z.array(experienceSchema).optional(),
  cvs: z.array(cvSchema).optional(),
});

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
    .regex(/^[\+]?[1-9][\d]{0,15}$/, 'Số điện thoại không hợp lệ') // Updated regex to match Mongoose schema
    .optional(),
  bio: z.string()
    .max(1000, 'Mô tả không được dài quá 1000 ký tự')
    .trim()
    .optional(),
  skills: z.array(skillSchema).optional(), // Changed to use skillSchema
  educations: z.array(educationSchema).optional(),
  experiences: z.array(experienceSchema).optional(),
  cvs: z.array(cvSchema).optional(),
  // Recruiter-specific fields
  contact: z.string()
    .max(200, 'Thông tin liên hệ không được dài quá 200 ký tự')
    .trim()
    .optional(),
  isRepresentative: z.boolean().optional(),
  company: z.string().optional() // Assuming company ID is a string
});
