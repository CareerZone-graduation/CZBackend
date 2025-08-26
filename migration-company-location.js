import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { RecruiterProfile } from './src/models/index.js'; // Sửa model thành RecruiterProfile
import connectDB from './src/utils/connectDB.js';
import logger from './src/utils/logger.js';

dotenv.config();

const migrateCompanyData = async () => {
  try {
    await connectDB();
    logger.info('MongoDB connected for company location migration...');

    // Tìm các hồ sơ có cấu trúc địa chỉ cũ ('company.address.city' tồn tại)
    const profilesToMigrate = await RecruiterProfile.find({ 
      'company.address.city': { $exists: true } 
    });

    if (profilesToMigrate.length === 0) {
      logger.info('No recruiter profiles with the old location schema found. Migration not needed.');
      return;
    }

    logger.info(`Found ${profilesToMigrate.length} recruiter profiles to migrate.`);

    const bulkOps = [];
    for (const profile of profilesToMigrate) {
      // Chuẩn bị các thao tác cập nhật cho mỗi document
      bulkOps.push({
        updateOne: {
          filter: { _id: profile._id },
          update: [ // Sử dụng pipeline để truy cập các trường con hiện có
            {
              // Giai đoạn 1: Lấy dữ liệu ra các trường mới/tạm thời
              $set: {
                'company.location': {
                  province: '$company.address.city',
                  ward: null,
                },
                'temp_address': '$company.address.street' // Trường tạm ở cấp cao nhất
              }
            },
            {
              // Giai đoạn 2: Xóa đối tượng cũ
              $unset: 'company.address'
            },
            {
              // Giai đoạn 3: Tạo lại trường address từ trường tạm
              $set: {
                'company.address': '$temp_address'
              }
            },
            {
              // Giai đoạn 4: Xóa trường tạm
              $unset: 'temp_address'
            }
          ]
        }
      });
    }

    if (bulkOps.length > 0) {
        logger.info(`Executing bulk write for ${bulkOps.length} profiles...`);
        const result = await RecruiterProfile.bulkWrite(bulkOps);
        logger.info('Bulk write result:', result);
    }
    
    logger.info('Company location data migration completed successfully!');
  } catch (error) {
    logger.error('Error during company location data migration:', error);
  } finally {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected.');
  }
};

migrateCompanyData();