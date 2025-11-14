// Test script để kiểm tra logic "Most Applied Companies"
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Kết nối MongoDB
await mongoose.connect(process.env.MONGO_URI);
console.log('✅ Connected to MongoDB');

const db = mongoose.connection.db;

// Step 1: Kiểm tra tổng số applications
console.log('\n📊 Step 1: Checking Applications collection...');
const totalApps = await db.collection('applications').countDocuments();
console.log(`   Total applications: ${totalApps}`);

if (totalApps === 0) {
  console.log('   ⚠️ No applications found! Cannot proceed.');
  process.exit(1);
}

// Lấy 3 applications mẫu
const sampleApps = await db.collection('applications').find().limit(3).toArray();
console.log('\n   Sample applications:');
sampleApps.forEach((app, i) => {
  console.log(`   ${i + 1}. Application ID: ${app._id}`);
  console.log(`      - jobId: ${app.jobId}`);
  console.log(`      - candidateProfileId: ${app.candidateProfileId}`);
  console.log(`      - status: ${app.status || 'N/A'}`);
});

// Step 2: Kiểm tra Jobs
console.log('\n📊 Step 2: Checking Jobs collection...');
const jobIds = sampleApps.map(app => app.jobId);
const jobs = await db.collection('jobs').find({ 
  _id: { $in: jobIds } 
}).toArray();

console.log(`   Found ${jobs.length} jobs for sample applications`);
jobs.forEach((job, i) => {
  console.log(`   ${i + 1}. Job: ${job.title || job._id}`);
  console.log(`      - recruiterProfileId: ${job.recruiterProfileId}`);
  console.log(`      - status: ${job.status}`);
  console.log(`      - moderationStatus: ${job.moderationStatus}`);
});

// Step 3: Kiểm tra RecruiterProfiles (Companies)
console.log('\n📊 Step 3: Checking RecruiterProfiles (Companies)...');
const recruiterIds = jobs.map(job => job.recruiterProfileId).filter(Boolean);
const companies = await db.collection('recruiterprofiles').find({
  _id: { $in: recruiterIds }
}).toArray();

console.log(`   Found ${companies.length} companies`);
companies.forEach((company, i) => {
  console.log(`   ${i + 1}. Company: ${company.company?.name || 'N/A'}`);
  console.log(`      - _id: ${company._id}`);
  console.log(`      - approvalStatus: ${company.approvalStatus}`);
  console.log(`      - hasName: ${!!company.company?.name}`);
});

// Step 4: Test aggregation đơn giản
console.log('\n📊 Step 4: Testing Simple Aggregation...');
const simpleAggResult = await db.collection('applications').aggregate([
  {
    // Nhóm theo jobId
    $group: {
      _id: '$jobId',
      applicationCount: { $sum: 1 }
    }
  },
  {
    // Lookup job info
    $lookup: {
      from: 'jobs',
      localField: '_id',
      foreignField: '_id',
      as: 'job'
    }
  },
  {
    $unwind: {
      path: '$job',
      preserveNullAndEmptyArrays: false // Bỏ qua nếu không tìm thấy job
    }
  },
  {
    // Lookup company info
    $lookup: {
      from: 'recruiterprofiles',
      localField: 'job.recruiterProfileId',
      foreignField: '_id',
      as: 'company'
    }
  },
  {
    $unwind: {
      path: '$company',
      preserveNullAndEmptyArrays: false
    }
  },
  {
    // Nhóm theo company
    $group: {
      _id: '$company._id',
      companyName: { $first: '$company.company.name' },
      totalApplications: { $sum: '$applicationCount' },
      jobCount: { $sum: 1 }
    }
  },
  {
    $sort: { totalApplications: -1 }
  },
  {
    $limit: 10
  }
]).toArray();

console.log('\n   ✅ Top 10 Companies by Applications:');
console.log('   ' + '='.repeat(70));
simpleAggResult.forEach((item, i) => {
  console.log(`   ${i + 1}. ${item.companyName || 'Unknown Company'}`);
  console.log(`      - Company ID: ${item._id}`);
  console.log(`      - Total Applications: ${item.totalApplications} CVs`);
  console.log(`      - Jobs with applications: ${item.jobCount}`);
  console.log('');
});

// Step 5: Test aggregation như trong service
console.log('\n📊 Step 5: Testing Service Aggregation Logic...');
const serviceAggResult = await db.collection('recruiterprofiles').aggregate([
  {
    $match: {
      'company.name': { $exists: true },
      approvalStatus: 'APPROVED'
    }
  },
  {
    // Lookup all jobs
    $lookup: {
      from: 'jobs',
      localField: '_id',
      foreignField: 'recruiterProfileId',
      as: 'allJobs'
    }
  },
  {
    // Lookup active jobs
    $lookup: {
      from: 'jobs',
      localField: '_id',
      foreignField: 'recruiterProfileId',
      as: 'activeJobs',
      pipeline: [
        {
          $match: {
            status: 'ACTIVE',
            moderationStatus: 'APPROVED'
          }
        }
      ]
    }
  },
  {
    // Tạo array jobIds
    $addFields: {
      jobIds: {
        $map: {
          input: '$allJobs',
          as: 'job',
          in: '$$job._id'
        }
      }
    }
  },
  {
    // Lookup applications
    $lookup: {
      from: 'applications',
      localField: 'jobIds',
      foreignField: 'jobId',
      as: 'applications'
    }
  },
  {
    $addFields: {
      activeJobCount: { $size: '$activeJobs' },
      totalJobCount: { $size: '$allJobs' },
      applicationCount: { $size: '$applications' }
    }
  },
  {
    $match: {
      $or: [
        { applicationCount: { $gt: 0 } },
        { activeJobCount: { $gt: 0 } }
      ]
    }
  },
  {
    $project: {
      companyName: '$company.name',
      activeJobCount: 1,
      totalJobCount: 1,
      applicationCount: 1
    }
  },
  {
    $sort: {
      applicationCount: -1,
      activeJobCount: -1
    }
  },
  {
    $limit: 10
  }
]).toArray();

console.log('\n   ✅ Service Aggregation Result:');
console.log('   ' + '='.repeat(70));
serviceAggResult.forEach((item, i) => {
  console.log(`   ${i + 1}. ${item.companyName || 'Unknown'}`);
  console.log(`      - Applications: ${item.applicationCount} CVs`);
  console.log(`      - Active Jobs: ${item.activeJobCount}`);
  console.log(`      - Total Jobs: ${item.totalJobCount}`);
  console.log('');
});

// Summary
console.log('\n📊 SUMMARY:');
console.log('   ' + '='.repeat(70));
console.log(`   ✅ Total Applications: ${totalApps}`);
console.log(`   ✅ Simple Aggregation found: ${simpleAggResult.length} companies`);
console.log(`   ✅ Service Aggregation found: ${serviceAggResult.length} companies`);

if (serviceAggResult.length === 0) {
  console.log('\n   ⚠️ WARNING: Service aggregation returned 0 results!');
  console.log('   Check:');
  console.log('   1. Do companies have approvalStatus = "APPROVED"?');
  console.log('   2. Do companies have company.name field?');
  console.log('   3. Are jobIds matching correctly?');
}

console.log('\n✅ Test completed!');
await mongoose.connection.close();
process.exit(0);
