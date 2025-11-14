// Test using existing models
import mongoose from 'mongoose';
import { Application, Job, RecruiterProfile } from './src/models/index.js';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.DB_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI or DB_URI not found!');
  console.log('Make sure .env file exists with MONGO_URI or DB_URI');
  process.exit(1);
}

console.log('🔗 Connecting to MongoDB...');
await mongoose.connect(MONGO_URI);
console.log('✅ Connected\n');

try {
  // 1. Check applications
  const totalApps = await Application.countDocuments();
  console.log(`📊 Total Applications: ${totalApps}`);

  if (totalApps === 0) {
    console.log('\n❌ NO APPLICATIONS FOUND!');
    console.log('You need to have applications in the database to show "Most Applied Companies".\n');
    await mongoose.connection.close();
    process.exit(0);
  }

  // 2. Sample application
  const sampleApp = await Application.findOne();
  console.log('\n📝 Sample Application:');
  console.log('   ID:', sampleApp._id);
  console.log('   jobId:', sampleApp.jobId);
  console.log('   candidateProfileId:', sampleApp.candidateProfileId);
  console.log('   status:', sampleApp.status);

  // 3. Find the job
  const job = await Job.findById(sampleApp.jobId);
  if (!job) {
    console.log('\n❌ Job not found for jobId:', sampleApp.jobId);
  } else {
    console.log('\n💼 Job Info:');
    console.log('   Title:', job.title);
    console.log('   recruiterProfileId:', job.recruiterProfileId);
    console.log('   status:', job.status);

    // 4. Find the company
    const company = await RecruiterProfile.findById(job.recruiterProfileId);
    if (!company) {
      console.log('\n❌ Company not found for recruiterProfileId:', job.recruiterProfileId);
    } else {
      console.log('\n🏢 Company Info:');
      console.log('   Name:', company.company?.name || 'NO NAME');
      console.log('   approvalStatus:', company.approvalStatus);
      console.log('   Has company.name?', !!company.company?.name);
    }
  }

  // 5. Count applications by job
  console.log('\n📊 Top 5 Jobs by Application Count:');
  const topJobs = await Application.aggregate([
    { $group: { _id: '$jobId', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 }
  ]);

  for (let i = 0; i < topJobs.length; i++) {
    const jobData = topJobs[i];
    const job = await Job.findById(jobData._id);
    if (job) {
      const company = await RecruiterProfile.findById(job.recruiterProfileId);
      console.log(`\n${i + 1}. ${job.title}`);
      console.log(`   Applications: ${jobData.count}`);
      console.log(`   Company: ${company?.company?.name || 'Unknown'}`);
      console.log(`   Approved: ${company?.approvalStatus === 'APPROVED' ? '✅ YES' : '❌ NO'}`);
    }
  }

  // 6. Test the actual aggregation
  console.log('\n\n🧪 Testing getMostAppliedCompanies aggregation...\n');

  // Count by job first
  const appsByJob = await Application.aggregate([
    { $group: { _id: '$jobId', applicationCount: { $sum: 1 } } }
  ]);
  
  console.log(`Found applications for ${appsByJob.length} jobs`);
  
  // Create map
  const jobAppCountMap = {};
  appsByJob.forEach(item => {
    jobAppCountMap[item._id.toString()] = item.applicationCount;
  });
  
  // Get companies
  const companies = await RecruiterProfile.aggregate([
    {
      $match: {
        'company.name': { $exists: true },
        approvalStatus: 'APPROVED'
      }
    },
    {
      $lookup: {
        from: 'jobs',
        localField: '_id',
        foreignField: 'recruiterProfileId',
        as: 'allJobs'
      }
    },
    {
      $addFields: {
        jobCount: { $size: '$allJobs' },
        allJobIds: {
          $map: {
            input: '$allJobs',
            as: 'job',
            in: { $toString: '$$job._id' }
          }
        }
      }
    },
    {
      $project: {
        companyName: '$company.name',
        jobCount: 1,
        allJobIds: 1
      }
    }
  ]);
  
  console.log(`\nFound ${companies.length} approved companies with company.name\n`);
  
  // Calculate application count
  const companiesWithApps = companies.map(c => {
    let appCount = 0;
    if (c.allJobIds) {
      c.allJobIds.forEach(jobId => {
        appCount += (jobAppCountMap[jobId] || 0);
      });
    }
    return {
      name: c.companyName,
      jobs: c.jobCount,
      applications: appCount
    };
  }).sort((a, b) => b.applications - a.applications);
  
  console.log('📊 Top 10 Companies by Applications:\n');
  companiesWithApps.slice(0, 10).forEach((c, i) => {
    console.log(`${i + 1}. ${c.name}`);
    console.log(`   Applications: ${c.applications}`);
    console.log(`   Jobs: ${c.jobs}`);
    console.log(`   Avg: ${c.jobs > 0 ? (c.applications / c.jobs).toFixed(1) : 0} CVs/job\n`);
  });
  
  if (companiesWithApps.every(c => c.applications === 0)) {
    console.log('⚠️ WARNING: All companies have 0 applications!');
    console.log('This means either:');
    console.log('1. Applications have jobId that don\'t match any jobs');
    console.log('2. Jobs have recruiterProfileId that don\'t match any approved companies');
    console.log('3. No approved companies have company.name field\n');
  }

} catch (error) {
  console.error('\n❌ Error:', error.message);
  console.error(error.stack);
}

await mongoose.connection.close();
console.log('\n✅ Done!');
