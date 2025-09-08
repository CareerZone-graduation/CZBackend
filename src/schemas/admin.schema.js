import { z } from 'zod';

export const rejectCompanySchema = z.object({
  rejectReason: z.string().min(1, 'Lý do từ chối không được để trống'),
});

export const idParamsSchema = z.object({
  id: z.string().refine((val) => /^[0-9a-fA-F]{24}$/.test(val), {
    message: 'ID không hợp lệ',
  }),
});

export const adminJobsQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  company: z.string().optional(),
  status: z.enum(['pending', 'approved']).optional(),
  sort: z.string().optional().default('-createdAt'),
});

export const adminUsersQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  status: z.enum(['active', 'banned']).optional(),
  role: z.enum(['candidate', 'recruiter']).optional(),
  sort: z.string().optional().default('-createdAt'),
});

export const adminCompaniesQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  sort: z.string().optional().default('-createdAt'),
});

export const userStatusSchema = z.object({
  status: z.enum(['active', 'banned']),
});
