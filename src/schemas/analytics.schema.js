// src/schemas/analytics.schema.js
import { z } from 'zod';

// Schema cho các query yêu cầu khoảng thời gian và độ chi tiết
export const timeSeriesSchema = z.object({
  period: z.enum(['7d', '30d', '90d', '1y']).default('30d'),
  granularity: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
});

// Schema cho transaction analytics query
export const transactionAnalyticsSchema = z.object({
  period: z.enum(['7d', '30d', '90d', '1y']).default('30d'),
  granularity: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
});