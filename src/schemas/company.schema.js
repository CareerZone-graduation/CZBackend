import { z } from 'zod';

/**
 * Company related validation schemas
 */

/**
 * Register company request validation schema
 * @typedef {Object} RegisterCompanyRequest
 * @property {string} name - Company name (2-200 chars)
 * @property {string} address - Company address (5-500 chars)
 * @property {string} website - Company website URL
 * @property {string} description - Company description (20-2000 chars)
 */
export const registerCompanySchema = z.object({
  name: z.string()
    .min(2, 'Tên công ty phải từ 2 đến 200 ký tự')
    .max(200, 'Tên công ty phải từ 2 đến 200 ký tự')
    .trim(),
  address: z.string()
    .min(5, 'Địa chỉ phải từ 5 đến 500 ký tự')
    .max(500, 'Địa chỉ phải từ 5 đến 500 ký tự')
    .trim(),
  website: z.string()
    .url('Website phải là URL hợp lệ')
    .max(200, 'Website không được dài quá 200 ký tự')
    .trim(),
  description: z.string()
    .min(20, 'Mô tả phải từ 20 đến 2000 ký tự')
    .max(2000, 'Mô tả phải từ 20 đến 2000 ký tự')
    .trim()
});

/**
 * Update company request validation schema
 * Same as register but all fields are optional
 */
export const updateCompanySchema = z.object({
  name: z.string()
    .min(2, 'Tên công ty phải từ 2 đến 200 ký tự')
    .max(200, 'Tên công ty phải từ 2 đến 200 ký tự')
    .trim()
    .optional(),
  address: z.string()
    .min(5, 'Địa chỉ phải từ 5 đến 500 ký tự')
    .max(500, 'Địa chỉ phải từ 5 đến 500 ký tự')
    .trim()
    .optional(),
  website: z.string()
    .url('Website phải là URL hợp lệ')
    .max(200, 'Website không được dài quá 200 ký tự')
    .trim()
    .optional(),
  description: z.string()
    .min(20, 'Mô tả phải từ 20 đến 2000 ký tự')
    .max(2000, 'Mô tả phải từ 20 đến 2000 ký tự')
    .trim()
    .optional(),
  active: z.boolean().optional()
});

/**
 * Add member to company request validation schema
 * @typedef {Object} AddMemberRequest
 * @property {string} email - Email of the user to invite
 */
export const addMemberSchema = z.object({
  email: z.string()
    .email('Email phải đúng định dạng')
    .toLowerCase()
    .trim()
});
