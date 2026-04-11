import { Job, User, RecruiterProfile, CandidateProfile, Application, CoinRecharge, CV, CreditTransaction } from '../models/index.js';
import { TRANSACTION_TYPES, TRANSACTION_CATEGORIES } from '../constants/index.js';
import { NotFoundError, BadRequestError, UnauthorizedError } from '../utils/AppError.js';
import mongoose from 'mongoose';
import * as queueService from './queue.service.js';
import { ROUTING_KEYS } from '../queues/rabbitmq.js';
import * as emailService from './email.service.js';
import axios from 'axios';
import config from '../config/index.js';
import logger from '../utils/logger.js';

// === QUẢN LÝ TIN TUYỂN DỤNG ===

export const getJobsForAdmin = async (queryParams) => {
  const { page = 1, limit = 10, search, company, status, sort = 'createdAt_desc' } = queryParams;

  const filter = {};

  // Search by title or company name
  if (search) {
    const searchRegex = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchFilter = [
      { title: { $regex: searchRegex, $options: 'i' } }
    ];

    const matchingCompanies = await RecruiterProfile.find({
      'company.name': { $regex: searchRegex, $options: 'i' }
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
    if (mongoose.Types.ObjectId.isValid(company)) {
      // Convert string to ObjectId for proper matching
      filter.recruiterProfileId = new mongoose.Types.ObjectId(company);
    } else {
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
  }
  // Filter by status (Unified)
  if (status) {
    if (status === 'PENDING') {
      // Chỉ hiển thị jobs PENDING, không bao gồm NEUTRAL
      filter.moderationStatus = 'PENDING';
    } else if (status === 'NEUTRAL') {
      // Tab riêng cho jobs không xác định
      filter.moderationStatus = 'NEUTRAL';
    } else if (status === 'AI_FAILED') {
      // Tab riêng cho jobs AI không duyệt được - cần duyệt thủ công
      filter.moderationStatus = { $in: ['PENDING', 'NEUTRAL'] };
      filter['aiModerationResult.failed'] = true;
      filter['aiModerationResult.allowRetry'] = { $ne: true }; // Chưa được reset
    } else if (status === 'ACTIVE') {
      filter.status = 'ACTIVE';
      filter.moderationStatus = 'APPROVED';
    } else if (status === 'INACTIVE') {
      filter.status = 'INACTIVE';
      filter.moderationStatus = 'APPROVED';
    } else if (status === 'EXPIRED') {
      filter.status = 'EXPIRED';
      filter.moderationStatus = 'APPROVED';
    } else if (status === 'REJECTED') {
      filter.moderationStatus = 'REJECTED';
    } else {
      // Fallback for direct status match if needed
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
      .select('title description requirements approved moderationStatus status createdAt recruiterProfileId aiModerationResult')
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

export const getJobStatistics = async () => {
  const [
    active,
    pending,
    neutral,
    expired,
    inactive,
    rejected,
    aiApproved,
    aiRejected,
    total
  ] = await Promise.all([
    Job.countDocuments({ status: 'ACTIVE', moderationStatus: 'APPROVED' }),
    // PENDING: Chỉ jobs chờ duyệt, không bao gồm NEUTRAL
    Job.countDocuments({ moderationStatus: 'PENDING' }),
    // NEUTRAL: Jobs không xác định - AI không duyệt được
    Job.countDocuments({ moderationStatus: 'NEUTRAL' }),
    Job.countDocuments({ status: 'EXPIRED', moderationStatus: 'APPROVED' }),
    Job.countDocuments({ status: 'INACTIVE', moderationStatus: 'APPROVED' }),
    Job.countDocuments({ moderationStatus: 'REJECTED' }),
    // AI Approved: Jobs được AI duyệt - có aiModerationResult với prediction
    Job.countDocuments({
      moderationStatus: 'APPROVED',
      'aiModerationResult.moderatedAt': { $exists: true },
      'aiModerationResult.prediction': { $exists: true, $ne: null }
    }),
    // AI Rejected: Jobs bị AI từ chối - có aiModerationResult với prediction
    Job.countDocuments({
      moderationStatus: 'REJECTED',
      'aiModerationResult.moderatedAt': { $exists: true },
      'aiModerationResult.prediction': { $exists: true, $ne: null }
    }),
    Job.countDocuments()
  ]);

  return {
    active,
    pending,
    neutral,
    expired,
    inactive,
    rejected,
    aiApproved,
    aiRejected,
    total
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
  const job = await Job.findById(jobId).populate({
    path: 'recruiterProfileId',
    populate: {
      path: 'userId',
      select: '_id'
    }
  });

  if (!job) {
    throw new NotFoundError('Tin tuyển dụng không tồn tại.');
  }

  if (job.moderationStatus === 'NEUTRAL') {
    logger.warn(`Admin approving NEUTRAL job ${jobId} (AI failed previously)`);
  }

  job.moderationStatus = 'APPROVED';
  
  if (job.deadline && new Date(job.deadline) < new Date()) {
    job.status = 'EXPIRED';
  } else {
    job.status = 'ACTIVE';
  }

  await job.save();

  // Publish notification
  if (job.recruiterProfileId?.userId?._id) {
    try {
      await queueService.publishNotification(ROUTING_KEYS.JOB_APPROVAL, {
        recipientId: job.recruiterProfileId.userId._id,
        data: {
          status: 'APPROVED',
          jobTitle: job.title,
          jobId: job._id
        }
      });
    } catch (error) {
      logger.error('Failed to publish job approval notification:', error);
    }
  }
  
  return job;
};

export const rejectJob = async (jobId, rejectionReason) => {
  const job = await Job.findById(jobId).populate({
    path: 'recruiterProfileId',
    populate: {
      path: 'userId',
      select: '_id'
    }
  });

  if (!job) {
    throw new NotFoundError('Tin tuyển dụng không tồn tại.');
  }

  // Cập nhật job status
  job.status = 'INACTIVE';
  job.moderationStatus = 'REJECTED';

  // Lưu lý do từ chối vào aiModerationResult
  if (!job.aiModerationResult) {
    job.aiModerationResult = {};
  }
  job.aiModerationResult.summary = rejectionReason || 'Không đáp ứng tiêu chuẩn';
  job.aiModerationResult.reasons = rejectionReason ? [rejectionReason] : [];
  job.aiModerationResult.moderatedAt = new Date();
  job.aiModerationResult.method = 'MANUAL'; // Đánh dấu là duyệt thủ công

  await job.save();

  // Publish notification
  if (job.recruiterProfileId?.userId?._id) {
    try {
      await queueService.publishNotification(ROUTING_KEYS.JOB_APPROVAL, {
        recipientId: job.recruiterProfileId.userId._id,
        data: {
          status: 'REJECTED',
          jobTitle: job.title,
          jobId: job._id,
          rejectionReason: rejectionReason || 'Không đáp ứng tiêu chuẩn'
        }
      });
      logger.info(`Rejection notification sent to recruiter ${job.recruiterProfileId.userId._id} for job ${job._id}`);
    } catch (error) {
      logger.error('Failed to send rejection notification:', error);
    }
  }

  return job;
};

// === AI AUTO MODERATION ===

const PYTHON_SERVICE_URL = config.PYTHON_SERVICE_URL || 'http://localhost:8000';
const INTERNAL_API_KEY = config.INTERNAL_API_KEY;

export const autoModerateJobWithPythonService = async (jobId) => {
  const job = await Job.findById(jobId);

  if (!job) {
    throw new NotFoundError('Không tìm thấy job');
  }

  // Kiểm tra xem job đã ở trạng thái NEUTRAL chưa
  if (job.moderationStatus === 'NEUTRAL') {
    throw new BadRequestError('Job này đã ở trạng thái không xác định. AI không thể duyệt job này. Vui lòng duyệt thủ công.');
  }

  // Kiểm tra xem job đã thử AI và thất bại chưa (và chưa được reset)
  if (job.aiModerationResult?.failed === true && job.aiModerationResult?.allowRetry !== true) {
    throw new BadRequestError('Job này đã thử duyệt bằng AI nhưng thất bại. Vui lòng duyệt thủ công hoặc bật lại tính năng duyệt AI cho job này.');
  }

  // Đảm bảo status luôn hợp lệ (KHÔNG BAO GIỜ là PENDING)
  if (!['ACTIVE', 'INACTIVE', 'EXPIRED'].includes(job.status)) {
    job.status = 'INACTIVE'; // Default to INACTIVE nếu status không hợp lệ
  }

  try {
    if (!INTERNAL_API_KEY) {
      throw new Error('INTERNAL_API_KEY is not configured');
    }

    logger.info('Calling AI service for job moderation');

    const url = `${PYTHON_SERVICE_URL}/api/v1/job-moderation/analyze`;

    const response = await axios.post(url, {
      title: job.title,
      description: job.description,
      requirements: job.requirements,
      benefits: job.benefits
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': INTERNAL_API_KEY
      },
      timeout: 30000
    });

    const aiResult = response.data;
    logger.info('AI service moderation completed successfully');

    // Cập nhật job dựa trên kết quả LLM
    if (aiResult.shouldApprove) {
      job.moderationStatus = 'APPROVED';
      job.status = 'ACTIVE';
    } else {
      job.moderationStatus = 'REJECTED';
      job.status = 'INACTIVE';
    }

    // Lưu kết quả AI với thông tin chi tiết
    if (!job.aiModerationResult) {
      job.aiModerationResult = {};
    }
    job.aiModerationResult.prediction = aiResult.prediction;
    job.aiModerationResult.confidence = aiResult.confidence;
    job.aiModerationResult.probabilities = aiResult.probabilities;
    job.aiModerationResult.reasons = aiResult.reasons;
    job.aiModerationResult.summary = aiResult.summary;
    job.aiModerationResult.moderatedAt = new Date();
    job.aiModerationResult.method = 'LLM'; // Đánh dấu là dùng LLM
    job.aiModerationResult.failed = false; // Đánh dấu thành công

    await job.save();

    // Populate sau khi save
    await job.populate('recruiterProfileId');

    // Gửi notification cho recruiter
    if (job.recruiterProfileId) {
      try {
        const recruiterProfile = await RecruiterProfile.findById(job.recruiterProfileId);

        if (recruiterProfile?.userId) {
          await queueService.publishNotification(ROUTING_KEYS.JOB_APPROVAL, {
            recipientId: recruiterProfile.userId,
            data: {
              status: aiResult.shouldApprove ? 'APPROVED' : 'REJECTED',
              jobTitle: job.title,
              jobId: job._id,
              rejectionReason: aiResult.shouldApprove ? undefined : aiResult.summary
            }
          });
        }
      } catch (notificationError) {
        logger.error('Failed to send notification:', notificationError);
      }
    }

    return {
      job,
      aiResult
    };
  } catch (error) {
    // Nếu phân tích thất bại, chuyển sang trạng thái NEUTRAL (không xác định)

    // Chuyển sang NEUTRAL - Job này không thể duyệt bằng AI
    job.moderationStatus = 'NEUTRAL';
    // Đảm bảo status là INACTIVE (không được phép ACTIVE khi chưa duyệt)
    job.status = 'INACTIVE';

    // Lưu thông tin lỗi vào aiModerationResult
    if (!job.aiModerationResult) {
      job.aiModerationResult = {};
    }
    job.aiModerationResult.prediction = null;
    job.aiModerationResult.confidence = null;
    job.aiModerationResult.probabilities = null;
    job.aiModerationResult.reasons = ['AI service không khả dụng - Job chuyển sang trạng thái không xác định'];
    job.aiModerationResult.summary = `AI không khả dụng`;
    job.aiModerationResult.moderatedAt = new Date();
    job.aiModerationResult.method = 'LLM';
    job.aiModerationResult.failed = true; // Đánh dấu là thất bại

    await job.save();
  

  }
};

// === ADMIN SETTINGS ===

export const getAutoModerationStatus = async () => {
  const AdminSettings = (await import('../models/AdminSettings.js')).default;

  const setting = await AdminSettings.findOne({ key: 'autoModeration' });

  return {
    enabled: setting?.value?.enabled || false,
    useLLM: setting?.value?.useLLM !== false, // Default to true
    updatedAt: setting?.updatedAt
  };
};

export const setAutoModerationStatus = async (enabled, userId) => {
  const AdminSettings = (await import('../models/AdminSettings.js')).default;

  const setting = await AdminSettings.findOneAndUpdate(
    { key: 'autoModeration' },
    {
      key: 'autoModeration',
      value: {
        enabled,
        useLLM: true // Always use LLM for auto-moderation
      },
      updatedBy: userId
    },
    { upsert: true, new: true }
  );

  return {
    enabled: setting.value.enabled,
    useLLM: setting.value.useLLM,
    updatedAt: setting.updatedAt
  };
};

// === QUẢN LÝ NGƯỜI DÙNG ===

export const getUsersForAdmin = async (queryParams) => {
  const { page = 1, limit = 10, search, status, role, companyRegistration, sort = '-createdAt' } = queryParams;

  const filter = {
    role: { $ne: 'admin' } // Loại bỏ admin khỏi danh sách
  };

  // Tìm kiếm theo email hoặc fullname
  if (search) {
    const searchRegex = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const userFilter = [
      { email: { $regex: searchRegex, $options: 'i' } }
    ];

    // Tìm trong RecruiterProfile (fullname) nếu không phải chỉ candidate
    if (role !== 'candidate') {
      const matchingRecruiters = await RecruiterProfile.find({
        fullname: { $regex: searchRegex, $options: 'i' }
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
        fullname: { $regex: searchRegex, $options: 'i' }
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
  }).select('userId fullname company.name company.logo').lean();

  const candidateProfiles = await CandidateProfile.find({
    userId: { $in: userIds }
  }).select('userId fullname avatar').lean();

  // Map fullname và hasCompany từ RecruiterProfile
  const recruiterMap = recruiterProfiles.reduce((acc, profile) => {
    acc[profile.userId.toString()] = {
      fullname: profile.fullname,
      avatar: profile.company?.logo || null,
      hasCompany: !!(profile.company && profile.company.name)
    };
    return acc;
  }, {});

  const candidateMap = candidateProfiles.reduce((acc, profile) => {
    acc[profile.userId.toString()] = {
      fullname: profile.fullname,
      avatar: profile.avatar || null
    };
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
        avatar: recruiterInfo?.avatar || null,
        hasCompany: recruiterInfo?.hasCompany || false
      };
    } else {
      const candidateInfo = candidateMap[user._id.toString()];
      return {
        ...baseUser,
        fullname: candidateInfo?.fullname || null,
        avatar: candidateInfo?.avatar || null
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

  const { status, reason } = statusData;
  const isActive = status === 'active';

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('Người dùng không tồn tại.');
  }

  // Chỉ cập nhật trạng thái hoạt động, không lưu lý do vào model User
  user.active = isActive;
  await user.save();

  // Lấy thông tin fullname để gửi email
  let fullname = user.email;
  if (user.role === 'recruiter') {
    const profile = await RecruiterProfile.findOne({ userId: user._id }).select('fullname');
    if (profile) fullname = profile.fullname;
  } else if (user.role === 'candidate') {
    const profile = await CandidateProfile.findOne({ userId: user._id }).select('fullname');
    if (profile) fullname = profile.fullname;
  }

  // Gửi email thông báo với lý do nhận được từ request
  const emailUser = { email: user.email, fullname };
  if (isActive) {
    emailService.sendAccountUnblockedEmail(emailUser, reason);
  } else {
    emailService.sendAccountBlockedEmail(emailUser, reason);
  }

  return {
    _id: user._id,
    email: user.email,
    role: user.role,
    active: user.active
  };
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
    const searchRegex = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchFilter = [
      { 'company.name': { $regex: searchRegex, $options: 'i' } },
      { fullname: { $regex: searchRegex, $options: 'i' } },
    ];
    filter.$or = searchFilter;
  }

  if (status) {
    filter['company.status'] = status;
  }

  if (industry) {
    filter['company.industry'] = industry;
  }

  const skip = (page - 1) * limit;

  // Check if sorting by jobs or applications (requires aggregation)
  const isAggregateSort = ['jobs_desc', 'jobs_asc', 'applications_desc', 'applications_asc'].includes(sort);

  if (isAggregateSort) {
    // Use aggregation pipeline for sorting by computed fields
    const pipeline = [
      { $match: filter },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'jobs',
          let: { profileId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$recruiterProfileId', '$$profileId'] },
                status: 'ACTIVE',
                moderationStatus: 'APPROVED'
              }
            },
            { $count: 'count' }
          ],
          as: 'jobsData'
        }
      },
      {
        $addFields: {
          activeJobs: { $ifNull: [{ $arrayElemAt: ['$jobsData.count', 0] }, 0] }
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
        $lookup: {
          from: 'applications',
          let: { jobIds: '$allJobs._id' },
          pipeline: [
            { $match: { $expr: { $in: ['$jobId', '$$jobIds'] } } },
            { $count: 'count' }
          ],
          as: 'applicationsData'
        }
      },
      {
        $addFields: {
          totalApplications: { $ifNull: [{ $arrayElemAt: ['$applicationsData.count', 0] }, 0] }
        }
      },
      { $project: { jobsData: 0, allJobs: 0, applicationsData: 0 } }
    ];

    let sortField, sortOrder;
    switch (sort) {
      case 'jobs_desc': sortField = 'activeJobs'; sortOrder = -1; break;
      case 'jobs_asc': sortField = 'activeJobs'; sortOrder = 1; break;
      case 'applications_desc': sortField = 'totalApplications'; sortOrder = -1; break;
      case 'applications_asc': sortField = 'totalApplications'; sortOrder = 1; break;
    }
    pipeline.push({ $sort: { [sortField]: sortOrder, createdAt: -1 } });

    const [countResult] = await RecruiterProfile.aggregate([{ $match: filter }, { $count: 'total' }]);
    const total = countResult?.total || 0;

    pipeline.push({ $skip: skip }, { $limit: parseInt(limit) });
    const results = await RecruiterProfile.aggregate(pipeline);

    const formattedData = results.map(profile => ({
      _id: profile._id,
      activeJobs: profile.activeJobs || 0,
      totalApplications: profile.totalApplications || 0,
      recruiterInfo: {
        fullname: profile.fullname,
        userId: profile.user?._id,
        email: profile.user?.email,
        active: profile.user?.active,
        userCreatedAt: profile.user?.createdAt
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

    return {
      meta: { currentPage: parseInt(page), totalPages: Math.ceil(total / limit), totalItems: total, limit: parseInt(limit) },
      data: formattedData
    };
  }

  // Standard sorting (non-aggregate)
  const sortOptions = {};
  switch (sort) {
    case 'name_asc': sortOptions['company.name'] = 1; break;
    case 'name_desc': sortOptions['company.name'] = -1; break;
    case 'createdAt_asc': sortOptions.createdAt = 1; break;
    case 'updatedAt_asc': sortOptions.updatedAt = 1; break;
    case 'updatedAt_desc': sortOptions.updatedAt = -1; break;
    case 'createdAt_desc':
    default: sortOptions.createdAt = -1; break;
  }

  const [recruiterProfiles, total] = await Promise.all([
    RecruiterProfile.find(filter)
      .populate({
        path: 'userId',
        select: 'email active createdAt',
      })
      .select('fullname company createdAt updatedAt userId')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    RecruiterProfile.countDocuments(filter),
  ]);

  // Get list of recruiter profile IDs
  const recruiterProfileIds = recruiterProfiles.map(p => p._id);

  // Aggregate active jobs count per recruiter
  const activeJobCounts = await Job.aggregate([
    {
      $match: {
        recruiterProfileId: { $in: recruiterProfileIds },
        status: 'ACTIVE',
        moderationStatus: 'APPROVED'
      }
    },
    {
      $group: {
        _id: '$recruiterProfileId',
        count: { $sum: 1 }
      }
    }
  ]);

  const activeJobCountMap = activeJobCounts.reduce((acc, curr) => {
    acc[curr._id.toString()] = curr.count;
    return acc;
  }, {});

  // Aggregate total applications count per recruiter
  const applicationCounts = await Application.aggregate([
    {
      $lookup: {
        from: 'jobs',
        localField: 'jobId',
        foreignField: '_id',
        as: 'job'
      }
    },
    { $unwind: '$job' },
    {
      $match: {
        'job.recruiterProfileId': { $in: recruiterProfileIds }
      }
    },
    {
      $group: {
        _id: '$job.recruiterProfileId',
        count: { $sum: 1 }
      }
    }
  ]);

  const applicationCountMap = applicationCounts.reduce((acc, curr) => {
    acc[curr._id.toString()] = curr.count;
    return acc;
  }, {});

  // Tạo cấu trúc response cố định cho hồ sơ nhà tuyển dụng
  const formattedData = recruiterProfiles.map(profile => ({
    _id: profile._id,
    activeJobs: activeJobCountMap[profile._id.toString()] || 0,
    totalApplications: applicationCountMap[profile._id.toString()] || 0,
    recruiterInfo: {
      fullname: profile.fullname,
      userId: profile.userId?._id,
      email: profile.userId?.email,
      active: profile.userId?.active,
      userCreatedAt: profile.userId?.createdAt
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
    Job.countDocuments({ recruiterProfileId: companyId, status: 'ACTIVE', moderationStatus: 'APPROVED' }),
    Job.countDocuments({ recruiterProfileId: companyId, moderationStatus: 'PENDING' }),
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

  // Publish notification
  if (updatedProfile.userId && updatedProfile.userId._id) {
    const payload = {
      recipientId: updatedProfile.userId._id.toString(),
      type: 'COMPANY_VERIFICATION',
      data: {
        status: 'approved',
        companyName: updatedProfile.company?.name
      }
    };
    await queueService.publishNotification(ROUTING_KEYS.COMPANY_VERIFICATION, payload);
  }

  // --- LOGIC MỚI: Tặng 200 xu cho nhà tuyển dụng ---
  if (updatedProfile.userId && updatedProfile.userId._id) {
    const bonusAmount = 200;

    // 1. Cộng xu cho user
    const user = await User.findByIdAndUpdate(
      updatedProfile.userId._id,
      { $inc: { coinBalance: bonusAmount } },
      { new: true }
    );

    // 2. Tạo lịch sử giao dịch
    if (user) {
      await CreditTransaction.create({
        userId: user._id,
        type: TRANSACTION_TYPES.DEPOSIT,
        category: TRANSACTION_CATEGORIES.COMPANY_VERIFIED_BONUS,
        amount: bonusAmount,
        balanceAfter: user.coinBalance,
        description: 'Tặng 200 xu khi xác thực công ty thành công',
        referenceId: updatedProfile._id,
        referenceModel: 'RecruiterProfile'
      });
    }
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

  // Publish notification
  if (updatedProfile.userId && updatedProfile.userId._id) {
    const payload = {
      recipientId: updatedProfile.userId._id.toString(),
      type: 'COMPANY_VERIFICATION',
      data: {
        status: 'rejected',
        reason: rejectReason,
        companyName: updatedProfile.company?.name
      }
    };
    await queueService.publishNotification(ROUTING_KEYS.COMPANY_VERIFICATION, payload);
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
    // Đếm công ty đã đăng ký (có company.name)
    totalRegisteredCompanies,
    pendingCompanies,
    approvedCompanies,
    rejectedCompanies,
    verifiedCompanies,
    // Đếm NTD chưa đăng ký công ty (bao gồm cả chưa có profile và có profile nhưng chưa có company.name)
    recruiterUserIds,
    recruiterProfileUserIds,
    bannedUsers
  ] = await Promise.all([
    User.countDocuments({ role: { $ne: 'admin' } }),
    User.countDocuments({ role: 'candidate' }),
    User.countDocuments({ role: 'recruiter' }),
    Job.countDocuments(),
    Job.countDocuments({ moderationStatus: 'PENDING' }),
    Job.countDocuments({ moderationStatus: 'APPROVED' }),
    Application.countDocuments(),
    // Đếm công ty đã đăng ký (có company.name)
    RecruiterProfile.countDocuments({
      'company.name': { $exists: true, $ne: null, $ne: '' }
    }),
    // Đếm theo status
    RecruiterProfile.countDocuments({
      'company.name': { $exists: true, $ne: null, $ne: '' },
      'company.status': 'pending'
    }),
    RecruiterProfile.countDocuments({
      'company.name': { $exists: true, $ne: null, $ne: '' },
      'company.status': 'approved'
    }),
    RecruiterProfile.countDocuments({
      'company.name': { $exists: true, $ne: null, $ne: '' },
      'company.status': 'rejected'
    }),
    RecruiterProfile.countDocuments({ 'company.verified': true }),
    // Lấy danh sách userId của tất cả recruiter
    User.find({ role: 'recruiter' }).distinct('_id'),
    // Lấy danh sách userId của recruiter đã có company.name
    RecruiterProfile.find({
      'company.name': { $exists: true, $ne: null, $ne: '' }
    }).distinct('userId'),
    User.countDocuments({ active: false, role: { $ne: 'admin' } })
  ]);

  // Tính số NTD chưa đăng ký công ty = Tổng recruiter - Recruiter đã có công ty
  const recruitersWithoutCompany = totalRecruiters - recruiterProfileUserIds.length;

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
      banned: bannedUsers
    },
    jobs: {
      pending: pendingJobs,
      approved: approvedJobs,
      total: totalJobs
    },
    companies: {
      // Tổng công ty = số RecruiterProfile có company.name (khớp với trang quản lý công ty)
      total: totalRegisteredCompanies,
      pending: pendingCompanies,
      approved: approvedCompanies,
      rejected: rejectedCompanies,
      verified: verifiedCompanies,
      // NTD chưa đăng ký = Tổng NTD - Số đã có công ty
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
      filter.moderationStatus = 'APPROVED';
    } else if (status === 'expired') {
      filter.status = 'EXPIRED';
      filter.moderationStatus = 'APPROVED';
    } else if (status === 'pending') {
      filter.moderationStatus = 'PENDING';
    } else if (status === 'inactive') {
      filter.status = 'INACTIVE';
      filter.moderationStatus = 'APPROVED';
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
      .select('title status approved moderationStatus createdAt expiresAt location salary')
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
  const validStatuses = ['ACTIVE', 'INACTIVE', 'EXPIRED', 'PENDING'];

  if (!validStatuses.includes(status)) {
    throw new BadRequestError('Trạng thái không hợp lệ.');
  }

  const updateData = {};

  // Nếu set về PENDING, chỉ update moderationStatus, không update status
  if (status === 'PENDING') {
    updateData.moderationStatus = 'PENDING';
    updateData.status = 'INACTIVE'; // Set status về INACTIVE khi chờ duyệt
    updateData.aiModerationResult = null; // Xóa kết quả AI cũ
  } else {
    updateData.status = status;
  }

  const updatedJob = await Job.findByIdAndUpdate(
    jobId,
    updateData,
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
      moderationStatus: 'APPROVED'
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

// === RESET AI MODERATION ===

export const resetAIModerationForJob = async (jobId) => {
  const job = await Job.findById(jobId);

  if (!job) {
    throw new NotFoundError('Tin tuyển dụng không tồn tại.');
  }

  // Kiểm tra xem job có aiModerationResult không
  if (!job.aiModerationResult || !job.aiModerationResult.failed) {
    throw new BadRequestError('Job này chưa có lỗi AI moderation hoặc đã được duyệt thành công.');
  }

  // Reset AI moderation result và cho phép thử lại
  job.aiModerationResult = {
    ...job.aiModerationResult,
    failed: false,
    allowRetry: true,
    resetAt: new Date(),
    resetReason: 'Admin cho phép thử lại AI moderation'
  };

  await job.save();

  return job;
};
