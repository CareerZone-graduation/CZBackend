import asyncHandler from 'express-async-handler';
import * as creditHistoryService from '../services/creditHistory.service.js';
import { UnauthorizedError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

/**
 * @desc    Get credit transaction history with filtering and pagination
 * @route   GET /api/credit-history
 * @access  Private
 */
export const getCreditHistory = asyncHandler(async (req, res) => {
  // Ensure user is authenticated
  if (!req.user || !req.user._id) {
    throw new UnauthorizedError('Vui lòng đăng nhập để xem lịch sử giao dịch');
  }

  const userId = req.user._id;
  
  // Get validated query parameters
  const filters = req.validatedQuery || req.query;
  
  logger.info(`Getting credit history for user ${userId}`, { filters });

  // Fetch transaction history from service
  const historyResult = await creditHistoryService.getTransactionHistory(userId, filters);
  
  // Fetch summary statistics
  const summary = await creditHistoryService.getTransactionSummary(userId, {
    startDate: filters.startDate,
    endDate: filters.endDate
  });

  // Format response
  res.status(200).json({
    success: true,
    message: 'Lấy lịch sử giao dịch thành công',
    data: {
      transactions: historyResult.transactions,
      pagination: historyResult.pagination,
      summary: {
        currentBalance: summary.currentBalance,
        totalDeposits: summary.totalDeposits,
        totalUsage: summary.totalUsage,
        periodStart: filters.startDate || null,
        periodEnd: filters.endDate || null
      }
    }
  });
});

/**
 * @desc    Get credit transaction summary statistics
 * @route   GET /api/credit-history/summary
 * @access  Private
 */
export const getCreditSummary = asyncHandler(async (req, res) => {
  // Ensure user is authenticated
  if (!req.user || !req.user._id) {
    throw new UnauthorizedError('Vui lòng đăng nhập để xem thống kê giao dịch');
  }

  const userId = req.user._id;
  
  // Get validated query parameters
  const dateRange = req.validatedQuery || req.query;
  
  logger.info(`Getting credit summary for user ${userId}`, { dateRange });

  // Fetch summary statistics from service
  const summary = await creditHistoryService.getTransactionSummary(userId, dateRange);

  // Format response
  res.status(200).json({
    success: true,
    message: 'Lấy thống kê giao dịch thành công',
    data: {
      currentBalance: summary.currentBalance,
      totalDeposits: summary.totalDeposits,
      totalUsage: summary.totalUsage,
      transactionCount: summary.transactionCount,
      categoryBreakdown: summary.categoryBreakdown,
      periodStart: dateRange.startDate || null,
      periodEnd: dateRange.endDate || null
    }
  });
});
