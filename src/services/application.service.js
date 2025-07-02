import mongoose from 'mongoose';
import Application from '../models/Application.js';
import Job from '../models/Job.js';
import User from '../models/User.js';
import CandidateProfile from '../models/CandidateProfile.js';
import RecruiterProfile from '../models/RecruiterProfile.js';
import InterviewRoom from '../models/InterviewRoom.js';
import { NotFoundError, UnauthorizedError, BadRequestError } from '../utils/AppError.js';
import logger from '../utils/logger.js';
import { publishNotification } from './queue.service.js';
import { ROUTING_KEYS } from '../queues/rabbitmq.js';

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

    const application = await Application.findById(applicationId).select('-createdAt -updatedAt -__v')
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
    throw new UnauthorizedError('Bạn không có quyền xem đơn ứng tuyển này');
  }

  // Lấy thông tin ứng viên
  const candidateProfile = await CandidateProfile.findById(application.candidateProfileId);
  if (!candidateProfile) {
    throw new NotFoundError('Không tìm thấy thông tin ứng viên');
  }

  // Tạo và trả về đối tượng thông tin
  const applicationDetails = {
    ...application.toObject(),
    candidateAvatar: candidateProfile.avatar
  };



  return applicationDetails;
};

/**
 * Cập nhật trạng thái đơn ứng tuyển
 * @param {string} applicationId ID của đơn ứng tuyển
 * @param {string} recruiterId ID của nhà tuyển dụng
 * @param {string} status Trạng thái mới
 * @returns {Object} Đơn ứng tuyển đã cập nhật
 */
export const updateApplicationStatus = async (applicationId, recruiterId, status) => {
  // Kiểm tra ID hợp lệ
  if (!mongoose.Types.ObjectId.isValid(applicationId)) {
    throw new BadRequestError('ID đơn ứng tuyển không hợp lệ');
  }

  // Lấy thông tin đơn ứng tuyển
  const application = await Application.findById(applicationId).select('-createdAt -updatedAt -__v');
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
    throw new UnauthorizedError('Bạn không có quyền cập nhật đơn ứng tuyển này');
  }

  // Cập nhật trạng thái
  application.status = status;
  application.lastStatusUpdateAt = new Date();
  await application.save();

  logger.info(`Đơn ứng tuyển ${applicationId} đã được cập nhật trạng thái thành ${status}`);

  // Gửi thông báo vào queue
  const candidateProfile = await CandidateProfile.findById(application.candidateProfileId).select('userId');
  if (candidateProfile) {
    publishNotification(ROUTING_KEYS.STATUS_UPDATE, {
      type: 'APPLICATION_STATUS_UPDATE',
      recipientId: candidateProfile.userId.toString(),
      data: {
        applicationId: application._id.toString(),
        jobTitle: application.jobSnapshot.title,
        companyName: application.jobSnapshot.company,
        newStatus: status,
      }
    });
  }

  return application;
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
  const application = await Application.findById(applicationId).select('-createdAt -updatedAt -__v');
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

  // Cập nhật đánh giá
  application.candidateRating = rating;
  await application.save();

  logger.info(`Đơn ứng tuyển ${applicationId} đã được cập nhật đánh giá thành ${rating}`);

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
  const application = await Application.findById(applicationId).select('-createdAt -updatedAt -__v');
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

  // Cập nhật ghi chú
  application.notes = notes;
  await application.save();

  logger.info(`Đơn ứng tuyển ${applicationId} đã được cập nhật ghi chú`);

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
  });

  // 5. Cập nhật trạng thái đơn ứng tuyển thành 'INTERVIEWED'
  application.status = 'INTERVIEWED';
  application.lastStatusUpdateAt = new Date();
  await application.save();

  // 6. Gửi thông báo (tùy chọn, có thể tách ra event)
  // Gửi cho ứng viên
  publishNotification(ROUTING_KEYS.STATUS_UPDATE, {
    type: 'APPLICATION_STATUS_UPDATE',
    recipientId: candidateProfile.userId.toString(),
    data: {
      applicationId: application._id.toString(),
      jobTitle: job.title,
      companyName: job.companyName, // Giả sử có trường này trong model Job
      newStatus: 'INTERVIEWED',
    },
  });

  logger.info(`Đã tạo lịch phỏng vấn ${newInterview._id} cho đơn ứng tuyển ${applicationId}.`);

  return newInterview;
};
