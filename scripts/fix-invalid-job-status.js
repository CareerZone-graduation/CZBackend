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
  console.error('❌ DB_URI not found in .env file');
  process.exit(1);
}

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(DB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

// Fix invalid job status
async function fixInvalidJobStatus() {
  try {
    const Job = mongoose.model('Job', new mongoose.Schema({}, { strict: false }));

    // Find jobs with invalid status
    const invalidJobs = await Job.find({
      status: { $nin: ['ACTIVE', 'INACTIVE', 'EXPIRED'] }
    });

    console.log(`\n📊 Found ${invalidJobs.length} jobs with invalid status`);

    if (invalidJobs.length === 0) {
      console.log('✅ No jobs need fixing');
      return;
    }

    // Fix each job
    let fixedCount = 0;
    for (const job of invalidJobs) {
      console.log(`\n🔧 Fixing job ${job._id}:`);
      console.log(`   Current status: "${job.status}"`);
      console.log(`   Moderation status: "${job.moderationStatus}"`);

      // Determine correct status based on moderationStatus
      let newStatus = 'INACTIVE'; // Default

      if (job.moderationStatus === 'APPROVED') {
        newStatus = 'ACTIVE';
      } else if (job.moderationStatus === 'REJECTED' || job.moderationStatus === 'NEUTRAL') {
        newStatus = 'INACTIVE';
      } else if (job.moderationStatus === 'PENDING') {
        // Check if job is expired
        if (job.deadline && new Date(job.deadline) < new Date()) {
          newStatus = 'EXPIRED';
        } else {
          newStatus = 'INACTIVE'; // Pending jobs should be inactive until approved
        }
      }

      // Update job
      await Job.updateOne(
        { _id: job._id },
        { $set: { status: newStatus } }
      );

      console.log(`   ✅ Updated to: "${newStatus}"`);
      fixedCount++;
    }

    console.log(`\n✅ Fixed ${fixedCount} jobs`);

  } catch (error) {
    console.error('❌ Error fixing jobs:', error);
    throw error;
  }
}

// Main function
async function main() {
  console.log('🚀 Starting job status fix script...\n');

  await connectDB();
  await fixInvalidJobStatus();

  console.log('\n✅ Script completed successfully');
  process.exit(0);
}

// Run script
main().catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
