import mongoose from 'mongoose';
import {
  Application,
  CandidateProfile,
  Job,
  RecruiterProfile,
  SavedJob,
  User,
  CV,
  InterviewRoom,
  PendingNotification,
} from '../models/index.js';
import * as kafkaService from './kafka.service.js';
import * as queueService from './queue.service.js';
import { ROUTING_KEYS } from '../queues/rabbitmq.js';
import { NotFoundError, UnauthorizedError, BadRequestError, ForbiddenError } from '../utils/AppError.js';
import * as uploadService from './upload.service.js';
import logger from '../utils/logger.js';
import axios from 'axios';
import { logActivity } from './application.service.js';
import { generateEmbeddingWithRetry } from '../utils/embedding.js';
import { recordCreditTransaction } from './creditHistory.service.js';
import { TRANSACTION_TYPES, TRANSACTION_CATEGORIES } from '../constants/index.js';

import { getCoordinatesByLocationName } from '../utils/geoUtils.js';

/**
 * Tìm CandidateProfile từ userId và kiểm tra sự tồn tại
 */
const findCandidateProfileByUserId = async (userId) => {
  const candidateProfile = await CandidateProfile.findOne({ userId });
  if (!candidateProfile) {
    throw new NotFoundError('Không tìm thấy hồ sơ ứng viên.');
  }
  return candidateProfile;
};

/**
 * Tìm RecruiterProfile từ userId và kiểm tra sự tồn tại
 */
const findRecruiterProfileByUserId = async (userId) => {
  const recruiterProfile = await RecruiterProfile.findOne({ userId });
  if (!recruiterProfile) {
    throw new NotFoundError('Không tìm thấy hồ sơ nhà tuyển dụng.');
  }
  return recruiterProfile;
};

/**
 * Tạo một tin tuyển dụng mới
 * @param {string} userId - ID của User (Recruiter)
 * @param {object} jobData - Dữ liệu của tin tuyển dụng
 * @returns {Promise<Document>} Tin tuyển dụng đã được tạo
 */
export const createJob = async (userId, jobData) => {
  const recruiterProfile = await findRecruiterProfileByUserId(userId);

  if (!recruiterProfile.company) {
    throw new BadRequestError('Nhà tuyển dụng phải liên kết với một công ty để đăng tin.');
  }

  // Kiểm tra số dư xu
  const user = await User.findById(userId);
  const JOB_POST_COST = 100; // Chi phí đăng tin tuyển dụng

  if (user.coinBalance < JOB_POST_COST) {
    throw new BadRequestError(`Không đủ xu để đăng tin. Cần ${JOB_POST_COST} xu, bạn hiện có ${user.coinBalance} xu.`);
  }

  // Xử lý trường hợp sử dụng địa chỉ công ty
  let finalJobData = { ...jobData };

  if (jobData.useCompanyAddress) {
    if (!recruiterProfile.company.location || !recruiterProfile.company.address) {
      throw new BadRequestError('Thông tin địa chỉ công ty chưa đầy đủ. Vui lòng cập nhật thông tin công ty trước.');
    }

    // Copy location từ company
    finalJobData.location = { ...recruiterProfile.company.location };
    finalJobData.address = recruiterProfile.company.address;
  }

  // Đảm bảo có coordinates (tự sinh nếu thiếu)
  if (finalJobData.location) {
    const hasValidCoordinates = finalJobData.location.coordinates &&
      Array.isArray(finalJobData.location.coordinates.coordinates) &&
      finalJobData.location.coordinates.coordinates.length === 2 &&
      typeof finalJobData.location.coordinates.coordinates[0] === 'number';

    if (!hasValidCoordinates) {
      finalJobData.location.coordinates = getCoordinatesByLocationName(
        finalJobData.location.province,
        finalJobData.location.district
      );
    }
  }

  const newJob = await Job.create({
    ...finalJobData,
    recruiterProfileId: recruiterProfile._id,
  });

  // Trừ xu và ghi nhận giao dịch
  user.coinBalance -= JOB_POST_COST;
  await user.save();

  // Ghi nhận giao dịch
  await recordCreditTransaction({
    userId: user._id,
    type: TRANSACTION_TYPES.USAGE,
    category: TRANSACTION_CATEGORIES.JOB_POST,
    amount: -JOB_POST_COST,
    description: `Đăng tin tuyển dụng: ${newJob.title}`,
    referenceId: newJob._id,
    referenceModel: 'Job'
  });

  // TODO: Gửi sự kiện JOB_CREATED đến Kafka
  // Không cần await để tránh block response trả về cho client
  //gửi all thông tin cần thiết để tạo sự kiện JOB_CREATED
  // kafkaService.sendJobEvent({
  //   eventType: 'JOB_CREATED',
  //   timestamp: new Date().toISOString(),
  //   payload: {
  //     jobId: newJob._id.toString(),
  //     description: newJob.description,
  //     requirements: newJob.requirements,
  //     benefits: newJob.benefits,
  //     title: newJob.title,
  //     skills: newJob.skills,
  //     category: newJob.category,
  //     area: newJob.area,
  //     minSalary: newJob.minSalary,
  //     maxSalary: newJob.maxSalary,
  //     companyName: recruiterProfile.company.name,
  //     location: {
  //       province: newJob.location.province,
  //       district: newJob.location.district,
  //       commune: newJob.location.commune,
  //     },
  //     address: newJob.address,
  //     type: newJob.type,
  //     workType: newJob.workType,
  //     experience: newJob.experience,
  //     deadline: newJob.deadline,
  //   }
  // });

  return newJob;
};

/**
 * Lấy tất cả các tin tuyển dụng (công khai) với bộ lọc và phân trang
 * @param {object} options - Tùy chọn truy vấn (phân trang, lọc, tìm kiếm)
 * @returns {Promise<object>} Danh sách tin tuyển dụng và thông tin phân trang
 */
export const getAllJobs = async (options) => {
  const { page = 1, limit = 10, sortBy, ...filters } = options;

  const query = { status: 'ACTIVE', moderationStatus: 'APPROVED' };

  // Simple text search on title and skills
  if (filters.q) {
    query.$or = [
      { title: { $regex: filters.q, $options: 'i' } },
      { skills: { $regex: filters.q, $options: 'i' } }
    ];
  }

  // Add other filters here if needed, e.g., location, category, etc.

  const sortOptions = {};
  if (sortBy) {
    const [field, order] = sortBy.split(':');
    sortOptions[field] = order === 'desc' ? -1 : 1;
  } else {
    sortOptions.createdAt = -1;
  }

  const skip = (page - 1) * limit;

  const jobs = await Job.find(query)
    .select('-requirements -description -benefits -address -embeddingsUpdatedAt -chunks')
    .populate({
      path: 'recruiterProfileId',
      select: 'company.name company.logo'
    })
    .sort(sortOptions)
    .skip(skip)
    .limit(limit)
    .lean();

  const totalJobs = await Job.countDocuments(query);

  const formattedJobs = jobs.map(job => {
    if (job.recruiterProfileId && job.recruiterProfileId.company) {
      job.company = job.recruiterProfileId.company;
    }
    delete job.recruiterProfileId;
    return job;
  });

  return {
    data: formattedJobs,
    meta: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalJobs / limit),
      totalItems: totalJobs,
      limit: parseInt(limit),
    },
  };
};


/**
 * Lấy danh sách các tin tuyển dụng của một nhà tuyển dụng
 * @param {string} userId - ID của User (Recruiter)
 * @param {object} options - Tùy chọn truy vấn (phân trang, lọc)
 * @returns {Promise<object>} Danh sách tin tuyển dụng và thông tin phân trang
 */
export const getJobsByRecruiter = async (userId, options) => {
  const { page = 1, limit = 10, status, sortBy, search } = options;

  const recruiterProfile = await findRecruiterProfileByUserId(userId);
  const recruiterProfileId = recruiterProfile._id;

  const query = { recruiterProfileId };
  /* 
   * Updated logic to handle multiple statuses and mixed checks on status vs moderationStatus 
   */
  const conditions = [];

  // 1. Filter by status
  if (status) {
    const statusList = status.split(',');
    const moderationStatuses = [];
    const jobStatuses = [];

    statusList.forEach(s => {
      if (['PENDING', 'REJECTED'].includes(s)) {
        moderationStatuses.push(s);
      } else {
        jobStatuses.push(s);
      }
    });

    const statusConditions = [];

    // Add condition for moderation statuses (PENDING, REJECTED)
    if (moderationStatuses.length > 0) {
      statusConditions.push({ moderationStatus: { $in: moderationStatuses } });
    }

    // Add condition for job statuses (ACTIVE, INACTIVE, EXPIRED) -> must be APPROVED
    if (jobStatuses.length > 0) {
      statusConditions.push({
        status: { $in: jobStatuses },
        moderationStatus: 'APPROVED'
      });
    }

    if (statusConditions.length > 0) {
      conditions.push({ $or: statusConditions });
    }
  }

  /**
   * Escape special characters for MongoDB regex
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  const escapeRegex = (text) => {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  // 2. Filter by search term
  if (search) {
    const escapedSearch = escapeRegex(search);
    conditions.push({
      $or: [
        { title: { $regex: escapedSearch, $options: 'i' } },
        { skills: { $regex: escapedSearch, $options: 'i' } }
      ]
    });
  }

  // Combine conditions into query
  if (conditions.length > 0) {
    query.$and = conditions;
  }

  const sortOptions = {};
  if (sortBy) {
    const [field, order] = sortBy.split(':');
    sortOptions[field] = order === 'desc' ? -1 : 1;
  } else {
    sortOptions.createdAt = -1;
  }

  const skip = (page - 1) * limit;

  const jobs = await Job.find(query)
    .select('-requirements -description -benefits -address -embeddingsUpdatedAt -chunks')
    .sort(sortOptions)
    .skip(skip)
    .limit(limit)
    .lean();

  const totalJobs = await Job.countDocuments(query);

  // Get application counts for these jobs (total and pending)
  const jobIds = jobs.map(job => job._id);
  const applicationCounts = await Application.aggregate([
    { $match: { jobId: { $in: jobIds } } },
    {
      $group: {
        _id: '$jobId',
        totalCount: { $sum: 1 },
        pendingCount: {
          $sum: {
            $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0]
          }
        }
      }
    }
  ]);

  // Create a map for quick lookup
  const countMap = {};
  applicationCounts.forEach(item => {
    countMap[item._id.toString()] = {
      total: item.totalCount,
      pending: item.pendingCount
    };
  });

  const plainJobs = jobs.map(job => ({
    _id: job._id,
    title: job.title,
    location: job.location,
    type: job.type,
    workType: job.workType,
    minSalary: job.minSalary?.toString(),
    maxSalary: job.maxSalary?.toString(),
    deadline: job.deadline,
    experience: job.experience,
    category: job.category,
    skills: job.skills,
    status: job.status,
    approved: job.approved,
    moderationStatus: job.moderationStatus, // Add moderationStatus
    recruiterProfileId: job.recruiterProfileId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    totalApply: countMap[job._id.toString()]?.total || 0, // Total applications
    pendingApply: countMap[job._id.toString()]?.pending || 0, // Pending applications
  }));

  return {
    data: plainJobs,
    meta: {
      currentPage: page,
      totalPages: Math.ceil(totalJobs / limit),
      totalItems: totalJobs,
      limit,
    },
  };
};

/**
 * Lấy thống kê mini dashboard cho trang quản lý tin tuyển dụng
 * @param {string} userId - ID của nhà tuyển dụng
 * @returns {Promise<object>} Thống kê mini dashboard
 */
export const getJobsMiniDashboard = async (userId) => {
  const recruiterProfile = await findRecruiterProfileByUserId(userId);
  const recruiterProfileId = recruiterProfile._id;

  // Get start of today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get date 3 days from now for expiring jobs
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
  threeDaysFromNow.setHours(23, 59, 59, 999);

  // Get all job IDs for this recruiter
  const jobIds = await Job.find({ recruiterProfileId }).distinct('_id');

  // Run all queries in parallel for better performance
  const [todayApplications, expiringJobs, totalPendingApplications] = await Promise.all([
    // Count today's new applications across all jobs
    Application.countDocuments({
      jobId: { $in: jobIds },
      createdAt: { $gte: today }
    }),

    // Get jobs expiring in next 3 days (ACTIVE and APPROVED only)
    Job.find({
      recruiterProfileId,
      status: 'ACTIVE',
      moderationStatus: 'APPROVED',
      deadline: { $gte: new Date(), $lte: threeDaysFromNow }
    })
      .select('_id title deadline')
      .sort({ deadline: 1 })
      .limit(5)
      .lean(),

    // Count total pending applications across all ACTIVE jobs
    Application.countDocuments({
      jobId: { $in: await Job.find({ recruiterProfileId, status: 'ACTIVE' }).distinct('_id') },
      status: 'PENDING'
    })
  ]);

  return {
    todayApplications,
    expiringJobs: expiringJobs.map(job => ({
      _id: job._id,
      title: job.title,
      deadline: job.deadline,
      daysLeft: Math.ceil((new Date(job.deadline) - new Date()) / (1000 * 60 * 60 * 24))
    })),
    totalPendingApplications
  };
};

/**
 * Lấy chi tiết một tin tuyển dụng cho nhà tuyển dụng (bao gồm các thống kê)
 * @param {string} jobId - ID của tin tuyển dụng
 * @param {string} userId - ID của nhà tuyển dụng
 * @returns {Promise<object>} Chi tiết tin tuyển dụng và thống kê
 */
export const getJobDetailsForRecruiter = async (jobId, userId) => {
  // 1. Xác thực nhà tuyển dụng và quyền sở hữu tin tuyển dụng
  const recruiterProfile = await findRecruiterProfileByUserId(userId);
  const job = await Job.findById(jobId).lean();

  if (!job) {
    throw new NotFoundError('Không tìm thấy tin tuyển dụng.');
  }
  if (job.recruiterProfileId.toString() !== recruiterProfile._id.toString()) {
    throw new UnauthorizedError('Bạn không có quyền xem chi tiết tin tuyển dụng này.');
  }

  // 2. Sử dụng Aggregation Pipeline để lấy thống kê từ model Application
  const statsPipeline = [
    { $match: { jobId: new mongoose.Types.ObjectId(jobId) } },
    {
      $group: {
        _id: '$jobId',
        totalApplications: { $sum: 1 },
        totalReapplications: {
          $sum: { $cond: [{ $eq: ['$isReapplied', true] }, 1, 0] }
        },
        // Thống kê theo từng trạng thái
        pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } },
        suitableCount: { $sum: { $cond: [{ $eq: ['$status', 'SUITABLE'] }, 1, 0] } },
        scheduledInterviewCount: { $sum: { $cond: [{ $eq: ['$status', 'SCHEDULED_INTERVIEW'] }, 1, 0] } },
        offerSentCount: { $sum: { $cond: [{ $eq: ['$status', 'OFFER_SENT'] }, 1, 0] } },
        acceptedCount: { $sum: { $cond: [{ $eq: ['$status', 'ACCEPTED'] }, 1, 0] } },
        rejectedCount: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } },
      }
    }
  ];

  const [stats] = await Application.aggregate(statsPipeline);

  // 3. Kết hợp thông tin tin tuyển dụng và thống kê
  const result = {
    ...job,
    minSalary: job.minSalary ? parseFloat(job.minSalary.toString()) : null,
    maxSalary: job.maxSalary ? parseFloat(job.maxSalary.toString()) : null,
    stats: {
      totalApplications: stats?.totalApplications || 0,
      totalReapplications: stats?.totalReapplications || 0,
      byStatus: {
        pending: stats?.pendingCount || 0,
        suitable: stats?.suitableCount || 0,
        scheduledInterview: stats?.scheduledInterviewCount || 0,
        offerSent: stats?.offerSentCount || 0,
        accepted: stats?.acceptedCount || 0,
        rejected: stats?.rejectedCount || 0,
      }
    }
  };

  return result;
};

/**
 * Lấy chi tiết một tin tuyển dụng bằng ID
 * @param {string} jobId - ID của tin tuyển dụng
 * @param {string|null} userId - ID của người dùng (nếu có)
 * @returns {Promise<Document>} Chi tiết tin tuyển dụng
 */
export const getJobById = async (jobId, userId = null) => {
  const jobDoc = await Job.findById(jobId).populate({
    path: 'recruiterProfileId',
    select: 'company.name company.logo company._id company.industry userId'
  });

  if (!jobDoc) {
    throw new NotFoundError('Không tìm thấy tin tuyển dụng.');
  }

  const job = jobDoc.toObject();

  // Kiểm tra xem user có phải là candidate và job có được lưu/apply không
  let isSaved = false;
  let isApplied = false;
  let applicationId = null;
  let applicationStatus = null;
  if (userId) {
    // TODO: Gửi sự kiện xem việc làm KAFKA

    // Kiểm tra xem user có phải là candidate và đã lưu/apply job này không
    try {
      const candidateProfile = await CandidateProfile.findOne({ userId });
      if (candidateProfile) {
        // Kiểm tra saved job
        const savedJob = await SavedJob.findOne({
          candidateId: userId,
          jobId
        });
        isSaved = !!savedJob;

        // Kiểm tra đã apply job chưa - lấy đơn MỚI NHẤT (sort appliedAt DESC)
        const application = await Application.findOne({
          candidateProfileId: candidateProfile._id,
          jobId
        }).sort({ appliedAt: -1 });

        isApplied = !!application;
        if (application) {
          applicationId = application._id;
          applicationStatus = application.status;
        }
      }
    } catch (error) {
      // Nếu có lỗi khi kiểm tra, isSaved và isApplied vẫn là false
      logger.warn('Error checking saved/applied job status', { userId, jobId, error: error.message });
    }
  }


  // tường minh
  return {
    _id: job._id,
    title: job.title,
    description: job.description,
    requirements: job.requirements,
    benefits: job.benefits,
    location: job.location,
    address: job.address,
    type: job.type,
    workType: job.workType,
    minSalary: job.minSalary,
    maxSalary: job.maxSalary,
    deadline: job.deadline,
    experience: job.experience,
    category: job.category,
    skills: job.skills,
    area: job.area,
    status: job.status,
    approved: job.approved,
    recruiterProfileId: {
      _id: job.recruiterProfileId._id,
      userId: job.recruiterProfileId.userId
    },
    company: {
      name: job.recruiterProfileId.company.name,
      logo: job.recruiterProfileId.company.logo,
      industry: job.recruiterProfileId.company.industry,
      _id: job.recruiterProfileId.company._id
    },
    isSaved,
    isApplied,
    applicationId,
    applicationStatus,
  };
};

/**
 * Cập nhật một tin tuyển dụng
 * @param {string} jobId - ID của tin tuyển dụng
 * @param {string} userId - ID của người thực hiện
 * @param {object} updateData - Dữ liệu cập nhật
 * @returns {Promise<Document>} Tin tuyển dụng đã được cập nhật
 */
export const updateJob = async (jobId, userId, updateData) => {
  const recruiterProfile = await findRecruiterProfileByUserId(userId);
  const job = await Job.findById(jobId);

  if (!job) {
    throw new NotFoundError('Không tìm thấy tin tuyển dụng.');
  }

  if (job.recruiterProfileId.toString() !== recruiterProfile._id.toString()) {
    throw new ForbiddenError('Bạn không có quyền cập nhật tin tuyển dụng này.');
  }

  // Xử lý trường hợp sử dụng địa chỉ công ty
  let finalUpdateData = { ...updateData };

  if (updateData.useCompanyAddress) {
    if (!recruiterProfile.company.location || !recruiterProfile.company.address) {
      throw new BadRequestError('Thông tin địa chỉ công ty chưa đầy đủ. Vui lòng cập nhật thông tin công ty trước.');
    }

    // Copy location từ company
    finalUpdateData.location = { ...recruiterProfile.company.location };
    finalUpdateData.address = recruiterProfile.company.address;
  }

  // Đảm bảo có coordinates (tự sinh nếu thiếu) khi update location
  if (finalUpdateData.location) {
    const hasValidCoordinates = finalUpdateData.location.coordinates &&
      Array.isArray(finalUpdateData.location.coordinates.coordinates) &&
      finalUpdateData.location.coordinates.coordinates.length === 2 &&
      typeof finalUpdateData.location.coordinates.coordinates[0] === 'number';

    if (!hasValidCoordinates) {
      finalUpdateData.location.coordinates = getCoordinatesByLocationName(
        finalUpdateData.location.province,
        finalUpdateData.location.district
      );
    }
  }

  // 3. Logic kích hoạt lại quy trình kiểm duyệt (Moderation)
  // Nếu người dùng chỉnh sửa các trường quan trọng -> set lại moderationStatus = PENDING
  const criticalFields = [
    'title', 'description', 'requirements', 'benefits',
    'minSalary', 'maxSalary', 'experience', 'category', 'skills',
    'address', 'type', 'workType'
  ];

  let shouldReModerate = false;

  const isFieldChanged = (original, updated) => {
    if (updated === undefined) return false;
    const normOriginal = original ? original.toString() : '';
    const normUpdated = updated ? updated.toString() : '';

    if (Array.isArray(original) || Array.isArray(updated)) {
      const arr1 = Array.isArray(original) ? [...original].sort() : [];
      const arr2 = Array.isArray(updated) ? [...updated].sort() : [];
      return JSON.stringify(arr1) !== JSON.stringify(arr2);
    }
    return normOriginal !== normUpdated;
  };

  for (const field of criticalFields) {
    if (isFieldChanged(job[field], finalUpdateData[field])) {
      shouldReModerate = true;
      break;
    }
  }

  // Check location specifically if present
  if (!shouldReModerate && finalUpdateData.location) {
    const oldProv = job.location?.province || '';
    const newProv = finalUpdateData.location.province || '';
    const oldDist = job.location?.district || '';
    const newDist = finalUpdateData.location.district || '';

    if (oldProv !== newProv || oldDist !== newDist) {
      shouldReModerate = true;
    }
  }

  if (shouldReModerate) {
    finalUpdateData.moderationStatus = 'PENDING';
    // Xóa kết quả AI cũ khi cần duyệt lại
    finalUpdateData.aiModerationResult = null;
  }

  // Nếu job đã bị REJECTED, khi chỉnh sửa phải reset về PENDING
  if (job.moderationStatus === 'REJECTED') {
    finalUpdateData.moderationStatus = 'PENDING';
    finalUpdateData.status = 'INACTIVE'; // Chờ duyệt lại
    finalUpdateData.aiModerationResult = null; // Xóa kết quả AI cũ
  }

  // Logic cập nhật status dựa trên deadline
  if (finalUpdateData.deadline) {
    const newDeadline = new Date(finalUpdateData.deadline);
    const now = new Date();

    if (newDeadline < now) {
      // Nếu deadline mới là quá khứ -> EXPIRED
      finalUpdateData.status = 'EXPIRED';
    } else {
      // Nếu deadline mới là tương lai
      // Nếu user không gửi status mới VÀ status hiện tại là EXPIRED -> tự động chuyển thành ACTIVE
      if (job.status === 'EXPIRED') {
        finalUpdateData.status = 'ACTIVE';
      }
      // Nếu user có gửi status (VD: INACTIVE) thì giữ nguyên status user gửi
      // Nếu status hiện tại là INACTIVE (đóng thủ công) và user không gửi status -> giữ nguyên INACTIVE
    }
  }

  const updatedJob = await Job.findByIdAndUpdate(jobId, finalUpdateData, {
    new: true,
    runValidators: true
  });
  //  Nơi đây kích hoạt AI
  if (finalUpdateData.moderationStatus === 'PENDING') {
    try {
      const AdminSettings = (await import('../models/AdminSettings.js')).default;
      const setting = await AdminSettings.findOne({ key: 'autoModeration' });

      if (setting?.value?.enabled) {
        const aiJobModerationLLMService = await import('./aiJobModerationLLM.service.js');
        aiJobModerationLLMService.autoModerateJobWithLLM(updatedJob._id)
          .catch(error => logger.error('Auto-moderation failed during job update:', error));
      }
    } catch (error) {
      logger.error('Error triggering auto-moderation during job update:', error);
    }
  }

  return updatedJob;
};

/**
 * Xóa (soft-delete) một tin tuyển dụng
 * @param {string} jobId - ID của tin tuyển dụng
 * @param {string} userId - ID của người thực hiện
 */
export const deleteJob = async (jobId, userId) => {
  const recruiterProfile = await findRecruiterProfileByUserId(userId);
  const job = await Job.findById(jobId);

  if (!job) {
    throw new NotFoundError('Không tìm thấy tin tuyển dụng.');
  }

  if (job.recruiterProfileId.toString() !== recruiterProfile._id.toString()) {
    throw new ForbiddenError('Bạn không có quyền xóa tin tuyển dụng này.');
  }

  // Kiểm tra các tham chiếu: Đơn ứng tuyển, Lưu việc làm, Phòng phỏng vấn, Thông báo chờ xử lý
  const [hasApplications, hasSaves, hasInterviews, hasPendingNotifications] = await Promise.all([
    Application.exists({ jobId }),
    SavedJob.exists({ jobId }),
    InterviewRoom.exists({ jobId }),
    PendingNotification.exists({ jobId })
  ]);

  if (hasApplications || hasSaves || hasInterviews || hasPendingNotifications) {
    // Soft-delete: Chuyển sang trạng thái INACTIVE nếu có tham chiếu
    job.status = 'INACTIVE';
    await job.save();
    logger.info(`Soft-deleted job ${jobId} (set to INACTIVE) due to existing references.`);
  } else {
    // Hard-delete: Xóa hoàn toàn khỏi database nếu không có tham chiếu nào
    await Job.findByIdAndDelete(jobId);
    logger.info(`Hard-deleted job ${jobId} as no references were found.`);
  }
};

/**
 * Ứng viên xem số lượng người đã ứng tuyển vào một tin tuyển dụng (tốn phí)
 * @param {string} jobId - ID của tin tuyển dụng
 * @param {string} userId - ID của ứng viên
 * @returns {Promise<{applicantCount: number}>} Số lượng ứng viên
 */
export const getApplicantCount = async (jobId, userId) => {
  // 1. Kiểm tra ứng viên và tin tuyển dụng có tồn tại không
  const job = await Job.findById(jobId);
  if (!job || job.status !== 'ACTIVE') {
    throw new NotFoundError('Tin tuyển dụng không tồn tại hoặc đã hết hạn.');
  }

  // 2. Kiểm tra và trừ xu của ứng viên
  const candidateUser = await User.findById(userId);
  if (!candidateUser) {
    throw new NotFoundError('Không tìm thấy tài khoản người dùng.');
  }

  const VIEW_APPLICANT_COST = 10;
  if (candidateUser.coinBalance < VIEW_APPLICANT_COST) {
    throw new BadRequestError(`Bạn không đủ xu. Cần ${VIEW_APPLICANT_COST} xu để xem.`);
  }

  // Trừ xu
  candidateUser.coinBalance -= VIEW_APPLICANT_COST;
  await candidateUser.save();

  // Record credit transaction
  try {
    await recordCreditTransaction({
      userId: candidateUser._id,
      type: TRANSACTION_TYPES.USAGE,
      category: TRANSACTION_CATEGORIES.JOB_VIEW,
      amount: -VIEW_APPLICANT_COST,
      description: `Xem số lượng ứng viên cho công việc "${job.title}"`,
      referenceId: job._id,
      referenceModel: 'Job',
      metadata: {
        jobTitle: job.title,
        cost: VIEW_APPLICANT_COST
      }
    });
  } catch (error) {
    // Log error but don't block main operation
    logger.error('Failed to record credit transaction for job view:', {
      userId: candidateUser._id,
      jobId: job._id,
      error: error.message,
      stack: error.stack
    });
  }

  // 3. Đếm số lượng ứng viên đã nộp đơn
  const applicantCount = await Application.countDocuments({ jobId });

  return { applicantCount };
};

/**
 * Ứng viên nộp đơn ứng tuyển vào một tin tuyển dụng
 * @param {string} userId - ID của User (Candidate)
 * @param {string} jobId - ID của Job
 * @param {object} applicationData - Dữ liệu ứng tuyển (cvId hoặc cvTemplateId, coverLetter)
 * @returns {Promise<Document>} Đơn ứng tuyển đã được tạo
 */
export const applyToJob = async (userId, jobId, applicationData) => {
  const { cvId, cvTemplateId, coverLetter, candidateName, candidateEmail, candidatePhone, source } = applicationData;

  // 1. Tìm hồ sơ ứng viên
  const candidateProfile = await CandidateProfile.findOne({ userId });
  if (!candidateProfile) {
    throw new NotFoundError('Không tìm thấy hồ sơ ứng viên.');
  }

  // 2. Tìm tin tuyển dụng
  const job = await Job.findById(jobId).populate('recruiterProfileId', 'company userId');
  if (!job || job.status !== 'ACTIVE') {
    throw new BadRequestError('Tin tuyển dụng không tồn tại hoặc đã hết hạn.');
  }

  // 3. Kiểm tra ứng viên đã ứng tuyển công việc này chưa
  const existingApplication = await Application.findOne({
    jobId,
    candidateProfileId: candidateProfile._id,
  });

  if (existingApplication) {
    throw new BadRequestError('Bạn đã ứng tuyển vào vị trí này rồi.');
  }

  let sourceFileInfo;
  let sourceType;

  // 4. Lấy thông tin CV tùy theo loại được cung cấp
  try {
    if (cvId) {
      // --- Trường hợp 1: Dùng CV đã tải lên ---
      // Kiểm tra xem CV có tồn tại trong hồ sơ ứng viên không
      const selectedCV = candidateProfile.cvs?.find(cv => cv._id.toString() === cvId);
      if (!selectedCV) {
        throw new BadRequestError('CV tải lên không hợp lệ hoặc không tìm thấy.');
      }
      sourceFileInfo = {
        name: selectedCV.name,
        path: selectedCV.path,

      };
      sourceType = 'UPLOADED';
    } else if (cvTemplateId) {
      // --- Trường hợp 2: Dùng CV tạo từ mẫu (Template) ---
      // Tìm CV template của user
      const cvTemplate = await CV.findOne({
        _id: cvTemplateId,
        userId: userId
      });

      if (!cvTemplate) {
        throw new BadRequestError('CV mẫu không hợp lệ hoặc không tìm thấy.');
      }

      // Lưu snapshot dữ liệu CV tại thời điểm nộp đơn
      // Để sau này candidate sửa CV gốc thì đơn ứng tuyển không bị thay đổi theo
      sourceFileInfo = {
        name: cvTemplate.title || 'CV Template',
        cvTemplateId: cvTemplate._id,
        templateId: cvTemplate.templateId, // modern-blue, classic-white, etc.
        templateSnapshot: cvTemplate.cvData, // Toàn bộ JSON data của CV
      };
      sourceType = 'TEMPLATE';
    } else {
      // Trường hợp không cung cấp ID nào (dù đã được validate bởi Zod)
      throw new BadRequestError('Phải cung cấp một CV để ứng tuyển.');
    }

    let submittedCVData;

    if (sourceType === 'UPLOADED') {
      // --- Xử lý CV đã tải lên: Tạo bản sao trên Cloudinary ---
      let copiedFile;
      if (process.env.NODE_ENV === 'test') {
        copiedFile = {
          secure_url: 'http://mocked.com/cv.pdf',
          public_id: 'mocked_public_id',
        };
      } else {
        logger.info(`Tạo bản sao CV cho đơn ứng tuyển: ${job.title}, ứng viên: ${userId}`);
        const uniqueSuffix = `${jobId}-${Date.now()}`;
        const publicId = `application-cv-${userId}-${uniqueSuffix}`;
        copiedFile = await uploadService.copyFileFromUrlToCloudinary(
          sourceFileInfo.path,
          'application-cvs',
          publicId
        );
      }

      submittedCVData = {
        name: sourceFileInfo.name,
        path: copiedFile.secure_url,

        source: sourceType,
      };
    } else {
      // --- Xử lý CV Template: Lưu snapshot data thay vì tạo file ---
      submittedCVData = {
        name: sourceFileInfo.name,
        source: sourceType,
        cvTemplateId: sourceFileInfo.cvTemplateId,
        templateId: sourceFileInfo.templateId,
        templateSnapshot: sourceFileInfo.templateSnapshot,
      };
    }

    // 6. Tạo bản ghi ứng tuyển (Application)
    const application = await Application.create({
      jobId,
      candidateProfileId: candidateProfile._id,
      coverLetter,
      source: source || 'DIRECT_APPLY',
      // Thông tin cá nhân từ form
      candidateName,
      candidateEmail,
      candidatePhone,
      submittedCV: submittedCVData,
      jobSnapshot: {
        title: job.title,
        company: job.recruiterProfileId.company.name,
        logo: job.recruiterProfileId.company.logo,
      },
    });
    logActivity(application, 'APPLICATION_SUBMITTED', 'Ứng viên đã nộp đơn');
    await application.save();
    // TODO: Gửi sự kiện APPLY_JOB KAFKA for recommendation (not implemented)

    // --- BẮT ĐẦU GỬI SỰ KIỆN THÔNG BÁO ---
    try {
      const recruiterUserId = job.recruiterProfileId.userId;

      // 1. Gửi sự kiện để thông báo cho ỨNG VIÊN
      queueService.publishNotification(ROUTING_KEYS.STATUS_UPDATE, {
        type: 'APPLICATION_SUBMITTED', // Type để worker nhận diện
        recipientId: userId.toString(),
        data: {
          applicationId: application._id.toString(),
        }
      });

      // 2. Gửi sự kiện để thông báo (gộp nhóm) cho NHÀ TUYỂN DỤNG
      queueService.publishNotification(ROUTING_KEYS.NEW_APPLICATION, {
        recipientId: recruiterUserId.toString(),
        data: {
          applicationId: application._id.toString()
        }
      });

    } catch (error) {
      logger.error('Failed to queue notifications after application', { error, applicationId: application._id });
      // Quan trọng: Không re-throw lỗi để không làm hỏng response của người dùng
    }
    // --- KẾT THÚC GỬI SỰ KIỆN ---

    return application;

  } catch (error) {
    logger.error(`Lỗi khi nộp đơn: ${error.message}`, {
      userId, jobId, cvId, cvTemplateId, error
    });

    if (error instanceof BadRequestError || error instanceof NotFoundError) {
      throw error;
    }
    throw new BadRequestError('Có lỗi xảy ra khi nộp đơn ứng tuyển.');
  }
};

/**
 * Lưu một tin tuyển dụng vào danh sách công việc đã lưu của ứng viên
 * @param {string} userId - ID của User (Candidate)
 * @param {string} jobId - ID của Job
 * @returns {Promise<Document>} Bản ghi SavedJob đã được tạo
 */
export const saveJob = async (userId, jobId) => {
  // 1. Tìm hồ sơ ứng viên để đảm bảo user là candidate
  await findCandidateProfileByUserId(userId);

  // 2. Kiểm tra tin tuyển dụng có tồn tại và đang hoạt động không
  const job = await Job.findById(jobId);
  if (!job || job.status !== 'ACTIVE') {
    throw new NotFoundError('Không tìm thấy công việc.');
  }

  // 3. Kiểm tra xem đã lưu công việc này chưa
  const existingSavedJob = await SavedJob.findOne({
    candidateId: userId,
    jobId,
  });

  if (existingSavedJob) {
    throw new BadRequestError('Bạn đã lưu công việc này rồi.');
  }

  // 4. Tạo bản ghi lưu công việc
  await SavedJob.create({
    candidateId: userId,
    jobId,
  });

  // TODO: Gửi sự kiện SAVE_JOB KAFKA
};

/**
 * Bỏ lưu một tin tuyển dụng khỏi danh sách công việc đã lưu của ứng viên
 * @param {string} userId - ID của User (Candidate)
 * @param {string} jobId - ID của Job
 */
export const unsaveJob = async (userId, jobId) => {
  // 1. Tìm hồ sơ ứng viên để đảm bảo user là candidate
  await findCandidateProfileByUserId(userId);

  // 2. Tìm và xóa bản ghi lưu công việc
  const savedJob = await SavedJob.findOneAndDelete({
    candidateId: userId,
    jobId,
  });

  if (!savedJob) {
    throw new NotFoundError('Công việc chưa được lưu.');
  }
};

/**
 * Lấy danh sách các tin tuyển dụng đã lưu của một ứng viên
 * @param {string} userId - ID của User (Candidate)
 * @param {object} options - Tùy chọn truy vấn (phân trang, lọc)
 * @returns {Promise<object>} Danh sách tin tuyển dụng đã lưu và thông tin phân trang
 */
export const getSavedJobs = async (userId, options) => {
  const { page = 1, limit = 10, sortBy, search } = options;

  // 1. Tìm hồ sơ ứng viên để đảm bảo user là candidate
  await findCandidateProfileByUserId(userId);

  const sortOptions = {};
  if (sortBy) {
    const [field, order] = sortBy.split(':');
    sortOptions[field] = order === 'desc' ? -1 : 1;
  } else {
    sortOptions.createdAt = -1;
  }

  const skip = (page - 1) * limit;

  // 2. Aggregate để lấy thông tin job và company
  const pipeline = [
    // Match các saved job của user
    { $match: { candidateId: new mongoose.Types.ObjectId(userId) } },

    // Sort theo thời gian tạo
    { $sort: sortOptions },

    // Lookup để lấy thông tin job
    {
      $lookup: {
        from: 'jobs',
        localField: 'jobId',
        foreignField: '_id',
        as: 'job'
      }
    },

    // Unwind job (chuyển từ array thành object)
    { $unwind: '$job' },

    // Filter chỉ lấy job đang active
    { $match: { 'job.status': 'ACTIVE' } },

    // Thêm điều kiện tìm kiếm nếu có
    ...(search ? [{
      $match: {
        'job.title': { $regex: search, $options: 'i' }
      }
    }] : []),

    // Lookup để lấy thông tin recruiter và company từ job
    {
      $lookup: {
        from: 'recruiterprofiles',
        localField: 'job.recruiterProfileId',
        foreignField: '_id',
        as: 'recruiter'
      }
    },

    // Unwind recruiter
    { $unwind: '$recruiter' },

    // Project để format lại dữ liệu - chỉ lấy các trường cần thiết từ job và company
    {
      $project: {
        _id: '$job._id',
        title: '$job.title',
        minSalary: { $toString: '$job.minSalary' },
        maxSalary: { $toString: '$job.maxSalary' },
        deadline: '$job.deadline',
        area: '$job.area',
        company: {
          name: '$recruiter.company.name',
          logo: '$recruiter.company.logo'
        }
      }
    },

    // Facet để đếm tổng số và phân trang
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: parseInt(limit) }
        ],
        totalCount: [
          { $count: 'count' }
        ]
      }
    }
  ];

  const [result] = await SavedJob.aggregate(pipeline);

  const savedJobs = result.data || [];
  const totalSavedJobs = result.totalCount[0]?.count || 0;

  return {
    data: savedJobs,
    meta: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalSavedJobs / limit),
      totalItems: totalSavedJobs,
      limit: parseInt(limit),
    },
  };
};
export const getJobsByCompany = async (companyId, options = {}) => {
  const { page = 1, limit = 10, province, sortBy, search, excludeId, ...filters } = options;

  // Find recruiter profile - Thử tìm theo RecruiterProfile._id trước (cho analytics)
  let recruiterProfile = await RecruiterProfile.findById(companyId).lean();

  // Nếu không thấy, thử tìm theo company._id (subdocument)
  if (!recruiterProfile) {
    recruiterProfile = await RecruiterProfile.findOne({
      'company._id': new mongoose.Types.ObjectId(companyId)
    }).lean();
  }

  if (!recruiterProfile) {
    throw new NotFoundError('Không tìm thấy công ty.');
  }

  // Build query
  const query = {
    status: 'ACTIVE',
    moderationStatus: 'APPROVED', // ✅ Fix: Dùng moderationStatus thay vì approved
    deadline: { $gte: new Date() }, // ✅ Fix: Chỉ lấy jobs chưa hết hạn
    recruiterProfileId: recruiterProfile._id
  };

  // Exclude specific job (useful for "other jobs from this company")
  if (excludeId) {
    query._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
  }

  // Add province filter
  if (province) {
    query['location.province'] = province;
  }

  // Add search filter
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { requirements: { $regex: search, $options: 'i' } }
    ];
  }

  // Sort options
  const sortOptions = {};
  if (sortBy) {
    const [field, order] = sortBy.split(':');
    sortOptions[field] = order === 'desc' ? -1 : 1;
  } else {
    sortOptions.createdAt = -1;
  }

  const skip = (page - 1) * limit;

  const jobs = await Job.find(query)
    .populate({
      path: 'recruiterProfileId',
      select: 'company.name company.logo'
    })
    .sort(sortOptions)
    .skip(skip)
    .limit(limit)
    .lean();

  const totalJobs = await Job.countDocuments(query);

  const formattedJobs = jobs.map(job => {
    if (job.recruiterProfileId && job.recruiterProfileId.company) {
      job.company = job.recruiterProfileId.company;
    }
    delete job.recruiterProfileId;
    return job;
  });

  return {
    data: formattedJobs,
    meta: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalJobs / limit),
      totalItems: totalJobs,
      limit: parseInt(limit),
    },
  };
};








/**
 * Generate query embedding using Google Gemini API
 * @param {string} query - Search query text
 * @returns {Promise<number[]>} Array of embedding values
 */
const generateQueryEmbedding = async (query) => {
  try {
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
    const aiServiceSecret = process.env.AI_INTERNAL_SECRET || 'careerzone_internal_secret_key';
    const response = await axios.post(
      `${aiServiceUrl}/api/v1/embeddings/query-embedding`,
      { query },
      { headers: { 'x-internal-secret': aiServiceSecret } }
    );
    return response.data.embedding;
  } catch (error) {
    logger.error('Failed to generate query embedding from Python AI service:', {
      query: query.substring(0, 100),
      error: error.message
    });
    throw new BadRequestError('Không thể xử lý truy vấn tìm kiếm. Lỗi embeding');
  }
};
/**
 * Build filter object for Atlas Search
 * @param {object} searchParams - Search parameters
 * @returns {object} Filter object for MongoDB Atlas Search
 */
const buildSearchFilter = (searchParams) => {
  const filter = {
    compound: {
      must: [
        { equals: { path: 'status', value: 'ACTIVE' } },
        { equals: { path: 'moderationStatus', value: 'APPROVED' } },
        { range: { path: 'deadline', gte: new Date() } }
      ],
      should: [],
    }
  };

  // Add optional filters
  if (searchParams.category) {
    filter.compound.must.push({ equals: { path: 'category', value: searchParams.category } });
  }

  if (searchParams.type) {
    filter.compound.must.push({ equals: { path: 'type', value: searchParams.type } });
  }

  if (searchParams.workType) {
    filter.compound.must.push({ equals: { path: 'workType', value: searchParams.workType } });
  }

  if (searchParams.experience) {
    filter.compound.must.push({ equals: { path: 'experience', value: searchParams.experience } });
  }

  if (searchParams.province) {
    filter.compound.must.push({ equals: { path: 'location.province', value: searchParams.province } });
  }
  if (searchParams.district) {
    filter.compound.must.push({ equals: { path: 'location.district', value: searchParams.district } });
  }

  // Salary range filters are handled as a post-filter $match stage 
  // because $search does not support range queries on unindexed numeric fields
  // Bounding box filter for Map
  // Bounding box filter for Map (Handles Anti-meridian wrap-around)
  if (searchParams.sw_lng && searchParams.sw_lat && searchParams.ne_lng && searchParams.ne_lat) {
    const sw_lng = parseFloat(searchParams.sw_lng);
    const sw_lat = parseFloat(searchParams.sw_lat);
    const ne_lng = parseFloat(searchParams.ne_lng);
    const ne_lat = parseFloat(searchParams.ne_lat);

    if (sw_lng <= ne_lng) {
      // Normal bounding box
      filter.compound.must.push({
        geoWithin: {
          box: {
            bottomLeft: { type: 'Point', coordinates: [sw_lng, sw_lat] },
            topRight: { type: 'Point', coordinates: [ne_lng, ne_lat] }
          },
          path: 'location.coordinates'
        }
      });
    } else {
      // Box wraps around the 180/-180 meridian
      filter.compound.must.push({
        compound: {
          should: [
            {
              geoWithin: {
                box: {
                  bottomLeft: { type: 'Point', coordinates: [sw_lng, sw_lat] },
                  topRight: { type: 'Point', coordinates: [180, ne_lat] }
                },
                path: 'location.coordinates'
              }
            },
            {
              geoWithin: {
                box: {
                  bottomLeft: { type: 'Point', coordinates: [-180, sw_lat] },
                  topRight: { type: 'Point', coordinates: [ne_lng, ne_lat] }
                },
                path: 'location.coordinates'
              }
            }
          ],
          minimumShouldMatch: 1
        }
      });
    }
  }

  // Distance/Radius filter for Atlas Search
  if (searchParams.latitude && searchParams.longitude && searchParams.distance) {
    filter.compound.must.push({
      geoWithin: {
        circle: {
          center: {
            type: 'Point',
            coordinates: [parseFloat(searchParams.longitude), parseFloat(searchParams.latitude)]
          },
          radius: parseFloat(searchParams.distance) * 1000 // Convert km to meters
        },
        path: 'location.coordinates'
      }
    });
  }

  const { userLocation } = searchParams || {};
  if (userLocation) {
    filter.compound.should.push({
      near: {
        path: 'location.coordinates',
        origin: { type: 'Point', coordinates: [userLocation.lng, userLocation.lat] },
        pivot: 20000
      }
    });
  }
  return filter;
};

const buildPreFilter = (searchParams) => {
  const preFilter = {
    status: 'ACTIVE',
    moderationStatus: 'APPROVED',
    deadline: { $gte: new Date() }
  };
  if (searchParams.category) {
    preFilter.category = searchParams.category;
  }
  if (searchParams.type) {
    preFilter.type = searchParams.type;
  }

  if (searchParams.workType) {
    preFilter.workType = searchParams.workType;
  }

  if (searchParams.experience) {
    preFilter.experience = searchParams.experience;
  }

  if (searchParams.province) {
    preFilter['location.province'] = searchParams.province;
  }

  if (searchParams.district) {
    preFilter['location.district'] = searchParams.district;
  }

  // Geospatial filtering logic
  const geoFilters = [];

  // Bounding box filter for Map (Handles Anti-meridian wrap-around)
  if (searchParams.sw_lng && searchParams.sw_lat && searchParams.ne_lng && searchParams.ne_lat) {
    const sw_lng = parseFloat(searchParams.sw_lng);
    const sw_lat = parseFloat(searchParams.sw_lat);
    const ne_lng = parseFloat(searchParams.ne_lng);
    const ne_lat = parseFloat(searchParams.ne_lat);

    if (sw_lng <= ne_lng) {
      geoFilters.push({
        'location.coordinates': {
          $geoWithin: {
            $box: [[sw_lng, sw_lat], [ne_lng, ne_lat]]
          }
        }
      });
    } else {
      // Box wraps around the 180/-180 meridian
      geoFilters.push({
        $or: [
          {
            'location.coordinates': {
              $geoWithin: { $box: [[sw_lng, sw_lat], [180, ne_lat]] }
            }
          },
          {
            'location.coordinates': {
              $geoWithin: { $box: [[-180, sw_lat], [ne_lng, ne_lat]] }
            }
          }
        ]
      });
    }
  }

  // Distance/Radius filter
  if (searchParams.latitude && searchParams.longitude && searchParams.distance) {
    console.log(`[buildPreFilter] Adding distance filter: radius ${searchParams.distance}km around [${searchParams.longitude}, ${searchParams.latitude}]`);
    geoFilters.push({
      'location.coordinates': {
        $geoWithin: {
          $centerSphere: [
            [parseFloat(searchParams.longitude), parseFloat(searchParams.latitude)],
            parseFloat(searchParams.distance) / 6378.1
          ]
        }
      }
    });
  }

  if (geoFilters.length === 1) {
    const key = Object.keys(geoFilters[0])[0];
    preFilter[key] = geoFilters[0][key];
  } else if (geoFilters.length > 1) {
    preFilter.$and = preFilter.$and || [];
    preFilter.$and.push(...geoFilters);
  }

  console.log(`[buildPreFilter] Final filter keys:`, Object.keys(preFilter));
  if (preFilter.$and) console.log(`[buildPreFilter] $and length:`, preFilter.$and.length);

  // Salary range filters — tách riêng vì $vectorSearch không hỗ trợ range trên numeric field
  const postFilter = {};
  if (searchParams.minSalary) {
    postFilter.minSalary = { $gte: searchParams.minSalary };
  }
  if (searchParams.maxSalary) {
    postFilter.maxSalary = { $lte: searchParams.maxSalary };
  }

  logger.info(`[buildPreFilter] Final filter keys:`, preFilter);
  logger.info(`[buildPreFilter] Salary postFilter:`, postFilter);
  return { preFilter, postFilter };
};

/**
 * Hybrid search jobs using RRF (Reciprocal Rank Fusion)
 * @param {object} searchParams - Search parameters
 * @returns {Promise<object>} Search results with pagination
 */
export const hybridSearchJobs = async (searchParams, userId = null) => {
  const {
    query,
    page = 1,
    size = 10,
    textWeight = 0.4,
    vectorWeight = 0.6,
  } = searchParams;

  // Nếu không có query, thực hiện tìm kiếm thông thường với filter
  if (!query || query.trim() === '') {
    console.log('No query provided, performing regular search with filters.');
    try {
      const { preFilter, postFilter: salaryFilter } = buildPreFilter(searchParams);
      // Merge salary filter vào preFilter vì Job.find() hỗ trợ range queries
      Object.assign(preFilter, salaryFilter);

      // Add distance filter if coordinates and distance are provided
      if (searchParams.latitude && searchParams.longitude && searchParams.distance) {
        preFilter['location.coordinates'] = {
          $geoWithin: {
            $centerSphere: [
              [searchParams.longitude, searchParams.latitude],
              searchParams.distance / 6378.1 // Convert km to radians (Earth radius = 6378.1 km)
            ]
          }
        };
      }
      console.log('Pre-filter applied:', preFilter);

      const skip = (page - 1) * size;

      let [results, totalCount] = await Promise.all([
        Job.find(preFilter)
          .select('-requirements -description -benefits -address -embeddingsUpdatedAt -chunks')
          .populate({
            path: 'recruiterProfileId',
            select: 'company.name company.logo'
          })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(size)
          .lean(),
        Job.countDocuments(preFilter)
        // sau đó đưa company.name, logo trải phẳng trong results

      ]);

      // Add isSaved status if userId is provided
      if (userId) {
        const jobIds = results.map(job => job._id);
        const savedJobs = await SavedJob.find({
          candidateId: userId,
          jobId: { $in: jobIds }
        }).select('jobId').lean();

        const savedJobIds = new Set(savedJobs.map(saved => saved.jobId.toString()));

        results = results.map(job => {
          job.isSaved = savedJobIds.has(job._id.toString());
          return job;
        });
      }
      results = results.map(job => {
        const company = job.recruiterProfileId?.company || {};
        return {
          ...job,
          company: {
            name: company.name || null,
            logo: company.logo || null
          },
          recruiterProfileId: job.recruiterProfileId?._id || null // giữ lại id nếu cần
        };
      });
      return {
        data: results,
        meta: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / size),
          totalItems: totalCount,
          limit: size,
          searchQuery: '',
          appliedFilters: {
            category: searchParams.category,
            type: searchParams.type,
            workType: searchParams.workType,
            experience: searchParams.experience,
            province: searchParams.province,
            district: searchParams.district,
            minSalary: searchParams.minSalary,
            maxSalary: searchParams.maxSalary,
            latitude: searchParams.latitude,
            longitude: searchParams.longitude,
            distance: searchParams.distance
          }
        }
      };
    } catch (error) {
      logger.error('Regular job search failed:', { error: error.message, searchParams });
      throw new BadRequestError('Lỗi khi tìm kiếm công việc.');
    }
  }
  // Calculate branch limit for pagination
  const branchLimit = Math.max(page * size + 100, 500); // Ensure sufficient candidates
  const numCandidates = Math.max(1000, branchLimit * 20); // For vector search recall

  // Build common filter
  const searchFilter = buildSearchFilter(searchParams);


  // vectorSearch filter doesn't support $geoWithin, so we build one without geo params
  const vectorSearchParams = { ...searchParams };
  delete vectorSearchParams.latitude;
  delete vectorSearchParams.longitude;
  delete vectorSearchParams.distance;
  delete vectorSearchParams.sw_lng;
  delete vectorSearchParams.sw_lat;
  delete vectorSearchParams.ne_lng;
  delete vectorSearchParams.ne_lat;
  const { preFilter: vectorFilter, postFilter: salaryPostFilter } = buildPreFilter(vectorSearchParams);


  // Generate query embedding for vector search
  const queryVector = await generateQueryEmbedding(query);

  try {
    // Execute hybrid search using RRF with $facet for pagination
    const results = await Job.aggregate([
      // --- Text search branch (BM25) ---
      {
        $search: {
          index: "kw", // Your Atlas Search index name
          compound: {
            must: [
              {
                text: {
                  query: query,
                  path: "title",
                  fuzzy: {
                    maxEdits: 1,
                    prefixLength: 2
                  },
                  score: { boost: { value: 2 } } // ưu tiên mạnh cho title
                }
              }
            ],
            should: [
              {
                text: {
                  query: query,
                  path: ["description", "requirements"],
                  fuzzy: { maxEdits: 1, prefixLength: 2 },
                }
              }
            ],
            filter: searchFilter.compound.must
          }
        }
      },
      { $set: { src: "text", bm25Score: { $meta: "searchScore" } } },
      { $limit: branchLimit },
      {
        $setWindowFields: {
          sortBy: { bm25Score: -1 },
          output: { textRank: { $documentNumber: {} } }
        }
      },
      {
        $addFields: {
          rrf: { $divide: [textWeight, { $add: [60, "$textRank"] }] }
        }
      },
      {
        $project: {
          _id: 1,
          title: 1,
          location: 1,
          type: 1,
          workType: 1,
          minSalary: 1,
          maxSalary: 1,
          deadline: 1,
          experience: 1,
          category: 1,
          skills: 1,
          recruiterProfileId: 1,
          createdAt: 1,
          rrf: 1,
          bm25Score: 1
        }
      },

      // --- Union with vector search branch ---
      {
        $unionWith: {
          coll: "jobs",
          pipeline: [
            {
              $vectorSearch: {
                index: "vt", // Your vector search index name
                path: "chunks.embedding",
                queryVector: queryVector,
                numCandidates: numCandidates,
                limit: branchLimit,
                filter: vectorFilter
              }
            },
            { $set: { vectorScore: { $meta: "vectorSearchScore" } } },
            {
              $setWindowFields: {
                sortBy: { vectorScore: -1 },
                output: { vectorRank: { $documentNumber: {} } }
              }
            },
            {
              $addFields: {
                rrf: { $divide: [vectorWeight, { $add: [60, "$vectorRank"] }] }
              }
            },
            {
              $project: {
                _id: 1,
                title: 1,
                location: 1,
                type: 1,
                workType: 1,
                minSalary: 1,
                maxSalary: 1,
                deadline: 1,
                experience: 1,
                category: 1,
                skills: 1,
                recruiterProfileId: 1,
                createdAt: 1,
                rrf: 1,
                vectorScore: 1
              }
            }
          ]
        }
      },
      // --- Merge and rank fusion ---
      // Apply distance filter if provided (strict radius filtering)
      ...(searchParams.latitude && searchParams.longitude && searchParams.distance ? [{
        $match: {
          'location.coordinates': {
            $geoWithin: {
              $centerSphere: [
                [searchParams.longitude, searchParams.latitude],
                searchParams.distance / 6378.1 // Convert km to radians (Earth radius = 6378.1 km)
              ]
            }
          }
        }
      }] : []),
      // Post-filter salary (tách khỏi $vectorSearch vì không hỗ trợ range trên numeric field)
      ...(Object.keys(salaryPostFilter).length > 0 ? [{ $match: salaryPostFilter }] : []),
      {
        $group: {
          _id: "$_id",
          doc: { $first: "$$ROOT" },
          totalRrf: { $sum: "$rrf" },
          maxBm25: { $max: "$bm25Score" },
          maxVector: { $max: "$vectorScore" }
        }
      },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              "$doc",
              {
                rrf: "$totalRrf",
                bm25Score: "$maxBm25",
                vectorScore: "$maxVector"
              }
            ]
          }
        }
      },

      // Stable sorting: rrf ↓, then vectorScore ↓, then bm25Score ↓, finally _id ↑
      {
        $sort: {
          rrf: -1,
          vectorScore: -1,
          bm25Score: -1,
          _id: 1
        }
      },

      // --- Pagination with $facet ---
      {
        $lookup: {
          from: 'recruiterprofiles',
          localField: 'recruiterProfileId',
          foreignField: '_id',
          as: 'recruiter'
        }
      },
      {
        $unwind: {
          path: '$recruiter',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $addFields: {
          'company.name': '$recruiter.company.name',
          'company.logo': '$recruiter.company.logo',
        }
      },
      {
        $project: {
          description: 0,
          requirements: 0,
          benefits: 0,
          address: 0,
          embeddingsUpdatedAt: 0,
          chunks: 0,
          recruiter: 0,
        }
      },
      {
        $facet: {
          page: [
            { $skip: (page - 1) * size },
            { $limit: size }
          ],
          total: [
            { $count: "value" }
          ]
        }
      }
    ]);

    const pageResults = results[0]?.page || [];
    const totalCount = results[0]?.total[0]?.value || 0;

    let finalResults = pageResults;
    // Add isSaved status if userId is provided
    if (userId) {
      const jobIds = finalResults.map(job => job._id);
      const savedJobs = await SavedJob.find({
        candidateId: userId,
        jobId: { $in: jobIds }
      }).select('jobId').lean();

      const savedJobIds = new Set(savedJobs.map(saved => saved.jobId.toString()));

      finalResults = finalResults.map(job => {
        job.isSaved = savedJobIds.has(job._id.toString());
        return job;
      });
    }

    return {
      data: finalResults,
      meta: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / size),
        totalItems: totalCount,
        limit: size,
        searchQuery: query,
        appliedFilters: {
          category: searchParams.category,
          type: searchParams.type,
          workType: searchParams.workType,
          experience: searchParams.experience,
          province: searchParams.province,
          district: searchParams.district,
          minSalary: searchParams.minSalary,
          maxSalary: searchParams.maxSalary,
          latitude: searchParams.latitude,
          longitude: searchParams.longitude,
          distance: searchParams.distance
        }
      }
    };

  } catch (error) {
    logger.error('Hybrid search error:', {
      message: error.message,
      stack: error.stack,
      query,
      searchParams
    });
    console.error('Hybrid search failed:', error.message);
    throw new BadRequestError('Lỗi khi thực hiện tìm kiếm hybrid');
  }
};


// Tìm kiếm thường
export const searchJobsForCandidate = async (searchParams, userId = null) => {
  const {
    query,
    page = 1,
    size = 10,
  } = searchParams;

  // 1. TRƯỜNG HỢP KHÔNG CÓ QUERY: Tìm kiếm thường bằng Filter (Giữ nguyên logic cũ)
  if (!query || query.trim() === '') {
    console.log('No query provided, performing regular search with filters.');
    try {
      const { preFilter, postFilter: salaryFilter } = buildPreFilter(searchParams);
      // Merge salary filter vào preFilter vì Job.find() hỗ trợ range queries
      Object.assign(preFilter, salaryFilter);
      console.log('preFilter', JSON.stringify(preFilter));
      const skip = (page - 1) * size;

      let [results, totalCount] = await Promise.all([
        Job.find(preFilter)
          .select('-requirements -description -benefits -address -embeddingsUpdatedAt -chunks')
          .populate({
            path: 'recruiterProfileId',
            select: 'company.name company.logo'
          })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(size)
          .lean(),
        Job.countDocuments(preFilter)
      ]);

      // Xử lý isSaved và isApplied va format lại company
      if (userId) {
        const jobIds = results.map(job => job._id);

        // Check saved jobs
        const savedJobs = await SavedJob.find({
          candidateId: userId,
          jobId: { $in: jobIds }
        }).select('jobId').lean();
        const savedJobIds = new Set(savedJobs.map(saved => saved.jobId.toString()));

        // Check applied jobs
        let appliedJobIds = new Set();
        const candidateProfile = await CandidateProfile.findOne({ userId }).select('_id');
        if (candidateProfile) {
          const applications = await Application.find({
            candidateProfileId: candidateProfile._id,
            jobId: { $in: jobIds }
          }).select('jobId').lean();
          appliedJobIds = new Set(applications.map(app => app.jobId.toString()));
        }

        results = results.map(job => ({
          ...job,
          isSaved: savedJobIds.has(job._id.toString()),
          isApplied: appliedJobIds.has(job._id.toString())
        }));
      }

      results = results.map(job => {
        const company = job.recruiterProfileId?.company || {};
        return {
          ...job,
          company: { name: company.name || null, logo: company.logo || null },
          recruiterProfileId: job.recruiterProfileId?._id || null
        };
      });

      return {
        data: results,
        meta: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / size),
          totalItems: totalCount,
          limit: size,
          searchQuery: '',
          appliedFilters: searchParams // Simplified for brevity
        }
      };
    } catch (error) {
      console.error('Regular job search failed:', { error: error.message });
      throw new BadRequestError('Lỗi khi tìm kiếm công việc.');
    }
  }

  // 2. TRƯỜNG HỢP CÓ QUERY: Full-text Search với Atlas Search ($search)

  // Build common filter cho Atlas Search
  const searchFilter = buildSearchFilter(searchParams);

  // Build salary filter for post-filtering after $search
  const { postFilter: salaryFilter } = buildPreFilter(searchParams);

  try {
    const pipeline = [
      // --- Stage 1: Full-text Search (BM25) ---
      {
        $search: {
          index: "kw", // Đảm bảo index này đã được tạo trên Atlas
          compound: {
            must: [
              {
                text: {
                  query: query,
                  path: "title",
                  fuzzy: {
                    maxEdits: 1,
                    prefixLength: 2
                  },
                  score: { boost: { value: 3 } }
                }
              },
              ...searchFilter.compound.must // Spread all filters (including geoWithin) here
            ],
            should: [
              {
                text: {
                  query: query,
                  path: ["description", "requirements"],
                  fuzzy: { maxEdits: 1, prefixLength: 2 },
                }
              }
            ]
          }
        }
      },

      // --- Stage 2: Post-filter Salary ---
      // Distace filtering is now part of searchFilter.compound.must
      // Salary must be filtered after $search because it's not indexed in Atlas Search
      ...(Object.keys(salaryFilter).length > 0 ? [{ $match: salaryFilter }] : []),
      // Distace filtering is now part of searchFilter.compound.must

      // --- Stage 3: Project Score & Fields ---
      {
        $addFields: {
          score: { $meta: "searchScore" } // Lấy điểm BM25
        }
      },

      // --- Stage 4: Sorting ---
      // Sắp xếp theo điểm số cao nhất, nếu bằng nhau thì xem ngày tạo mới nhất
      {
        $sort: {
          score: -1,
          createdAt: -1
        }
      },

      // --- Stage 5: Lookup Company Info ---
      {
        $lookup: {
          from: 'recruiterprofiles',
          localField: 'recruiterProfileId',
          foreignField: '_id',
          as: 'recruiter'
        }
      },
      {
        $unwind: {
          path: '$recruiter',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $addFields: {
          'company.name': '$recruiter.company.name',
          'company.logo': '$recruiter.company.logo',
        }
      },

      // --- Stage 6: Clean up fields ---
      {
        $project: {
          description: 0, requirements: 0, benefits: 0, address: 0,
          embeddingsUpdatedAt: 0, chunks: 0, recruiter: 0,
        }
      },

      // --- Stage 7: Pagination with Facet ---
      {
        $facet: {
          page: [
            { $skip: (page - 1) * size },
            { $limit: size }
          ],
          total: [
            { $count: "value" }
          ]
        }
      }
    ];

    const results = await Job.aggregate(pipeline);

    const pageResults = results[0]?.page || [];
    const totalCount = results[0]?.total[0]?.value || 0;

    let finalResults = pageResults;

    // Add isSaved and isApplied status logic
    if (userId) {
      const jobIds = finalResults.map(job => job._id);

      // Check saved jobs
      const savedJobs = await SavedJob.find({
        candidateId: userId,
        jobId: { $in: jobIds }
      }).select('jobId').lean();
      const savedJobIds = new Set(savedJobs.map(saved => saved.jobId.toString()));

      // Check applied jobs
      let appliedJobIds = new Set();
      const candidateProfile = await CandidateProfile.findOne({ userId }).select('_id');
      if (candidateProfile) {
        const applications = await Application.find({
          candidateProfileId: candidateProfile._id,
          jobId: { $in: jobIds }
        }).select('jobId').lean();
        appliedJobIds = new Set(applications.map(app => app.jobId.toString()));
      }

      finalResults = finalResults.map(job => ({
        ...job,
        isSaved: savedJobIds.has(job._id.toString()),
        isApplied: appliedJobIds.has(job._id.toString())
      }));
    }

    return {
      data: finalResults,
      meta: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / size),
        totalItems: totalCount,
        limit: size,
        searchQuery: query,
        appliedFilters: {
          // Map lại filters để trả về frontend
          ...searchParams
        }
      }
    };

  } catch (error) {
    console.error('Full-text search error:', {
      message: error.message,
      query,
    });
    throw new BadRequestError('Lỗi khi thực hiện tìm kiếm.');
  }
};


/**
 * Autocomplete job titles with prioritized sorting
 * @param {string} query - Search query for autocomplete
 * @param {number} limit - Maximum number of suggestions (default: 10)
 * @returns {Promise<Array>} Array of autocomplete suggestions
 */
export const autocompleteJobTitles = async (query, limit = 10) => {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const trimmedQuery = query.trim().toLowerCase();

  try {
    // MongoDB Atlas Search autocomplete aggregation
    const results = await Job.aggregate([
      {
        $search: {
          index: "autocl", // Your autocomplete index name
          compound: {
            must: [
              {
                autocomplete: {
                  query: query,
                  path: "title",
                  fuzzy: {
                    maxEdits: 1 // Allow 1 character difference
                  }
                }
              }
            ]
          }
        }
      },
      {
        $project: {
          title: 1,
          score: { $meta: "searchScore" },
          // Add field to check if title starts with query (prefix match)
          isPrefixMatch: {
            $regexMatch: {
              input: { $toLower: "$title" },
              regex: `^${trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
              options: "i"
            }
          }
        }
      },
      {
        // Group by title to remove duplicates and keep highest score
        $group: {
          _id: "$title",
          score: { $max: "$score" },
          isPrefixMatch: { $max: "$isPrefixMatch" }
        }
      },
      {
        $project: {
          _id: 0,
          title: "$_id",
          score: 1,
          isPrefixMatch: 1
        }
      },
      {
        // Sort: prefix matches first, then by score descending
        $sort: {
          isPrefixMatch: -1, // Prefix matches first (true = 1, false = 0)
          score: -1          // Then by score descending
        }
      },
      {
        $limit: limit
      }
    ]);

    // Return only the titles
    return results.map(result => ({
      title: result.title,
      score: result.score,
      isPrefixMatch: result.isPrefixMatch
    }));

  } catch (error) {
    logger.error('Error in autocomplete search:', {
      query,
      error: error.message,
      stack: error.stack
    });
    console.error('Autocomplete failed:', error.message);

    // Fallback to simple regex search if Atlas Search fails
    return await fallbackAutocomplete(query, limit);
  }
};

/**
 * Fallback autocomplete using simple MongoDB regex search
 * @param {string} query - Search query
 * @param {number} limit - Maximum number of suggestions
 * @returns {Promise<Array>} Array of autocomplete suggestions
 */
const fallbackAutocomplete = async (query, limit = 10) => {
  const trimmedQuery = query.trim();
  const escapedQuery = trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  try {
    const results = await Job.aggregate([
      {
        $match: {
          status: 'ACTIVE',
          moderationStatus: 'APPROVED',
          title: {
            $regex: escapedQuery,
            $options: 'i'
          }
        }
      },
      {
        $project: {
          title: 1,
          // Check if title starts with query (prefix match)
          isPrefixMatch: {
            $regexMatch: {
              input: { $toLower: "$title" },
              regex: `^${escapedQuery.toLowerCase()}`,
              options: "i"
            }
          }
        }
      },
      {
        // Group by title to remove duplicates
        $group: {
          _id: "$title",
          isPrefixMatch: { $max: "$isPrefixMatch" }
        }
      },
      {
        $project: {
          _id: 0,
          title: "$_id",
          score: 1, // Default score for fallback
          isPrefixMatch: 1
        }
      },
      {
        // Sort: prefix matches first, then alphabetically
        $sort: {
          isPrefixMatch: -1,
          title: 1
        }
      },
      {
        $limit: limit
      }
    ]);

    return results.map(result => ({
      title: result.title,
      score: result.score || 1,
      isPrefixMatch: result.isPrefixMatch
    }));

  } catch (error) {
    logger.error('Error in fallback autocomplete:', {
      query,
      error: error.message
    });
    return [];
  }
};

/**
 * Find jobs within a bounding box (map viewport)
 * @param {object} bounds - Bounding box coordinates {sw_lng, sw_lat, ne_lng, ne_lat}
 * @param {object} options - Additional options like limit
 * @returns {Promise<Array>} Array of jobs within the bounds
 */
export const findJobsInBounds = async (bounds) => {
  const { limit = 500, query } = bounds;

  let jobs;
  if (query && query.trim() !== '') {
    // If query exists, use Atlas Search for consistency with list view
    const searchFilter = buildSearchFilter(bounds);
    const pipeline = [
      {
        $search: {
          index: "kw",
          compound: {
            must: [
              {
                text: {
                  query: query,
                  path: "title",
                  fuzzy: { maxEdits: 1, prefixLength: 2 },
                  score: { boost: { value: 3 } }
                }
              }
            ],
            should: [
              {
                text: {
                  query: query,
                  path: ["description", "requirements"],
                  fuzzy: { maxEdits: 1, prefixLength: 2 },
                }
              }
            ],
            filter: searchFilter.compound.must
          }
        }
      },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'recruiterprofiles',
          localField: 'recruiterProfileId',
          foreignField: '_id',
          as: 'recruiter'
        }
      },
      { $unwind: { path: '$recruiter', preserveNullAndEmptyArrays: true } }
    ];

    const results = await Job.aggregate(pipeline);
    jobs = results.map(job => ({
      ...job,
      recruiterProfileId: job.recruiterProfileId // Preserve original if needed by select below
    }));
  } else {
    // Regular match filter
    const { preFilter, postFilter: salaryFilter } = buildPreFilter(bounds);
    Object.assign(preFilter, salaryFilter);
    jobs = await Job.find(preFilter)
      .limit(parseInt(limit))
      .populate({
        path: 'recruiterProfileId',
        select: 'company.name company.logo'
      })
      .lean();
  }

  // Format response (reuse formatting logic)
  return jobs.map(job => ({
    _id: job._id,
    title: job.title,
    coordinates: job.location?.coordinates?.coordinates || job.coordinates,
    address: job.address,
    minSalary: job.minSalary?.toString(),
    maxSalary: job.maxSalary?.toString(),
    type: job.type,
    workType: job.workType,
    company: {
      name: job.recruiterProfileId?.company?.name || job.recruiter?.company?.name,
      logo: job.recruiterProfileId?.company?.logo || job.recruiter?.company?.logo
    }
  }));
};

/**
 * Get job clusters for map view using geohash-based clustering
 * @param {object} bounds - Bounding box coordinates {sw_lng, sw_lat, ne_lng, ne_lat}
 * @param {number} zoom - Map zoom level (1-20)
 * @returns {Promise<Array>} Array of clusters and individual jobs
 */
export const getClustersFromDb = async (bounds, zoom) => {
  const { sw_lng, sw_lat, ne_lng, ne_lat } = bounds;

  // Determine grid precision based on zoom level
  const getPrecision = (zoomLevel) => {
    if (zoomLevel >= 15) return 8;
    if (zoomLevel >= 12) return 7;
    if (zoomLevel >= 10) return 6;
    if (zoomLevel >= 7) return 5;
    return 4;
  };

  const precision = getPrecision(parseInt(zoom));

  const pipeline = [
    // Stage 1: Filter jobs within viewport
    {
      $match: {
        status: 'ACTIVE',
        moderationStatus: 'APPROVED',
        'location.coordinates': {
          $geoWithin: {
            $box: [
              [parseFloat(sw_lng), parseFloat(sw_lat)],
              [parseFloat(ne_lng), parseFloat(ne_lat)]
            ]
          }
        }
      }
    },
    // Stage 2: Generate geohash for clustering
    {
      $project: {
        _id: 1,
        location: 1,
        title: 1,
        geohash: {
          $substrBytes: [
            {
              $function: {
                body: function (coords) {
                  // Simple geohash implementation
                  const [lng, lat] = coords;
                  const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
                  let idx = 0;
                  let bit = 0;
                  let evenBit = true;
                  let geohash = '';

                  let latMin = -90, latMax = 90;
                  let lngMin = -180, lngMax = 180;

                  while (geohash.length < 12) {
                    if (evenBit) {
                      const lngMid = (lngMin + lngMax) / 2;
                      if (lng > lngMid) {
                        idx |= (1 << (4 - bit));
                        lngMin = lngMid;
                      } else {
                        lngMax = lngMid;
                      }
                    } else {
                      const latMid = (latMin + latMax) / 2;
                      if (lat > latMid) {
                        idx |= (1 << (4 - bit));
                        latMin = latMid;
                      } else {
                        latMax = latMid;
                      }
                    }
                    evenBit = !evenBit;

                    if (bit < 4) {
                      bit++;
                    } else {
                      geohash += base32[idx];
                      bit = 0;
                      idx = 0;
                    }
                  }
                  return geohash;
                },
                args: ['$location.coordinates.coordinates'],
                lang: 'js'
              }
            },
            0,
            precision
          ]
        }
      }
    },
    // Stage 3: Group by geohash to create clusters
    {
      $group: {
        _id: '$geohash',
        count: { $sum: 1 },
        center: { $avg: '$location.coordinates.coordinates' },
        jobId: { $first: '$_id' },
        title: { $first: '$title' }
      }
    },
    // Stage 4: Format output
    {
      $project: {
        _id: 0,
        count: 1,
        coordinates: '$center',
        cluster: { $gt: ['$count', 1] },
        jobId: {
          $cond: {
            if: { $eq: ['$count', 1] },
            then: '$jobId',
            else: '$$REMOVE'
          }
        },
        title: {
          $cond: {
            if: { $eq: ['$count', 1] },
            then: '$title',
            else: '$$REMOVE'
          }
        }
      }
    }
  ];

  try {
    const clusters = await Job.aggregate(pipeline);
    return clusters;
  } catch (error) {
    logger.error('Error in getClustersFromDb:', {
      error: error.message,
      bounds,
      zoom
    });

    // Fallback to simple bounds query without clustering
    return await findJobsInBounds({ ...bounds, limit: 100 }).then(jobs =>
      jobs.map(job => ({
        count: 1,
        coordinates: job.coordinates,
        cluster: false,
        jobId: job._id,
        title: job.title
      }))
    );
  }
};


/**
 * ✅ OPTIMIZED: Xác định số lượng cụm mong muốn dựa trên mức zoom
 * 
 * Nguyên tắc: Zoom càng XA → Bucket count càng NHỎ → Cụm càng LỚN
 * 
 * Logic:
 * - Zoom 1-4 (Rất xa - cả nước): 5-10 cụm lớn
 * - Zoom 5-7 (Xa - vùng/tỉnh): 10-20 cụm
 * - Zoom 8-11 (Gần - <qu></qu>ận/huyện): 30-50 cụm
 * - Zoom 12+ (Rất gần - NOT USED, frontend dùng client clustering)
 */
const getBucketCount = (zoom) => {
  if (zoom < 5) return 2;   // Zoom rất xa: 2 cụm LỚN
  if (zoom < 8) return 4;   // Zoom xa: 4 cụm VỪA (FIXED: was 100)
  if (zoom < 10) return 6;  // Zoom gần: 6 cụm NHỎ (FIXED: was 50)
  if (zoom < 11) return 7;  // Zoom gần: 7 cụm NHỎ
  if (zoom < 12) return 8;  // Zoom gần: 7 cụm NHỎ (FIXED: was 250)
  return 20; // Fallback (không nên xảy ra vì zoom >= 12 dùng /map-search)
};

/**
 * ✅ ĐỀ XUẤT 2: Lấy CHỈ CLUSTERS cho zoom level thấp (< 12)
 * - API này CHỈ TRẢ VỀ clusters (point_count > 1)
 * - KHÔNG trả về single jobs (điểm đơn lẻ)
 * - Frontend sẽ sử dụng MarkerClusterGroup để gom cụm phía client khi zoom >= 12
 * 
 * Sử dụng MongoDB $bucketAuto để phân cụm tự động
 * @param {object} bounds - Khung nhìn bản đồ {sw_lat, sw_lng, ne_lat, ne_lng}
 * @param {number} zoom - Mức độ zoom của bản đồ
 * @param {object} filters - Các bộ lọc bổ sung (category, type, workType, etc.)
 * @returns {Promise<Array>} Danh sách CHỈ GỒM clusters (type: 'cluster', count > 1)
 */
export const getMapClusters = async (bounds, zoom) => { // Removed third argument filters
  const {
    sw_lat, sw_lng, ne_lat, ne_lng,
    query, category, type, workType, experience,
    province, district, minSalary, maxSalary,
    latitude, longitude, distance
  } = bounds; // filters is now part of bounds

  // Determine grid size (in degrees) based on zoom level
  // This controls the clustering radius
  const getGridSize = (z) => {
    const zoomLevel = parseInt(z);
    if (zoomLevel <= 4) return 4.0;
    if (zoomLevel <= 5) return 2.0;
    if (zoomLevel <= 6) return 1.0;
    if (zoomLevel <= 7) return 0.5;
    if (zoomLevel <= 8) return 0.25;
    if (zoomLevel <= 9) return 0.12;
    if (zoomLevel <= 10) return 0.06;
    if (zoomLevel <= 11) return 0.03;
    return 0.015;
  };

  const gridSize = getGridSize(zoom);

  // ✅ DEBUG: Log input parameters
  logger.info(`[MAP CLUSTERS] Zoom: ${zoom}, GridSize: ${gridSize}`);
  logger.info(`[MAP CLUSTERS] Bounds:`, bounds);
  if (latitude || longitude || distance) {
    logger.info(`[MAP CLUSTERS] Radius filter detected: ${distance}km around [${longitude}, ${latitude}]`);
  }

  // 1. Xây dựng điều kiện match cơ bản (Sử dụng builder trung tâm)
  const { preFilter: baseMatch, postFilter: salaryFilter } = buildPreFilter(bounds);
  Object.assign(baseMatch, salaryFilter);

  // ✅ DEBUG log
  console.log(`[MAP CLUSTERS] Zoom: ${zoom}, Query: "${query || ''}"`);
  console.log(`[MAP CLUSTERS] Bounds filter:`, JSON.stringify(baseMatch));
  if (baseMatch.$and) {
    console.log(`[MAP CLUSTERS] AND filters found:`, baseMatch.$and.length);
  }


  // 2. Xây dựng Aggregation Pipeline với Grid Clustering (No $function)
  const pipeline = [];

  if (query && query.trim() !== '') {
    // Sử dụng Atlas Search để đồng bộ với danh sách khi có từ khóa
    const searchFilter = buildSearchFilter(bounds);
    pipeline.push({
      $search: {
        index: "kw",
        compound: {
          must: [
            {
              text: {
                query: query,
                path: "title",
                fuzzy: { maxEdits: 1, prefixLength: 2 },
                score: { boost: { value: 3 } }
              }
            },
            ...searchFilter.compound.must // Spread filters here
          ],
          should: [
            {
              text: {
                query: query,
                path: ["description", "requirements"],
                fuzzy: { maxEdits: 1, prefixLength: 2 },
              }
            }
          ]
        }
      }
    });
  } else {
    // Tìm kiếm thường bằng match
    pipeline.push({ $match: baseMatch });
  }

  // Giai đoạn 2: Calculate Grid Coordinates
  pipeline.push({
    $project: {
      _id: 1,
      // Calculate grid bucket indices
      gridX: {
        $floor: {
          $divide: [
            { $arrayElemAt: ["$location.coordinates.coordinates", 0] },
            gridSize
          ]
        }
      },
      gridY: {
        $floor: {
          $divide: [
            { $arrayElemAt: ["$location.coordinates.coordinates", 1] },
            gridSize
          ]
        }
      },
      coords: "$location.coordinates.coordinates"
    }
  });

  // Giai đoạn 3: Group by Grid Coordinates
  pipeline.push({
    $group: {
      _id: { x: "$gridX", y: "$gridY" },
      count: { $sum: 1 },
      // Calculate average center for the cluster
      avgLng: { $avg: { $arrayElemAt: ["$coords", 0] } },
      avgLat: { $avg: { $arrayElemAt: ["$coords", 1] } },
      jobIds: { $push: "$_id" }
    }
  });

  // Giai đoạn 4: Format Output
  pipeline.push({
    $project: {
      _id: 0,
      count: 1,
      coordinates: ["$avgLng", "$avgLat"],
      jobIds: 1
    }
  });

  try {
    const results = await Job.aggregate(pipeline);

    // ✅ DEBUG: Log raw aggregation results
    logger.info(`[MAP CLUSTERS] Raw results count: ${results.length}`);

    const formattedResults = results.map(result => ({
      type: 'cluster',
      coordinates: result.coordinates,
      count: result.count,
      jobIds: result.jobIds.map(id => id.toString())
    }));

    // ✅ DEBUG: Log final formatted results
    logger.info(`[MAP CLUSTERS] Final results: ${formattedResults.length} clusters/markers`);
    logger.info(`[MAP CLUSTERS] Total jobs: ${formattedResults.reduce((sum, c) => sum + c.count, 0)}`);

    return formattedResults;
  } catch (error) {
    logger.error('Error in getMapClusters:', error);
    throw error;
  }
};


/**
 * Get multiple jobs by their IDs
 * Used for job alert notifications to display jobs from metadata.jobIds
 * @param {string[]} ids - Array of job IDs
 * @returns {Promise<object[]>} Array of jobs with company info
 */
export const getJobsByIds = async (ids) => {
  const jobs = await Job.find({ _id: { $in: ids } })
    .populate('recruiterProfileId', 'company')
    .select('title description location minSalary maxSalary type workType experience skills createdAt deadline recruiterProfileId status')
    .lean();

  // Map recruiterProfile company to job for cleaner response
  return jobs.map(job => ({
    ...job,
    company: job.recruiterProfileId?.company || null,
    recruiterProfileId: undefined
  }));
};

/**
 * Ứng tuyển lại vào một tin tuyển dụng
 * @param {string} userId - ID của User (Candidate)
 * @param {string} jobId - ID của Job
 * @param {object} applicationData - Dữ liệu ứng tuyển (cvId hoặc cvTemplateId, coverLetter)
 * @returns {Promise<Document>} Đơn ứng tuyển mới đã được tạo
 */
export const reapplyToJob = async (userId, jobId, applicationData) => {
  const { cvId, cvTemplateId, coverLetter, candidateName, candidateEmail, candidatePhone, source } = applicationData;

  // 1. Tìm hồ sơ ứng viên
  const candidateProfile = await CandidateProfile.findOne({ userId });
  if (!candidateProfile) {
    throw new NotFoundError('Không tìm thấy hồ sơ ứng viên.');
  }

  // 2. Tìm tin tuyển dụng và kiểm tra còn ACTIVE không
  const job = await Job.findById(jobId).populate('recruiterProfileId', 'company userId');
  if (!job) {
    throw new NotFoundError('Tin tuyển dụng không tồn tại.');
  }
  if (job.status !== 'ACTIVE') {
    throw new BadRequestError('Tin tuyển dụng đã hết hạn hoặc không còn hoạt động. Không thể ứng tuyển lại.');
  }

  // 3. Tìm đơn ứng tuyển cũ MỚI NHẤT (sort appliedAt DESC)
  const previousApplication = await Application.findOne({
    jobId,
    candidateProfileId: candidateProfile._id,
  }).sort({ appliedAt: -1 });

  if (!previousApplication) {
    throw new BadRequestError('Bạn chưa từng ứng tuyển vào vị trí này. Vui lòng sử dụng chức năng ứng tuyển thông thường.');
  }

  let sourceFileInfo;
  let sourceType;

  // 4. Lấy thông tin CV tùy theo loại được cung cấp
  try {
    if (cvId) {
      // --- Trường hợp 1: Dùng CV đã tải lên ---
      const selectedCV = candidateProfile.cvs?.find(cv => cv._id.toString() === cvId);
      if (!selectedCV) {
        throw new BadRequestError('CV tải lên không hợp lệ hoặc không tìm thấy.');
      }
      sourceFileInfo = {
        name: selectedCV.name,
        path: selectedCV.path,
      };
      sourceType = 'UPLOADED';
    } else if (cvTemplateId) {
      // --- Trường hợp 2: Dùng CV tạo từ mẫu (Template) ---
      const cvTemplate = await CV.findOne({
        _id: cvTemplateId,
        userId: userId
      });

      if (!cvTemplate) {
        throw new BadRequestError('CV mẫu không hợp lệ hoặc không tìm thấy.');
      }

      sourceFileInfo = {
        name: cvTemplate.title || 'CV Template',
        cvTemplateId: cvTemplate._id,
        templateId: cvTemplate.templateId,
        templateSnapshot: cvTemplate.cvData,
      };
      sourceType = 'TEMPLATE';
    } else {
      throw new BadRequestError('Phải cung cấp một CV để ứng tuyển lại.');
    }

    let submittedCVData;

    if (sourceType === 'UPLOADED') {
      // --- Xử lý CV đã tải lên: Tạo bản sao trên Cloudinary ---
      let copiedFile;
      if (process.env.NODE_ENV === 'test') {
        copiedFile = {
          secure_url: 'http://mocked.com/cv.pdf',
          public_id: 'mocked_public_id',
        };
      } else {
        logger.info(`Tạo bản sao CV cho đơn ứng tuyển lại: ${job.title}, ứng viên: ${userId}`);
        const uniqueSuffix = `${jobId}-${Date.now()}`;
        const publicId = `application-cv-${userId}-${uniqueSuffix}`;
        copiedFile = await uploadService.copyFileFromUrlToCloudinary(
          sourceFileInfo.path,
          'application-cvs',
          publicId
        );
      }

      submittedCVData = {
        name: sourceFileInfo.name,
        path: copiedFile.secure_url,
        source: sourceType,
      };
    } else {
      // --- Xử lý CV Template: Lưu snapshot data ---
      submittedCVData = {
        name: sourceFileInfo.name,
        source: sourceType,
        cvTemplateId: sourceFileInfo.cvTemplateId,
        templateId: sourceFileInfo.templateId,
        templateSnapshot: sourceFileInfo.templateSnapshot,
      };
    }

    // 5. Tạo bản ghi ứng tuyển MỚI (re-apply)
    // Đơn mới có isReapplied = true để:
    // - Semantic đúng: đây là đơn ứng tuyển lại
    // - Bypass unique index (index chỉ enforce khi isReapplied !== true)
    const newApplication = await Application.create({
      jobId,
      candidateProfileId: candidateProfile._id,
      coverLetter,
      source: source || 'DIRECT_APPLY',
      candidateName,
      candidateEmail,
      candidatePhone,
      submittedCV: submittedCVData,
      jobSnapshot: {
        title: job.title,
        company: job.recruiterProfileId.company.name,
        logo: job.recruiterProfileId.company.logo,
      },
      // Đánh dấu đây là đơn ứng tuyển lại
      isReapplied: true,
      // Lưu reference đến đơn ứng tuyển trước đó
      previousApplicationId: previousApplication._id,
    });

    logActivity(newApplication, 'APPLICATION_SUBMITTED', 'Ứng viên đã nộp đơn ứng tuyển lại');
    await newApplication.save();

    // --- GỬI SỰ KIỆN THÔNG BÁO ---
    try {
      const recruiterUserId = job.recruiterProfileId.userId;

      // 1. Gửi sự kiện để thông báo cho ỨNG VIÊN
      queueService.publishNotification(ROUTING_KEYS.STATUS_UPDATE, {
        type: 'APPLICATION_RESUBMITTED',
        recipientId: userId.toString(),
        data: {
          applicationId: newApplication._id.toString(),
        }
      });

      // 2. Gửi sự kiện để thông báo cho NHÀ TUYỂN DỤNG (đây là đơn ứng tuyển lại)
      queueService.publishNotification(ROUTING_KEYS.NEW_APPLICATION, {
        recipientId: recruiterUserId.toString(),
        data: {
          applicationId: newApplication._id.toString(),
          isReapply: true, // Đánh dấu để worker biết đây là re-apply
          candidateName: candidateName,
          jobTitle: job.title,
        }
      });

    } catch (error) {
      logger.error('Failed to queue notifications after re-application', { error, applicationId: newApplication._id });
    }

    return newApplication;

  } catch (error) {
    logger.error(`Lỗi khi nộp đơn ứng tuyển lại: ${error.message}`, {
      userId, jobId, cvId, cvTemplateId, error
    });

    if (error instanceof BadRequestError || error instanceof NotFoundError) {
      throw error;
    }
    throw new BadRequestError('Có lỗi xảy ra khi nộp đơn ứng tuyển lại.');
  }
};

/**
 * Get similar jobs via AI Python service (vector search)
 * BE only sends jobId → FastAPI fetches embedding, does vector search, returns job IDs
 */
export const getSimilarJobs = async (jobId, options = {}, userId = null) => {
  const { limit = 6 } = options;

  // 1. Call FastAPI AI service — it handles embedding + vector search internally
  const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
  const aiServiceSecret = process.env.AI_INTERNAL_SECRET || 'careerzone_internal_secret_key';

  let similarJobIds;
  try {
    const response = await axios.post(
      `${aiServiceUrl}/api/v1/embeddings/similar-jobs`,
      { job_id: jobId, limit },
      { headers: { 'x-internal-secret': aiServiceSecret }, timeout: 15000 }
    );
    similarJobIds = response.data.data; // [{ job_id, similarity_score }]
  } catch (error) {
    // If 404, job not found or no embeddings
    if (error.response?.status === 404) {
      throw new NotFoundError('Không tìm thấy tin tuyển dụng.');
    }
    logger.error('Failed to call AI similar-jobs service:', {
      message: error.message, jobId
    });
    throw new BadRequestError('Lỗi khi tìm kiếm việc làm tương tự.');
  }

  if (!similarJobIds || similarJobIds.length === 0) {
    return { data: [], meta: { jobId, total: 0 } };
  }

  // 2. Fetch full job details from DB
  const scoreMap = new Map(similarJobIds.map(r => [r.job_id, r.similarity_score]));
  const objectIds = similarJobIds.map(r => new mongoose.Types.ObjectId(r.job_id));

  const pipeline = [
    { $match: { _id: { $in: objectIds } } },
    {
      $lookup: {
        from: 'recruiterprofiles',
        localField: 'recruiterProfileId',
        foreignField: '_id',
        as: 'recruiter'
      }
    },
    { $unwind: { path: '$recruiter', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        'company.name': '$recruiter.company.name',
        'company.logo': '$recruiter.company.logo',
      }
    },
    {
      $project: {
        description: 0, requirements: 0, benefits: 0, address: 0,
        embeddingsUpdatedAt: 0, chunks: 0, recruiter: 0,
      }
    },
  ];

  let results = await Job.aggregate(pipeline);

  // Attach similarity scores and sort descending
  results = results.map(j => ({
    ...j,
    similarityScore: scoreMap.get(j._id.toString()) || 0,
  }));
  results.sort((a, b) => b.similarityScore - a.similarityScore);

  // Add isSaved status if authenticated
  if (userId && results.length > 0) {
    const jobIds = results.map(j => j._id);
    const savedJobs = await SavedJob.find({
      candidateId: userId,
      jobId: { $in: jobIds }
    }).select('jobId').lean();

    const savedJobIds = new Set(savedJobs.map(s => s.jobId.toString()));
    results = results.map(j => ({
      ...j,
      isSaved: savedJobIds.has(j._id.toString())
    }));
  }

  logger.info('Similar jobs search completed', {
    sourceJobId: jobId, resultsCount: results.length
  });

  return {
    data: results,
    meta: { jobId, total: results.length }
  };
};

/**
 * Get jobs that users with similar preferences also liked via AI Python service (Item-Item CF)
 */
export const getAlsoLikedJobs = async (jobId, options = {}, userId = null) => {
  const { limit = 6 } = options;

  // 1. Call FastAPI AI service — it handles LightFM item-item CF internally
  const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
  const aiServiceSecret = process.env.AI_INTERNAL_SECRET || 'careerzone_internal_secret_key';

  let similarJobIds;
  try {
    const response = await axios.get(
      `${aiServiceUrl}/api/v1/recommendation/similar-jobs-cf/${jobId}?limit=${limit}`,
      { headers: { 'x-internal-secret': aiServiceSecret }, timeout: 15000 }
    );
    similarJobIds = response.data.data; // [{ jobId, score }]
  } catch (error) {
    if (error.response?.status === 404) {
      throw new NotFoundError('Không tìm thấy tin tuyển dụng.');
    }
    logger.error('Failed to call AI similar-jobs-cf service:', {
      message: error.message, jobId
    });
    // Fallback if AI fails:
    similarJobIds = [];
  }

  if (!similarJobIds || similarJobIds.length === 0) {
    return { data: [], meta: { jobId, total: 0 } };
  }

  // 2. Fetch full job details from DB
  const scoreMap = new Map(similarJobIds.map(r => [r.jobId, r.score]));
  // Filter out invalid object IDs just in case
  const objectIds = similarJobIds
    .filter(r => mongoose.Types.ObjectId.isValid(r.jobId))
    .map(r => new mongoose.Types.ObjectId(r.jobId));

  const pipeline = [
    { $match: { _id: { $in: objectIds } } },
    {
      $lookup: {
        from: 'recruiterprofiles',
        localField: 'recruiterProfileId',
        foreignField: '_id',
        as: 'recruiter'
      }
    },
    { $unwind: { path: '$recruiter', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        'company.name': '$recruiter.company.name',
        'company.logo': '$recruiter.company.logo',
      }
    },
    {
      $project: {
        description: 0, requirements: 0, benefits: 0, address: 0,
        embeddingsUpdatedAt: 0, chunks: 0, recruiter: 0,
      }
    },
  ];

  let results = await Job.aggregate(pipeline);

  // Attach similarity scores and sort descending
  results = results.map(j => ({
    ...j,
    similarityScore: scoreMap.get(j._id.toString()) || 0,
  }));
  results.sort((a, b) => b.similarityScore - a.similarityScore);

  // Add isSaved status if authenticated
  if (userId && results.length > 0) {
    const jobIds = results.map(j => j._id);
    const savedJobs = await SavedJob.find({
      candidateId: userId,
      jobId: { $in: jobIds }
    }).select('jobId').lean();

    const savedJobIds = new Set(savedJobs.map(s => s.jobId.toString()));
    results = results.map(j => ({
      ...j,
      isSaved: savedJobIds.has(j._id.toString())
    }));
  }

  logger.info('Also Liked jobs search completed', {
    sourceJobId: jobId, resultsCount: results.length
  });

  return {
    data: results,
    meta: { jobId, total: results.length }
  };
};
