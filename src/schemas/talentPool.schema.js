import { z } from 'zod';

// Validation schema cho thêm vào talent pool
export const addToTalentPoolBody = z.object({
  applicationId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Application ID không hợp lệ'),
  notes: z.string().max(2000, 'Notes không thể vượt quá 2000 ký tự').optional()
});

// Validation schema cho talent pool ID param
export const talentPoolIdParam = z.object({
  talentPoolId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Talent Pool ID không hợp lệ')
});

// Validation schema cho cập nhật talent pool entry
export const updateTalentPoolBody = z.object({
  notes: z.string().max(2000, 'Notes không thể vượt quá 2000 ký tự').optional()
});

// Validation schema cho query parameters lấy danh sách talent pool
export const getTalentPoolQuery = z.object({
  page: z.string().regex(/^\d+$/, 'Page phải là số').optional().transform(Number),
  limit: z.string().regex(/^\d+$/, 'Limit phải là số').optional().transform(Number),
  search: z.string().optional(),
  sort: z.enum(['addedAt', '-addedAt']).optional()
}).optional();

// Validation schema cho invite ứng viên
export const inviteCandidates = z.object({
  jobId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Job ID không hợp lệ'),
  candidateProfileIds: z.array(
    z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID ứng viên không hợp lệ')
  ).min(1, 'Phải chọn ít nhất 1 ứng viên').max(50, 'Tối đa 50 ứng viên mỗi lần')
});
