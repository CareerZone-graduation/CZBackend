/**
 * Script test để kiểm tra Job Categories từ MongoDB
 * Chạy: node scripts/test-job-categories.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Job } from '../src/models/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const testJobCategories = async () => {
  try {
    const dbUri = process.env.DB_URI || process.env.MONGODB_URI;
    if (!dbUri) {
      throw new Error('DB_URI not found in environment variables');
    }
    
    await mongoose.connect(dbUri);
    console.log('✅ Connected to MongoDB\n');

    // 1. Đếm tổng số jobs
    const totalJobs = await Job.countDocuments();
    console.log(`📊 Tổng số job postings: ${totalJobs}`);

    // 2. Đếm jobs theo status
    const statusCount = await Job.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    console.log('\n📈 Jobs theo Status:');
    statusCount.forEach(s => {
      console.log(`   - ${s._id || 'NULL'}: ${s.count}`);
    });

    // 3. Đếm jobs theo moderationStatus
    const moderationCount = await Job.aggregate([
      { $group: { _id: '$moderationStatus', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    console.log('\n📋 Jobs theo ModerationStatus:');
    moderationCount.forEach(m => {
      console.log(`   - ${m._id || 'NULL'}: ${m.count}`);
    });

    // 4. Lấy job categories (giống như API)
    console.log('\n🎯 Job Categories (ACTIVE + APPROVED):');
    const categories = await Job.aggregate([
      { 
        $match: { 
          status: "ACTIVE", 
          moderationStatus: "APPROVED"
        } 
      },
      { 
        $group: { 
          _id: "$category", 
          value: { $sum: 1 } 
        } 
      },
      { 
        $project: { 
          _id: 0, 
          name: "$_id", 
          value: 1 
        } 
      },
      { $sort: { value: -1 } },
      { $limit: 10 }
    ]);

    if (categories.length === 0) {
      console.log('⚠️  Không có jobs nào với status=ACTIVE và moderationStatus=APPROVED');
      
      // Kiểm tra xem có jobs nào không?
      const anyActiveJobs = await Job.countDocuments({ status: 'ACTIVE' });
      console.log(`\n📊 Số jobs với status=ACTIVE: ${anyActiveJobs}`);
      
      if (anyActiveJobs > 0) {
        console.log('\n💡 Gợi ý: Có jobs ACTIVE nhưng moderationStatus không phải APPROVED');
        console.log('   Hãy kiểm tra field moderationStatus trong database');
        console.log('   Hoặc update jobs để có moderationStatus=APPROVED');
      }
    } else {
      console.log(`\n✅ Tìm thấy ${categories.length} categories:`);
      categories.forEach((cat, index) => {
        console.log(`   ${index + 1}. ${cat.name || 'NULL'}: ${cat.value} jobs`);
      });
    }

    // 5. Lấy tất cả categories (không filter)
    console.log('\n📚 Tất cả Categories trong database:');
    const allCategories = await Job.aggregate([
      { 
        $group: { 
          _id: "$category", 
          total: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] }
          },
          approved: {
            $sum: { $cond: [{ $eq: ['$moderationStatus', 'APPROVED'] }, 1, 0] }
          }
        } 
      },
      { $sort: { total: -1 } }
    ]);

    allCategories.forEach((cat, index) => {
      console.log(`   ${index + 1}. ${cat._id || 'NULL'}:`);
      console.log(`      - Total: ${cat.total}`);
      console.log(`      - Active: ${cat.active}`);
      console.log(`      - Approved: ${cat.approved}`);
    });

    // 6. Sample jobs
    console.log('\n📝 Sample Jobs (5 jobs đầu tiên):');
    const sampleJobs = await Job.find()
      .select('title category status moderationStatus')
      .limit(5);
    
    sampleJobs.forEach((job, index) => {
      console.log(`   ${index + 1}. ${job.title}`);
      console.log(`      Category: ${job.category || 'NULL'}`);
      console.log(`      Status: ${job.status || 'NULL'}`);
      console.log(`      ModerationStatus: ${job.moderationStatus || 'NULL'}`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

testJobCategories();
