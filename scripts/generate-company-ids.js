import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../src/utils/connectDB.js';
import logger from '../src/utils/logger.js';
import RecruiterProfile from '../src/models/RecruiterProfile.js';

dotenv.config();

/**
 * Script di trú dữ liệu: Thêm _id cho các sub-document 'company' bị thiếu.
 * Script sẽ tìm tất cả các RecruiterProfile có 'company' nhưng không có 'company._id'
 * và tự động thêm một ObjectId mới vào.
 */
const migrationScript = async () => {
  try {
    logger.info('Connecting to MongoDB for migration...');
    await connectDB();

    // 1. Tìm tất cả các document cần di trú
    const query = {
      'company': { $exists: true, $ne: null },
      'company._id': { $exists: false }
    };
    const docsToMigrate = await RecruiterProfile.find(query);

    if (docsToMigrate.length === 0) {
      logger.info('✅ No documents found needing migration. Database is up to date.');
      return;
    }

    logger.info(`Found ${docsToMigrate.length} documents to migrate.`);

    let migratedCount = 0;
    const promises = [];

    // 2. Lặp qua và tạo câu lệnh cập nhật cho mỗi document
    for (const doc of docsToMigrate) {
      const newCompanyId = new mongoose.Types.ObjectId();
      
      const updatePromise = RecruiterProfile.updateOne(
        { _id: doc._id },
        { $set: { 'company._id': newCompanyId } }
      );
      
      promises.push(updatePromise);
      logger.info(`[${migratedCount + 1}/${docsToMigrate.length}] Queued update for profile ${doc._id} with new company._id: ${newCompanyId}`);
      migratedCount++;
    }

    // 3. Thực thi tất cả các câu lệnh cập nhật
    logger.info('Executing all updates...');
    await Promise.all(promises);

    logger.info(`🚀 Migration complete! Successfully updated ${migratedCount} documents.`);

  } catch (error) {
    logger.error('Error during data migration:', error);
  } finally {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected.');
  }
};

migrationScript();