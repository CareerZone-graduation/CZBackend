import { Job, User, RecruiterProfile, CandidateProfile, Application, CoinRecharge, CV } from '../models/index.js';
import { NotFoundError, BadRequestError, UnauthorizedError } from '../utils/AppError.js';
import mongoose from 'mongoose';
import * as queueService from './queue.service.js';
import { ROUTING_KEYS } from '../queues/rabbitmq.js';

// === QUẢN LÝ TIN TUYỂN DỤNG ===

export const getJobsForAdmin = async (queryParams) => {
  const { page = 1, limit = 10, search, company, status, sort = 'createdAt_desc' } = queryParams;

  const filter = {};

  // Search by title or company name
  if (search) {
    const searchFilter = [
      { title: { $regex: search, $options: 'i' } }
    ];

    const matchingCompanies = await RecruiterProfile.find({
      'company.name': { $regex: search, $options: 'i' }
    }).select('_id');

    if (matchingCompanies.length > 0) {
      searchFilter.push({
        recruiterProfileId: { $in: matchingCompanies.map(c => c._id) }
      });
    }

    filter.$or = searchFilter;
  }

  // Filter by a specific company
  if (company) {
    const companyProfiles = await RecruiterProfile.find({
      'company.name': { $regex: company, $options: 'i' }
    }).select('_id');

    if (companyProfiles.length > 0) {
      filter.recruiterProfileId = { $in: companyProfiles.map(c => c._id) };
    } else {
      // If no company is found, return an empty result
      return {
        meta: { currentPage: page, totalPages: 0, totalItems: 0, limit: limit },
        data: []
      };
    }
  }
  // Filter by status
  if (status) {
    if (status === 'PENDING') {
      // PENDING means not approved yet
      filter.approved = false;
    } else {
      filter.status = status;
    }
  }


  const sortOptions = {};
  switch (sort) {
    case 'title_asc':
      sortOptions.title = 1;
      break;
    case 'title_desc':
      sortOptions.title = -1;
      break;
    case 'createdAt_asc':
      sortOptions.createdAt = 1;
      break;
    case 'createdAt_desc':
    default:
      sortOptions.createdAt = -1;
      break;
  }

  const skip = (page - 1) * limit;

  const [jobs, total] = await Promise.all([
    Job.find(filter)
      .populate({
        path: 'recruiterProfileId',
        select: 'company.name company.logo'
      })
      .select('title description approved status createdAt recruiterProfileId')
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
    Job.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    meta: {
      currentPage: page,
      totalPages,
      totalItems: total,
      limit
    },
    data: jobs
  };
};

export const getJobDetail = async (jobId) => {
  const jobObjectId = new mongoose.Types.ObjectId(jobId);

  const [job, applicationStats] = await Promise.all([
    Job.findById(jobObjectId)
      .populate({
        path: 'recruiterProfileId',
        select: 'fullname company.name company.logo company.about company.industry verified userId',
        populate: {
          path: 'userId',
          select: 'email'
        }
      })
      .lean(),
    Application.aggregate([
      { $match: { jobId: jobObjectId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } },
          suitable: { $sum: { $cond: [{ $eq: ['$status', 'SUITABLE'] }, 1, 0] } },
          scheduled_interview: { $sum: { $cond: [{ $eq: ['$status', 'SCHEDULED_INTERVIEW'] }, 1, 0] } },
          offer_sent: { $sum: { $cond: [{ $eq: ['$status', 'OFFER_SENT'] }, 1, 0] } },
          accepted: { $sum: { $cond: [{ $eq: ['$status', 'ACCEPTED'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } },
        }
      }
    ])
  ]);

  if (!job) {
    throw new NotFoundError('Tin tuyển dụng không tồn tại.');
  }

  const stats = applicationStats[0] || {
    total: 0,
    pending: 0,
    suitable: 0,
    scheduled_interview: 0,
    offer_sent: 0,
    accepted: 0,
    rejected: 0,
  };

  return {
    ...job,
    analytics: {
      applicationStats: stats
    }
  };
};

export const approveJob = async (jobId) => {
  const updatedJob = await Job.findByIdAndUpdate(
    jobId,
    { approved: true },
    { new: true }
  );

  if (!updatedJob) {
    throw new NotFoundError('Tin tuyển dụng không tồn tại.');
  }

  return updatedJob;
};

export const rejectJob = async (jobId) => {
  const updatedJob = await Job.findByIdAndUpdate(
    jobId,
    { approved: false, status: 'INACTIVE' },
    { new: true }
  );

  if (!updatedJob) {
    throw new NotFoundError('Tin tuyển dụng không tồn tại.');
  }

  return updatedJob;
};

// === QUẢN LÝ NGƯỜI DÙNG ===

export const getUsersForAdmin = async (queryParams) => {
  const { page = 1, limit = 10, search, status, role, companyRegistration, sort = '-createdAt' } = queryParams;

  const filter = {
    role: { $ne: 'admin' } // Loại bỏ admin khỏi danh sách
  };

  // Tìm kiếm theo email hoặc fullname
  if (search) {
    const userFilter = [
      { email: { $regex: search, $options: 'i' } }
    ];

    // Tìm trong RecruiterProfile (fullname) nếu không phải chỉ candidate
    if (role !== 'candidate') {
      const matchingRecruiters = await RecruiterProfile.find({
        fullname: { $regex: search, $options: 'i' }
      }).select('userId');

      if (matchingRecruiters.length > 0) {
        userFilter.push({
          _id: { $in: matchingRecruiters.map(r => r.userId) }
        });
      }
    }

    // Tìm trong CandidateProfile (fullname) nếu không phải chỉ recruiter
    if (role !== 'recruiter') {
      const matchingCandidates = await CandidateProfile.find({
        fullname: { $regex: search, $options: 'i' }
      }).select('userId');

      if (matchingCandidates.length > 0) {
        userFilter.push({
          _id: { $in: matchingCandidates.map(c => c.userId) }
        });
      }
    }

    filter.$or = userFilter;
  }

  // Lọc theo trạng thái
  if (status === 'active') {
    filter.active = true;
  } else if (status === 'banned') {
    filter.active = false;
  }

  // Lọc theo role
  if (role) {
    filter.role = role;
  }

  // Lọc theo company registration status (chỉ áp dụng cho recruiter)
  let companyFilteredUserIds = null;
  if (companyRegistration && role === 'recruiter') {
    if (companyRegistration === 'registered') {
      // Tìm recruiters có company.name
      const recruitersWithCompany = await RecruiterProfile.find({
        'company.name': { $exists: true, $ne: null, $ne: '' }
      }).select('userId').lean();
      companyFilteredUserIds = recruitersWithCompany.map(r => r.userId);
    } else if (companyRegistration === 'not-registered') {
      // Tìm recruiters không có company.name
      const recruitersWithoutCompany = await RecruiterProfile.find({
        $or: [
          { 'company.name': { $exists: false } },
          { 'company.name': null },
          { 'company.name': '' }
        ]
      }).select('userId').lean();
      companyFilteredUserIds = recruitersWithoutCompany.map(r => r.userId);
    }

    // Nếu có filter company registration, thêm vào filter chính
    if (companyFilteredUserIds) {
      if (filter.$or) {
        // Nếu đã có $or từ search, cần kết hợp với $and
        filter.$and = [
          { $or: filter.$or },
          { _id: { $in: companyFilteredUserIds } }
        ];
        delete filter.$or;
      } else {
        filter._id = { $in: companyFilteredUserIds };
      }
    }
  }

  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('email role active createdAt')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter)
  ]);

  // Lấy thông tin fullname và company registration status cho tất cả users
  const userIds = users.map(u => u._id);
  const recruiterProfiles = await RecruiterProfile.find({
    userId: { $in: userIds }
  }).select('userId fullname company.name').lean();

  const candidateProfiles = await CandidateProfile.find({
    userId: { $in: userIds }
  }).select('userId fullname').lean();

  // Map fullname và hasCompany từ RecruiterProfile
  const recruiterMap = recruiterProfiles.reduce((acc, profile) => {
    acc[profile.userId.toString()] = {
      fullname: profile.fullname,
      hasCompany: !!(profile.company && profile.company.name)
    };
    return acc;
  }, {});

  const candidateMap = candidateProfiles.reduce((acc, profile) => {
    acc[profile.userId.toString()] = profile.fullname;
    return acc;
  }, {});

  // Tạo cấu trúc cố định cho tất cả users
  const usersWithFullname = users.map(user => {
    const baseUser = {
      _id: user._id,
      email: user.email,
      role: user.role,
      active: user.active,
      createdAt: user.createdAt
    };

    if (user.role === 'recruiter') {
      const recruiterInfo = recruiterMap[user._id.toString()];
      return {
        ...baseUser,
        fullname: recruiterInfo?.fullname || null,
        hasCompany: recruiterInfo?.hasCompany || false
      };
    } else {
      return {
        ...baseUser,
        fullname: candidateMap[user._id.toString()] || null
      };
    }
  });

  const totalPages = Math.ceil(total / limit);

  return {
    meta: {
      currentPage: page,
      totalPages,
      totalItems: total,
      limit
    },
    data: usersWithFullname
  };
};

export const updateUserStatus = async (userId, statusData) => {
  if (statusData.status === 'admin') {
    throw new BadRequestError('Không thể thay đổi trạng thái của admin.');
  }

  const isActive = statusData.status === 'active';

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { active: isActive },
    { new: true }
  ).select('email role active');

  if (!updatedUser) {
    throw new NotFoundError('Người dùng không tồn tại.');
  }

  return updatedUser;
};

export const getUserDetail = async (userId) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Fetch user basic info
  const user = await User.findById(userObjectId)
    .select('email role active createdAt')
    .lean();

  if (!user) {
    throw new NotFoundError('Người dùng không tồn tại.');
  }

  // Base response structure
  const userDetail = {
    _id: user._id,
    email: user.email,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt
  };

  // If user is a candidate
  if (user.role === 'candidate') {
    // Fetch candidate profile with profileCompleteness
    const candidateProfile = await CandidateProfile.findOne({ userId: userObjectId })
      .select('fullname avatar dateOfBirth gender phone address cvs profileCompleteness')
      .lean();

    // Use existing profileCompleteness calculation from the profile
    // This matches the calculation in /api/candidate/my-profile
    const profileCompleteness = candidateProfile?.profileCompleteness?.percentage || 0;

    // Count both uploaded CVs and template CVs
    const uploadedCVCount = candidateProfile?.cvs?.length || 0;
    const templateCVCount = await CV.countDocuments({ userId: userObjectId });
    const totalCVCount = uploadedCVCount + templateCVCount;

    // Fetch application statistics
    const applicationStats = await Application.aggregate([
      { $match: { candidateProfileId: candidateProfile?._id } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } },
          reviewing: { $sum: { $cond: [{ $eq: ['$status', 'REVIEWING'] }, 1, 0] } },
          scheduled_interview: { $sum: { $cond: [{ $eq: ['$status', 'SCHEDULED_INTERVIEW'] }, 1, 0] } },
          interviewed: { $sum: { $cond: [{ $eq: ['$status', 'INTERVIEWED'] }, 1, 0] } },
          accepted: { $sum: { $cond: [{ $eq: ['$status', 'ACCEPTED'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } },
          withdrawn: { $sum: { $cond: [{ $eq: ['$status', 'WITHDRAWN'] }, 1, 0] } }
        }
      }
    ]);

    // Fetch most recent application
    const recentApplication = await Application.findOne({ candidateProfileId: candidateProfile?._id })
      .sort({ createdAt: -1 })
      .select('createdAt')
      .lean();

    const stats = applicationStats[0] || {
      total: 0,
      pending: 0,
      reviewing: 0,
      scheduled_interview: 0,
      interviewed: 0,
      accepted: 0,
      rejected: 0,
      withdrawn: 0
    };

    // Calculate acceptance rate
    const acceptanceRate = stats.total > 0
      ? Math.round((stats.accepted / stats.total) * 100)
      : 0;

    return {
      ...userDetail,
      profile: {
        fullname: candidateProfile?.fullname || null,
        avatar: candidateProfile?.avatar || null,
        dateOfBirth: candidateProfile?.dateOfBirth || null,
        gender: candidateProfile?.gender || null,
        phone: candidateProfile?.phone || null,
        address: candidateProfile?.address || null,
        cvCount: totalCVCount,
        uploadedCVCount: uploadedCVCount,
        templateCVCount: templateCVCount,
        profileCompleteness,
        profileCompletenessDetails: candidateProfile?.profileCompleteness || null
      },
      applicationStats: {
        ...stats,
        acceptanceRate,
        mostRecentApplication: recentApplication?.createdAt || null
      }
    };
  }

  // If user is a recruiter
  if (user.role === 'recruiter') {
    // Fetch recruiter profile
    const recruiterProfile = await RecruiterProfile.findOne({ userId: userObjectId })
      .select('_id fullname company')
      .lean();

    // Fetch job posting statistics
    const jobStats = await Job.aggregate([
      { $match: { recruiterProfileId: recruiterProfile?._id } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] } },
          inactive: { $sum: { $cond: [{ $eq: ['$status', 'INACTIVE'] }, 1, 0] } },
          expired: { $sum: { $cond: [{ $eq: ['$status', 'EXPIRED'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ['$approved', false] }, 1, 0] } }
        }
      }
    ]);

    // Fetch most recent job posting
    const recentJob = await Job.findOne({ recruiterProfileId: recruiterProfile?._id })
      .sort({ createdAt: -1 })
      .select('createdAt')
      .lean();

    // Fetch application statistics for recruiter's jobs
    const applicationStats = await Application.aggregate([
      {
        $lookup: {
          from: 'jobs',
          localField: 'jobId',
          foreignField: '_id',
          as: 'job'
        }
      },
      { $unwind: '$job' },
      { $match: { 'job.recruiterProfileId': recruiterProfile?._id } },
      {
        $group: {
          _id: null,
          totalApplications: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } },
          reviewing: { $sum: { $cond: [{ $eq: ['$status', 'REVIEWING'] }, 1, 0] } },
          scheduled_interview: { $sum: { $cond: [{ $eq: ['$status', 'SCHEDULED_INTERVIEW'] }, 1, 0] } },
          interviewed: { $sum: { $cond: [{ $eq: ['$status', 'INTERVIEWED'] }, 1, 0] } },
          accepted: { $sum: { $cond: [{ $eq: ['$status', 'ACCEPTED'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } }
        }
      }
    ]);

    const stats = jobStats[0] || {
      total: 0,
      active: 0,
      inactive: 0,
      expired: 0,
      pending: 0
    };

    const appStats = applicationStats[0] || {
      totalApplications: 0,
      pending: 0,
      reviewing: 0,
      scheduled_interview: 0,
      interviewed: 0,
      accepted: 0,
      rejected: 0
    };

    return {
      ...userDetail,
      recruiterProfileId: recruiterProfile?._id || null,
      profile: {
        fullname: recruiterProfile?.fullname || null,
        hasCompany: !!(recruiterProfile?.company?.name)
      },
      company: recruiterProfile?.company ? {
        name: recruiterProfile.company.name || null,
        about: recruiterProfile.company.about || null,
        logo: recruiterProfile.company.logo || null,
        industry: recruiterProfile.company.industry || null,
        size: recruiterProfile.company.size || null,
        website: recruiterProfile.company.website || null,
        location: {
          province: recruiterProfile.company.location?.province || null,
          district: recruiterProfile.company.location?.district || null,
          commune: recruiterProfile.company.location?.commune || null
        },
        address: recruiterProfile.company.address || null,
        contactInfo: {
          email: recruiterProfile.company.contactInfo?.email || null,
          phone: recruiterProfile.company.contactInfo?.phone || null
        },
        verified: recruiterProfile.company.verified || false,
        status: recruiterProfile.company.status || null
      } : null,
      jobStats: {
        ...stats,
        mostRecentJob: recentJob?.createdAt || null
      },
      applicationStats: appStats
    };
  }

  // For admin or other roles
  return userDetail;
};

// === QUẢN LÝ CÔNG TY ===

export const getCompaniesForAdmin = async (queryParams) => {
  const { page = 1, limit = 10, search, status, industry, sort = 'createdAt_desc' } = queryParams;

  const filter = {};

  if (search) {
    const searchFilter = [
      { 'company.name': { $regex: search, $options: 'i' } },
      { fullname: { $regex: search, $options: 'i' } },
    ];
    filter.$or = searchFilter;
  }

  if (status) {
    filter['company.status'] = status;
  }

  if (industry) {
    filter['company.industry'] = industry;
  }

  const sortOptions = {};
  switch (sort) {
    case 'name_asc':
      sortOptions['company.name'] = 1;
      break;
    case 'name_desc':
      sortOptions['company.name'] = -1;
      break;
    case 'createdAt_asc':
      sortOptions.createdAt = 1;
      break;
    case 'updatedAt_asc':
      sortOptions.updatedAt = 1;
      break;
    case 'updatedAt_desc':
      sortOptions.updatedAt = -1;
      break;
    case 'createdAt_desc':
    default:
      sortOptions.createdAt = -1;
      break;
  }

  const skip = (page - 1) * limit;

  const [recruiterProfiles, total] = await Promise.all([
    RecruiterProfile.find(filter)
      .populate({
        path: 'userId',
        select: 'email active createdAt',
      })
      .select('fullname company createdAt updatedAt userId')
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
    RecruiterProfile.countDocuments(filter),
  ]);

  // Tạo cấu trúc response cố định cho hồ sơ nhà tuyển dụng
  const formattedData = recruiterProfiles.map(profile => ({
    _id: profile._id,
    recruiterInfo: {
      fullname: profile.fullname,
      userId: profile.userId._id,
      email: profile.userId.email,
      active: profile.userId.active,
      userCreatedAt: profile.userId.createdAt
    },
    company: {
      name: profile.company?.name || null,
      about: profile.company?.about || null,
      logo: profile.company?.logo || null,
      industry: profile.company?.industry || null,
      taxCode: profile.company?.taxCode || null,
      businessRegistrationUrl: profile.company?.businessRegistrationUrl || null,
      size: profile.company?.size || null,
      website: profile.company?.website || null,
      location: {
        province: profile.company?.location?.province || null,
        district: profile.company?.location?.district || null,
        commune: profile.company?.location?.commune || null
      },
      address: profile.company?.address || null,
      contactInfo: {
        email: profile.company?.contactInfo?.email || null,
        phone: profile.company?.contactInfo?.phone || null
      },
      verified: profile.company?.verified || false,
      status: profile.company?.status || 'pending',
      rejectReason: profile.company?.rejectReason || null
    },
    profileCreatedAt: profile.createdAt,
    profileUpdatedAt: profile.updatedAt
  }));

  const totalPages = Math.ceil(total / limit);

  return {
    meta: {
      currentPage: page,
      totalPages,
      totalItems: total,
      limit
    },
    data: formattedData
  };
};


export const getCompanyDetail = async (companyId) => {
  const recruiterProfile = await RecruiterProfile.findById(companyId)
    .populate({
      path: 'userId',
      select: 'email active createdAt'
    })
    .lean();

  if (!recruiterProfile) {
    throw new NotFoundError('Hồ sơ nhà tuyển dụng không tồn tại.');
  }

  // Lấy thống kê tin tuyển dụng
  const [totalJobs, recruitingJobs, pendingJobs, expiredJobs] = await Promise.all([
    Job.countDocuments({ recruiterProfileId: companyId }),
    Job.countDocuments({ recruiterProfileId: companyId, status: 'ACTIVE', approved: true }),
    Job.countDocuments({ recruiterProfileId: companyId, approved: false }),
    Job.countDocuments({ recruiterProfileId: companyId, status: 'EXPIRED' })
  ]);

  // Lấy danh sách các job của công ty để thống kê đơn ứng tuyển
  const companyJobs = await Job.find({ recruiterProfileId: companyId }).select('_id').lean();
  const companyJobIds = companyJobs.map(job => job._id);

  // Lấy thống kê đơn ứng tuyển và thống kê giao dịch
  const [applicationStats, rechargeStats] = await Promise.all([
    Application.aggregate([
      { $match: { jobId: { $in: companyJobIds } } },
      {
        $group: {
          _id: null,
          totalApplications: { $sum: 1 },
          pending: { $sum: { $cond: [{ $in: ['$status', ['PENDING', 'REVIEWING']] }, 1, 0] } },
          accepted: { $sum: { $cond: [{ $eq: ['$status', 'ACCEPTED'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } }
        }
      }
    ]),
    CoinRecharge.aggregate([
      { $match: { userId: recruiterProfile.userId._id, status: 'SUCCESS' } },
      {
        $group: {
          _id: null,
          totalAmountPaid: { $sum: '$amountPaid' },
          totalCoinsRecharged: { $sum: '$coinAmount' },
          rechargeCount: { $sum: 1 },
          lastRechargeDate: { $max: '$createdAt' }
        }
      }
    ])
  ]);

  const appStats = applicationStats[0] || { totalApplications: 0, pending: 0, accepted: 0, rejected: 0 };
  const rechargeSummary = rechargeStats[0] || { totalAmountPaid: 0, totalCoinsRecharged: 0, rechargeCount: 0, lastRechargeDate: null };

  // Trả về cấu trúc chi tiết đầy đủ
  return {
    _id: recruiterProfile._id,
    recruiterInfo: {
      fullname: recruiterProfile.fullname,
      userId: recruiterProfile.userId._id,
      email: recruiterProfile.userId.email,
      active: recruiterProfile.userId.active,
      userCreatedAt: recruiterProfile.userId.createdAt
    },
    company: {
      name: recruiterProfile.company?.name || null,
      about: recruiterProfile.company?.about || null,
      logo: recruiterProfile.company?.logo || null,
      industry: recruiterProfile.company?.industry || null,
      taxCode: recruiterProfile.company?.taxCode || null,
      businessRegistrationUrl: recruiterProfile.company?.businessRegistrationUrl || null,
      size: recruiterProfile.company?.size || null,
      website: recruiterProfile.company?.website || null,
      location: {
        province: recruiterProfile.company?.location?.province || null,
        district: recruiterProfile.company?.location?.district || null,
        commune: recruiterProfile.company?.location?.commune || null
      },
      address: recruiterProfile.company?.address || null,
      contactInfo: {
        email: recruiterProfile.company?.contactInfo?.email || null,
        phone: recruiterProfile.company?.contactInfo?.phone || null
      },
      verified: recruiterProfile.company?.verified || false,
      status: recruiterProfile.company?.status || null,
      rejectReason: recruiterProfile.company?.rejectReason || null
    },
    jobStats: {
      totalJobs,
      recruitingJobs,
      pendingJobs,
      expiredJobs
    },
    applicationStats: {
      total: appStats.totalApplications,
      pending: appStats.pending,
      accepted: appStats.accepted,
      rejected: appStats.rejected
    },
    rechargeStats: {
      totalAmountPaid: rechargeSummary.totalAmountPaid,
      totalCoinsRecharged: rechargeSummary.totalCoinsRecharged,
      rechargeCount: rechargeSummary.rechargeCount,
      lastRechargeDate: rechargeSummary.lastRechargeDate
    },
    profileCreatedAt: recruiterProfile.createdAt,
    profileUpdatedAt: recruiterProfile.updatedAt
  };
};

export const approveCompany = async (companyId) => {
  const updatedProfile = await RecruiterProfile.findByIdAndUpdate(
    companyId,
    {
      'company.status': 'approved',
      'company.verified': true,
      'company.rejectReason': null
    },
    { new: true }
  ).populate({
    path: 'userId',
    select: 'email active createdAt'
  }).lean();

  if (!updatedProfile) {
    throw new NotFoundError('Hồ sơ nhà tuyển dụng không tồn tại.');
  }

  // Trả về cấu trúc cố định đầy đủ
  return {
    _id: updatedProfile._id,
    recruiterInfo: {
      fullname: updatedProfile.fullname,
      userId: updatedProfile.userId._id,
      email: updatedProfile.userId.email,
      active: updatedProfile.userId.active,
      userCreatedAt: updatedProfile.userId.createdAt
    },
    company: {
      name: updatedProfile.company?.name || null,
      about: updatedProfile.company?.about || null,
      logo: updatedProfile.company?.logo || null,
      industry: updatedProfile.company?.industry || null,
      taxCode: updatedProfile.company?.taxCode || null,
      businessRegistrationUrl: updatedProfile.company?.businessRegistrationUrl || null,
      size: updatedProfile.company?.size || null,
      website: updatedProfile.company?.website || null,
      location: {
        province: updatedProfile.company?.location?.province || null,
        district: updatedProfile.company?.location?.district || null,
        commune: updatedProfile.company?.location?.commune || null
      },
      address: updatedProfile.company?.address || null,
      contactInfo: {
        email: updatedProfile.company?.contactInfo?.email || null,
        phone: updatedProfile.company?.contactInfo?.phone || null
      },
      verified: updatedProfile.company?.verified || false,
      status: updatedProfile.company?.status,
      rejectReason: updatedProfile.company?.rejectReason
    },
    profileCreatedAt: updatedProfile.createdAt,
    profileUpdatedAt: updatedProfile.updatedAt
  };
};

export const rejectCompany = async (companyId, { rejectReason }) => {
  const updatedProfile = await RecruiterProfile.findByIdAndUpdate(
    companyId,
    {
      'company.status': 'rejected',
      'company.verified': false,
      'company.rejectReason': rejectReason
    },
    { new: true }
  ).populate({
    path: 'userId',
    select: 'email active createdAt'
  }).lean();

  if (!updatedProfile) {
    throw new NotFoundError('Hồ sơ nhà tuyển dụng không tồn tại.');
  }

  // Trả về cấu trúc cố định đầy đủ
  return {
    _id: updatedProfile._id,
    recruiterInfo: {
      fullname: updatedProfile.fullname,
      userId: updatedProfile.userId._id,
      email: updatedProfile.userId.email,
      active: updatedProfile.userId.active,
      userCreatedAt: updatedProfile.userId.createdAt
    },
    company: {
      name: updatedProfile.company?.name || null,
      about: updatedProfile.company?.about || null,
      logo: updatedProfile.company?.logo || null,
      industry: updatedProfile.company?.industry || null,
      taxCode: updatedProfile.company?.taxCode || null,
      businessRegistrationUrl: updatedProfile.company?.businessRegistrationUrl || null,
      size: updatedProfile.company?.size || null,
      website: updatedProfile.company?.website || null,
      location: {
        province: updatedProfile.company?.location?.province || null,
        district: updatedProfile.company?.location?.district || null,
        commune: updatedProfile.company?.location?.commune || null
      },
      address: updatedProfile.company?.address || null,
      contactInfo: {
        email: updatedProfile.company?.contactInfo?.email || null,
        phone: updatedProfile.company?.contactInfo?.phone || null
      },
      verified: updatedProfile.company?.verified || false,
      status: updatedProfile.company?.status,
      rejectReason: updatedProfile.company?.rejectReason
    },
    profileCreatedAt: updatedProfile.createdAt,
    profileUpdatedAt: updatedProfile.updatedAt
  };
};

// === DASHBOARD THỐNG KÊ ===

export const getAdminStats = async () => {
  const [
    totalUsers,
    totalCandidates,
    totalRecruiters,
    totalJobs,
    pendingJobs,
    approvedJobs,
    totalApplications,
    verifiedCompanies,
    unverifiedCompanies,
    pendingCompanies,
    // --- BỔ SUNG CÁC TRUY VẤN MỚI ---
    recruitersWithoutCompany, // Đếm NTD chưa có thông tin công ty
    bannedUsers             // Đếm tài khoản bị khóa
  ] = await Promise.all([
    User.countDocuments({ role: { $ne: 'admin' } }), // Loại bỏ admin
    User.countDocuments({ role: 'candidate' }),
    User.countDocuments({ role: 'recruiter' }),
    Job.countDocuments(),
    Job.countDocuments({ approved: false }),
    Job.countDocuments({ approved: true }),
    Application.countDocuments(),
    RecruiterProfile.countDocuments({ 'company.verified': true }),
    RecruiterProfile.countDocuments({ 'company.verified': false }),
    RecruiterProfile.countDocuments({
      'company.status': 'pending'
    }),
    // --- LOGIC MỚI ---
    RecruiterProfile.countDocuments({ 'company.name': { $exists: false } }),
    User.countDocuments({ active: false, role: { $ne: 'admin' } }) // Loại bỏ admin trong banned users
  ]);

  return {
    overview: {
      totalUsers,
      totalJobs,
      totalApplications
    },
    users: {
      candidates: totalCandidates,
      recruiters: totalRecruiters,
      total: totalUsers,
      // --- DỮ LIỆU MỚI ---
      banned: bannedUsers
    },
    jobs: {
      pending: pendingJobs,
      approved: approvedJobs,
      total: totalJobs
    },
    companies: {
      verified: verifiedCompanies,
      unverified: unverifiedCompanies,
      pending: pendingCompanies,
      total: verifiedCompanies + unverifiedCompanies,
      // --- DỮ LIỆU MỚI ---
      recruitersWithoutCompany: recruitersWithoutCompany
    }
  };
};

// === QUẢN LÝ JOBS CỦA CÔNG TY ===

export const getCompanyJobs = async (companyId, queryParams) => {
  const { page = 1, limit = 20, status, search, sort = 'createdAt_desc' } = queryParams;

  // Verify company exists
  const recruiterProfile = await RecruiterProfile.findById(companyId);
  if (!recruiterProfile) {
    throw new NotFoundError('Hồ sơ nhà tuyển dụng không tồn tại.');
  }

  const filter = { recruiterProfileId: new mongoose.Types.ObjectId(companyId) };

  // Filter by status
  if (status && status !== 'all') {
    if (status === 'active') {
      filter.status = 'ACTIVE';
      filter.approved = true;
    } else if (status === 'expired') {
      filter.status = 'EXPIRED';
    } else if (status === 'pending') {
      filter.approved = false;
    } else if (status === 'inactive') {
      filter.status = 'INACTIVE';
    }
  }

  // Search by title
  if (search) {
    filter.title = { $regex: search, $options: 'i' };
  }

  // Sort options
  const sortOptions = {};
  switch (sort) {
    case 'createdAt_asc':
      sortOptions.createdAt = 1;
      break;
    case 'createdAt_desc':
      sortOptions.createdAt = -1;
      break;
    case 'expiresAt_asc':
      sortOptions.expiresAt = 1;
      break;
    case 'expiresAt_desc':
      sortOptions.expiresAt = -1;
      break;
    default:
      sortOptions.createdAt = -1;
  }

  const skip = (page - 1) * limit;

  const [jobs, total] = await Promise.all([
    Job.find(filter)
      .select('title status approved createdAt expiresAt location salary')
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
    Job.countDocuments(filter)
  ]);

  // Get application counts for each job
  const jobIds = jobs.map(job => job._id);
  const applicationCounts = await Application.aggregate([
    { $match: { jobId: { $in: jobIds } } },
    { $group: { _id: '$jobId', count: { $sum: 1 } } }
  ]);

  const applicationCountMap = applicationCounts.reduce((acc, item) => {
    acc[item._id.toString()] = item.count;
    return acc;
  }, {});

  const jobsWithCounts = jobs.map(job => ({
    ...job,
    applicationCount: applicationCountMap[job._id.toString()] || 0
  }));

  const totalPages = Math.ceil(total / limit);

  return {
    meta: {
      currentPage: page,
      totalPages,
      totalItems: total,
      itemsPerPage: limit
    },
    data: jobsWithCounts
  };
};

export const updateJobStatusByAdmin = async (jobId, status) => {
  const validStatuses = ['ACTIVE', 'INACTIVE', 'EXPIRED'];

  if (!validStatuses.includes(status)) {
    throw new BadRequestError('Trạng thái không hợp lệ.');
  }

  const updatedJob = await Job.findByIdAndUpdate(
    jobId,
    { status },
    { new: true }
  );

  if (!updatedJob) {
    throw new NotFoundError('Tin tuyển dụng không tồn tại.');
  }

  return updatedJob;
};

export const activateJob = async (jobId) => {
  const job = await Job.findById(jobId);

  if (!job) {
    throw new NotFoundError('Tin tuyển dụng không tồn tại.');
  }

  // Update status and extend expiration if needed
  const updatedJob = await Job.findByIdAndUpdate(
    jobId,
    {
      status: 'ACTIVE',
      approved: true
    },
    { new: true }
  );

  return updatedJob;
};

export const deactivateJob = async (jobId) => {
  const updatedJob = await Job.findByIdAndUpdate(
    jobId,
    { status: 'INACTIVE' },
    { new: true }
  );

  if (!updatedJob) {
    throw new NotFoundError('Tin tuyển dụng không tồn tại.');
  }

  return updatedJob;
};
