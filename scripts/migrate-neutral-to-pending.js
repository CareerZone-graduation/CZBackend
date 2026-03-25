import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const DB_URI = process.env.DB_URI;

if (!DB_URI) {
  console.error('❌ DB_URI not found in environment variables');
  process.exit(1);
}

async function migrateNeutralToPending() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(DB_URI);
    console.log('✅ Connected to MongoDB');

    const Job = mongoose.model('Job', new mongoose.Schema({}, { strict: false }));

    // Tìm tất cả job có moderationStatus = NEUTRAL
    const neutralJobs = await Job.find({ moderationStatus: 'NEUTRAL' });
    
    console.log(`\n📊 Found ${neutralJobs.length} jobs with NEUTRAL status`);

    if (neutralJobs.length === 0) {
      console.log('✅ No jobs to migrate');
      await mongoose.connection.close();
      return;
    }

    // Hiển thị thông tin các job sẽ được migrate
    console.log('\n📋 Jobs to be migrated:');
    neutralJobs.forEach((job, index) => {
      console.log(`${index + 1}. ${job.title} (${job._id})`);
      if (job.aiModerationResult?.summary) {
        console.log(`   Reason: ${job.aiModerationResult.summary}`);
      }
    });

    // Cập nhật tất cả job NEUTRAL về PENDING
    const result = await Job.updateMany(
      { moderationStatus: 'NEUTRAL' },
      { 
        $set: { 
          moderationStatus: 'PENDING',
          // Đảm bảo status là INACTIVE để chờ duyệt
          status: 'INACTIVE'
        }
      }
    );

    console.log(`\n✅ Migration completed successfully!`);
    console.log(`   - Modified: ${result.modifiedCount} jobs`);
    console.log(`   - All NEUTRAL jobs are now PENDING and waiting for manual review`);

    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run migration
migrateNeutralToPending();
