/**
 * Migration script để chuyển đổi từ Redis-based email verification sang Database-based
 * Chạy script này sau khi deploy thay đổi mới
 */

import mongoose from 'mongoose';
import { User } from '../src/models/index.js';
import config from '../src/config/index.js';
import logger from '../src/utils/logger.js';

const migrateEmailVerification = async () => {
  try {
    await mongoose.connect(config.MONGODB_URI);
    logger.info('Connected to MongoDB for migration');

    // Reset tất cả verification tokens về null cho các user chưa verify
    const result = await User.updateMany(
      { 
        isEmailVerified: false,
        emailVerificationToken: { $exists: false }
      },
      {
        $set: {
          emailVerificationToken: null,
          emailVerificationExpires: null
        }
      }
    );

    logger.info(`Migration completed. Updated ${result.modifiedCount} users`);
    
    // Thống kê sau migration
    const stats = await User.aggregate([
      {
        $group: {
          _id: '$isEmailVerified',
          count: { $sum: 1 }
        }
      }
    ]);
    
    logger.info('User email verification statistics after migration:', stats);
    
  } catch (error) {
    logger.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  }
};

// Chỉ chạy script khi được gọi trực tiếp
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateEmailVerification();
}

export default migrateEmailVerification;