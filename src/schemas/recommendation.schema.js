import { z } from 'zod';

/**
 * Schema for generating recommendations
 * POST /api/candidate/recommendations/generate
 */
export const generateRecommendationsSchema = z.object({
  maxDistance: z.number()
    .min(1, 'Khoảng cách tối thiểu là 1km')
    .max(200, 'Khoảng cách tối đa là 200km')
    .optional()
    .default(50),
  limit: z.number()
    .min(1, 'Số lượng tối thiểu là 1')
    .max(100, 'Số lượng tối đa là 100')
    .optional()
    .default(20)
}).optional().default({});

/**
 * Schema for getting recommendations with pagination
 * GET /api/candidate/recommendations
 */
export const getRecommendationsQuerySchema = z.object({
  page: z.string()
    .regex(/^\d+$/, 'Trang phải là một số')
    .transform(val => parseInt(val))
    .refine(val => val >= 1, 'Trang phải lớn hơn hoặc bằng 1')
    .optional()
    .default('1'),
  limit: z.string()
    .regex(/^\d+$/, 'Giới hạn phải là một số')
    .transform(val => parseInt(val))
    .refine(val => val >= 1 && val <= 50, 'Giới hạn phải từ 1 đến 50')
    .optional()
    .default('20'),
  refresh: z.enum(['true', 'false'])
    .transform(val => val === 'true')
    .optional()
    .default('false')
});
