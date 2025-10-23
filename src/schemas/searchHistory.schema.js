import { z } from 'zod';

// Schema for saving search history (POST request)
export const saveSearchHistorySchema = z.object({
  query: z.string().trim().max(200, 'Từ khóa tìm kiếm không được vượt quá 200 ký tự').optional().default(''),
});

// Schema for getting search history (GET request)
export const getSearchHistorySchema = z.object({
  limit: z.coerce.number().int().min(1, 'Limit phải lớn hơn 0').max(50, 'Limit không được vượt quá 50').default(10),
  page: z.coerce.number().int().min(1, 'Trang phải lớn hơn 0').default(1)
});

// Schema for deleting search history (DELETE request)
export const deleteSearchHistorySchema = z.object({
  id: z.string({
    required_error: 'ID lịch sử tìm kiếm là bắt buộc'
  }).trim().min(1, 'ID không được để trống')
});
