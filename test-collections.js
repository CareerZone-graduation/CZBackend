// Quick test to check collection names and data
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

await mongoose.connect(process.env.MONGO_URI);
console.log('✅ Connected to MongoDB\n');

const db = mongoose.connection.db;

// List all collections
console.log('📂 Available collections:');
const collections = await db.listCollections().toArray();
collections.forEach(c => console.log(`   - ${c.name}`));

console.log('\n📊 Checking data in collections...\n');

// Check applications
const applicationsCount = await db.collection('applications').countDocuments();
console.log(`1. applications: ${applicationsCount} documents`);
if (applicationsCount > 0) {
  const sample = await db.collection('applications').findOne();
  console.log('   Sample fields:', Object.keys(sample));
  console.log('   Sample jobId:', sample.jobId);
}

// Check jobs
const jobsCount = await db.collection('jobs').countDocuments();
console.log(`\n2. jobs: ${jobsCount} documents`);
if (jobsCount > 0) {
  const sample = await db.collection('jobs').findOne();
  console.log('   Sample fields:', Object.keys(sample).slice(0, 10), '...');
  console.log('   Sample recruiterProfileId:', sample.recruiterProfileId);
}

// Check recruiterprofiles
const companiesCount = await db.collection('recruiterprofiles').countDocuments();
console.log(`\n3. recruiterprofiles: ${companiesCount} documents`);
if (companiesCount > 0) {
  const sample = await db.collection('recruiterprofiles').findOne();
  console.log('   Sample fields:', Object.keys(sample));
  console.log('   Has company.name?', !!sample.company?.name);
  console.log('   Sample company.name:', sample.company?.name);
  console.log('   approvalStatus:', sample.approvalStatus);
}

// Test simple join
console.log('\n🔗 Testing join between collections...\n');

// Get one application
const oneApp = await db.collection('applications').findOne();
if (oneApp) {
  console.log('Testing with application:', oneApp._id);
  console.log('   jobId:', oneApp.jobId);
  
  // Find corresponding job
  const job = await db.collection('jobs').findOne({ _id: oneApp.jobId });
  if (job) {
    console.log('   ✅ Found job:', job.title);
    console.log('   recruiterProfileId:', job.recruiterProfileId);
    
    // Find corresponding company
    const company = await db.collection('recruiterprofiles').findOne({ 
      _id: job.recruiterProfileId 
    });
    if (company) {
      console.log('   ✅ Found company:', company.company?.name);
      console.log('   approvalStatus:', company.approvalStatus);
    } else {
      console.log('   ❌ Company not found for recruiterProfileId:', job.recruiterProfileId);
    }
  } else {
    console.log('   ❌ Job not found for jobId:', oneApp.jobId);
  }
}

// Test aggregation with ObjectId conversion
console.log('\n🧪 Testing aggregation...\n');

const result = await db.collection('recruiterprofiles').aggregate([
  {
    $match: {
      'company.name': { $exists: true, $ne: null },
      approvalStatus: 'APPROVED'
    }
  },
  { $limit: 5 },
  {
    $lookup: {
      from: 'jobs',
      localField: '_id',
      foreignField: 'recruiterProfileId',
      as: 'jobs'
    }
  },
  {
    $project: {
      companyName: '$company.name',
      approvalStatus: 1,
      jobCount: { $size: '$jobs' },
      jobIds: {
        $map: {
          input: '$jobs',
          as: 'job',
          in: '$$job._id'
        }
      }
    }
  }
]).toArray();

console.log(`Found ${result.length} approved companies:\n`);
result.forEach((company, i) => {
  console.log(`${i + 1}. ${company.companyName}`);
  console.log(`   - Jobs: ${company.jobCount}`);
  console.log(`   - First jobId: ${company.jobIds[0]}`);
});

// Now test application lookup with these jobIds
if (result.length > 0 && result[0].jobIds.length > 0) {
  const firstCompanyJobIds = result[0].jobIds;
  const apps = await db.collection('applications').find({
    jobId: { $in: firstCompanyJobIds }
  }).toArray();
  
  console.log(`\n✅ Applications for ${result[0].companyName}: ${apps.length}`);
}

console.log('\n✅ Test completed!');
await mongoose.connection.close();
