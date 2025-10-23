import SearchHistory from '../models/SearchHistory.js';
import redisClient from '../config/redis.js';
import logger from '../utils/logger.js';
import { NotFoundError, ForbiddenError } from '../utils/AppError.js';
import mongoose from 'mongoose';

// Redis cache keys and TTL constants
const CACHE_KEYS = {
  USER_HISTORY: (userId) => `search_history:user:${userId}`
};

const CACHE_TTL = {
  USER_HISTORY: 24 * 60 * 60 // 24 hours
};

const MAX_ENTRIES_PER_USER = 50;
const EXPIRATION_DAYS = 180;

/**
 * Save or update search history entry
 * Implements deduplication logic - updates existing entry if same search exists
 * @param {string} userId - User ID
 * @param {Object} searchData - Search data containing query
 * @returns {Promise<Object>} - Created or updated search history entry
 */
export const saveSearchHistory = async (userId, searchData) => {
  try {
    const { query = '' } = searchData;

    // Check if entry already exists (deduplication)
    const existingEntry = await SearchHistory.findOne({
      userId,
      query: query.trim()
    });

    let entry;

    if (existingEntry) {
      // Update existing entry - increment searchCount and update timestamp
      existingEntry.searchCount += 1;
      existingEntry.lastSearchedAt = new Date();
      entry = await existingEntry.save();
      logger.info(`Updated existing search history entry for user ${userId}`);
    } else {
      // Create new entry
      entry = await SearchHistory.create({
        userId,
        query: query.trim(),
        searchCount: 1,
        lastSearchedAt: new Date()
      });
      logger.info(`Created new search history entry for user ${userId}`);

      // Check if user has exceeded max entries limit
      const userEntriesCount = await SearchHistory.countDocuments({ userId });

      if (userEntriesCount > MAX_ENTRIES_PER_USER) {
        // Delete oldest entries to maintain limit
        const entriesToDelete = userEntriesCount - MAX_ENTRIES_PER_USER;
        const oldestEntries = await SearchHistory.find({ userId })
          .sort({ lastSearchedAt: 1 })
          .limit(entriesToDelete)
          .select('_id');

        const idsToDelete = oldestEntries.map(e => e._id);
        await SearchHistory.deleteMany({ _id: { $in: idsToDelete } });

        logger.info(`Deleted ${entriesToDelete} oldest entries for user ${userId} to maintain limit`);
      }
    }

    // Invalidate Redis cache for this user
    await invalidateUserCache(userId);

    return entry;
  } catch (error) {
    logger.error('Error saving search history:', error);
    throw error;
  }
};

/**
 * Get user's search history with pagination
 * Uses Redis cache for performance
 * @param {string} userId - User ID
 * @param {Object} options - Pagination options { limit, page }
 * @returns {Promise<Object>} - Search history entries with pagination metadata
 */
export const getUserSearchHistory = async (userId, { limit = 10, page = 1 } = {}) => {
  try {
    const cacheKey = CACHE_KEYS.USER_HISTORY(userId);

    // Try to get from Redis cache
    let cachedData = null;
    try {
      if (redisClient.isOpen) {
        const cached = await redisClient.get(cacheKey);
        console.log(cached)
        if (cached) {
          cachedData = JSON.parse(cached);
          logger.debug(`Cache hit for user search history: ${userId}`);
        }
      }
    } catch (cacheError) {
      logger.warn('Redis cache read error, falling back to database:', cacheError);
    }

    let entries;
    let total;

    if (cachedData) {
      // Use cached data
      entries = cachedData.entries;
      total = cachedData.total;

      // Apply pagination to cached data
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      entries = entries.slice(startIndex, endIndex);
    } else {
      // Query from MongoDB
      console.log("lay tu db")
      const skip = (page - 1) * limit;

      [entries, total] = await Promise.all([
        SearchHistory.find({ userId })
          .sort({ lastSearchedAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        SearchHistory.countDocuments({ userId })
      ]);

      // Cache the full result set (not paginated) for future requests
      try {
        if (redisClient.isOpen) {
          const allEntries = await SearchHistory.find({ userId })
            .sort({ lastSearchedAt: -1 })
            .lean();

          await redisClient.setEx(
            cacheKey,
            CACHE_TTL.USER_HISTORY,
            JSON.stringify({ entries: allEntries, total })
          );
          logger.debug(`Cached user search history: ${userId}`);
        }
      } catch (cacheError) {
        logger.warn('Redis cache write error:', cacheError);
      }
    }

    const totalPages = Math.ceil(total / limit);

    return {
      data: entries,
      pagination: {
        total,
        page,
        limit,
        totalPages
      }
    };
  } catch (error) {
    logger.error('Error getting user search history:', error);
    throw error;
  }
};



/**
 * Delete a specific search history entry
 * Verifies that entry belongs to the user
 * Optimized: Xóa nhanh, invalidate cache ở background
 * @param {string} userId - User ID
 * @param {string} entryId - Search history entry ID
 * @returns {Promise<void>}
 */
export const deleteSearchHistory = async (userId, entryId) => {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(entryId)) {
      throw new NotFoundError('Không tìm thấy lịch sử tìm kiếm');
    }

    const entry = await SearchHistory.findById(entryId);

    if (!entry) {
      throw new NotFoundError('Không tìm thấy lịch sử tìm kiếm');
    }

    // Verify ownership
    if (entry.userId.toString() !== userId.toString()) {
      throw new ForbiddenError('Bạn không có quyền xóa lịch sử này');
    }

    // Xóa entry từ database (await để đảm bảo xóa thành công)
    await SearchHistory.deleteOne({ _id: entryId });
    logger.info(`Deleted search history entry ${entryId} for user ${userId}`);

    // Invalidate Redis cache ở background (không await)
    // Nếu cache invalidation fail, không ảnh hưởng đến response
    invalidateUserCache(userId).catch(error => {
      logger.error('Background cache invalidation error:', error);
    });

  } catch (error) {
    logger.error('Error deleting search history:', error);
    throw error;
  }
};

/**
 * Clear all search history for a user
 * @param {string} userId - User ID
 * @returns {Promise<number>} - Number of deleted entries
 */
export const clearAllSearchHistory = async (userId) => {
  try {
    const result = await SearchHistory.deleteMany({ userId });
    logger.info(`Cleared all search history for user ${userId}, deleted ${result.deletedCount} entries`);

    // Invalidate Redis cache
    await invalidateUserCache(userId);

    return result.deletedCount;
  } catch (error) {
    logger.error('Error clearing search history:', error);
    throw error;
  }
};

/**
 * Delete expired search history entries (older than 180 days)
 * Called by cron job
 * @returns {Promise<number>} - Number of deleted entries
 */
export const deleteExpiredEntries = async () => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - EXPIRATION_DAYS);

    const result = await SearchHistory.deleteMany({
      lastSearchedAt: { $lt: cutoffDate }
    });

    logger.info(`Deleted ${result.deletedCount} expired search history entries (older than ${EXPIRATION_DAYS} days)`);

    return result.deletedCount;
  } catch (error) {
    logger.error('Error deleting expired search history entries:', error);
    throw error;
  }
};

/**
 * Invalidate Redis cache for a user
 * Deletes cache key for user's search history
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
const invalidateUserCache = async (userId) => {
  try {
    if (!redisClient.isOpen) {
      return;
    }

    // Delete user history cache
    const historyKey = CACHE_KEYS.USER_HISTORY(userId);
    await redisClient.del(historyKey);

    logger.debug(`Invalidated cache for user ${userId}`);
  } catch (error) {
    logger.warn('Error invalidating cache:', error);
    // Don't throw - cache invalidation failure shouldn't break the operation
  }
};
