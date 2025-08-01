import { z } from 'zod';

// Validation schema cho job ID param
export const jobIdParam = z.object({
  jobId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Job ID không hợp lệ')
});

// Validation schema cho application ID param
export const applicationIdParam = z.object({
  applicationId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Application ID không hợp lệ')
});

// Validation schema cho query parameters lấy danh sách ứng viên
export const getApplicationsQuery = z.object({
  page: z.string().regex(/^\d+$/, 'Page phải là số').optional().transform(Number),
  limit: z.string().regex(/^\d+$/, 'Limit phải là số').optional().transform(Number),
  status: z.string().optional(),
  sort: z.enum(['appliedAt', '-appliedAt', 'lastStatusUpdateAt', '-lastStatusUpdateAt']).optional(),
  candidateRating: z.enum(['NOT_RATED', 'NOT_SUITABLE', 'MAYBE', 'SUITABLE', 'PERFECT_MATCH']).optional(),
  search: z.string().optional(),
  isReapplied: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
}).optional();

// Validation schema cho cập nhật trạng thái đơn ứng tuyển
export const updateApplicationStatusBody = z.object({
  status: z.enum(['PENDING', 'REVIEWING', 'INTERVIEWED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'SCHEDULED_INTERVIEW'], {
    errorMap: () => ({ message: 'Status không hợp lệ' })
  })
});

// Validation schema cho cập nhật đánh giá ứng viên
export const updateCandidateRatingBody = z.object({
  rating: z.enum(['NOT_RATED', 'NOT_SUITABLE', 'MAYBE', 'SUITABLE', 'PERFECT_MATCH'], {
    errorMap: () => ({ message: 'Rating không hợp lệ' })
  })
});

// Validation schema cho cập nhật ghi chú đơn ứng tuyển
export const updateApplicationNotesBody = z.object({
  notes: z.string().max(2000, 'Ghi chú không thể vượt quá 2000 ký tự')
});
