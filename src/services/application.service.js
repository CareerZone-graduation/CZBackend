import mongoose from 'mongoose';
import {
  Application,
  Job,
  User,
  CandidateProfile,
  RecruiterProfile,
  InterviewRoom,
  TalentPool,
} from '../models/index.js';
import { NotFoundError, UnauthorizedError, BadRequestError } from '../utils/AppError.js';
import logger from '../utils/logger.js';
import * as queueService from './queue.service.js';
import * as rabbitmq from '../queues/rabbitmq.js';
import { pushNotification } from './notification.service.js';

// ==========================================================
// === HELPER FUNCTIONS FOR AUTOMATION & LOGGING (NEW) ====
// ==========================================================

/**
 * Ghi lại một hành động vào lịch sử của đơn ứng tuyển.
 * Hàm này không tự save, việc save sẽ do hàm gọi nó quyết định.
 */
export const logActivity = (application, action, detail) => {
  console.log("Logging activity: ", { action, detail });
  application.activityHistory.push({
    action,
    detail,
    timestamp: new Date()
  });
};



/**
 * Lấy danh sách ứng viên đã ứng tuyển vào một công việc cụ thể
 * @param {string} jobId ID của công việc
 * @param {string} recruiterId ID của nhà tuyển dụng
 * @param {Object} options Các tùy chọn lọc và phân trang
 * @returns {Object} Object chứa mảng data và object meta
 */
export const getApplicationsByJob = async (jobId, recruiterId, options = {}) => {

  // Kiểm tra xem công việc có tồn tại không và nhà tuyển dụng có quyền không
  const job = await Job.findById(jobId);
  if (!job) {
    throw new NotFoundError('Không tìm thấy công việc');
  }

  // Lấy recruiter profile của người dùng hiện tại
  const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId });
  if (!recruiterProfile) {
    throw new UnauthorizedError('Bạn không phải là nhà tuyển dụng');
  }

  // Kiểm tra quyền sở hữu
  if (job.recruiterProfileId.toString() !== recruiterProfile._id.toString()) {
    throw new UnauthorizedError('Bạn không có quyền xem danh sách ứng viên cho công việc này');
  }

  // Xử lý các options
  const page = options.page || 1;
  const limit = options.limit || 10;
  const skip = (page - 1) * limit;

  // Xây dựng query filter
  const filter = { jobId: new mongoose.Types.ObjectId(jobId) };

  if (options.status) {
    filter.status = options.status;
  }

  // Xử lý filter isReapplied - convert string to boolean
  if (options.isReapplied !== undefined && options.isReapplied !== 'all') {
    // Convert string "true"/"false" to boolean
    filter.isReapplied = options.isReapplied === true || options.isReapplied === 'true';
  }
  
  //   Xây dựng sort options
  let sortOptions = {};
  if (options.sort) {
    if (options.sort.startsWith('-')) {
      sortOptions[options.sort.substring(1)] = -1;
    } else {
      sortOptions[options.sort] = 1;
    }
  } else {
    // Mặc định sắp xếp theo thời gian ứng tuyển giảm dần
    sortOptions = { appliedAt: -1 };
  }

  // Tạo pipeline aggregate để lấy thông tin chi tiết
  const pipeline = [
    { $match: filter },
    {
      $lookup: {
        from: 'candidateprofiles',
        localField: 'candidateProfileId',
        foreignField: '_id',
        as: 'candidateProfile'
      }
    },
    { $unwind: { path: '$candidateProfile', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        jobId: 1,
        status: 1,
        appliedAt: 1,
        lastStatusUpdateAt: 1,
        candidateRating: 1,
        isReapplied: 1,
        previousApplicationId: 1,
        notes: 1,
        coverLetter: 1,
        submittedCV: 1,
        jobSnapshot: 1,
        // Thông tin cơ bản của ứng viên từ form hoặc từ thông tin người dùng
        candidateName: { $ifNull: ['$candidateName', '$candidateProfile.fullname'] },
        candidateEmail: { $ifNull: ['$candidateEmail', '$candidateProfile.email'] },
        candidatePhone: { $ifNull: ['$candidatePhone', '$candidateProfile.phone'] },
        candidateAvatar: '$candidateProfile.avatar',
        candidateTitle: '$candidateProfile.title',
        candidateUserId: '$candidateProfile.userId',
      }
    },
    { $sort: sortOptions },
    { $skip: skip },
    { $limit: limit }
  ];

  // Nếu có tìm kiếm, thêm điều kiện tìm kiếm
  if (options.search) {
    const searchRegex = new RegExp(options.search, 'i');

    // Thêm một stage riêng cho tìm kiếm sau khi đã lookup để có thể tìm trong các trường
    pipeline.splice(3, 0, {
      $match: {
        $or: [
          { 'candidateName': searchRegex },
          { 'candidateEmail': searchRegex },
          { 'candidatePhone': searchRegex }
        ]
      }
    });
  }

  // Thực hiện truy vấn
  const applications = await Application.aggregate(pipeline);
  logger.info(`Lấy danh sách ứng viên cho công việc ${jobId} thành công`, { applications });
  // Đếm tổng số lượng
  const totalApplications = await Application.countDocuments(filter);

  return {
    data: applications,
    meta: {
      currentPage: page,
      totalPages: Math.ceil(totalApplications / limit),
      totalItems: totalApplications,
      limit
    }
  };
};

/**
 * Lấy thông tin chi tiết một đơn ứng tuyển
 * @param {string} applicationId ID của đơn ứng tuyển
 * @param {string} recruiterId ID của nhà tuyển dụng
 * @returns {Object} Thông tin chi tiết đơn ứng tuyển
 */
export const getApplicationById = async (applicationId, recruiterId) => {
  // Populate candidateProfileId với chỉ những field cần thiết để so sánh (không bao gồm CVs - thông tin riêng tư)
  const application = await Application.findById(applicationId)
    .populate({
      path: 'candidateProfileId',
      select: 'userId fullname avatar bio phone email address skills experiences educations certificates projects expectedSalary workPreferences preferredLocations'
    })
    .populate({
      path: 'jobId',
      select: 'title company location salary employmentType description requirements benefits'
    });

  if (!application) {
    throw new NotFoundError('Không tìm thấy đơn ứng tuyển');
  }

  // Kiểm tra quyền sở hữu
  const job = await Job.findById(application.jobId._id || application.jobId);
  if (!job) {
    throw new NotFoundError('Không tìm thấy công việc liên quan');
  }

  // Lấy recruiter profile của người dùng hiện tại
  const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId });
  if (!recruiterProfile) {
    throw new UnauthorizedError('Bạn không phải là nhà tuyển dụng');
  }

  if (job.recruiterProfileId.toString() !== recruiterProfile._id.toString()) {
    throw new UnauthorizedError('Bạn không có quyền xem đơn ứng tuyển này');
  }

  // Lấy thông tin phỏng vấn nếu có
  const interview = await InterviewRoom.findOne({ applicationId: application._id }).lean();
  // Check if candidate is in talent pool
  const isInTalentPool = application.candidateProfileId ? await TalentPool.exists({
    recruiterProfileId: recruiterProfile._id,
    candidateProfileId: application.candidateProfileId._id
  }) : null;

  // Tạo và trả về đối tượng thông tin (candidateProfileId đã được populate đầy đủ)
  const applicationDetails = {
    ...application.toObject(),
    candidateUserId: application.candidateProfileId?.userId,
    candidateAvatar: application.candidateProfileId?.avatar,
    isInTalentPool: !!isInTalentPool,
    talentPoolId: isInTalentPool ? isInTalentPool._id : null,
    hasInterview: !!interview,
    interviewInfo: interview
      ? {
        interviewId: interview._id,
        scheduledTime: interview.scheduledTime,
        status: interview.status,
        roomName: interview.roomName,
      }
      : null,
  };

  // Kiểm tra xem đã log APPLICATION_VIEWED chưa
  const hasViewed = application.activityHistory.some(activity => activity.action === 'APPLICATION_VIEWED');

  if (!hasViewed) {
    // Log activity
    logActivity(application, 'APPLICATION_VIEWED', 'Nhà tuyển dụng đã xem hồ sơ ứng tuyển');
    await application.save();

    // Gửi thông báo cho ứng viên
    const candidateProfile = await CandidateProfile.findById(application.candidateProfileId);
    if (candidateProfile) {
      queueService.publishNotification(rabbitmq.ROUTING_KEYS.STATUS_UPDATE, {
        type: 'APPLICATION_VIEWED',
        recipientId: candidateProfile.userId.toString(),
        data: {
          applicationId: application._id.toString(),
          jobTitle: job.title,
          companyName: recruiterProfile.company.name
        }
      });
    }
  }

  return {
    ...applicationDetails,
  };

};

/**
 * Cập nhật trạng thái đơn ứng tuyển (chỉ dành cho nhà tuyển dụng)
 * @param {string} applicationId ID đơn ứng tuyển
 * @param {string} recruiterId ID nhà tuyển dụng
 * @param {string} status Trạng thái mới
 * @returns {Object} Đơn ứng tuyển đã cập nhật
 */
export const updateApplicationStatus = async (applicationId, recruiterId, status) => {
  // Kiểm tra ID hợp lệ
  if (!mongoose.Types.ObjectId.isValid(applicationId)) {
    throw new BadRequestError('ID đơn ứng tuyển không hợp lệ');
  }

  // Lấy thông tin đơn ứng tuyển
  const application = await Application.findById(applicationId).populate('jobId');
  if (!application) {
    throw new NotFoundError('Không tìm thấy đơn ứng tuyển');
  }

  // Kiểm tra quyền sở hữu
  const job = application.jobId;
  if (!job) {
    throw new NotFoundError('Không tìm thấy công việc liên quan');
  }

  // Lấy recruiter profile của người dùng hiện tại
  const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId });
  if (!recruiterProfile) {
    throw new UnauthorizedError('Bạn không phải là nhà tuyển dụng');
  }

  if (job.recruiterProfileId.toString() !== recruiterProfile._id.toString()) {
    throw new UnauthorizedError('Bạn không có quyền cập nhật trạng thái cho đơn ứng tuyển này');
  }

  const oldStatus = application.status;
  application.status = status;
  application.lastStatusUpdateAt = new Date();

  // Ghi log activity, cũng hiển thị cho ứng viên
  if (status === 'SUITABLE') {
    logActivity(application, 'SUITABLE', `Nhà tuyển dụng đã đánh giá đơn ứng tuyển này là phù hợp`);
  } else if (status === 'SCHEDULED_INTERVIEW') {
    logActivity(application, 'SCHEDULED_INTERVIEW', `Nhà tuyển dụng đã đặt lịch phỏng vấn cho đơn ứng tuyển này`);
  } else if (status === 'OFFER_SENT') {
    logActivity(application, 'OFFER_SENT', `Nhà tuyển dụng đã gửi lời mời cho đơn ứng tuyển này`);
  } else if (status === 'REJECTED') {
    logActivity(application, 'REJECTED', `Nhà tuyển dụng đã đánh giá đơn ứng tuyển này là không phù hợp`);
  }

  await application.save();

  // Gửi thông báo nếu trạng thái thay đổi
  if (oldStatus !== status) {
    const candidateProfile = await CandidateProfile.findById(application.candidateProfileId);
    if (candidateProfile) {
      queueService.publishNotification(rabbitmq.ROUTING_KEYS.STATUS_UPDATE, {
        type: status,
        recipientId: candidateProfile.userId.toString(),
        data: {
          applicationId: application._id.toString(),
          newStatus: status
        }
      });
    }
  }

  // Populate candidateProfileId để lấy thông tin chi tiết
  await application.populate({
    path: 'candidateProfileId',
    select: 'userId avatar'
  });

  // Lấy thông tin phỏng vấn nếu có
  const interview = await InterviewRoom.findOne({ applicationId: application._id }).lean();
  // Check if candidate is in talent pool
  const isInTalentPool = application.candidateProfileId ? await TalentPool.exists({
    recruiterProfileId: recruiterProfile._id,
    candidateProfileId: application.candidateProfileId._id
  }) : null;

  // Tạo và trả về đối tượng thông tin đầy đủ
  const applicationDetails = {
    ...application.toObject(),
    candidateUserId: application.candidateProfileId?.userId,
    candidateAvatar: application.candidateProfileId?.avatar,
    isInTalentPool: !!isInTalentPool,
    talentPoolId: isInTalentPool ? isInTalentPool._id : null,
    hasInterview: !!interview,
    interviewInfo: interview
      ? {
        interviewId: interview._id,
        scheduledTime: interview.scheduledTime,
        status: interview.status,
        roomName: interview.roomName,
      }
      : null,
  };

  return applicationDetails;
};

/**
 * Cập nhật ghi chú cho đơn ứng tuyển
 * @param {string} applicationId ID đơn ứng tuyển
 * @param {string} recruiterId ID nhà tuyển dụng
 * @param {string} notes Ghi chú mới
 * @returns {Object} Đơn ứng tuyển đã cập nhật
 */
export const updateApplicationNotes = async (applicationId, recruiterId, notes) => {
  // Kiểm tra ID hợp lệ
  if (!mongoose.Types.ObjectId.isValid(applicationId)) {
    throw new BadRequestError('ID đơn ứng tuyển không hợp lệ');
  }

  // Lấy thông tin đơn ứng tuyển
  const application = await Application.findById(applicationId);
  if (!application) {
    throw new NotFoundError('Không tìm thấy đơn ứng tuyển');
  }

  // Kiểm tra quyền sở hữu
  const job = await Job.findById(application.jobId);
  if (!job) {
    throw new NotFoundError('Không tìm thấy công việc liên quan');
  }

  // Lấy recruiter profile của người dùng hiện tại
  const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId });
  if (!recruiterProfile) {
    throw new UnauthorizedError('Bạn không phải là nhà tuyển dụng');
  }

  if (job.recruiterProfileId.toString() !== recruiterProfile._id.toString()) {
    throw new UnauthorizedError('Bạn không có quyền cập nhật ghi chú cho đơn ứng tuyển này');
  }

  application.notes = notes;
  await application.save();

  return application;
};

// ==========================================================
// === NEW FEATURES: ALL CANDIDATES MANAGEMENT ====
// ==========================================================

/**
 * Lấy tất cả ứng viên từ tất cả các job của công ty recruiter
 * @param {string} recruiterId - ID của nhà tuyển dụng
 * @param {Object} options - Các tùy chọn filter và phân trang
 * @returns {Object} - Object chứa data và meta
 */
export const getAllApplications = async (recruiterId, options = {}) => {
  // Lấy recruiter profile
  const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId });
  if (!recruiterProfile) {
    throw new UnauthorizedError('Bạn không phải là nhà tuyển dụng');
  }

  // Lấy tất cả jobs của recruiter này
  const jobQuery = { recruiterProfileId: recruiterProfile._id };
  if (options.jobStatus && options.jobStatus !== 'all') {
    jobQuery.status = options.jobStatus;
  }

  const recruiterJobs = await Job.find(jobQuery).select('_id');

  const jobIds = recruiterJobs.map(job => job._id);

  // Xử lý options
  const page = options.page || 1;
  const limit = options.limit || 10;
  const skip = (page - 1) * limit;

  // Build filter
  const filter = { jobId: { $in: jobIds } };

  // Filter by status
  if (options.status && options.status !== 'all') {
    filter.status = options.status;
  }

  // Filter by specific jobs
  if (options.jobIds && options.jobIds.length > 0) {
    filter.jobId = {
      $in: options.jobIds.map(id => new mongoose.Types.ObjectId(id))
    };
  }

  // Filter by date range
  if (options.fromDate || options.toDate) {
    filter.appliedAt = {};
    if (options.fromDate) {
      filter.appliedAt.$gte = new Date(options.fromDate);
    }
    if (options.toDate) {
      filter.appliedAt.$lte = new Date(options.toDate);
    }
  }

  // Build sort options
  let sortOptions = {};
  if (options.sort) {
    if (options.sort.startsWith('-')) {
      sortOptions[options.sort.substring(1)] = -1;
    } else {
      sortOptions[options.sort] = 1;
    }
  } else {
    sortOptions = { appliedAt: -1 };
  }

  // Build aggregation pipeline
  const pipeline = [
    { $match: filter },
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
      $lookup: {
        from: 'candidateprofiles',
        localField: 'candidateProfileId',
        foreignField: '_id',
        as: 'candidateProfile'
      }
    },
    { $unwind: { path: '$candidateProfile', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        jobId: 1,
        status: 1,
        appliedAt: 1,
        lastStatusUpdateAt: 1,
        candidateRating: 1,
        isReapplied: 1,
        notes: 1,
        coverLetter: 1,
        submittedCV: 1,
        candidateName: 1,
        candidateEmail: 1,
        candidatePhone: 1,
        jobTitle: '$job.title',
        jobStatus: '$job.status',
        jobDeadline: '$job.deadline',
        jobSnapshot: 1,
        candidateAvatar: '$candidateProfile.avatar',
        candidateTitle: '$candidateProfile.title',
      }
    }
  ];

  // Add search filter if provided
  if (options.search) {
    const searchRegex = new RegExp(options.search, 'i');
    pipeline.push({
      $match: {
        $or: [
          { candidateName: searchRegex },
          { candidateEmail: searchRegex },
          { candidatePhone: searchRegex }
        ]
      }
    });
  }

  // Add sort and pagination
  pipeline.push({ $sort: sortOptions });
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: limit });

  // Execute query
  const applications = await Application.aggregate(pipeline);

  // Count total for pagination
  const countPipeline = [
    { $match: filter }
  ];

  if (options.search) {
    const searchRegex = new RegExp(options.search, 'i');
    countPipeline.push({
      $match: {
        $or: [
          { candidateName: searchRegex },
          { candidateEmail: searchRegex },
          { candidatePhone: searchRegex }
        ]
      }
    });
  }

  const countResult = await Application.aggregate([
    ...countPipeline,
    { $count: 'total' }
  ]);

  const totalApplications = countResult.length > 0 ? countResult[0].total : 0;

  return {
    data: applications,
    meta: {
      currentPage: page,
      totalPages: Math.ceil(totalApplications / limit),
      totalItems: totalApplications,
      limit
    }
  };
};

/**
 * Lấy thống kê tổng quan về applications
 * @param {string} recruiterId - ID của nhà tuyển dụng
 * @param {Object} filters - Các bộ lọc tương tự như getAllApplications
 * @returns {Object} - Thống kê
 */
export const getApplicationsStatistics = async (recruiterId, filters = {}) => {
  // Lấy recruiter profile
  const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId });
  if (!recruiterProfile) {
    throw new UnauthorizedError('Bạn không phải là nhà tuyển dụng');
  }

  // Lấy tất cả jobs của recruiter
  const recruiterJobs = await Job.find({
    recruiterProfileId: recruiterProfile._id
  }).select('_id title status');

  const jobIds = recruiterJobs.map(job => job._id);
  const activeJobIds = recruiterJobs.filter(job => job.status === 'ACTIVE').map(job => job._id);

  // Build base filter
  const baseFilter = { jobId: { $in: jobIds } };

  // Apply additional filters if provided
  if (filters.jobIds && filters.jobIds.length > 0) {
    baseFilter.jobId = {
      $in: filters.jobIds.map(id => new mongoose.Types.ObjectId(id))
    };
  }

  if (filters.fromDate || filters.toDate) {
    baseFilter.appliedAt = {};
    if (filters.fromDate) {
      baseFilter.appliedAt.$gte = new Date(filters.fromDate);
    }
    if (filters.toDate) {
      baseFilter.appliedAt.$lte = new Date(filters.toDate);
    }
  }

  // Get total applications
  const totalApplications = await Application.countDocuments(baseFilter);

  // Get new applications (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const newApplications = await Application.countDocuments({
    ...baseFilter,
    appliedAt: { $gte: sevenDaysAgo }
  });

  // Get pending reviews
  const pendingReviewsQuery = {
    ...baseFilter,
    status: 'PENDING'
  };

  // If no specific job filter is applied, only count pending reviews for ACTIVE jobs
  if (!filters.jobIds || filters.jobIds.length === 0) {
    pendingReviewsQuery.jobId = { $in: activeJobIds };
  }

  const pendingReviews = await Application.countDocuments(pendingReviewsQuery);

  // Get scheduled interviews
  const scheduledInterviews = await Application.countDocuments({
    ...baseFilter,
    status: 'SCHEDULED_INTERVIEW'
  });

  // Status distribution
  const statusDistribution = await Application.aggregate([
    { $match: baseFilter },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);



  // Top jobs by application count
  const topJobs = await Application.aggregate([
    { $match: baseFilter },
    {
      $group: {
        _id: '$jobId',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: 'jobs',
        localField: '_id',
        foreignField: '_id',
        as: 'job'
      }
    },
    { $unwind: '$job' },
    {
      $project: {
        jobId: '$_id',
        jobTitle: '$job.title',
        count: 1
      }
    }
  ]);

  return {
    summary: {
      totalApplications,
      newApplications,
      pendingReviews,
      scheduledInterviews
    },
    statusDistribution,
    topJobs
  };
};

/**
 * Bulk update status cho nhiều applications
 * @param {string} recruiterId - ID của nhà tuyển dụng
 * @param {Array<string>} applicationIds - Array của application IDs
 * @param {string} newStatus - Status mới
 * @returns {Object} - Kết quả update
 */
export const bulkUpdateStatus = async (recruiterId, applicationIds, newStatus) => {
  // Verify recruiter
  const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId });
  if (!recruiterProfile) {
    throw new UnauthorizedError('Bạn không phải là nhà tuyển dụng');
  }

  // Get all applications
  const applications = await Application.find({
    _id: { $in: applicationIds }
  }).populate('jobId');

  // Verify ownership
  for (const app of applications) {
    if (!app.jobId || app.jobId.recruiterProfileId.toString() !== recruiterProfile._id.toString()) {
      throw new UnauthorizedError('Bạn không có quyền cập nhật một số đơn ứng tuyển');
    }
  }

  // Update all applications
  const updatePromises = applications.map(async (app) => {
    app.status = newStatus;
    app.lastStatusUpdateAt = new Date();

    let action;
    if (newStatus === 'SUITABLE') action = 'SUITABLE';
    else if (newStatus === 'SCHEDULED_INTERVIEW') action = 'SCHEDULED_INTERVIEW';
    else if (newStatus === 'OFFER_SENT') action = 'OFFER_SENT';
    else if (newStatus === 'ACCEPTED') action = 'OFFER_ACCEPTED';
    else if (newStatus === 'OFFER_DECLINED') action = 'OFFER_DECLINED';
    else if (newStatus === 'REJECTED') action = 'REJECTED';

    if (action) {
      logActivity(app, action, `Trạng thái thay đổi thành ${newStatus} (bulk update)`);
    }
    return app.save();
  });

  await Promise.all(updatePromises);

  return {
    success: true,
    count: applications.length
  };
};




/**
 * Export applications to CSV format
 * @param {string} recruiterId - ID của nhà tuyển dụng
 * @param {Array<string>} applicationIds - Array của application IDs
 * @returns {Array} - Array of application data for CSV
 */
export const exportApplicationsToCSV = async (recruiterId, applicationIds) => {
  // Verify recruiter
  const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId });
  if (!recruiterProfile) {
    throw new UnauthorizedError('Bạn không phải là nhà tuyển dụng');
  }

  // Get applications with populated data
  const applications = await Application.find({
    _id: { $in: applicationIds }
  })
    .populate('jobId', 'title')
    .populate('candidateProfileId', 'title skills yearsOfExperience')
    .lean();

  // Verify ownership and format data
  const csvData = applications.map(app => {
    return {
      'Candidate Name': app.candidateName,
      'Email': app.candidateEmail,
      'Phone': app.candidatePhone,
      'Job Title': app.jobSnapshot?.title || app.jobId?.title,
      'Applied Date': new Date(app.appliedAt).toLocaleDateString('vi-VN'),
      'Status': app.status,
      'Notes': app.notes || '',
    };
  });

  return csvData;
};

/**
 * Lấy dữ liệu CV để render cho Application (dành cho CV template)
 * Recruiter có thể xem CV template của ứng viên thông qua Application
 * @param {string} applicationId - ID của đơn ứng tuyển
 * @param {string} recruiterId - ID của nhà tuyển dụng (để xác thực quyền) - có thể null nếu dùng token đặc biệt
 * @returns {Object} - Dữ liệu CV để render
 */
export const getApplicationCVData = async (applicationId, recruiterId = null) => {
  // Kiểm tra ID hợp lệ
  if (!mongoose.Types.ObjectId.isValid(applicationId)) {
    throw new BadRequestError('ID đơn ứng tuyển không hợp lệ');
  }

  // Lấy thông tin đơn ứng tuyển
  const application = await Application.findById(applicationId)
    .populate('jobId', 'recruiterProfileId')
    .lean();

  if (!application) {
    throw new NotFoundError('Không tìm thấy đơn ứng tuyển');
  }

  // Nếu có recruiterId, kiểm tra quyền sở hữu
  if (recruiterId) {
    const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId });
    if (!recruiterProfile) {
      throw new UnauthorizedError('Bạn không phải là nhà tuyển dụng');
    }

    if (application.jobId.recruiterProfileId.toString() !== recruiterProfile._id.toString()) {
      throw new UnauthorizedError('Bạn không có quyền xem CV này');
    }
  }

  const submittedCV = application.submittedCV;

  // Kiểm tra loại CV
  if (submittedCV.source !== 'TEMPLATE') {
    throw new BadRequestError('CV này không phải là CV template. Vui lòng tải xuống file PDF.');
  }

  // Trả về dữ liệu CV để render
  return {
    applicationId: application._id,
    cvName: submittedCV.name,
    templateId: submittedCV.templateId,
    cvData: submittedCV.templateSnapshot,
    jobSnapshot: application.jobSnapshot,
    appliedAt: application.appliedAt,
  };
};
