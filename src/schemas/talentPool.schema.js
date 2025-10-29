import { z } from 'zod';

// Validation schema cho thêm vào talent pool
export const addToTalentPoolBody = z.object({
  applicationId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Application ID không hợp lệ'),
  tags: z.array(z.string().max(50, 'Tag không thể vượt quá 50 ký tự')).optional(),
  notes: z.string().max(2000, 'Notes không thể vượt quá 2000 ký tự').optional()
});

// Validation schema cho talent pool ID param
export const talentPoolIdParam = z.object({
  talentPoolId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Talent Pool ID không hợp lệ')
});

// Validation schema cho cập nhật talent pool entry
export const updateTalentPoolBody = z.object({
  tags: z.array(z.string().max(50, 'Tag không thể vượt quá 50 ký tự')).optional(),
  notes: z.string().max(2000, 'Notes không thể vượt quá 2000 ký tự').optional()
});

// Validation schema cho query parameters lấy danh sách talent pool
export const getTalentPoolQuery = z.object({
  page: z.string().regex(/^\d+$/, 'Page phải là số').optional().transform(Number),
  limit: z.string().regex(/^\d+$/, 'Limit phải là số').optional().transform(Number),
  search: z.string().optional(),
  sort: z.enum(['addedAt', '-addedAt']).optional(),
  tags: z.string().optional().transform(val => val ? val.split(',') : [])
}).optional();
