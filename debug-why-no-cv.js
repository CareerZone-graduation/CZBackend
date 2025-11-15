require('dotenv').config();
const mongoose = require('mongoose');

const DB_URI = process.env.MONGO_URI || process.env.DB_URI;

console.log('🔥 DEBUG: Tại sao không đếm được CV?\n');
console.log('='.repeat(70));

async function debugWhyNoApplications() {
  try {
    await mongoose.connect(DB_URI);
    console.log('✅ Connected to MongoDB\n');

    const Application = require('./src/models/Application').default;
    const Job = require('./src/models/Job').default;
    const RecruiterProfile = require('./src/models/RecruiterProfile').default;
    
    // BƯỚC 1: Kiểm tra có applications không
    console.log('BƯỚC 1: Kiểm tra Applications\n' + '-'.repeat(70));
    const totalApps = await Application.countDocuments();
    console.log(`Total Applications: ${totalApps}`);
    
    if (totalApps === 0) {
      console.log('\n❌ DATABASE KHÔNG CÓ APPLICATIONS!');
      console.log('   → Đây là nguyên nhân chính!');
      console.log('   → Backend fallback về getTopCompanies');
      console.log('\n💡 GIẢI PHÁP:');
      console.log('   1. Apply vào một số jobs để tạo test data');
      console.log('   2. Hoặc import sample applications data\n');
      await mongoose.disconnect();
      return;
    }
    
    // Sample application
    const sampleApp = await Application.findOne().lean();
    console.log(`\nSample Application:`);
    console.log(`  _id: ${sampleApp._id}`);
    console.log(`  jobId: ${sampleApp.jobId || 'NULL'}`);
    console.log(`  candidateId: ${sampleApp.candidateProfileId || sampleApp.candidateId}`);
    console.log(`  status: ${sampleApp.status}`);
    console.log(`  createdAt: ${sampleApp.createdAt}\n`);
    
    // BƯỚC 2: Aggregate applications by jobId (GIỐNG CODE BACKEND)
    console.log('BƯỚC 2: Aggregate Applications by Job\n' + '-'.repeat(70));
    
    const appsByJob = await Application.aggregate([
      {
        $group: {
          _id: '$jobId',
          applicationCount: { $sum: 1 }
        }
      },
      { $sort: { applicationCount: -1 } },
      { $limit: 10 }
    ]);
    
    console.log(`Jobs có applications: ${appsByJob.length}\n`);
    
    if (appsByJob.length === 0) {
      console.log('❌ KHÔNG CÓ JOB NÀO CÓ APPLICATIONS!');
      console.log('   → Applications không có jobId hoặc jobId NULL\n');
      
      // Kiểm tra có app nào không có jobId
      const appsWithoutJob = await Application.countDocuments({ jobId: null });
      console.log(`Applications without jobId: ${appsWithoutJob}/${totalApps}`);
      
      if (appsWithoutJob > 0) {
        console.log('\n💡 VẤN ĐỀ: Applications không link với Job!');
        console.log('   → Cần fix Application model hoặc apply process\n');
      }
      
      await mongoose.disconnect();
      return;
    }
    
    console.log('Top 10 Jobs có nhiều CV nhất:');
    appsByJob.forEach((job, i) => {
      console.log(`  ${i + 1}. Job ID: ${job._id} - ${job.applicationCount} CVs`);
    });
    
    // BƯỚC 3: Lookup jobs và check recruiterProfileId
    console.log('\n\nBƯỚC 3: Lookup Jobs\n' + '-'.repeat(70));
    
    const jobIds = appsByJob.map(j => j._id);
    const jobs = await Job.find({ _id: { $in: jobIds } })
      .select('_id title recruiterProfileId status moderationStatus deadline')
      .lean();
    
    console.log(`Jobs found: ${jobs.length}/${jobIds.length}\n`);
    
    if (jobs.length === 0) {
      console.log('❌ KHÔNG TÌM THẤY JOBS!');
      console.log('   → Jobs có thể đã bị xóa');
      console.log('   → Applications trỏ tới jobId không tồn tại\n');
      await mongoose.disconnect();
      return;
    }
    
    // Sample job
    const sampleJob = jobs[0];
    console.log('Sample Job:');
    console.log(`  _id: ${sampleJob._id}`);
    console.log(`  title: ${sampleJob.title}`);
    console.log(`  recruiterProfileId: ${sampleJob.recruiterProfileId || 'NULL'}`);
    console.log(`  status: ${sampleJob.status}`);
    console.log(`  moderationStatus: ${sampleJob.moderationStatus}`);
    console.log(`  deadline: ${sampleJob.deadline}\n`);
    
    // BƯỚC 4: Group by recruiterProfileId
    console.log('BƯỚC 4: Group by Company\n' + '-'.repeat(70));
    
    const companyApps = {};
    const jobAppMap = {};
    
    appsByJob.forEach(item => {
      jobAppMap[item._id.toString()] = item.applicationCount;
    });
    
    jobs.forEach(job => {
      if (!job.recruiterProfileId) {
        console.log(`⚠️ Job ${job._id} không có recruiterProfileId!`);
        return;
      }
      
      const recruiterId = job.recruiterProfileId.toString();
      const appCount = jobAppMap[job._id.toString()] || 0;
      
      if (!companyApps[recruiterId]) {
        companyApps[recruiterId] = {
          recruiterProfileId: recruiterId,
          applicationCount: 0,
          jobCount: 0
        };
      }
      
      companyApps[recruiterId].applicationCount += appCount;
      companyApps[recruiterId].jobCount += 1;
    });
    
    console.log(`Companies with applications: ${Object.keys(companyApps).length}\n`);
    
    // BƯỚC 5: Lookup company names
    console.log('BƯỚC 5: Lookup Company Names\n' + '-'.repeat(70));
    
    const recruiterIds = Object.keys(companyApps);
    const companies = await RecruiterProfile.find({
      _id: { $in: recruiterIds }
    })
    .select('_id company.name approvalStatus')
    .lean();
    
    console.log(`Companies found: ${companies.length}\n`);
    
    // Merge data
    const results = companies.map(company => {
      const stats = companyApps[company._id.toString()];
      return {
        companyName: company.company?.name || 'N/A',
        approvalStatus: company.approvalStatus,
        applicationCount: stats.applicationCount,
        jobCount: stats.jobCount
      };
    });
    
    // Sort by applicationCount
    results.sort((a, b) => b.applicationCount - a.applicationCount);
    
    console.log('Top 10 Companies (theo CV):\n');
    console.log('Công ty'.padEnd(30) + ' | CVs | Jobs | Status');
    console.log('-'.repeat(70));
    
    results.slice(0, 10).forEach((c, i) => {
      const name = (c.companyName || 'N/A').padEnd(30).substring(0, 30);
      const apps = String(c.applicationCount).padStart(4);
      const jobs = String(c.jobCount).padStart(4);
      const status = c.approvalStatus === 'APPROVED' ? '✅' : '⚠️';
      console.log(`${name} | ${apps} | ${jobs} | ${status}`);
    });
    
    // BƯỚC 6: Kiểm tra approved companies
    console.log('\n\nBƯỚC 6: Kiểm tra APPROVED Status\n' + '-'.repeat(70));
    
    const approvedResults = results.filter(c => c.approvalStatus === 'APPROVED');
    console.log(`APPROVED companies: ${approvedResults.length}/${results.length}\n`);
    
    if (approvedResults.length === 0) {
      console.log('❌ KHÔNG CÓ CÔNG TY NÀO APPROVED!');
      console.log('   → Backend filter bỏ tất cả companies');
      console.log('   → Kết quả: 0 companies → fallback\n');
      console.log('💡 GIẢI PHÁP:');
      console.log('   Approve các công ty này trong admin panel\n');
    } else {
      console.log('Top 5 APPROVED Companies:\n');
      approvedResults.slice(0, 5).forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.companyName} - ${c.applicationCount} CVs`);
      });
    }
    
    // KẾT LUẬN
    console.log('\n\n' + '='.repeat(70));
    console.log('KẾT LUẬN\n');
    
    if (totalApps === 0) {
      console.log('❌ Database không có applications');
    } else if (appsByJob.length === 0) {
      console.log('❌ Applications không link với jobs');
    } else if (jobs.length === 0) {
      console.log('❌ Jobs không tồn tại (đã bị xóa)');
    } else if (Object.keys(companyApps).length === 0) {
      console.log('❌ Jobs không có recruiterProfileId');
    } else if (companies.length === 0) {
      console.log('❌ RecruiterProfile không tồn tại');
    } else if (approvedResults.length === 0) {
      console.log('❌ Không có công ty nào APPROVED');
      console.log('   → Backend đang filter chỉ lấy APPROVED companies');
      console.log('   → Tất cả bị loại bỏ → fallback về getTopCompanies\n');
      console.log('💡 FIX: Approve companies trong admin panel');
    } else {
      console.log('✅ Tất cả đều OK!');
      console.log(`   → Có ${approvedResults.length} công ty APPROVED với CV`);
      console.log(`   → Top 1: ${approvedResults[0].companyName} (${approvedResults[0].applicationCount} CVs)\n`);
      console.log('💡 NẾU API VẪN TRẢ VỀ 0 CV:');
      console.log('   1. Backend chưa restart');
      console.log('   2. Code aggregation có bug');
      console.log('   3. Frontend cache cũ\n');
    }
    
    await mongoose.disconnect();
    console.log('✅ Debug hoàn thành!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

debugWhyNoApplications();
