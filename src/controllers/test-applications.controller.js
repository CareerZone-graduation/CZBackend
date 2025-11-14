// Simple test API to check applications data
export const testApplicationsData = async (req, res) => {
  try {
    const { Application, Job, RecruiterProfile } = await import('../models/index.js');
    
    // 1. Tổng số applications
    const totalApps = await Application.countDocuments();
    
    // 2. Đếm applications theo job
    const appsByJob = await Application.aggregate([
      {
        $group: {
          _id: '$jobId',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // 3. Lấy thông tin jobs
    const jobIds = appsByJob.map(item => item._id);
    const jobs = await Job.find({ _id: { $in: jobIds } })
      .select('title recruiterProfileId status moderationStatus');
    
    // 4. Lấy thông tin companies
    const recruiterIds = [...new Set(jobs.map(j => j.recruiterProfileId).filter(Boolean))];
    const companies = await RecruiterProfile.find({ _id: { $in: recruiterIds } })
      .select('company.name approvalStatus');
    
    // 5. Tạo map company -> applications
    const companyAppMap = {};
    
    jobs.forEach(job => {
      const appCount = appsByJob.find(a => a._id.toString() === job._id.toString())?.count || 0;
      const recruiterId = job.recruiterProfileId?.toString();
      
      if (recruiterId) {
        if (!companyAppMap[recruiterId]) {
          companyAppMap[recruiterId] = {
            totalApps: 0,
            jobs: []
          };
        }
        companyAppMap[recruiterId].totalApps += appCount;
        companyAppMap[recruiterId].jobs.push({
          jobId: job._id,
          title: job.title,
          appCount
        });
      }
    });
    
    // 6. Format kết quả
    const result = companies.map(company => {
      const companyData = companyAppMap[company._id.toString()];
      return {
        _id: company._id,
        companyName: company.company?.name,
        approvalStatus: company.approvalStatus,
        applicationCount: companyData?.totalApps || 0,
        jobCount: companyData?.jobs.length || 0,
        topJobs: companyData?.jobs.slice(0, 3) || []
      };
    }).sort((a, b) => b.applicationCount - a.applicationCount);
    
    res.json({
      success: true,
      data: {
        totalApplications: totalApps,
        totalUniqueJobs: appsByJob.length,
        totalCompanies: companies.length,
        topCompaniesByApplications: result
      }
    });
    
  } catch (error) {
    console.error('Test API Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
