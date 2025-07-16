import { RecruiterProfile } from '../models/index.js';
import { NotFoundError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

/**
 * Get recruiter profile by user ID.
 * @param {string} userId - The ID of the user (recruiter).
 * @returns {Promise<Object>} The recruiter profile.
 */
export const getRecruiterProfile = async (userId) => {
  logger.info(`Fetching recruiter profile for userId: ${userId}`);

  const profile = await RecruiterProfile.findOne({ userId }).populate(
    'userId',
    'email avatar role'
  ).lean();

  if (!profile) {
    logger.warn(`Recruiter profile not found for userId: ${userId}`);
    throw new NotFoundError('Không tìm thấy hồ sơ nhà tuyển dụng.');
  }

  logger.info(`Successfully fetched recruiter profile for userId: ${userId}`);
  return profile;
};
