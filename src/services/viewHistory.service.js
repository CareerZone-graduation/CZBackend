import JobViewHistory from '../models/JobViewHistory.js';
import Job from '../models/Job.js';
import logger from '../utils/logger.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/AppError.js';
import mongoose from 'mongoose';

const MAX_ENTRIES_PER_USER = 100; // Giữ tối đa 100 lịch sử xem gần nhất

/**
 * Save or update job view history entry
 * Automatically updates viewedAt if user views the same job again
 * @param {string} userId - User ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} - Created or updated view history entry
 */
export const saveViewHistory = async (userId, jobId) => {
  try {
    // Validate jobId
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      throw new BadRequestError('Job ID không hợp lệ');
    }

    // Check if job exists
    const jobExists = await Job.findById(jobId).select('_id');
    if (!jobExists) {
      throw new NotFoundError('Không tìm thấy tin tuyển dụng');
    }

    // Use the static method to create or update
    const entry = await JobViewHistory.recordView(userId, jobId);

    logger.info(`Recorded view history for user ${userId}, job ${jobId}`);

    // Check if user has exceeded max entries limit
    const userEntriesCount = await JobViewHistory.countDocuments({ userId });

    if (userEntriesCount > MAX_ENTRIES_PER_USER) {
      // Delete oldest entries to maintain limit
      const entriesToDelete = userEntriesCount - MAX_ENTRIES_PER_USER;
      const oldestEntries = await JobViewHistory.find({ userId })
        .sort({ viewedAt: 1 })
        .limit(entriesToDelete)
        .select('_id');

      const idsToDelete = oldestEntries.map(e => e._id);
      await JobViewHistory.deleteMany({ _id: { $in: idsToDelete } });

      logger.info(`Deleted ${entriesToDelete} oldest view entries for user ${userId} to maintain limit`);
    }

    return entry;
  } catch (error) {
    logger.error('Error saving view history:', error);
    throw error;
  }
};

/**
 * Get user's job view history with pagination
 * @param {string} userId - User ID
 * @param {Object} options - Pagination options
 * @param {number} options.page - Page number (default: 1)
 * @param {number} options.limit - Items per page (default: 10, max: 50)
 * @returns {Promise<Object>} - View history data with pagination
 */
export const getUserViewHistory = async (userId, { page = 1, limit = 10 } = {}) => {
  try {
    // Validate and sanitize pagination params
    const sanitizedPage = Math.max(1, parseInt(page) || 1);
    const sanitizedLimit = Math.min(50, Math.max(1, parseInt(limit) || 10));

    const result = await JobViewHistory.getUserHistory(userId, {
      page: sanitizedPage,
      limit: sanitizedLimit
    });

    // Filter out jobs that might have been deleted and normalize job shape
    result.data = result.data
      .filter(entry => entry.jobId) // Remove entries with deleted jobs
      .map(entry => {
        const jobRaw = entry.jobId;

        // Extract company from recruiterProfileId (RecruiterProfile.company)
        const company = jobRaw.recruiterProfileId && jobRaw.recruiterProfileId.company
          ? jobRaw.recruiterProfileId.company
          : null;

        // Normalize salary fields: Job model uses minSalary/maxSalary (Decimal128)
        const minSalary = jobRaw.minSalary ? parseFloat(jobRaw.minSalary.toString()) : null;
        const maxSalary = jobRaw.maxSalary ? parseFloat(jobRaw.maxSalary.toString()) : null;
        const salary = (minSalary !== null || maxSalary !== null) ? {
          min: minSalary,
          max: maxSalary,
          currency: 'VND'
        } : null;

        // Format location to string for frontend compatibility
        let locationString = '';
        if (jobRaw.location) {
          if (typeof jobRaw.location === 'string') {
            locationString = jobRaw.location;
          } else {
            // location is object: { province, district, commune, coordinates }
            const parts = [
              jobRaw.location.province,
              jobRaw.location.district,
              jobRaw.location.commune
            ].filter(Boolean);
            locationString = parts.join(', ');
          }
        }

        // Build normalized job object expected by frontend
        const job = {
          _id: jobRaw._id,
          title: jobRaw.title,
          location: locationString || jobRaw.location, // Return formatted string or original
          workType: jobRaw.workType,
          skills: jobRaw.skills,
          status: jobRaw.status,
          company,
          salary
        };

        return {
          _id: entry._id,
          job,
          viewedAt: entry.viewedAt,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt
        };
      });

    // Update pagination total if jobs were filtered
    const actualCount = result.data.length;
    if (actualCount < sanitizedLimit && sanitizedPage === 1) {
      result.pagination.totalItems = actualCount;
      result.pagination.totalPages = 1;
    }

    logger.info(`Retrieved ${actualCount} view history entries for user ${userId}`);

    return result;
  } catch (error) {
    logger.error('Error retrieving user view history:', error);
    throw error;
  }
};

/**
 * Get user's view history statistics
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Statistics data
 */
export const getUserViewStats = async (userId) => {
  try {
    const stats = await JobViewHistory.getUserStats(userId);

    logger.info(`Retrieved view stats for user ${userId}`);

    return stats;
  } catch (error) {
    logger.error('Error retrieving user view stats:', error);
    throw error;
  }
};

/**
 * Delete a specific view history entry
 * @param {string} userId - User ID
 * @param {string} entryId - Entry ID to delete
 * @returns {Promise<void>}
 */
export const deleteViewHistory = async (userId, entryId) => {
  try {
    // Validate entryId
    if (!mongoose.Types.ObjectId.isValid(entryId)) {
      throw new BadRequestError('Entry ID không hợp lệ');
    }

    const entry = await JobViewHistory.findById(entryId);

    if (!entry) {
      throw new NotFoundError('Không tìm thấy lịch sử xem');
    }

    // Check if the entry belongs to the user
    if (entry.userId.toString() !== userId.toString()) {
      throw new ForbiddenError('Bạn không có quyền xóa lịch sử này');
    }

    await JobViewHistory.findByIdAndDelete(entryId);

    logger.info(`Deleted view history entry ${entryId} for user ${userId}`);
  } catch (error) {
    logger.error('Error deleting view history:', error);
    throw error;
  }
};

/**
 * Clear all view history for a user
 * @param {string} userId - User ID
 * @returns {Promise<number>} - Number of deleted entries
 */
export const clearAllViewHistory = async (userId) => {
  try {
    const result = await JobViewHistory.deleteMany({ userId });

    logger.info(`Cleared all view history for user ${userId}, deleted ${result.deletedCount} entries`);

    return result.deletedCount;
  } catch (error) {
    logger.error('Error clearing all view history:', error);
    throw error;
  }
};



