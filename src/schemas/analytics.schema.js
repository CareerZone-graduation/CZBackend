// src/schemas/analytics.schema.js
import { z } from 'zod';

// Schema cho các query yêu cầu khoảng thời gian và độ chi tiết
export const timeSeriesSchema = z.object({
  period: z.enum(['7d', '30d', '90d', '1y']).optional().default('30d'),
  granularity: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
  customStartDate: z.string().optional(), // Thêm support cho custom date range
  customEndDate: z.string().optional(),   // Thêm support cho custom date range
});

export const recruiterDashboardSchema = z.object({
  range: z.enum(['7d', '30d', '90d', '1y']).default('30d'),
});

// [MỚI] Schema cho query lấy danh sách giao dịch
export const transactionListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(), // Tìm kiếm theo transactionCode, email, fullname
  status: z.enum(['SUCCESS', 'PENDING', 'FAILED']).optional(),
  paymentMethod: z.enum(['ZALOPAY', 'VNPAY', 'MOMO']).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  sort: z.string().optional().default('-createdAt'),
});
// Schema cho transaction analytics query
export const transactionAnalyticsSchema = z.object({
  period: z.enum(['7d', '30d', '90d', '1y']).default('30d'),
  granularity: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
  customStartDate: z.string().optional(), // Thêm support cho custom date range
  customEndDate: z.string().optional(),   // Thêm support cho custom date range
});