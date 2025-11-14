// Test script để kiểm tra top companies API
import mongoose from 'mongoose';
import RecruiterProfile from './src/models/RecruiterProfile.js';
import Job from './src/models/Job.js';

// Kết nối MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/careerzone';

async function testTopCompanies() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // 1. Kiểm tra tổng số công ty
    const totalCompanies = await RecruiterProfile.countDocuments({
      'company.name': { $exists: true }
    });
    console.log(`\n📊 Total companies with name: ${totalCompanies}`);

    // 2. Kiểm tra công ty APPROVED
    const approvedCompanies = await RecruiterProfile.countDocuments({
      'company.name': { $exists: true },
      approvalStatus: 'APPROVED'
    });
    console.log(`✅ Approved companies: ${approvedCompanies}`);

    // 3. Kiểm tra tổng số jobs
    const totalJobs = await Job.countDocuments();
    console.log(`\n📋 Total jobs: ${totalJobs}`);

    const activeJobs = await Job.countDocuments({
      status: 'ACTIVE',
      moderationStatus: 'APPROVED'
    });
    console.log(`✅ Active + Approved jobs: ${activeJobs}`);

    // 4. Test aggregation query
    console.log('\n🔍 Running top companies query...\n');
    
    const companies = await RecruiterProfile.aggregate([
      {
        $match: {
          'company.name': { $exists: true }
        }
      },
      {
        $lookup: {
          from: 'jobs',
          localField: '_id',
          foreignField: 'recruiterProfileId',
          as: 'jobs'
        }
      },
      {
        $addFields: {
          activeJobCount: {
            $size: {
              $filter: {
                input: '$jobs',
                as: 'job',
                cond: { 
                  $and: [
                    { $eq: ['$$job.status', 'ACTIVE'] },
                    { $eq: ['$$job.moderationStatus', 'APPROVED'] }
                  ]
                }
              }
            }
          },
          totalJobCount: { $size: '$jobs' }
        }
      },
      {
        $match: {
          totalJobCount: { $gt: 0 }
        }
      },
      {
        $project: {
          _id: 1,
          companyName: '$company.name',
          approvalStatus: 1,
          activeJobCount: 1,
          totalJobCount: 1
        }
      },
      { $sort: { activeJobCount: -1, totalJobCount: -1 } },
      { $limit: 10 }
    ]);

    console.log('🏢 Top Companies Result:');
    console.table(companies.map((c, i) => ({
      '#': i + 1,
      'Company': c.companyName,
      'Status': c.approvalStatus,
      'Active Jobs': c.activeJobCount,
      'Total Jobs': c.totalJobCount
    })));

    if (companies.length === 0) {
      console.log('\n⚠️ NO COMPANIES FOUND WITH JOBS!');
      console.log('\nPossible reasons:');
      console.log('1. No companies in database');
      console.log('2. No jobs linked to companies');
      console.log('3. All jobs are INACTIVE or not APPROVED');
      
      // Kiểm tra mẫu dữ liệu
      const sampleCompany = await RecruiterProfile.findOne({ 'company.name': { $exists: true } });
      if (sampleCompany) {
        console.log('\n📝 Sample company structure:');
        console.log({
          _id: sampleCompany._id,
          companyName: sampleCompany.company.name,
          approvalStatus: sampleCompany.approvalStatus
        });
      }

      const sampleJob = await Job.findOne();
      if (sampleJob) {
        console.log('\n📝 Sample job structure:');
        console.log({
          _id: sampleJob._id,
          recruiterProfileId: sampleJob.recruiterProfileId,
          status: sampleJob.status,
          moderationStatus: sampleJob.moderationStatus
        });
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

testTopCompanies();
