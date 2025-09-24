/**
 * Script migration để thêm trường activityHistory vào các Application hiện có
 * Chạy script này để đảm bảo tính tương thích với dữ liệu cũ
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Application } from './src/models/index.js';
import logger from './src/utils/logger.js';

// Load environment variables
dotenv.config();

const migrateApplicationHistory = async () => {
  try {
    // Kết nối database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Đếm số lượng Application cần migrate
    const totalApplications = await Application.countDocuments({
      activityHistory: { $exists: false }
    });

    console.log(`📊 Found ${totalApplications} applications need migration`);

    if (totalApplications === 0) {
      console.log('✅ No applications need migration');
      return;
    }

    // Cập nhật tất cả Application chưa có activityHistory
    const result = await Application.updateMany(
      { 
        activityHistory: { $exists: false } 
      },
      { 
        $set: { 
          activityHistory: [] 
        }
      }
    );

    console.log(`✅ Migration completed successfully!`);
    console.log(`   - Modified: ${result.modifiedCount} applications`);
    console.log(`   - Matched: ${result.matchedCount} applications`);

    // Kiểm tra kết quả
    const remainingCount = await Application.countDocuments({
      activityHistory: { $exists: false }
    });

    if (remainingCount === 0) {
      console.log('✅ All applications now have activityHistory field');
    } else {
      console.log(`⚠️  Warning: ${remainingCount} applications still missing activityHistory`);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    logger.error('Application migration failed', { error: error.message, stack: error.stack });
  } finally {
    await mongoose.disconnect();
    console.log('📥 Disconnected from MongoDB');
  }
};

// Chạy migration
migrateApplicationHistory();