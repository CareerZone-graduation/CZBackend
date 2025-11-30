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
  search: z.string().optional(),
  isReapplied: z.enum(['true', 'false']).optional(),
}).optional();

// Validation schema cho cập nhật trạng thái đơn ứng tuyển
export const updateApplicationStatusBody = z.object({
  status: z.enum(['PENDING', 'SUITABLE', 'SCHEDULED_INTERVIEW', 'OFFER_SENT', 'ACCEPTED', 'REJECTED'], {
    errorMap: () => ({ message: 'Status không hợp lệ' })
  })
});

// Validation schema cho cập nhật ghi chú đơn ứng tuyển
export const updateApplicationNotesBody = z.object({
  notes: z.string().max(2000, 'Ghi chú không thể vượt quá 2000 ký tự')
});

// Validation schema cho phản hồi offer của candidate
export const respondToOfferBody = z.object({
  status: z.enum(['ACCEPTED', 'OFFER_DECLINED'], {
    errorMap: () => ({ message: 'Status phải là ACCEPTED hoặc OFFER_DECLINED' })
  })
});

// Validation schema cho query parameters lấy danh sách đơn ứng tuyển của candidate
export const getCandidateApplicationsQuery = z.object({
  page: z.string().regex(/^\d+$/, 'Page phải là số').optional().transform(Number),
  limit: z.string().regex(/^\d+$/, 'Limit phải là số').optional().transform(Number),
  status: z.string().optional(),
  sort: z.enum(['appliedAt', '-appliedAt', 'lastStatusUpdateAt', '-lastStatusUpdateAt']).optional(),
  search: z.string().optional(),
}).optional();

// ==========================================================
// === NEW: VALIDATION SCHEMAS FOR ALL CANDIDATES MANAGEMENT
// ==========================================================

// Validation schema cho query parameters lấy TẤT CẢ ứng viên của recruiter
export const getAllApplicationsQuery = z.object({
  page: z.string().regex(/^\d+$/, 'Page phải là số').optional().transform(Number),
  limit: z.string().regex(/^\d+$/, 'Limit phải là số').optional().transform(Number),
  status: z.string().optional(),
  search: z.string().optional(),
  sort: z.enum(['appliedAt', '-appliedAt', 'lastStatusUpdateAt', '-lastStatusUpdateAt']).optional(),
  jobStatus: z.string().optional(),
  jobIds: z.string().optional().transform(val => val ? val.split(',') : []),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
}).optional();

// Validation schema cho statistics query
export const getStatisticsQuery = z.object({
  jobIds: z.string().optional().transform(val => val ? val.split(',') : []),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
}).optional();

// Validation schema cho bulk update status
export const bulkUpdateStatusBody = z.object({
  applicationIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Application ID không hợp lệ')),
  status: z.enum(['PENDING', 'SUITABLE', 'SCHEDULED_INTERVIEW', 'OFFER_SENT', 'ACCEPTED', 'OFFER_DECLINED', 'REJECTED'], {
    errorMap: () => ({ message: 'Status không hợp lệ' })
  })
});

// Validation schema cho export applications
export const exportApplicationsBody = z.object({
  applicationIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Application ID không hợp lệ'))
});
