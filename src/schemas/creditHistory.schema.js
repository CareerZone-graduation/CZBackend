import { z } from 'zod';
import { ALL_TRANSACTION_TYPES, ALL_TRANSACTION_CATEGORIES } from '../constants/index.js';

/**
 * Schema for credit history query parameters
 * Validates pagination, filtering, and date range parameters
 */
export const getCreditHistorySchema = z.object({
  // Pagination
  page: z.coerce.number().int().min(1, 'Số trang phải lớn hơn hoặc bằng 1').optional().default(1),
  limit: z.coerce.number().int().min(1, 'Số bản ghi tối thiểu là 1').max(100, 'Số bản ghi tối đa là 100').optional().default(20),

  // Transaction type filter
  type: z.preprocess(
    (val) => val === '' || val === undefined || val === null ? undefined : val,
    z.enum(ALL_TRANSACTION_TYPES, {
      message: 'Loại giao dịch không hợp lệ'
    }).optional()
  ),

  // Transaction category filter
  category: z.preprocess(
    (val) => val === '' || val === undefined || val === null ? undefined : val,
    z.enum(ALL_TRANSACTION_CATEGORIES, {
      message: 'Danh mục giao dịch không hợp lệ'
    }).optional()
  ),

  // Date range filters
  startDate: z.preprocess(
    (val) => {
      if (val === '' || val === undefined || val === null) return undefined;
      const date = new Date(val);
      return isNaN(date.getTime()) ? val : date;
    },
    z.date({
      message: 'Ngày bắt đầu không hợp lệ'
    }).optional()
  ),

  endDate: z.preprocess(
    (val) => {
      if (val === '' || val === undefined || val === null) return undefined;
      const date = new Date(val);
      return isNaN(date.getTime()) ? val : date;
    },
    z.date({
      message: 'Ngày kết thúc không hợp lệ'
    }).optional()
  )
}).refine(
  (data) => {
    // Validate that startDate is not after endDate
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate;
    }
    return true;
  },
  {
    message: 'Ngày bắt đầu không thể sau ngày kết thúc',
    path: ['startDate']
  }
);

/**
 * Schema for transaction summary query parameters
 * Validates date range for summary calculations
 */
export const getTransactionSummarySchema = z.object({
  // Date range filters
  startDate: z.preprocess(
    (val) => {
      if (val === '' || val === undefined || val === null) return undefined;
      const date = new Date(val);
      return isNaN(date.getTime()) ? val : date;
    },
    z.date({
      message: 'Ngày bắt đầu không hợp lệ'
    }).optional()
  ),

  endDate: z.preprocess(
    (val) => {
      if (val === '' || val === undefined || val === null) return undefined;
      const date = new Date(val);
      return isNaN(date.getTime()) ? val : date;
    },
    z.date({
      message: 'Ngày kết thúc không hợp lệ'
    }).optional()
  )
}).refine(
  (data) => {
    // Validate that startDate is not after endDate
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate;
    }
    return true;
  },
  {
    message: 'Ngày bắt đầu không thể sau ngày kết thúc',
    path: ['startDate']
  }
);
