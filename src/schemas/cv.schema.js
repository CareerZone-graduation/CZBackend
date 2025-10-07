// src/schemas/cv.schema.js
import { z } from 'zod';

// Schema cho PersonalInfo
const personalInfoSchema = z.object({
  firstName: z.string().max(100, 'Tên không được vượt quá 100 ký tự').optional(),
  lastName: z.string().max(100, 'Họ không được vượt quá 100 ký tự').optional(),
  email: z.string().email('Email không hợp lệ').optional(),
  phone: z.string().regex(/^[\+]?[\d]{1,15}$/, 'Số điện thoại không hợp lệ').optional(),
  address: z.string().max(200, 'Địa chỉ không được vượt quá 200 ký tự').optional(),
  linkedin: z.string().url('LinkedIn URL không hợp lệ').optional(),
  github: z.string().url('GitHub URL không hợp lệ').optional(),
  portfolio: z.string().url('Portfolio URL không hợp lệ').optional(),
  avatar: z.string().url('Avatar URL không hợp lệ').optional()
}).optional();

// Schema cho Skill
const skillSchema = z.object({
  name: z.string().min(1, 'Tên kỹ năng là bắt buộc').max(100, 'Tên kỹ năng không được vượt quá 100 ký tự')
});

// Schema cho Education
const educationSchema = z.object({
  school: z.string().min(1, 'Tên trường là bắt buộc').max(200, 'Tên trường không được vượt quá 200 ký tự'),
  major: z.string().min(1, 'Chuyên ngành là bắt buộc').max(200, 'Chuyên ngành không được vượt quá 200 ký tự'),
  degree: z.string().min(1, 'Bằng cấp là bắt buộc').max(100, 'Bằng cấp không được vượt quá 100 ký tự'),
  startDate: z.string().min(1, 'Ngày bắt đầu là bắt buộc'),
  endDate: z.string().optional(),
  description: z.string().max(1000, 'Mô tả không được vượt quá 1000 ký tự').optional(),
  gpa: z.string().optional(),
  type: z.string().max(50, 'Loại không được vượt quá 50 ký tự').optional()
});

// Schema cho Experience
const experienceSchema = z.object({
  companyName: z.string().min(1, 'Tên công ty là bắt buộc').max(200, 'Tên công ty không được vượt quá 200 ký tự'),
  position: z.string().min(1, 'Vị trí là bắt buộc').max(200, 'Vị trí không được vượt quá 200 ký tự'),
  startDate: z.string().min(1, 'Ngày bắt đầu là bắt buộc'),
  endDate: z.string().optional(),
  description: z.string().max(2000, 'Mô tả không được vượt quá 2000 ký tự').optional()
});

// Schema cho Award/Certification
const awardCertificationSchema = z.object({
  name: z.string().max(200, 'Tên giải thưởng/chứng chỉ không được vượt quá 200 ký tự').optional(),
  issuer: z.string().max(200, 'Đơn vị cấp không được vượt quá 200 ký tự').optional(),
  date: z.string().optional(),
  description: z.string().max(1000, 'Mô tả không được vượt quá 1000 ký tự').optional()
});

// Schema cho Project
const projectSchema = z.object({
  name: z.string().max(200, 'Tên dự án không được vượt quá 200 ký tự').optional(),
  description: z.string().max(2000, 'Mô tả dự án không được vượt quá 2000 ký tự').optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  url: z.string().url('URL không hợp lệ').optional(),
  technologies: z.array(z.string().max(100, 'Tên công nghệ không được vượt quá 100 ký tự')).optional()
});

// Schema cho Reference
const referenceSchema = z.object({
  name: z.string().max(200, 'Tên người giới thiệu không được vượt quá 200 ký tự').optional(),
  title: z.string().max(200, 'Chức danh không được vượt quá 200 ký tự').optional(),
  company: z.string().max(200, 'Tên công ty không được vượt quá 200 ký tự').optional(),
  email: z.string().email('Email không hợp lệ').optional(),
  phone: z.string().regex(/^[\+]?[\d]{1,15}$/, 'Số điện thoại không hợp lệ').optional()
});

// Schema chính cho CV
export const createCvSchema = z.object({
  name: z.string().min(1, 'Tên CV là bắt buộc').max(200, 'Tên CV không được vượt quá 200 ký tự'),
  templateId: z.string().min(1, 'Template ID là bắt buộc'),
  personalInfo: personalInfoSchema,
  summary: z.string().max(2000, 'Tóm tắt không được vượt quá 2000 ký tự').optional(),
  skills: z.array(skillSchema).optional(),
  educations: z.array(educationSchema).optional(),
  experiences: z.array(experienceSchema).optional(),
  awardsAndCertifications: z.array(awardCertificationSchema).optional(),
  projects: z.array(projectSchema).optional(),
  references: z.array(referenceSchema).optional()
});

export const updateCvSchema = createCvSchema.partial();


export const duplicateCvSchema = z.object({
  name: z.string().min(1, 'Tên CV là bắt buộc').max(200, 'Tên CV không được vượt quá 200 ký tự')
});

// Schema để tạo CV từ template
export const createCvFromTemplateSchema = z.object({
  templateId: z.string().min(1, 'Template ID là bắt buộc'),
  name: z.string().min(1, 'Tên CV là bắt buộc').max(200, 'Tên CV không được vượt quá 200 ký tự')
});
