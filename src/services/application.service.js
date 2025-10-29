import mongoose from 'mongoose';
import {
  Application,
  Job,
  User,
  CandidateProfile,
  RecruiterProfile,
  InterviewRoom,
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
  console.log("Logging activity: ", {action, detail });
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
  console.log(filter);
  
  if (options.status) {
    filter.status = options.status;
  }
  
  if (options.candidateRating) {
    filter.candidateRating = options.candidateRating;
  }
  
  if (options.isReapplied !== undefined) {
    filter.isReapplied = options.isReapplied;
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
        jobSnapshot: 1,
        // Thông tin cơ bản của ứng viên từ form hoặc từ thông tin người dùng
        candidateName: { $ifNull: ['$candidateName', '$user.fullName'] },
        candidateEmail: { $ifNull: ['$candidateEmail', '$user.email'] },
        candidatePhone: { $ifNull: ['$candidatePhone', '$user.phoneNumber'] },
        candidateAvatar: '$user.avatar',
        candidateTitle: '$candidateProfile.title',
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
      select: 'fullname avatar bio phone email address skills experiences educations certificates projects expectedSalary workPreferences preferredLocations'
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

  // Tạo và trả về đối tượng thông tin (candidateProfileId đã được populate đầy đủ)
  const applicationDetails = {
    ...application.toObject(),
    candidateAvatar: application.candidateProfileId?.avatar,
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
 * Cập nhật đánh giá ứng viên
 * @param {string} applicationId ID của đơn ứng tuyển
 * @param {string} recruiterId ID của nhà tuyển dụng
 * @param {string} rating Đánh giá mới
 * @returns {Object} Đơn ứng tuyển đã cập nhật
 */
export const updateCandidateRating = async (applicationId, recruiterId, rating) => {
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
    throw new UnauthorizedError('Bạn không có quyền cập nhật đánh giá ứng viên này');
  }
  const ratingMessage = rating === "NOT_RATED" ? "chưa được đánh giá" :
              rating === "NOT_SUITABLE" ? "không phù hợp" :
              rating === "MAYBE" ? "có thể phù hợp" :
              rating === "SUITABLE" ? "phù hợp" :
              rating === "PERFECT_MATCH" ? "rất phù hợp" : rating;
  if (application.status === 'PENDING') {
    application.status = 'REVIEWING';
  }
  logActivity(application, 'RATING_UPDATE', `Đã đánh giá đơn ứng tuyển là: ${ratingMessage}`);
  
  application.candidateRating = rating;
  await application.save();

  // Gửi thông báo cho ứng viên
  const candidateProfile = await CandidateProfile.findById(application.candidateProfileId).select('userId');
  if (candidateProfile) {
    await pushNotification(candidateProfile.userId, {
      title: 'CV của bạn đã được duyệt!',
      body: `Nhà tuyển dụng đã đánh giá hồ sơ của bạn cho vị trí "${application.jobSnapshot.title}" là: ${ratingMessage}.`,
      type: 'application',
      data: {
        url: `/my-jobs/applied` // Link để người dùng click vào sẽ mở ra
      }
    });
  }

  return application;
};

/**
 * Cập nhật ghi chú cho đơn ứng tuyển
 * @param {string} applicationId ID của đơn ứng tuyển
 * @param {string} recruiterId ID của nhà tuyển dụng
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


  logActivity(application, 'NOTES_UPDATE', "Ghi chú cập nhật: " + notes);

  application.notes = notes;
  if (application.status === 'PENDING') {
    application.status = 'REVIEWING';
  }
  await application.save();

  return application;
};

/**
 * Tạo lịch phỏng vấn cho một đơn ứng tuyển.
 * @param {string} applicationId - ID của đơn ứng tuyển.
 * @param {string} recruiterId - ID của nhà tuyển dụng (từ req.user).
 * @param {Date} scheduledTime - Thời gian phỏng vấn dự kiến.
 * @returns {Object} - Thông tin phòng phỏng vấn đã được tạo.
 */
export const scheduleInterview = async (applicationId, recruiterId, scheduledTime) => {
  // 1. Lấy thông tin cần thiết và kiểm tra quyền
  const application = await Application.findById(applicationId).populate('jobId');
  if (!application) {
    throw new NotFoundError('Không tìm thấy đơn ứng tuyển.');
  }

  const job = application.jobId;
  if (!job) {
    throw new NotFoundError('Công việc liên quan đến đơn ứng tuyển không tồn tại.');
  }

  const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId });
  if (!recruiterProfile || job.recruiterProfileId.toString() !== recruiterProfile._id.toString()) {
    throw new UnauthorizedError('Bạn không có quyền tạo phỏng vấn cho đơn ứng tuyển này.');
  }

  // 2. Kiểm tra xem đã có phỏng vấn cho đơn này chưa
  const existingInterview = await InterviewRoom.findOne({ applicationId });
  if (existingInterview) {
    throw new BadRequestError('Đã có một lịch phỏng vấn được tạo cho đơn ứng tuyển này.');
  }

  // 3. Lấy thông tin ứng viên
  const candidateProfile = await CandidateProfile.findById(application.candidateProfileId);
  if (!candidateProfile) {
    throw new NotFoundError('Không tìm thấy hồ sơ ứng viên.');
  }
  
  // 4. Tạo phòng phỏng vấn
  const roomName = `Phỏng vấn vị trí ${job.title} - Ứng viên: ${application.candidateName}`;
  const newInterview = await InterviewRoom.create({
    roomName,
    recruiterId,
    candidateId: candidateProfile.userId,
    applicationId,
    scheduledTime,
    status: 'SCHEDULED',
    changeHistory: [{
      timestamp: new Date(),
      action: 'CREATED',
      actor: recruiterId
    }]
  });

  // 5. Cập nhật trạng thái đơn ứng tuyển và ghi log
  const oldStatus = application.status;
  application.status = 'SCHEDULED_INTERVIEW';
  application.lastStatusUpdateAt = new Date();

  // Ghi log cho việc lên lịch và việc đổi trạng thái
  logActivity(application, 'INTERVIEW_SCHEDULED', 
    "Lên lịch phỏng vấn vào " + new Date(scheduledTime).toLocaleString('vi-VN'),
  );
  
  await application.save();

  // Gửi thông báo
  // Gửi cho ứng viên
  queueService.publishNotification(rabbitmq.ROUTING_KEYS.STATUS_UPDATE, {
    type: 'INTERVIEW_SCHEDULED',
    recipientId: candidateProfile.userId.toString(),
    data: {
      applicationId: application._id.toString(),
      interviewId: newInterview._id.toString(),
    },
  });


  return newInterview;
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
  const recruiterJobs = await Job.find({ 
    recruiterProfileId: recruiterProfile._id 
  }).select('_id');
  
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
  
  // Filter by rating
  if (options.candidateRating && options.candidateRating !== 'all') {
    filter.candidateRating = options.candidateRating;
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
  }).select('_id title');
  
  const jobIds = recruiterJobs.map(job => job._id);

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
  const pendingReviews = await Application.countDocuments({
    ...baseFilter,
    status: 'PENDING'
  });

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

  // Rating distribution
  const ratingDistribution = await Application.aggregate([
    { $match: baseFilter },
    {
      $group: {
        _id: '$candidateRating',
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
    ratingDistribution,
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
    logActivity(app, 'STATUS_CHANGE', `Trạng thái thay đổi thành ${newStatus} (bulk update)`);
    return app.save();
  });

  await Promise.all(updatePromises);

  return {
    success: true,
    count: applications.length
  };
};

/**
 * Bulk update rating cho nhiều applications
 * @param {string} recruiterId - ID của nhà tuyển dụng
 * @param {Array<string>} applicationIds - Array của application IDs
 * @param {string} newRating - Rating mới
 * @returns {Object} - Kết quả update
 */
export const bulkUpdateRating = async (recruiterId, applicationIds, newRating) => {
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
    app.candidateRating = newRating;
    if (app.status === 'PENDING') {
      app.status = 'REVIEWING';
    }
    logActivity(app, 'RATING_UPDATE', `Đánh giá thay đổi thành ${newRating} (bulk update)`);
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
      'Rating': app.candidateRating,
      'Notes': app.notes || '',
    };
  });

  return csvData;
};
