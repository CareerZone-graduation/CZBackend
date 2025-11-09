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
  status: z.enum(['ACTIVE', 'INACTIVE', 'EXPIRED', 'PENDING']).optional(),
  sort: z
    .enum(['title_asc', 'title_desc', 'createdAt_asc', 'createdAt_desc'])
    .optional()
    .default('createdAt_desc'),
});

export const adminUsersQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  status: z.enum(['active', 'banned']).optional(),
  role: z.enum(['candidate', 'recruiter']).optional(),
  companyRegistration: z.enum(['registered', 'not-registered']).optional(),
  sort: z.string().optional().default('-createdAt'),
});
export const adminCompaniesQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  industry: z.enum([
    'Công nghệ thông tin',
    'Tài chính',
    'Y tế',
    'Giáo dục',
    'Sản xuất',
    'Bán lẻ',
    'Xây dựng',
    'Du lịch',
    'Nông nghiệp',
    'Truyền thông',
    'Vận tải',
    'Bất động sản',
    'Dịch vụ',
    'Khởi nghiệp',
    'Nhà hàng - Khách sạn',
    'Bảo hiểm',
    'Logistics',
    'Năng lượng',
    'Viễn thông',
    'Dược phẩm',
    'Hóa chất',
    'Ô tô - Xe máy',
    'Thực phẩm - Đồ uống',
    'Thời trang - Mỹ phẩm',
    'Thể thao - Giải trí',
    'Công nghiệp nặng',
    'Công nghiệp điện tử',
    'Công nghiệp cơ khí',
    'Công nghiệp dệt may',
    'Đa lĩnh vực',
    'Khác'
  ]).optional(),
  sort: z
    .enum(['name_asc', 'name_desc', 'createdAt_asc', 'createdAt_desc', 'updatedAt_asc', 'updatedAt_desc'])
    .optional()
    .default('createdAt_desc'),
});

export const userStatusSchema = z.object({
  status: z.enum(['active', 'banned']),
});

export const companyJobsQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(['all', 'active', 'expired', 'pending', 'inactive']).optional(),
  search: z.string().optional(),
  sort: z.enum(['createdAt_asc', 'createdAt_desc', 'expiresAt_asc', 'expiresAt_desc']).optional().default('createdAt_desc'),
});

export const jobStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'EXPIRED']),
});
