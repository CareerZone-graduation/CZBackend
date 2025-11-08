/**
 * Script để kiểm tra và hiển thị job titles hiện có trong database
 * Chạy: node scripts/check-job-titles.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Job } from '../src/models/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const checkJobTitles = async () => {
  try {
    const dbUri = process.env.DB_URI || process.env.MONGODB_URI;
    if (!dbUri) {
      throw new Error('DB_URI or MONGODB_URI not found in environment variables');
    }
    
    await mongoose.connect(dbUri);
    console.log('✅ Connected to MongoDB\n');

    // Đếm tổng số jobs
    const totalJobs = await Job.countDocuments();
    console.log(`📊 Tổng số job postings trong database: ${totalJobs}\n`);

    if (totalJobs === 0) {
      console.log('⚠️  Database chưa có job postings nào!');
      console.log('💡 Hãy chạy script seed hoặc tạo jobs từ ứng dụng trước.\n');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Lấy job titles theo category
    console.log('📋 JOB TITLES THEO CATEGORY:\n');
    const jobsByCategory = await Job.aggregate([
      {
        $group: {
          _id: '$category',
          titles: { $addToSet: '$title' },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    jobsByCategory.forEach(category => {
      console.log(`\n🏷️  Category: ${category._id || 'Không có category'}`);
      console.log(`   Số lượng jobs: ${category.count}`);
      console.log(`   Số lượng job titles khác nhau: ${category.titles.length}`);
      console.log(`   Job titles:`);
      category.titles.forEach((title, index) => {
        console.log(`      ${index + 1}. ${title}`);
      });
    });

    // Thống kê tổng quan
    console.log('\n\n📊 THỐNG KÊ TỔNG QUAN:');
    console.log(`   - Tổng số categories: ${jobsByCategory.length}`);
    console.log(`   - Tổng số job titles khác nhau: ${jobsByCategory.reduce((sum, cat) => sum + cat.titles.length, 0)}`);
    
    // Top 10 job titles phổ biến nhất
    console.log('\n\n🔥 TOP 10 JOB TITLES PHỔ BIẾN NHẤT:');
    const topTitles = await Job.aggregate([
      {
        $group: {
          _id: '$title',
          count: { $sum: 1 },
          categories: { $addToSet: '$category' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    topTitles.forEach((title, index) => {
      console.log(`   ${index + 1}. ${title._id}`);
      console.log(`      - Số lượng: ${title.count} jobs`);
      console.log(`      - Categories: ${title.categories.join(', ')}`);
    });

    // Kiểm tra các job titles trùng lặp nhiều
    console.log('\n\n⚠️  JOB TITLES CÓ THỂ CẦN CHUẨN HÓA:');
    const duplicateTitles = await Job.aggregate([
      {
        $group: {
          _id: { $toLower: { $trim: { input: '$title' } } },
          originalTitles: { $addToSet: '$title' },
          count: { $sum: 1 }
        }
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    if (duplicateTitles.length > 0) {
      duplicateTitles.forEach((item, index) => {
        if (item.originalTitles.length > 1) {
          console.log(`   ${index + 1}. Các biến thể của "${item._id}":`);
          item.originalTitles.forEach(title => {
            console.log(`      - "${title}"`);
          });
        }
      });
    } else {
      console.log('   ✅ Không có job titles cần chuẩn hóa');
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

checkJobTitles();
