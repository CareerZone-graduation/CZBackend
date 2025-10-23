import CreditTransaction from '../models/CreditTransaction.js';
import User from '../models/User.js';
import { TRANSACTION_TYPES, TRANSACTION_CATEGORIES } from '../constants/index.js';
import { BadRequestError, NotFoundError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

/**
 * Record a credit transaction
 * Creates a transaction record with the current user balance
 * 
 * @param {Object} params - Transaction parameters
 * @param {string} params.userId - User ID
 * @param {string} params.type - Transaction type (DEPOSIT/USAGE)
 * @param {string} params.category - Transaction category
 * @param {number} params.amount - Transaction amount (positive for deposits, negative for usage)
 * @param {string} params.description - Human-readable description
 * @param {string} [params.referenceId] - Optional reference to related document
 * @param {string} [params.referenceModel] - Optional model name for reference
 * @param {Object} [params.metadata] - Optional additional data
 * @returns {Promise<Object>} Created transaction record
 */
export const recordCreditTransaction = async ({
  userId,
  type,
  category,
  amount,
  description,
  referenceId = null,
  referenceModel = null,
  metadata = {}
}) => {
  try {
    // Validate transaction type
    if (!Object.values(TRANSACTION_TYPES).includes(type)) {
      throw new BadRequestError(`Invalid transaction type: ${type}`);
    }

    // Validate transaction category
    if (!Object.values(TRANSACTION_CATEGORIES).includes(category)) {
      throw new BadRequestError(`Invalid transaction category: ${category}`);
    }

    // Validate amount sign matches transaction type
    if (type === TRANSACTION_TYPES.DEPOSIT && amount <= 0) {
      throw new BadRequestError('Deposit amount must be positive');
    }

    if (type === TRANSACTION_TYPES.USAGE && amount >= 0) {
      throw new BadRequestError('Usage amount must be negative');
    }

    // Get current user balance
    const user = await User.findById(userId).select('coinBalance');
    
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Create transaction record
    const transaction = await CreditTransaction.create({
      userId,
      type,
      category,
      amount,
      balanceAfter: user.coinBalance,
      description,
      referenceId,
      referenceModel,
      metadata
    });

    logger.info(`Credit transaction recorded: userId=${userId}, type=${type}, amount=${amount}, balanceAfter=${user.coinBalance}`);

    return transaction;
  } catch (error) {
    logger.error('Error recording credit transaction:', {
      userId,
      type,
      category,
      amount,
      error: error.message,
      stack: error.stack
    });

    // Re-throw known errors
    if (error instanceof BadRequestError || error instanceof NotFoundError) {
      throw error;
    }

    // Wrap unknown errors
    throw new Error(`Failed to record credit transaction: ${error.message}`);
  }
};

/**
 * Get transaction history with filtering and pagination
 * 
 * @param {string} userId - User ID
 * @param {Object} filters - Filter options
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Records per page
 * @param {string} [filters.type] - Filter by transaction type (DEPOSIT/USAGE)
 * @param {string} [filters.category] - Filter by transaction category
 * @param {Date} [filters.startDate] - Filter by start date
 * @param {Date} [filters.endDate] - Filter by end date
 * @returns {Promise<Object>} Paginated transaction history
 */
export const getTransactionHistory = async (userId, filters = {}) => {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      category,
      startDate,
      endDate
    } = filters;

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query = { userId };

    // Filter by type
    if (type && Object.values(TRANSACTION_TYPES).includes(type)) {
      query.type = type;
    }

    // Filter by category
    if (category && Object.values(TRANSACTION_CATEGORIES).includes(category)) {
      query.category = category;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.createdAt = {};
      
      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          throw new BadRequestError('Invalid start date format');
        }
        query.createdAt.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          throw new BadRequestError('Invalid end date format');
        }
        // Set to end of day
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }

      // Validate date range
      if (startDate && endDate && query.createdAt.$gte > query.createdAt.$lte) {
        throw new BadRequestError('Start date cannot be after end date');
      }
    }

    // Execute query with pagination
    const [transactions, totalRecords] = await Promise.all([
      CreditTransaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      CreditTransaction.countDocuments(query)
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalRecords / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    logger.info(`Transaction history retrieved: userId=${userId}, page=${pageNum}, records=${transactions.length}`);

    return {
      transactions,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords,
        limit: limitNum,
        hasNextPage,
        hasPrevPage
      }
    };
  } catch (error) {
    logger.error('Error getting transaction history:', {
      userId,
      filters,
      error: error.message,
      stack: error.stack
    });

    // Re-throw known errors
    if (error instanceof BadRequestError) {
      throw error;
    }

    // Wrap unknown errors
    throw new Error(`Failed to get transaction history: ${error.message}`);
  }
};

/**
 * Get transaction summary statistics
 * Calculates current balance, total deposits, total usage, and category breakdown
 * 
 * @param {string} userId - User ID
 * @param {Object} dateRange - Date range filter
 * @param {Date} [dateRange.startDate] - Start date for filtering
 * @param {Date} [dateRange.endDate] - End date for filtering
 * @returns {Promise<Object>} Summary statistics
 */
export const getTransactionSummary = async (userId, dateRange = {}) => {
  try {
    const { startDate, endDate } = dateRange;

    // Get current user balance
    const user = await User.findById(userId).select('coinBalance');
    
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Build date filter
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      
      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          throw new BadRequestError('Invalid start date format');
        }
        dateFilter.createdAt.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          throw new BadRequestError('Invalid end date format');
        }
        // Set to end of day
        end.setHours(23, 59, 59, 999);
        dateFilter.createdAt.$lte = end;
      }

      // Validate date range
      if (startDate && endDate && dateFilter.createdAt.$gte > dateFilter.createdAt.$lte) {
        throw new BadRequestError('Start date cannot be after end date');
      }
    }

    // Build aggregation pipeline
    const pipeline = [
      {
        $match: {
          userId: user._id,
          ...dateFilter
        }
      },
      {
        $facet: {
          // Calculate totals by type
          totals: [
            {
              $group: {
                _id: '$type',
                total: { $sum: '$amount' }
              }
            }
          ],
          // Calculate category breakdown
          categoryBreakdown: [
            {
              $group: {
                _id: '$category',
                count: { $sum: 1 },
                totalAmount: { $sum: '$amount' }
              }
            },
            {
              $sort: { totalAmount: -1 }
            }
          ],
          // Count total transactions
          transactionCount: [
            {
              $count: 'count'
            }
          ]
        }
      }
    ];

    const [result] = await CreditTransaction.aggregate(pipeline);

    // Process totals
    let totalDeposits = 0;
    let totalUsage = 0;

    if (result.totals && result.totals.length > 0) {
      result.totals.forEach(item => {
        if (item._id === TRANSACTION_TYPES.DEPOSIT) {
          totalDeposits = item.total;
        } else if (item._id === TRANSACTION_TYPES.USAGE) {
          totalUsage = Math.abs(item.total); // Convert to positive for display
        }
      });
    }

    // Process category breakdown
    const categoryBreakdown = (result.categoryBreakdown || []).map(item => ({
      category: item._id,
      count: item.count,
      totalAmount: item.totalAmount
    }));

    // Get transaction count
    const transactionCount = result.transactionCount && result.transactionCount.length > 0
      ? result.transactionCount[0].count
      : 0;

    const summary = {
      currentBalance: user.coinBalance,
      totalDeposits,
      totalUsage,
      transactionCount,
      categoryBreakdown,
      periodStart: startDate || null,
      periodEnd: endDate || null
    };

    logger.info(`Transaction summary calculated: userId=${userId}, balance=${user.coinBalance}, deposits=${totalDeposits}, usage=${totalUsage}`);

    return summary;
  } catch (error) {
    logger.error('Error getting transaction summary:', {
      userId,
      dateRange,
      error: error.message,
      stack: error.stack
    });

    // Re-throw known errors
    if (error instanceof BadRequestError || error instanceof NotFoundError) {
      throw error;
    }

    // Wrap unknown errors
    throw new Error(`Failed to get transaction summary: ${error.message}`);
  }
};
