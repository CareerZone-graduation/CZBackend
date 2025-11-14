// Quick check - xem có applications không
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const MONGO_URI = process.env.MONGO_URI || process.env.DB_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI or DB_URI not found in .env file!');
  process.exit(1);
}

console.log('🔗 Connecting to MongoDB...');
await mongoose.connect(MONGO_URI);
console.log('✅ Connected\n');

const db = mongoose.connection.db;

// 1. Check applications
const apps = await db.collection('applications').countDocuments();
console.log(`Applications: ${apps}`);

if (apps === 0) {
  console.log('❌ NO APPLICATIONS! Cannot show trending companies.\n');
  process.exit(1);
}

// 2. Check if applications have jobId
const sampleApp = await db.collection('applications').findOne();
console.log('Sample application fields:', Object.keys(sampleApp));
console.log('jobId value:', sampleApp.jobId);
console.log('jobId type:', typeof sampleApp.jobId, '\n');

// 3. Quick aggregation
const result = await db.collection('applications').aggregate([
  { $group: { _id: '$jobId', count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 5 }
]).toArray();

console.log('Top 5 jobs by applications:');
for (const item of result) {
  // Find job
  const job = await db.collection('jobs').findOne({ _id: item._id });
  if (job) {
    // Find company
    const company = await db.collection('recruiterprofiles').findOne({ 
      _id: job.recruiterProfileId 
    });
    
    console.log(`\n  Job: ${job.title}`);
    console.log(`  Applications: ${item.count}`);
    console.log(`  Company: ${company?.company?.name || 'Unknown'}`);
    console.log(`  Company approved: ${company?.approvalStatus === 'APPROVED' ? 'YES' : 'NO'}`);
  }
}

await mongoose.connection.close();
