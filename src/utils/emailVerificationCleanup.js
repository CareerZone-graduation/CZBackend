/**
 * Cleanup utility cho email verification tokens
 * Nên chạy định kỳ bằng cron job để dọn dẹp các token hết hạn
 */

import { User } from '../models/index.js';
import logger from '../utils/logger.js';

export const cleanupExpiredVerificationTokens = async () => {
  try {
    const result = await User.updateMany(
      {
        emailVerificationExpires: { $lt: new Date() }, // Token đã hết hạn
        emailVerificationToken: { $ne: null } // Và vẫn còn token
      },
      {
        $unset: {
          emailVerificationToken: 1,
          emailVerificationExpires: 1
        }
      }
    );

    if (result.modifiedCount > 0) {
      logger.info(`Cleaned up ${result.modifiedCount} expired email verification tokens`);
    }
    
    return result.modifiedCount;
  } catch (error) {
    logger.error('Error cleaning up expired verification tokens:', error);
    throw error;
  }
};

// Hàm lấy thống kê verification tokens
export const getVerificationTokenStats = async () => {
  try {
    const stats = await User.aggregate([
      {
        $facet: {
          totalUsers: [{ $count: "count" }],
          verifiedUsers: [
            { $match: { isEmailVerified: true } },
            { $count: "count" }
          ],
          unverifiedUsers: [
            { $match: { isEmailVerified: false } },
            { $count: "count" }
          ],
          pendingTokens: [
            { 
              $match: { 
                emailVerificationToken: { $ne: null },
                emailVerificationExpires: { $gt: new Date() }
              } 
            },
            { $count: "count" }
          ],
          expiredTokens: [
            { 
              $match: { 
                emailVerificationToken: { $ne: null },
                emailVerificationExpires: { $lt: new Date() }
              } 
            },
            { $count: "count" }
          ]
        }
      }
    ]);

    return {
      total: stats[0].totalUsers[0]?.count || 0,
      verified: stats[0].verifiedUsers[0]?.count || 0,
      unverified: stats[0].unverifiedUsers[0]?.count || 0,
      pendingTokens: stats[0].pendingTokens[0]?.count || 0,
      expiredTokens: stats[0].expiredTokens[0]?.count || 0
    };
  } catch (error) {
    logger.error('Error getting verification token stats:', error);
    throw error;
  }
};