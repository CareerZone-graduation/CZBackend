import mongoose from 'mongoose';
import {
  Application,
  CandidateProfile,
  Job,
  RecruiterProfile,
  SavedJob,
  User,
  CV,
} from '../models/index.js';
import * as kafkaService from './kafka.service.js';
import * as queueService from './queue.service.js';
import { ROUTING_KEYS } from '../queues/rabbitmq.js';
import { NotFoundError, UnauthorizedError, BadRequestError, ForbiddenError } from '../utils/AppError.js';
import * as uploadService from './upload.service.js';
import logger from '../utils/logger.js';
import { logActivity } from './application.service.js';
import { generateEmbeddingWithRetry } from '../utils/embedding.js';
import { recordCreditTransaction } from './creditHistory.service.js';
import { TRANSACTION_TYPES, TRANSACTION_CATEGORIES } from '../constants/index.js';

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

    // // Kiểm tra và sửa coordinates nếu không đầy đủ
    // if (finalJobData.location.coordinates && 
    //     (!finalJobData.location.coordinates.coordinates || 
    //      finalJobData.location.coordinates.coordinates.length !== 2)) {
    //   // Nếu coordinates không đầy đủ, tạo tọa độ mặc định
    //   finalJobData.location.coordinates = {
    //     type: 'Point',
    //     coordinates: [106.6297, 10.8231] // Tọa độ mặc định (TP.HCM)
    //   };
    // }
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

  const query = { status: 'ACTIVE', approved: true };

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
  // Filter by status
  if (status) {
    if (status === 'PENDING') {
      // PENDING means not approved yet
      query.approved = false;
    } else {
      query.status = status;
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

  // Add search functionality with escaped regex
  if (search) {
    const escapedSearch = escapeRegex(search);
    query.$or = [
      { title: { $regex: escapedSearch, $options: 'i' } },
      { skills: { $regex: escapedSearch, $options: 'i' } }
    ];
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

  // Get application counts for these jobs
  const jobIds = jobs.map(job => job._id);
  const applicationCounts = await Application.aggregate([
    { $match: { jobId: { $in: jobIds } } },
    { $group: { _id: '$jobId', count: { $sum: 1 } } }
  ]);

  // Create a map for quick lookup
  const countMap = {};
  applicationCounts.forEach(item => {
    countMap[item._id.toString()] = item.count;
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
    recruiterProfileId: job.recruiterProfileId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    totalApply: countMap[job._id.toString()] || 0, // Add totalApply field
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

    // Kiểm tra và sửa coordinates nếu không đầy đủ
    if (finalUpdateData.location.coordinates &&
      (!finalUpdateData.location.coordinates.coordinates ||
        finalUpdateData.location.coordinates.coordinates.length !== 2)) {
      // Nếu coordinates không đầy đủ, tạo tọa độ mặc định
      finalUpdateData.location.coordinates = {
        type: 'Point',
        coordinates: [106.6297, 10.8231] // Tọa độ mặc định (TP.HCM)
      };
    }
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

  // Soft-delete bằng cách chuyển status thành 'INACTIVE'
  job.status = 'INACTIVE';
  await job.save();
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
  const { cvId, cvTemplateId, coverLetter, candidateName, candidateEmail, candidatePhone } = applicationData;

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
        cloudinaryId: selectedCV.cloudinaryId || null,
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
        cloudinaryId: copiedFile.public_id,
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
    return await generateEmbeddingWithRetry(query);
  } catch (error) {
    logger.error('Failed to generate query embedding:', {
      query: query.substring(0, 100),
      error: error.message
    });
    throw new BadRequestError('Không thể xử lý truy vấn tìm kiếm. Lỗi embeding');
  }
  // return [
  //           -0.02053595, -0.003450682,
  //           -0.013501058, -0.07958457,
  //           -0.014115734, 0.0053775734,
  //           0.0051488774, 0.002913094,
  //           -0.006378624, 0.0010083447,
  //           -0.015959412, -0.003696255,
  //           -0.0043487917, 0.010691495,
  //           0.09105804, -0.03765421,
  //           0.0119299665, -0.0053487513,
  //           0.007129684, -0.024946466,
  //           -0.0043945573, -0.030385518,
  //           0.012196934, -0.027653985,
  //           0.018619685, -0.000054237866,
  //           0.023426078, 0.004763875,
  //           0.029025557, -0.009006576,
  //           0.018084545, 0.018826872,
  //           0.009811614, 0.0025102226,
  //           0.0031565763, 0.0039821146,
  //           0.008737879, 0.02107674,
  //           -0.023097005, 0.02086294,
  //           0.0024317582, -0.0048826616,
  //           0.002908476, -0.0067869057,
  //           0.002410427, -0.010197377,
  //           -0.003316249, -0.021912944,
  //           -0.016244296, 0.02054879,
  //           0.012702998, 0.0019981954,
  //           -0.022231046, -0.14459032,
  //           -0.0013941247, -0.016421048,
  //           -0.0033818032, -0.01975478,
  //           0.025769627, 0.0040791677,
  //           -0.013586958, -0.01149629,
  //           -0.04660573, -0.016268719,
  //           -0.010690652, -0.0047434643,
  //           -0.00014065196, 0.0018406331,
  //           -0.02659576, 0.01382415,
  //           -0.007339804, 0.0037041472,
  //           -0.012264888, -0.0027670402,
  //           -0.0056000557, -0.0019707796,
  //           0.0035778678, -0.0022175517,
  //           -0.011406644, 0.06537212,
  //           -0.005303498, -0.020786399,
  //           0.0069195093, -0.021419827,
  //           -0.0017021918, -0.0060378048,
  //           -0.009556566, 0.0054831225,
  //           -0.0057939366, 0.0109921135,
  //           -0.006201041, -0.02928441,
  //           -0.0024158894, 0.029397827,
  //           0.011296722, 0.011165361,
  //           0.004459511, 0.026045106,
  //           0.0063461782, 0.00031273623,
  //           0.0124058565, -0.020370819,
  //           -0.013529869, 0.023467567,
  //           -0.0150409425, 0.003544892,
  //           -0.0074596787, 0.005107637,
  //           -0.012364835, 0.0043300753,
  //           0.011607447, 0.011551574,
  //           0.020438796, 0.03032996,
  //           0.000506446, -0.20161285,
  //           0.020586243, -0.0034666893,
  //           -0.0051463395, 0.0024408007,
  //           0.030224748, -0.010651169,
  //           -0.013139091, 0.002423182,
  //           -0.010392099, -0.0075703613,
  //           0.0011705627, 0.0088393865,
  //           -0.007290179, 0.002108714,
  //           0.02412573, -0.0079521695,
  //           -0.0149976285, -0.01748227,
  //           -0.006563092, 0.0006687122,
  //           -0.0011813362, -0.00471555,
  //           0.013530036, 0.021371728,
  //           0.009419787, -0.0029141598,
  //           -0.0014741258, 0.011062544,
  //           0.015030392, 0.004759494,
  //           -0.00492754, 0.0051210043,
  //           0.006476262, 0.0003205214,
  //           -0.018983396, 0.0039026563,
  //           0.017405234, 0.0030108471,
  //           0.00063525734, -0.063083924,
  //           -0.011989686, -0.009668985,
  //           -0.009799977, -0.0047385986,
  //           -0.00895215, -0.0143486,
  //           0.017786985, 0.0100374855,
  //           -0.017257174, -0.004294965,
  //           -0.01163616, 0.02077402,
  //           -0.00835878, 0.009439882,
  //           -0.049454074, 0.011530373,
  //           -0.014105275, -0.0072611766,
  //           0.007405145, -0.0013656922,
  //           0.008775071, -0.010776084,
  //           -0.0011966552, -0.021920266,
  //           0.009753677, -0.0006413645,
  //           0.01275759, -0.00805879,
  //           -0.008650003, -0.011714985,
  //           0.006929858, -0.0054207896,
  //           -0.01886048, 0.0029492509,
  //           0.0005542904, 0.013858457,
  //           0.00013130403, -0.0034701347,
  //           0.0072328304, 0.027570179,
  //           -0.015211133, 0.0010776964,
  //           0.011326543, 0.009896942,
  //           -0.010124982, -0.020167362,
  //           -0.0036003934, -0.013273219,
  //           0.00351719, -0.013150268,
  //           0.010741902, -0.032138135,
  //           0.007345027, 0.034543328,
  //           -0.009769728, -0.020530155,
  //           0.0032007678, -0.012183881,
  //           0.009841423, -0.015930131,
  //           0.012935606, -0.02057669,
  //           -0.0041850004, -0.0038776842,
  //           0.035770636, -0.004755886,
  //           -0.0019322059, 0.011183836,
  //           -0.017029673, -0.009254539,
  //           -0.013952077, -0.0032542688,
  //           0.003341043, 0.008755102,
  //           -0.018669784, 0.016285261,
  //           -0.028456207, -0.0077383807,
  //           -0.0073974947, -0.0018861442,
  //           -0.0155275315, 0.025896834,
  //           0.0000691785, 0.01250062,
  //           0.003095155, -0.00023522551,
  //           -0.0015263662, -0.0019505373,
  //           0.012861535, 0.01063844,
  //           -0.009918281, 0.005187134,
  //           -0.012750618, -0.02043903,
  //           0.025163332, 0.008621708,
  //           -0.027670942, -0.0036353949,
  //           0.023138179, -0.019550124,
  //           -0.020033168, -0.010579977,
  //           -0.0070896926, 0.011963907,
  //           -0.0024814107, -0.027507458,
  //           -0.033026703, -0.0085488055,
  //           -0.012082976, 0.0076073334,
  //           -0.015685664, 0.013340837,
  //           -0.020471755, 0.003473795,
  //           0.00023630953, -0.005603364,
  //           -0.007855149, 0.010554807,
  //           -0.020898147, -0.0121262465,
  //           -0.12625276, 0.023307124,
  //           0.0077393386, -0.0080875335,
  //           0.021339873, 0.02883638, 0.02231641,
  //           -0.0083996905, -0.011360028,
  //           -0.005768593, 0.004252002,
  //           -0.008977302, 0.0023907595,
  //           -0.012847637, 0.0072818566,
  //           -0.00286556, -0.014283586,
  //           -0.003554338, 0.022953017,
  //           -0.01794865, 0.0017343598,
  //           0.03931862, 0.011738977,
  //           -0.011519121, 0.0042779697,
  //           -0.0018809806, 0.004115808,
  //           0.04208313, 0.014558026,
  //           -0.016776016, -0.009084153,
  //           -0.008088846, 0.026708692,
  //           -0.0043309648, 0.0036767456,
  //           -0.015354695, 0.0036650968,
  //           -0.004264285, -0.011964341,
  //           -0.027964292, 0.009517792,
  //           0.005604353, 0.016928885,
  //           -0.000053117, 0.0334167,
  //           0.0061867298, -0.020951109,
  //           -0.014922288, 0.0016839424,
  //           -0.004542354, -0.009883824,
  //           0.001398908, 0.03481271,
  //           -0.005154205, -0.011832409,
  //           -0.009642468, 0.019501714,
  //           -0.003072626, -0.0030880424,
  //           0.0024260227, 0.022748299,
  //           -0.011620704, 0.011944271,
  //           -0.013086616, 0.009223753,
  //           0.009771104, 0.00082653156,
  //           -0.0036077471, -0.023468135,
  //           -0.0023129706, -0.00062582,
  //           -0.0045756768, -0.006444995,
  //           -0.03067623, 0.0040294, 0.009603188,
  //           -0.0046885945, 0.0037579753,
  //           0.0065372367, 0.016104309,
  //           0.0133757545, -0.013060072,
  //           -0.012827537, 0.027852757,
  //           0.0035402467, -0.0004246872,
  //           0.0001449685, 0.011796185,
  //           0.015790602, -0.017779786,
  //           0.009216855, 0.0028131723,
  //           -0.00065999763, -0.0038726586,
  //           -0.014774169, 0.0011704232,
  //           -0.020378, 0.004064891, 0.010014322,
  //           0.015094978, -0.026238024,
  //           -0.00024695162, 0.008924697,
  //           -0.011915251, 0.018837988,
  //           0.036475427, 0.015194282, 0.0131963,
  //           -0.005720105, 0.02137592,
  //           -0.017253531, -0.01317599,
  //           -0.0013835023, -0.003062248,
  //           -0.016227549, 0.0020631996,
  //           0.010029884, 0.0056664916,
  //           -0.0070105763, 0.0043139975,
  //           -0.010130596, -0.015762703,
  //           -0.016489709, 0.0076934346,
  //           -0.0072761984, 0.0054521537,
  //           -0.021222003, 0.030731304,
  //           0.0067976858, -0.010349077,
  //           0.0013952724, -0.008706761,
  //           -0.0111534335, 0.00008133567,
  //           0.004985115, -0.018574934,
  //           0.010720957, -0.009127996,
  //           0.021866258, 0.011574327,
  //           -0.0017110772, 0.001339858,
  //           0.031616297, -0.0076518375,
  //           0.0000671193, 0.0018198448,
  //           -0.028472072, 0.01161372,
  //           -0.0028494264, -0.02753124,
  //           0.0004641746, -0.006786355,
  //           0.0047536097, -0.0037084767,
  //           0.011546093, 0.016413296,
  //           -0.007011354, -0.009580239,
  //           0.014682716, -0.016304713,
  //           -0.026841955, -0.003057948,
  //           -0.006458169, 0.0139872525,
  //           0.0061579645, 0.0019652033,
  //           0.0063238847, 0.012650737,
  //           0.00980929, -0.0003824945,
  //           0.013346352, 0.019445911,
  //           -0.034596287, -0.00918345,
  //           0.004947661, -0.0035665736,
  //           0.009143542, 0.0007895448,
  //           -0.003433816, -0.01725256,
  //           0.01801967, 0.0052815946,
  //           -0.023777923, 0.001002597,
  //           0.012694112, 0.019261254,
  //           -0.0037163964, 0.013709183,
  //           -0.008467058, -0.0058014565,
  //           0.008377828, -0.022882277,
  //           -0.019989232, 0.007750383,
  //           -0.017015832, 0.009700761,
  //           -0.006986119, 0.0024701795,
  //           0.0043181647, 0.0066517685,
  //           -0.0070845387, -0.008475612,
  //           0.009447892, 0.002806624,
  //           -0.0040884106, 0.00023057513,
  //           -0.003235726, 0.017500998,
  //           0.00040491752, 0.0032130592,
  //           -0.0030299916, -0.0045251795,
  //           -0.0067776106, -0.023928735,
  //           0.022101557, 0.026119372,
  //           -0.013847809, 0.026916182,
  //           -0.0186609, 0.008169375, 0.02607308,
  //           -0.001340348, 0.005185691,
  //           0.009680196, 0.007959403,
  //           -0.015183871, -0.014315675,
  //           -0.010555125, -0.019293971,
  //           -0.017617581, 0.010433775,
  //           -0.0008265115, -0.009920709,
  //           0.010240209, 0.0049795727,
  //           -0.0006401904, 0.018474866,
  //           -0.007994033, 0.010486027,
  //           -0.014632622, 0.01008617,
  //           -0.0052285288, -0.0039268103,
  //           -0.0021729686, 0.008604181,
  //           -0.011590825, -0.013696024,
  //           0.019746576, -0.003967346,
  //           0.026844546, 0.025846979,
  //           -0.0090203155, 0.018124582,
  //           0.0020256308, -0.00053273025,
  //           0.0043385434, -0.0045277034,
  //           -0.014389748, 0.0013528629,
  //           0.0035276953, -0.009837334,
  //           0.008519379, 0.0057457653,
  //           -0.010823542, 0.0005741081,
  //           0.006322875, 0.0028595629,
  //           0.03768062, 0.005023706, -0.1365557,
  //           0.007273092, 0.00208762,
  //           0.0006521973, -0.03395029,
  //           0.008119843, 0.023853889,
  //           0.0029827617, -0.012706379,
  //           -0.0041826856, -0.0004972102,
  //           0.00538652, 0.009430757,
  //           -0.010556345, 0.006657198,
  //           -0.021781607, 0.012136186,
  //           -0.013620604, 0.024646636,
  //           -0.01776425, -0.028715724,
  //           0.01781994, -0.012554575,
  //           -0.0011797029, -0.0026956361,
  //           0.0049436577, 0.0027295356,
  //           -0.011574687, -0.0071203634,
  //           -0.010058143, 0.0021639462,
  //           -0.00006462082, -0.004138685,
  //           -0.022350304, -0.003426527,
  //           0.009322202, 0.0008171012,
  //           -0.00906182, 0.024879707,
  //           0.013988071, 0.005064112,
  //           0.018009327, -0.004671321,
  //           -0.021686248, -0.0044513936,
  //           -0.017357636, 0.015742982,
  //           -0.025885256, -0.04054245,
  //           0.010180671, -0.015125769,
  //           0.0012640317, 0.013558679,
  //           -0.011741847, 0.004624846,
  //           -0.00905804, 0.010254721,
  //           -0.011655763, -0.028041389,
  //           0.015684385, 0.0049872776,
  //           0.01879463, 0.027617153,
  //           0.025247082, -0.00007569899,
  //           0.0069264737, 0.009834081,
  //           -0.016776536, 0.01630131,
  //           -0.01015724, 0.00805351,
  //           0.0024705385, -0.0043957694,
  //           0.0014082162, 0.016500056,
  //           0.0022169477, 0.008979635,
  //           -0.013206189, 0.04246973,
  //           -0.0010287275, -0.009719504,
  //           0.0009107289, -0.06963703,
  //           0.032215357, -0.0037379386,
  //           -0.011793045, -0.006906296,
  //           0.006297856, 0.0016136565,
  //           -0.014106962, -0.002658786,
  //           0.0021320276, -0.008211698,
  //           -0.006900494, 0.0004822479,
  //           0.0029889466, -0.0042473758,
  //           0.00028378548, -0.0017706319,
  //           -0.013981725, -0.021553403,
  //           0.021739412, -0.011844472,
  //           0.0026617856, 0.019244589,
  //           -0.0047253347, -0.0060157874,
  //           0.025410967, -0.0028638064,
  //           0.016951423, 0.008210091,
  //           -0.004488423, 0.00059013674,
  //           -0.13028063, 0.00037575795,
  //           -0.010481783, -0.0028374782,
  //           0.008911126, -0.0022697614,
  //           0.0045075356, 0.001629289,
  //           0.0035431643, 0.00095243164,
  //           0.004953608, -0.014118319,
  //           -0.017020702, -0.0015189879,
  //           -0.009577376, 0.1732748,
  //           0.025440896, -0.005966957,
  //           -0.01559061, -0.016593352,
  //           -0.008288367, -0.014362635,
  //           -0.0050010397, 0.0075300066,
  //           0.005624144, 0.005048315,
  //           -0.009670381, -0.0012261001,
  //           0.013748468, 0.0048394636,
  //           0.008149281, 0.0100044925,
  //           -0.0043607387, -0.0055003376,
  //           -0.009794851, 0.00634614,
  //           0.0064813835, 0.013689798,
  //           0.038820766, 0.004561255,
  //           -0.0015525818, -0.0074052797,
  //           0.012389944, -0.03076642,
  //           -0.030133426, -0.007497015,
  //           -0.0028309166, -0.008306257,
  //           -0.0057198503, -0.0024235663,
  //           -0.026692363, -0.09967704,
  //           0.0052685505, 0.008777699,
  //           0.002389312, 0.0020113494,
  //           0.0060546794, -0.007832893,
  //           -0.00782952, -0.039069667,
  //           -0.010316182, -0.025509637,
  //           -0.009884423, -0.0391262,
  //           -0.019644914, 0.0077958736,
  //           0.00958554, 0.012842003,
  //           -0.0034040269, -0.024777772,
  //           0.004432936, 0.0030726928,
  //           -0.01224056, 0.0107111465,
  //           -0.00400913, -0.019702308,
  //           0.012146069, 0.014791225,
  //           -0.011534222, -0.015800055,
  //           0.006689599, 0.027976835,
  //           0.011267289, -0.011955958,
  //           -0.006574629, -0.018361121,
  //           0.0042596394, 0.01446844,
  //           -0.022107052, -0.0123479,
  //           0.003175854, 0.0048891627,
  //           0.030026933, -0.007924385,
  //           -0.0054828534, 0.013103994,
  //           -0.036308534, 0.019496398,
  //           -0.00010107211, -0.010550376,
  //           -0.017331777, -0.024595724,
  //           0.010004011, -0.031051332,
  //           0.0013326437, 0.017242992,
  //           0.035426952, 0.015367176,
  //           -0.007665596, 0.015662726,
  //           -0.00032757554, -0.0020342753,
  //           -0.006277874, 0.0039288234,
  //           0.00010682686, 0.013138132,
  //           0.003560399, -0.0084895715,
  //           -0.0011524551, -0.005189979,
  //           0.012983822, 0.008392648,
  //           0.014676853, 0.0013907469,
  //           0.0022761372, 0.003196286,
  //           -0.012270848, 0.006364913,
  //           -0.0031238475, 0.006886852,
  //           -0.0057973303, -0.012314702,
  //           0.0036142308, -0.00071378873,
  //           0.002880971, 0.005518858,
  //           0.001511658, -0.009576652,
  //           -0.015339234, -0.009902069,
  //           0.0055293124, 0.02186515,
  //           -0.0033189, -0.012607346,
  //           0.0084285755, -0.009255287,
  //           -0.006385751, 0.0054056384,
  //           -0.004661514, 0.00025001215,
  //           -0.008633075, -0.019878464,
  //           -0.013366029, -0.0033416222,
  //           0.02991567, 0.01742984, 0.01171814,
  //           0.017420217, 0.004021486,
  //           -0.021616397, 0.02128292,
  //           0.034022983, -0.0035097816,
  //           0.010690218, 0.0024523586,
  //           -0.007028266, 0.0028320616,
  //           -0.008214915, 0.0023514132,
  //           -0.0026329283, 0.01287472,
  //           -0.00038863753, 0.0025844737,
  //           0.0036610719, -0.0041079535,
  //           0.002755614, -0.00883878,
  //           -0.0029149924, -0.014963735,
  //           -0.0130977575, -0.0077532884,
  //           0.011469591, -0.007843678,
  //           0.018969607, -0.014852121,
  //           0.014641973, 0.0010574482,
  //           -0.0069630775, -0.0026128853,
  //           -0.0011206353, -0.0010519526,
  //           -0.012811081, 0.0051877154,
  //           -0.008488442, 0.006927739,
  //           -0.0052550854, -0.0055182897,
  //           0.0040973723, -0.006781976,
  //           0.00056367496, 0.0015364145,
  //           0.0016513006, -0.0028639508,
  //           -0.010450369, 0.0027167092,
  //           0.010394416, -0.02604896,
  //           0.0049714586, 0.008171085,
  //           -0.006841557, -0.0011895212,
  //           0.01743576, -0.0003029889,
  //           0.02214792, -0.0040384163,
  //           -0.002504874, -0.007190448,
  //           0.0038697447, -0.0013300136,
  //           -0.01156597, -0.018305028,
  //           0.0016717279, -0.0005604926,
  //           0.0008069345, 0.03575861,
  //           0.005345495, -0.00714843,
  //           0.023068095, 0.0101859635,
  //           0.013642663, -0.0076112696,
  //           -0.007654442, -0.0032526439,
  //           -0.007844371, -0.0038778675,
  //           -0.0112837255, -0.00450853,
  //           -0.003457604, -0.008205534,
  //           0.0059887893, 0.0013877596,
  //           0.010537266, -0.0031642632,
  //           0.000015276093, 0.01802377,
  //           -0.007944921, -0.006171912,
  //           -0.0032531847, -0.017206568,
  //           0.00070758944, -0.011366701,
  //           -0.0017027424, 0.00087019685,
  //           -0.015750034, -0.0060676006,
  //           0.0094656665, 0.00591345,
  //           0.008121316, -0.0017293813,
  //           -0.0061474936, -0.00094111444,
  //           0.010358991, 0.012985164,
  //           -0.0113323955, -0.0020699792,
  //           0.00084896974, 0.0027636061,
  //           0.0066631017, -0.022991132,
  //           0.0024970346, 0.007380959,
  //           -0.0048998427, 0.002092563,
  //           0.0008278062, 0.00038276947,
  //           0.017390894, 0.0019196314,
  //           -0.008542164, -0.016497454,
  //           0.0036385162, -0.014023177,
  //           -0.0017445546, 0.005199417,
  //           -0.018504288, 0.017997783,
  //           0.010037604, 0.013718408,
  //           -0.0023221327, -0.013997089,
  //           -0.016561223, 0.0047898865,
  //           0.0033297779, -0.0031681957,
  //           -0.0046783066, -0.01230278,
  //           0.0008220659, -0.008611058,
  //           -0.007439035, 0.010826157,
  //           -0.0037806376, -0.002808036,
  //           -0.001198546, 0.012441614,
  //           -0.0040385784, 0.01114516,
  //           -0.011114778, -0.0059639844,
  //           -0.0062951986, 0.004037169,
  //           0.0026471121, 0.10793884,
  //           0.016634574, 0.0033700438,
  //           -0.004005357, -0.012357707,
  //           -0.00824135, -0.0009247062,
  //           -0.026784359, -0.008855664,
  //           -0.009276652, -0.002467539,
  //           -0.0021090088, -0.004710727,
  //           -0.0031846846, -0.008606559,
  //           0.0028346486, -0.009288405,
  //           -0.010665844, 0.0007985369,
  //           -0.0030781333, -0.011906134,
  //           0.015438251, 0.0048491014,
  //           -0.00668292, -0.012016687,
  //           0.013376991, -0.0007529317,
  //           -0.0034714332, -0.020356158,
  //           -0.005539869, 0.011266125,
  //           0.012871636, -0.009090021,
  //           0.016812023, 0.01080049,
  //           -0.0025046223, 0.0028834005,
  //           0.007560306, -0.0029997663,
  //           0.017470457, -0.011367796,
  //           -0.0063290005, 0.012131277,
  //           0.0045638583, 0.001305578,
  //           0.010573046, 0.0014671261,
  //           0.008742343, -0.0010961335,
  //           -0.0068087312, -0.0032678344,
  //           0.009291335, -0.0055913012,
  //           -0.0014156591, 0.00715805,
  //           0.007754611, 0.0086611705,
  //           -0.004872847, 0.013668959,
  //           0.007002133, 0.0039263633,
  //           0.0064427564, 0.0035852336,
  //           0.018224198, -0.0015401089,
  //           0.0014028425, -0.008019895,
  //           0.0027649307, 0.010481667,
  //           -0.0037741563, -0.010663522,
  //           0.0039347145, -0.010908122,
  //           -0.00081704877, 0.06753668,
  //           0.009095732, -0.0051533296,
  //           0.006974109, -0.0018124888,
  //           0.009802635, -0.008883906,
  //           0.004169753, -0.0038870843,
  //           -0.0035554832, 0.011139202,
  //           0.005056707, 0.0032341185,
  //           -0.007580126, 0.0042902706,
  //           0.007821518, -0.017538186,
  //           -0.020738352, 0.0050881454,
  //           0.008142555, 0.0042340998,
  //           -0.007976944, 0.124853484,
  //           -0.016938284, 0.014976899,
  //           0.0028011096, 0.002066103,
  //           -0.015372582, 0.0044511557,
  //           0.009908316, -0.018371996,
  //           -0.010638307, -0.01894535,
  //           0.0050034067, 0.01015208,
  //           -0.012750704, -0.010618564,
  //           0.0027452598, 0.007890084,
  //           0.0011049671, 0.0054421597,
  //           -0.01447457, 0.002918292,
  //           0.008390642, -0.0015242321,
  //           0.006441278, 0.01868485,
  //           -0.0016964988, -0.014085836,
  //           -0.003046374, 0.0084995525,
  //           0.008084314, 0.0016925453,
  //           0.00076545175, 0.00008336239,
  //           -0.013248533, -0.0141926035,
  //           -0.009088038, 0.008506991,
  //           -0.011410773, -0.015175061,
  //           0.0069762836, -0.0013456934,
  //           0.0027218745, 0.008676378,
  //           0.0047769397, 0.0013048121,
  //           -0.015956895, 0.009456955,
  //           0.0013638522, -0.015422604,
  //           0.022182776, -0.0056922827,
  //           0.0001089002, -0.001294236,
  //           -0.003522418, -0.0033370245,
  //           0.00077078363, -0.0070547936,
  //           -0.010322715, 0.012746721,
  //           0.005832036, -0.0073648146,
  //           0.017353127, -0.0012146955,
  //           0.016144374, 0.00884971,
  //           -0.010803042, -0.004855762,
  //           0.0086480165, -0.0027353477,
  //           0.008840768, 0.009334798,
  //           0.010800381, 0.007522247,
  //           -0.0028393706, -0.0030253518,
  //           -0.009704027, 0.010067126,
  //           0.0064191665, -0.012644965,
  //           0.009387255, 0.0006524189,
  //           -0.006803211, 0.015401986,
  //           0.005498021, 0.007948164,
  //           -0.0048622955, -0.0036479915,
  //           -0.010886264, 0.0046869805,
  //           -0.0073706526, -0.0020892867,
  //           -0.007870786, -0.0007996356,
  //           0.005632494, 0.00781392,
  //           -0.012364545, 0.017716719,
  //           -0.0024087382, 0.002396327,
  //           0.0032854192, 0.009544603,
  //           0.0072383676, 0.0038143145,
  //           -0.0023698886, -0.012207959,
  //           -0.0137580335, 0.00078118837,
  //           -0.009296357, -0.009203889,
  //           0.001539888, 0.0071394066,
  //           0.005565194, -0.018242536,
  //           -0.0078621395, -0.010210624,
  //           -0.012055989, -0.005701814,
  //           0.009939434, 0.0109023135,
  //           0.0058282726, -0.0143818995,
  //           0.013786168, 0.0005457126,
  //           0.0095501235, -0.0038282648,
  //           -0.0012733048, -0.0036201186,
  //           -0.012399198, 0.02413582,
  //           -0.00052063284, 0.0064705615,
  //           0.0031806314, -0.018595463,
  //           -0.0070913937, -0.015228183,
  //           -0.00018296577, -0.026613493,
  //           0.00026174326, -0.022858553,
  //           -0.0075923884, 0.006664989,
  //           -0.0011421136, 0.0014736999,
  //           -0.006739081, -0.0047976007,
  //           -0.009318383, 0.00886796,
  //           0.004467296, -0.007247096,
  //           0.0006904407, 0.005574383,
  //           0.017159447, -0.007927807,
  //           -0.018293725, -0.0049085063,
  //           -0.0003935259, -0.0040457323,
  //           -0.0020991496, 0.0146793565,
  //           -0.011350973, 0.013506739,
  //           -0.08017885, 0.01952381,
  //           0.010234871, 0.007274906,
  //           0.0070178485, 0.011356785,
  //           0.013700108, -0.0051019127,
  //           -0.004077535, 0.00046101553,
  //           -0.0028714975, -0.0044923956,
  //           -0.0022615967, 0.007732471,
  //           -0.0045182705, 0.0018393213,
  //           -0.0050285533, 0.007844639,
  //           0.0020367098, -0.0126050785,
  //           0.0050422996, 0.014612111,
  //           -0.009816603, -0.004333679,
  //           0.015128264, 0.0014467424,
  //           0.008065344, 0.012896788,
  //           -0.006088336, -0.000052129526,
  //           0.01461901, -0.0052724197,
  //           0.010066398, -0.0121215405,
  //           0.0027779234, -0.0043071075,
  //           0.018682625, -0.010403711,
  //           -0.006306426, 0.0009400927,
  //           0.017663563, -0.010513787,
  //           -0.012610986, 0.012613812,
  //           -0.00814026, -0.0055770273,
  //           0.01832643, 0.0023767494,
  //           0.016992263, -0.0066269715,
  //           -0.0077956375, -0.0034961079,
  //           0.0009097756, -0.005809208,
  //           0.013854554, -0.003368222,
  //           -0.0035138398, 0.005302779,
  //           -0.0031252422, -0.010032508,
  //           0.017029872, -0.0008128583,
  //           0.008989632, -0.017571429,
  //           -0.0033017502, -0.0061983312,
  //           -0.0009800546, -0.008196019,
  //           -0.013382847, -0.012804158,
  //           0.005883161, -0.013806257,
  //           0.0041333945, 0.018182304,
  //           -0.015425665, -0.000018700892,
  //           0.008212647, 0.023708694,
  //           0.008520637, 0.0024849633,
  //           0.0030766143, 0.0037407794,
  //           0.0047726524, -0.015757231,
  //           -0.0013135076, -0.0063727833,
  //           -0.012550604, 0.0034649943,
  //           -0.0072370376, -0.016286012,
  //           -0.004502474, -0.0032454592,
  //           0.011261536, 0.0012540361,
  //           0.004314096, 0.002758009,
  //           0.0021189812, 0.0123792235,
  //           0.00957575, 0.0017801088,
  //           -0.0017386805, -0.01646566,
  //           0.027747063, -0.0050332556,
  //           0.0020303878, 0.0015020625,
  //           0.011451367, -0.009084246,
  //           0.016923148, 0.0031722633,
  //           -0.0011959319, 0.0037240544,
  //           0.011083363, 0.002222053,
  //           0.0039464543, -0.01772372,
  //           -0.00081333664, -0.00125416,
  //           0.011160288, 0.003271207,
  //           0.009183813, 0.022405785,
  //           0.0006411178, -0.022282857,
  //           0.0021666011, 0.007934192,
  //           0.004850858, -0.00919008,
  //           0.007823049, 0.0010729411,
  //           -0.009322249, 0.0118531445,
  //           0.01969479, -0.0010467535,
  //           -0.01787841, 0.004943331,
  //           0.017675273, 0.016700981,
  //           0.016127229, 0.004890375,
  //           0.0028236005, -0.009883778,
  //           0.0026906377, -0.0008991975,
  //           0.005466975, -0.0036686717,
  //           -0.0073107434, -0.017141774,
  //           0.0024782743, 0.0105657615,
  //           0.0037441836, 0.006970192,
  //           0.0072330516, 0.023875041,
  //           -0.021705626, -0.013588992,
  //           0.00053853047, 0.0033587387,
  //           -0.0019112402, 0.0033236067,
  //           -0.00036960357, 0.002936453,
  //           0.0073923077, -0.008562373,
  //           -0.0023514328, -0.008332374,
  //           -0.018814627, -0.003849815,
  //           -0.0037602826, -0.00048073864,
  //           0.006615105, 0.0044467086,
  //           0.004488001, 0.017361287,
  //           0.0022375775, 0.0027346693,
  //           -0.009291926, 0.0129095055,
  //           -0.0037952792, -0.0049777916,
  //           -0.0056948927, 0.0021745143,
  //           0.006011933, 0.014349838,
  //           -0.009105238, -0.004448033,
  //           0.0015699355, 0.007138763,
  //           -0.009311985, 0.02966088,
  //           -0.011099397, -0.0072772712,
  //           -0.007330659, 0.005027387,
  //           0.0035049983, -0.010309137,
  //           0.013377837, -0.0033710268,
  //           -0.00023510506, -0.009006919,
  //           0.0036050244, -0.008940035,
  //           0.007104923, 0.00010826191,
  //           -0.007367549, -0.10026974,
  //           -0.0073646973, 0.0074586635,
  //           0.0032985278, -0.0059501408,
  //           0.0069645843, -0.008913933,
  //           0.005204518, -0.016663829,
  //           -0.0015011807, -0.009798931,
  //           -0.002537088, -0.008194962,
  //           -0.044475533, -0.0022829853,
  //           -0.012105831, 0.0055289427,
  //           -0.008211559, 0.003227787,
  //           0.007865688, -0.005440172,
  //           -0.0007002176, 0.0026937863,
  //           0.010075322, 0.0130772935,
  //           0.0027585484, -0.0025515158,
  //           -0.011245747, 0.001203166,
  //           0.00896099, -0.012920154,
  //           -0.0017097213, -0.0043653245,
  //           0.008510895, 0.011044573,
  //           -0.010472397, 0.023984129,
  //           0.01329996, -0.13904913,
  //           -0.0015354293, -0.0026337155,
  //           0.011608778, -0.01741335,
  //           0.012303697, -0.0014850727,
  //           -0.020182576, 0.012991928,
  //           0.0026845948, 0.000050090784,
  //           -0.0036760515, -0.0012976554,
  //           -0.014725354, -0.0057954155,
  //           -0.0032130878, -0.020958057,
  //           -0.01198788, -0.017042233,
  //           -0.001795555, 0.0007567079,
  //           -0.012472134, -0.0035118023,
  //           0.016353194, -0.0029222728,
  //           -0.015721083, 0.001317621,
  //           0.0006100249, 0.0010004301,
  //           0.017784834, 0.0006371093,
  //           0.00012423625, 0.005481544,
  //           0.006784317, 0.0023598205,
  //           -0.0142531935, 0.003710625,
  //           -0.010446627, -0.012980954,
  //           -0.012144336, 0.00937432,
  //           0.019309094, 0.0039879633,
  //           0.015168827, 0.01630584,
  //           -0.012980014, 0.010796688,
  //           -0.00019791618, -0.015045794,
  //           -0.019067017, -0.0028227959,
  //           0.010656506, -0.002385309,
  //           -0.014831555, -0.0063910247,
  //           -0.007824979, 0.02091859,
  //           0.019010212, -0.0033329562,
  //           -0.01093623, 0.0005178705,
  //           -0.01547709, 0.00016819392,
  //           -0.0052982825, -0.0035390744,
  //           0.008428067, -0.00080563914,
  //           0.005432525, 0.0038927437,
  //           -0.0021406198, -0.010005446,
  //           -0.0013979373, 0.0003001089,
  //           -0.0068866275, 0.0061819344,
  //           0.022984631, 0.017911997,
  //           0.0011681813, 0.005348185,
  //           -0.011977942, 0.012412701,
  //           -0.00056269503, -0.025495721,
  //           -0.0154590225, -0.0048473338,
  //           -0.021988917, -0.02570002,
  //           -0.010005362, 0.009312543,
  //           -0.0146755185, 0.025472432,
  //           -0.006046683, -0.0066538407,
  //           -0.011886615, -0.019998057,
  //           0.007821766, 0.0039735977,
  //           -0.010072262, -0.010220933,
  //           0.0019647405, 0.005386032,
  //           0.020331167, 0.011251883,
  //           -0.0127948625, 0.00344445,
  //           0.02807641, -0.016585747,
  //           0.008449721, -0.010411644,
  //           -0.01917046, -0.00096820534,
  //           0.006083529, 0.0041693985,
  //           -0.004803139, -0.0024269212,
  //           0.022665467, 0.0010030878,
  //           0.026355185, -0.010928269,
  //           -0.009158075, 0.0025776045,
  //           -0.0006571374, -0.0011409915,
  //           0.0053375578, 0.0038571511,
  //           0.008581891, -0.011335328,
  //           -0.004991062, 0.0002996704,
  //           0.017414702, -0.0031913754,
  //           0.0066104103, -0.0024046467,
  //           -0.017731706, -0.0023126793,
  //           -0.0099444445, 0.011384485,
  //           0.006790488, -0.007880972,
  //           -0.011710036, 0.0049202796,
  //           -0.0041842544, -0.0019965838,
  //           0.009015405, -0.013455203,
  //           -0.0025401015, 0.011973729,
  //           0.01916183, 0.00636096,
  //           -0.014649758, -0.006874623,
  //           -0.003843695, 0.0069302246,
  //           -0.010341751, 0.018014317,
  //           -0.0024475425, 0.0051195077,
  //           -0.0009098948, -0.004654814,
  //           0.012084243, -0.005369468,
  //           0.016087284, -0.011586713,
  //           0.005454846, -0.005329794,
  //           0.022745889, -0.017781947,
  //           -0.007217535, 0.0051107686,
  //           0.0046539316, 0.0079643205,
  //           -0.006765325, 0.029119788,
  //           -0.011344632, 0.0018513452,
  //           0.013816772, 0.014595214,
  //           0.002130998, -0.00061334064,
  //           -0.018095838, -0.027737014,
  //           -0.015614115, 0.0058286726,
  //           -0.004025498, -0.0071135806,
  //           0.014757716, -0.0013537297,
  //           0.013694594, 0.005717461,
  //           0.0014022094, -0.026035666,
  //           -0.014525526, 0.013518559,
  //           -0.01013523, -0.007627642,
  //           -0.004160417, -0.024878599,
  //           -0.0030784467, -0.01990227,
  //           0.0098648025, -0.0014565495,
  //           0.0023638238, 0.0019895418,
  //           -0.12261401, -0.022113895,
  //           0.008854902, -0.006112194,
  //           0.000951966, -0.011330861,
  //           0.008562938, 0.003546774,
  //           0.005789907, -0.017119924,
  //           0.016830472, 0.007791773,
  //           -0.0011817948, -0.010620223,
  //           -0.0010694929, -0.0052445848,
  //           0.004610156, -0.0043911897,
  //           -0.008974598, -0.0027721499,
  //           -0.018565051, -0.015957462,
  //           0.011031334, 0.025386563,
  //           -0.01560203, -0.024346724,
  //           0.007879293, -0.0062714755,
  //           -0.0025591112, 0.017158343,
  //           0.0070737377, -0.007016472,
  //           0.0010214342, -0.0111794295,
  //           0.008275416, -0.01798784,
  //           0.00062128744, 0.011925808,
  //           0.0011472859, -0.0005251242,
  //           0.005848116, -0.016678175,
  //           0.009165568, -0.018447377,
  //           0.0025086687, -0.008744554,
  //           -0.03455773, 0.02426699,
  //           -0.016702939, -0.0001320094,
  //           0.018419651, -0.009656951,
  //           0.0029078599, 0.009893067,
  //           0.008381234, -0.008652298,
  //           0.008187126, 0.0024956237,
  //           -0.0018538581, -0.022834897,
  //           0.0069148405, -0.0043664537,
  //           0.00009212909, -0.003738417,
  //           0.017498909, 0.0049682693,
  //           0.008837292, 0.175744, -0.004303534,
  //           0.019212913, -0.005145266,
  //           0.004784475, 0.019439247,
  //           0.0049809646, -0.0007073385,
  //           -0.024288706, -0.013762371,
  //           -0.0013207259, -0.0012253838,
  //           0.01111886, -0.017947242,
  //           -0.0032296008, 0.00603068,
  //           -0.005864173, -0.0011647304,
  //           0.012401554, 0.01453566,
  //           -0.0064671454, 0.007213778,
  //           -0.025978502, -0.0037688233,
  //           0.0051616393, 0.009075741,
  //           -0.0071063885, 0.014269952,
  //           -0.009546606, 0.014452616,
  //           0.00966356, -0.0007660099,
  //           -0.0075339805, -0.009811032,
  //           0.021726575, -0.009628476,
  //           0.032395124, -0.0060635176,
  //           0.00704279, 0.0038789199,
  //           -0.00058148545, -0.010537356,
  //           -0.009424213, -0.0057001486,
  //           0.009753611, -0.0071960925,
  //           -0.020871725, 0.020291338,
  //           0.0066627054, 0.010755961,
  //           -0.024638936, -0.0002451827,
  //           -0.016095828, 0.01392428,
  //           0.010774296, -0.011574112,
  //           0.003447682, -0.0068530017,
  //           0.0046774657, -0.0033735388,
  //           0.0066321455, -0.0045023803,
  //           0.0011542861, 0.012076062,
  //           0.0055387067, -0.009380839,
  //           0.02023942, 0.0008207129,
  //           -0.0023551001, -0.16152896,
  //           -0.003186372, -0.006550644,
  //           0.006936525, -0.013382672,
  //           -0.014663501, 0.0032988915,
  //           0.008911109, 0.0061463392,
  //           0.011897127, 0.012737296,
  //           -0.0070086983, 0.0054177446,
  //           0.01632751, -0.007933073,
  //           -0.0005548446, -0.0065471185,
  //           -0.0063093607, 0.0015271818,
  //           0.0016954947, -0.007514521,
  //           -0.007125139, -0.008360883,
  //           0.006502918, -0.008767205,
  //           0.004378405, -0.003882698,
  //           -0.00960228, 0.022648076,
  //           -0.012106577, -0.022290956,
  //           0.0042411503, 0.0011312362,
  //           -0.010098219, 0.0070219873,
  //           0.00050232577, -0.0023538205,
  //           -0.00075533637, 0.0012700562,
  //           0.0012696268, -0.010399348,
  //           0.013801367, 0.015032058,
  //           0.013394597, -0.0113022225,
  //           0.010446762, 0.008552553,
  //           -0.016804937, -0.011313621,
  //           -0.020539824, 0.016877322,
  //           0.01548105, 0.0016118763,
  //           -0.0004031162, -0.0003960714,
  //           0.0018248251, 0.0019077453,
  //           -0.012239662, -0.0031512037,
  //           0.0062630503, -0.0011848647,
  //           0.014741874, 0.013205769,
  //           -0.003427876, 0.02065572,
  //           0.0071971654, -0.0035452484,
  //           -0.004717341, 0.009550954,
  //           -0.0056692935, 0.023102483,
  //           -0.0007373924, -0.0012933388,
  //           -0.007873372, 0.0014458781,
  //           0.020863485, -0.008091272,
  //           -0.003782592, 0.0077322163,
  //           0.015195024, 0.018739596,
  //           0.006991934, 0.0024995129,
  //           -0.019964011, 0.03910578,
  //           -0.01576015, 0.00046875436,
  //           -0.010744753, 0.024083728,
  //           0.002161274, -0.0069888798,
  //           0.019522166, -0.0016806257,
  //           0.011799512, -0.0024066623,
  //           0.0068504303, 0.014651324,
  //           -0.0023987333, -0.00023774069,
  //           -0.015367539, 0.01155639,
  //           -0.020220404, 0.0006066117,
  //           -0.005798132, 0.0067177364,
  //           -0.007916384, -0.002953177,
  //           0.009339826, -0.0015520949,
  //           -0.018088454, 0.01026172,
  //           0.011240351, 0.008625444,
  //           -0.014285745, -0.015379901,
  //           0.014880337, 0.0032777516,
  //           0.007383211, -0.007401081,
  //           -0.02721903, 0.0075281654,
  //           -0.005161848, -0.00331287,
  //           0.024761112, -0.0066373344,
  //           -0.0016897478, -0.010765122,
  //           -0.010887561, 0.013784942,
  //           -0.0111344205, 0.011797104,
  //           -0.0032633154, 0.020611573,
  //           0.005121947, 0.012814411,
  //           -0.016195174, 0.024516787,
  //           -0.0073969737, 0.014573801,
  //           0.012209645, -0.016458776,
  //           0.009711852, -0.020836988,
  //           -0.013657074, -0.018317474,
  //           -0.021510104, 0.012257441,
  //           0.029998792, -0.012196007,
  //           -0.021851055, 0.012447287,
  //           -0.009971184, -0.017590733,
  //           0.0043116924, 0.013049811,
  //           -0.0047361697, 0.0053873886,
  //           0.0061826087, -0.012676512,
  //           -0.008957523, 0.015727296,
  //           0.01384217, -0.001859463,
  //           0.009958246, 0.0138015365,
  //           -0.008441729, -0.0049301805,
  //           -0.005045287, -0.022973588,
  //           -0.032812603, -0.01792852,
  //           -0.007957685, 0.0026419843,
  //           0.008959868, 0.01678475,
  //           -0.001742754, -0.0024751702,
  //           0.007746843, -0.013220099,
  //           -0.085511215, -0.012686734,
  //           -0.001970853, 0.0051326137,
  //           0.0057341387, -0.000594406,
  //           -0.014600414, -0.0023185704,
  //           -0.019175766, -0.0040516388,
  //           0.0016425278, 0.0037932869,
  //           -0.009331527, -0.02435707,
  //           0.025677018, 0.024664639,
  //           -0.010202671, 0.009316848,
  //           -0.019376036, 0.008264229,
  //           -0.008224867, -0.020143002,
  //           -0.008112567, 0.006827579,
  //           0.0014508574, -0.0075965407,
  //           0.016121011, 0.005354213,
  //           0.011571505, 0.0023574764,
  //           0.009180657, -0.0033315162,
  //           0.006405989, -0.0051976303,
  //           0.003541551, -0.0030177126,
  //           -0.0030622117, -0.013572253,
  //           -0.0010036066, -0.06804415,
  //           -0.00484567, -0.013920639,
  //           -0.13677163, -0.0065590492,
  //           -0.0067390148, 0.010091612,
  //           -0.010194296, 0.0010952114,
  //           -0.009845366, 0.008571659,
  //           -0.0070867348, 0.026240991,
  //           -0.025584444, 0.0035800568,
  //           0.005092558, 0.015006968,
  //           0.0044654594, -0.0020552664,
  //           -0.009918956, -0.008922697,
  //           -0.00023817486, -0.019612236,
  //           -0.0083931135, -0.005150906,
  //           0.019594314, 0.00070973975,
  //           0.011504879, -0.0048393975,
  //           0.0035302264, 0.008360627,
  //           -0.0058019925, -0.010024796,
  //           -0.011603065, 0.0050703455,
  //           0.0065299, 0.011025316,
  //           -0.0048938273, 0.0021509505,
  //           -0.008156155, 0.0060792584,
  //           0.0049320017, 0.0036158415,
  //           0.015450312, 0.042901196,
  //           0.009108193, 0.0035513588,
  //           0.020682365, -0.13444698,
  //           -0.006285902, 0.006188015,
  //           -0.022195041, -0.004555659,
  //           0.038441565, -0.012340888,
  //           0.16463186, -0.0023851946,
  //           0.0021376016, -0.019912057,
  //           -0.0010280324, 0.0065883705,
  //           0.010287716, 0.002313707,
  //           0.0068524787, 0.004006774,
  //           0.008409081, 0.0050857114,
  //           0.0040008714, 0.0036822245,
  //           0.005631098, -0.0034612517,
  //           -0.0039351233, 0.00511126,
  //           -0.059847634, 0.009198184,
  //           0.0033337397, 0.003574024,
  //           0.008387592, 0.012783306,
  //           0.008222804, -0.0044022826,
  //           0.004750373, -0.0085619185,
  //           0.0025296696, -0.0116157085,
  //           0.0006995871, -0.0020623896,
  //           0.00067595055, -0.008265072,
  //           -0.01447837, -0.0018685358,
  //           0.004118553, -0.0038029116,
  //           -0.0024636353, 0.011337204,
  //           -0.011352665, 0.016070021,
  //           -0.008138494, 0.015197319,
  //           -0.005694755, 0.014906876,
  //           0.0018593536, -0.011275106,
  //           -0.0042540138, 0.014863875,
  //           -0.013858958, 0.022209775,
  //           -0.0040597343, 0.0008171452,
  //           -0.007911426, -0.011468574,
  //           -0.0041579665, -0.005247764,
  //           0.023979805, -0.029903073,
  //           -0.0056415466, -0.0049607707,
  //           -0.023324087, -0.001362325,
  //           -0.00020391407, 0.00804501,
  //           -0.0023699466, -0.020607868,
  //           0.0040411325, -0.00620864,
  //           -0.0074953064, -0.0014317976,
  //           -0.010588147, 0.0101200435,
  //           0.002025045, 0.0017822906,
  //           -0.007725543, -0.016887613,
  //           0.005415208, 0.0021028963,
  //           0.009584208, 0.0036089227,
  //           -0.013816379, 0.0010938952,
  //           -0.00679385, -0.0006835123,
  //           -0.0063667544, -0.0030046115,
  //           0.006009064, 0.0006754139,
  //           0.010116112, 0.005822513,
  //           0.014944771, -0.029658781,
  //           0.004520985, 0.0057702507,
  //           0.025380835, 0.002511414,
  //           0.0046217837, -0.001497036,
  //           0.0035259577, -0.0023337682,
  //           -0.0018507271, 0.011017972,
  //           0.013865956, -0.006733801,
  //           -0.012583398, 0.006683895,
  //           -0.011171921, 0.0045159273,
  //           -0.011923977, 0.009034067,
  //           -0.018523095, 0.003906602,
  //           -0.0013454071, 0.024862071,
  //           -0.014628046, 0.020306148,
  //           -0.00007502121, -0.0020392102,
  //           0.0072817714, -0.019322926,
  //           -0.006140987, -0.030322721,
  //           0.018200355, 0.009416102,
  //           -0.0018800193, 0.009177569,
  //           -0.0044558654, 0.004744209,
  //           -0.005362516, -0.0075941435,
  //           -0.016901629, -0.0080592325,
  //           0.009251158, 0.004689546,
  //           -0.0066740606, -0.001065423,
  //           0.003520802, -0.011681415,
  //           0.011046465, -0.012758458,
  //           0.014686781, 0.013403705,
  //           0.016258672, 0.0074073724,
  //           -0.010473285, 0.0045314,
  //           -0.010716274, 0.0052481177,
  //           -0.023915041, -0.0046776338,
  //           -0.009891361, 0.014344659,
  //           -0.014792412, -0.012823411,
  //           0.003367805, 0.019005798,
  //           0.00036987892, -0.0021855787,
  //           -0.0062257308, -0.0033794052,
  //           -0.0042472086, 0.012432997,
  //           0.016176097, 0.0038098444,
  //           0.0008192929, 0.028212562,
  //           0.005110749, 0.010042774,
  //           0.016548581, 0.0053599966,
  //           -0.0062479298, 0.012134456,
  //           -0.004471879, -0.011240373,
  //           0.0152812, 0.0064871847,
  //           -0.008736163, -0.025231272,
  //           0.0017798176, 0.016080122,
  //           -0.018112892, 0.0061975135,
  //           0.0007756401, 0.0038648043,
  //           -0.012532198, -0.0031923673,
  //           -0.004518691, 0.0045211683,
  //           0.012483444, 0.00845208,
  //           0.0016194285, -0.007236869,
  //           0.003737439, 0.007340563,
  //           -0.0031988053, -0.022230389,
  //           0.01987382, -0.034643386,
  //           0.01659438, -0.010641209,
  //           -0.010509296, 0.010687589,
  //           -0.016984368, 0.004065167,
  //           0.012527951, 0.004632766,
  //           0.011629482, 0.010447005,
  //           -0.014550076, 0.03693449,
  //           0.011935896, 0.0067843534,
  //           -0.0022461102, 0.009743877,
  //           -0.0031541167, -0.010941202,
  //           -0.012390957, -0.004164687,
  //           -0.0102490345, -0.00084134226,
  //           0.02159626, -0.029817216,
  //           0.0041882046, -0.0002236896,
  //           0.014439296, 0.0029213636,
  //           -0.0017194169, -0.010496909,
  //           -0.013391588, -0.002323395,
  //           0.0063131526, 0.007150152,
  //           0.005685988, 0.013820618,
  //           0.020840667, -0.033182535,
  //           -0.02067564, -0.024281316,
  //           0.011769014, 0.010383836,
  //           -0.0045132563, 0.018231232,
  //           -0.0078874715, 0.011655011,
  //           -0.0007411855, 0.004848419,
  //           -0.022114621, 0.0037232388,
  //           -0.009145221, 0.00097652146,
  //           -0.01766859, 0.0075307623,
  //           -0.009814384, -0.010405486,
  //           0.006727243, -0.033912998,
  //           0.013415141, 0.010670699,
  //           0.02081431, -0.009720164,
  //           0.0015477877, -0.005773421,
  //           0.0020670139, -0.0106606325,
  //           0.0149872145, 0.013110117,
  //           -0.01143364, 0.0009740603,
  //           0.0013967085, -0.007879779,
  //           0.012292275, 0.0058142445,
  //           -0.016787257, 0.0059779603,
  //           0.005563552, -0.0050061434,
  //           0.0020947042, -0.0008497186,
  //           -0.01362811, -0.008467471,
  //           -0.010035915, 0.0037896256,
  //           -0.008255691, -0.021262951,
  //           -0.010027554, 0.005830012,
  //           0.0054670773, 0.007188608,
  //           0.0028225582, -0.016438916,
  //           0.016615914, 0.011506575,
  //           -0.009029295, -0.0038455466,
  //           -0.013816066, -0.000880714,
  //           -0.0045017055, 0.003953877,
  //           -0.014023486, 0.019918209,
  //           -0.00430324, -0.014967399,
  //           -0.0010360013, 0.0044946177,
  //           0.0095586, 0.0022086545,
  //           0.016149973, 0.021427356,
  //           0.0141340755, 0.0023844556,
  //           -0.006719156, 0.007063467,
  //           0.012960842, 0.011610254,
  //           -0.011483876, 0.01901159,
  //           0.02449821, 0.0008875924,
  //           -0.016945183, -0.0055501284,
  //           -0.0030056864, -0.0055747223,
  //           0.0022634908, -0.010491919,
  //           -0.016581165, 0.013501311,
  //           -0.009943695, -0.013327198,
  //           0.009250545, 0.006273118,
  //           0.0026241355, -0.019536238,
  //           -0.0015204574, 0.009495032,
  //           -0.02731094, 0.029078528,
  //           -0.006498572, -0.00001635694,
  //           0.005164394, 0.013062644,
  //           -0.035372004, -0.018671477,
  //           0.029602773, -0.011867906,
  //           0.020670336, -0.009753443,
  //           -0.005423158, 0.010193804,
  //           0.017019292, 0.0007748429,
  //           0.013574064, 0.007453195,
  //           -0.0038523797, -0.015265404,
  //           0.0012218285, -0.0069383797,
  //           0.000045932877, -0.0008677462,
  //           0.007491688, -0.0050206664,
  //           0.0063289967, 0.007038241,
  //           0.009355094, 0.00044903797,
  //           -0.008645558, -0.0033424837,
  //           0.024605487, 0.005351973,
  //           0.0072076246, 0.010565915,
  //           0.0026273832, -0.004157971,
  //           0.0081690755, -0.005303508,
  //           -0.015557566, -0.03175667,
  //           -0.0037222991, -0.013793078,
  //           0.0038410714, 0.00027680726,
  //           -0.008331147, 0.0032665168,
  //           0.012626889, 0.006086481,
  //           0.015771784, 0.0044773715,
  //           0.001232961, -0.0025376624,
  //           -0.010636425, 0.0048426823,
  //           -0.0065688374, 0.010289244,
  //           0.0013786023, -0.003006124,
  //           -0.009538145, -0.010181273,
  //           0.012689184, -0.00093407254,
  //           0.012979213, 0.009639284,
  //           -0.012369009, 0.010271096,
  //           -0.0070001027, -0.0032956894,
  //           0.027054789, -0.006821447,
  //           0.00067488954, -0.019763334,
  //           -0.012958039, 0.004472894,
  //           -0.012629246, -0.0013206776,
  //           0.004079598, 0.01006357,
  //           0.010633624, 0.005350177,
  //           -0.0058943825, 0.0013760313,
  //           0.004597949, 0.008000946,
  //           0.00019627601, 0.0028388328,
  //           -0.013064288, -0.01643019,
  //           0.0072243456, -0.016589394,
  //           -0.0049901493, 0.0036252465,
  //           0.006672651, -0.0012304315,
  //           -0.009745329, -0.0029547333,
  //           0.027936421, -0.006214102,
  //           0.007376833, -0.0035779928,
  //           -0.012832308, -0.016551567,
  //           0.015347701, 0.00828879,
  //           -0.015846992, 0.0025774376,
  //           -0.024776764, 0.01538669,
  //           -0.007045433, -0.007648462,
  //           0.009442451, 0.010112189,
  //           -0.004094429, 0.018322878,
  //           -0.013527351, -0.02240748,
  //           0.0010330977, 0.005323357,
  //           0.01838358, -0.0061813216,
  //           -0.010720817, -0.0087284865,
  //           0.012756154, 0.0024633915,
  //           -0.002919795, -0.061190516,
  //           0.008721479, -0.03622128,
  //           -0.013249829, -0.0008843864,
  //           -0.011461937, -0.0034493085,
  //           0.014799935, 0.010516371,
  //           -0.045941286, -0.003513499,
  //           -0.011060025, 0.012920386,
  //           0.011370853, -0.0075804926,
  //           0.0075521613, 0.009027546,
  //           -0.008341055, 0.005958726,
  //           -0.011564391, -0.017347336,
  //           -0.002430339, 0.008060184,
  //           0.0010977127, 0.0054708747,
  //           -0.00043908437, -0.0026105766,
  //           -0.0019384542, -0.001655863,
  //           0.003999093, 0.007915124,
  //           -0.005011379, 0.019173177,
  //           -0.0048708464, 0.013436701,
  //           0.0038114698, -0.007871962,
  //           -0.0012243643, -0.019701159,
  //           -0.025949541, -0.004354561,
  //           -0.021159783, -0.013499136,
  //           0.012656528, 0.013032787,
  //           0.003940437, 0.009115071,
  //           -0.00008799139, -0.008079466,
  //           -0.0060594, 0.0032293687,
  //           0.015331733, -0.0020250601,
  //           0.010580659, -0.00966518,
  //           -0.010763204, -0.0030950815,
  //           -0.000068639536, -0.021255076,
  //           -0.00050615706, -0.0055790315,
  //           -0.01174133, 0.0002939174,
  //           0.0076098354, -0.009631005,
  //           0.0034782675, 0.014664838,
  //           -0.009331371, -0.0046070116,
  //           -0.0023037149, 0.0035220317,
  //           0.018821765, 0.001748906,
  //           -0.00074070663, 0.037243206,
  //           -0.010565429, -0.015908696,
  //           -0.005230844, -0.0011561562,
  //           0.013412241, 0.0011345535,
  //           0.006295022, -0.010898264,
  //           -0.017324476, 0.024334006,
  //           -0.0055867825, 0.016943501,
  //           0.00090473273, -0.005922328,
  //           0.003978988, -0.02453888,
  //           -0.010800341, -0.0061805113,
  //           -0.004690678, -0.022556858,
  //           0.016216462, 0.020939777,
  //           0.021023013, 0.011415582,
  //           0.016497357, 0.008839857,
  //           -0.010830888, 0.01407463,
  //           -0.00812664, 0.015987255,
  //           0.010695897, 0.0005924086,
  //           -0.02870128, 0.0068603414,
  //           0.01390648, -0.010671339,
  //           -0.0072007324, -0.0069087856,
  //           -0.0016493599, -0.014808659,
  //           0.0034965947, -0.011663711,
  //           0.0022449938, -0.00018993978,
  //           0.016534736, -0.020029517,
  //           0.0056619085, 0.01309025,
  //           -0.006238593, -0.0046690097,
  //           -0.0038806405, -0.004196639,
  //           0.0057235057, -0.0053317184,
  //           0.00738896, 0.007468586,
  //           0.010027711, -0.01642607,
  //           -0.013933549, -0.0027761504,
  //           -0.0048647844, -0.01969348,
  //           -0.00759138, 0.0010391718,
  //           0.008646757, -0.013031185,
  //           0.025472967, -0.018521419,
  //           -0.017834036, 0.0022451482,
  //           0.016418716, 0.0045590647,
  //           -0.018496081, 0.0027366292,
  //           -0.0055644894, 0.0022679903,
  //           0.00616206, 0.015660718,
  //           -0.0074026794, 0.0039836774,
  //           -0.0099918125, 0.008951695,
  //           -0.010274233, -0.0029814225,
  //           -0.0066561317, 0.014254915,
  //           -0.02333606, 0.004955353,
  //           0.0017971968, -0.009316478,
  //           0.01439421, -0.0028894139,
  //           0.023679545, 0.035311192,
  //           0.001203472, 0.012040707,
  //           -0.014136722, 0.01828985,
  //           -0.0034573057, -0.0031380896,
  //           0.0055741137, 0.0019136645,
  //           0.00067744346, -0.0009012147,
  //           -0.0032555799, 0.004507946,
  //           0.013357806, -0.01683875,
  //           -0.0085595865, 0.010106571,
  //           0.0007023174, -0.0132679185,
  //           -0.00013598823, 0.005962781,
  //           -0.0027706577, 0.02035307,
  //           0.0060446584, 0.013590153,
  //           -0.012285192, -0.012878279,
  //           -0.0037502386, 0.008003873,
  //           -0.017735012, -0.0036492597,
  //           0.006831383, -0.0012800508,
  //           0.01630901, -0.0050454196,
  //           0.014245767, 0.0005873662,
  //           -0.025129996, -0.011408829,
  //           -0.0014102432, -0.007960422,
  //           -0.013429731, -0.016398454,
  //           -0.0116989035, -0.006964756,
  //           0.013716473, 0.005645233,
  //           0.017677909, 0.1825482, 0.11539434,
  //           -0.014701432, -0.011422675,
  //           0.006310846, -0.005268934,
  //           -0.0021768603, 0.016566047,
  //           0.010597789, 0.013571516,
  //           0.0035342171, 0.0038027095,
  //           0.013514978, -0.0057156063,
  //           0.008088095, -0.00810739,
  //           -0.0014048236, -0.0076662945,
  //           0.007255562, 0.011381519,
  //           0.005189453, -0.0110197775,
  //           0.004841421, 0.012899029,
  //           -0.02783151, 0.0024976416,
  //           0.004586054, 0.008208281,
  //           0.01690684, 0.0025798772,
  //           0.0042474265, -0.0032849144,
  //           -0.0073943487, -0.00060512824,
  //           0.024777172, -0.015489274,
  //           0.0028383113, 0.012452532,
  //           0.0061233756, 0.025384149,
  //           -0.0039888397, 0.014640979,
  //           0.017536853, 0.0069738957,
  //           -0.011903345, 0.00839368,
  //           0.0035423292, -0.003377181,
  //           0.003985683, -0.0062917313,
  //           0.010802214, -0.0056308727,
  //           -0.0060363803, -0.0034480025,
  //           -0.01145489, 0.0009412253,
  //           -0.0053524273, 0.0065880325,
  //           -0.020204747, 0.0026636154,
  //           0.01832437, 0.0071409442,
  //           -0.0013002788, 0.0063450853,
  //           -0.0011305639, 0.000566441,
  //           0.00551908, 0.012824082,
  //           0.0015764219, 0.019730937,
  //           -0.006129762, 0.0077928863,
  //           -0.0036746315, -0.0046345256,
  //           -0.005572033, 0.0034857437,
  //           -0.007969945, -0.0069416026,
  //           0.0022062738, -0.011678624,
  //           -0.014489907, 0.008873642,
  //           0.007859198, 0.0013433703,
  //           -0.0052040704, 0.03093001,
  //           0.0036027054, 0.018584497,
  //           0.15097786, -0.015603258,
  //           -0.010587557, -0.028117873,
  //           0.0037559269, 0.022554394,
  //           -0.013366088, 0.02342333,
  //           -0.006013264, -0.0068680956,
  //           -0.0088233575, 0.0062144483,
  //           0.006794861, 0.011114673,
  //           -0.004345488, -0.020333383,
  //           0.014592594, 0.08629914,
  //           -0.0055192625, 0.010028417,
  //           -0.011582742, -0.0012778745,
  //           -0.0043771625, 0.009541254,
  //           0.0044797095, -0.02932921,
  //           0.0063176258, -0.002897424,
  //           -0.0008315005, -0.0027889395,
  //           -0.11689892, -0.0028217447,
  //           -0.014533517, -0.012796769,
  //           0.0002412267, 0.00927483,
  //           -0.021646647, -0.005185885,
  //           0.012219434, -0.0036002288,
  //           0.0056280172, -0.017262654,
  //           -0.0054290136, -0.0049149627,
  //           -0.025499046, -0.0019357171,
  //           -0.010862595, 0.0012972573,
  //           -0.007960257, 0.029496318,
  //           0.0017211367, -0.0089945095,
  //           -0.0030569548, 0.0027842664,
  //           -0.0051756017, -0.003951493,
  //           0.00075453415, 0.017828567,
  //           0.012672983, -0.01331187,
  //           -0.02517932, 0.008559945,
  //           -0.007984157, -0.009214624,
  //           0.008017704, -0.0121144615,
  //           0.016915321, -0.0054176473,
  //           -0.0047389055, -0.008434019,
  //           -0.014317734, -0.019555688,
  //           0.004271874, -0.028053172,
  //           -0.016211985, -0.0040323995,
  //           0.0044733505, -0.00041326525,
  //           -0.011941626, -0.0116742365,
  //           0.06788824, -0.010409087,
  //           -0.0021969448, -0.002860971,
  //           -0.002525379, -0.0007936576,
  //           -0.0032824015, -0.0010186413,
  //           -0.025813654, 0.003059252,
  //           -0.0038793408, 0.0122790085,
  //           -0.022453414, 0.019864168,
  //           -0.008276356, -0.015329954,
  //           0.015968056, -0.00050881086,
  //           -0.010906543, -0.013890947,
  //           0.0065392787, 0.008542886,
  //           0.023028752, -0.019581553,
  //           -0.020817783, 0.0032665073,
  //           -0.02359392, 0.008012062,
  //           0.0077732275, 0.0054495046,
  //           0.005688654, 0.0109226545,
  //           0.010257937, 0.1377451,
  //           -0.0107048275, 0.012734469,
  //           0.0070627015, -0.004259661,
  //           0.017565303, -0.0029821666,
  //           -0.013898113, 0.0074090743,
  //           0.024962137, 0.007046071,
  //           -0.009018316, -0.006630269,
  //           0.008115039, -0.0060904734,
  //           -0.0050883596, 0.020752825,
  //           -0.026642272, 0.010450309,
  //           -0.02531303, -0.02389165,
  //           0.004756148, -0.017112961,
  //           0.014501154, -0.010325205,
  //           -0.0034877183, -0.013858436,
  //           0.005216078, 0.0032050633,
  //           -0.0024512203, -0.025699565,
  //           0.002910877, 0.020566924,
  //           -0.0031051026, -0.02000959,
  //           0.0014677896, -0.010306543,
  //           -0.0012121189, 0.0010283197,
  //           0.0062594656, -0.0015568853,
  //           -0.0049100425, 0.005215859,
  //           0.008493832, -0.026980126,
  //           0.1891337, 0.00017962126,
  //           -0.0029303783, -0.01748594,
  //           -0.006488803, 0.013788817,
  //           -0.013525981, 0.0015620815,
  //           -0.0014156948, -0.0010981729,
  //           0.02131258, 0.0050590476,
  //           0.0060587605, -0.013247414,
  //           0.01570759, -0.0014032219,
  //           -0.0008968687, 0.011196274,
  //           0.007988827, -0.0031341845,
  //           0.013161127, -0.0003024663,
  //           -0.00084807276, 0.010750246,
  //           0.0068998374, -0.0044861785,
  //           0.016637826, 0.004832289,
  //           0.023465091, -0.005634983,
  //           0.0048659644, 0.0093284035,
  //           0.010991587, -0.004165199,
  //           0.011284849, 0.0022898004,
  //           -0.01709269, -0.004923005,
  //           0.009164829, -0.017458497,
  //           0.0030230395, 0.0081224805,
  //           0.0020058767, 0.009130684,
  //           0.008440799, -0.0076720524,
  //           -0.015174319, -0.016705524,
  //           -0.010045383, 0.019397343,
  //           0.005373033, -0.0109468065,
  //           0.0003743596, -0.0044466495,
  //           0.010384771, 0.0057537104,
  //           -0.0055978, 0.0076026046,
  //           -0.0013001444, 0.011595491,
  //           0.008538172, 0.0059507648,
  //           -0.004192897, -0.0022059386,
  //           -0.0072764694, 0.005267017,
  //           -0.0077458867
  //         ];
}
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
        // { equals: { path: 'moderationStatus', value: 'APPROVED' } },
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

  // Salary range filters
  if (searchParams.minSalary || searchParams.maxSalary) {
    const salaryFilter = { compound: { should: [] } };
    if (searchParams.minSalary && searchParams.maxSalary) {
      // Job salary range overlaps with user's salary range
      salaryFilter.compound.should.push({
        compound: {
          must: [
            { range: { path: 'maxSalary', gte: searchParams.minSalary } },
            { range: { path: 'minSalary', lte: searchParams.maxSalary } }
          ]
        }
      });
    } else if (searchParams.minSalary) {
      salaryFilter.compound.should.push({
        range: { path: 'maxSalary', gte: searchParams.minSalary }
      });
    } else if (searchParams.maxSalary) {
      salaryFilter.compound.should.push({
        range: { path: 'minSalary', lte: searchParams.maxSalary }
      });
    }

    filter.compound.must.push(salaryFilter);
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
    // moderationStatus: 'APPROVED',
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

  // Salary range filters
  if (searchParams.minSalary || searchParams.maxSalary) {
    if (searchParams.minSalary && searchParams.maxSalary) {
      preFilter.$or = [
        {
          $and: [
            { maxSalary: { $gte: searchParams.minSalary } },
            { minSalary: { $lte: searchParams.maxSalary } }
          ]
        }
      ];
    }
    else if (searchParams.minSalary) {
      preFilter.maxSalary = { $gte: searchParams.minSalary };
    }
    else if (searchParams.maxSalary) {
      preFilter.minSalary = { $lte: searchParams.maxSalary };
    }
  }
  return preFilter;

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
      const preFilter = buildPreFilter(searchParams);

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

  const preFilter = buildPreFilter(searchParams);


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
                filter: preFilter
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
          approved: true,
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
  const { sw_lng, sw_lat, ne_lng, ne_lat, limit = 500 } = bounds;

  const jobs = await Job.find({
    status: 'ACTIVE',
    approved: true,
    'location.coordinates': {
      $geoWithin: {
        $box: [
          [parseFloat(sw_lng), parseFloat(sw_lat)], // Southwest corner [lng, lat]
          [parseFloat(ne_lng), parseFloat(ne_lat)]  // Northeast corner [lng, lat]
        ]
      }
    }
  })
    .limit(parseInt(limit))
    .select('title location.coordinates address minSalary maxSalary type workType')
    .populate({
      path: 'recruiterProfileId',
      select: 'company.name company.logo'
    })
    .lean();

  // Format response
  return jobs.map(job => ({
    _id: job._id,
    title: job.title,
    coordinates: job.location.coordinates.coordinates,
    address: job.address,
    minSalary: job.minSalary?.toString(),
    maxSalary: job.maxSalary?.toString(),
    type: job.type,
    workType: job.workType,
    company: {
      name: job.recruiterProfileId?.company?.name,
      logo: job.recruiterProfileId?.company?.logo
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
        approved: true,
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
export const getMapClusters = async (bounds, zoom, filters = {}) => {
  const bucketCount = getBucketCount(zoom);

  // ✅ DEBUG: Log input parameters
  logger.info(`[MAP CLUSTERS] Zoom: ${zoom}, BucketCount: ${bucketCount}`);
  logger.info(`[MAP CLUSTERS] Bounds:`, bounds);
  logger.info(`[MAP CLUSTERS] Filters:`, filters);

  // 1. Xây dựng điều kiện match cơ bản
  const baseMatch = {
    status: 'ACTIVE',
    'location.coordinates.coordinates': {
      $geoWithin: {
        $box: [
          [parseFloat(bounds.sw_lng), parseFloat(bounds.sw_lat)],
          [parseFloat(bounds.ne_lng), parseFloat(bounds.ne_lat)],
        ],
      },
    },
  };

  // Áp dụng các bộ lọc bổ sung
  if (filters.category) baseMatch.category = filters.category;
  if (filters.type) baseMatch.type = filters.type;
  if (filters.workType) baseMatch.workType = filters.workType;
  if (filters.experience) baseMatch.experience = filters.experience;
  if (filters.province) baseMatch['location.province'] = filters.province;
  if (filters.district) baseMatch['location.district'] = filters.district;

  // 2. Xây dựng Aggregation Pipeline với $bucketAuto
  const pipeline = [
    // Giai đoạn 1: Lọc các công việc trong khung nhìn và theo bộ lọc
    { $match: baseMatch },

    // Giai đoạn 2: Tự động phân cụm
    {
      $bucketAuto: {
        groupBy: '$location.coordinates.coordinates', // Phân nhóm dựa trên tọa độ
        buckets: bucketCount, // Số lượng cụm tối đa mong muốn
        output: {
          // Đếm số lượng công việc trong mỗi cụm
          point_count: { $sum: 1 },
          // Lấy tọa độ của công việc đầu tiên làm đại diện cho cụm
          coordinates: { $first: '$location.coordinates.coordinates' },
          // Thu thập các ID của công việc trong cụm
          jobIds: { $push: '$_id' }
          // ✅ REMOVED: jobs field (không cần nữa vì chỉ trả clusters)
        },
      },
    },

    // Giai đoạn 3: Lọc chỉ lấy clusters (point_count > 1)
    {
      $match: {
        point_count: { $gt: 1 } // ✅ CHỈ LẤY CLUSTERS, bỏ qua singles
      }
    },

    // Giai đoạn 4: Định dạng lại đầu ra
    {
      $project: {
        _id: 0,
        coordinates: 1,
        point_count: 1,
        jobIds: 1
      },
    },
  ];

  try {
    const results = await Job.aggregate(pipeline);

    // ✅ DEBUG: Log raw aggregation results
    logger.info(`[MAP CLUSTERS] Raw results count: ${results.length}`);
    if (results.length > 0) {
      logger.info(`[MAP CLUSTERS] First result sample:`, JSON.stringify(results[0], null, 2));
    }

    // ✅ ĐỀ XUẤT 2: CHỈ TRẢ CLUSTERS - Không trả singles
    // Frontend sẽ chỉ nhận clusters khi zoom < 12
    // Aggregation pipeline đã lọc sẵn (point_count > 1) nên results chỉ chứa clusters
    const formattedResults = results.map(result => ({
      type: 'cluster',
      coordinates: result.coordinates,
      count: result.point_count,
      jobIds: result.jobIds.map(id => id.toString())
    }));

    // ✅ DEBUG: Log final formatted results
    logger.info(`[MAP CLUSTERS] Final results: ${formattedResults.length} clusters ONLY (singles removed)`);
    logger.info(`[MAP CLUSTERS] Total jobs in clusters: ${formattedResults.reduce((sum, c) => sum + c.count, 0)}`);

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
  const { cvId, cvTemplateId, coverLetter, candidateName, candidateEmail, candidatePhone } = applicationData;

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
        cloudinaryId: selectedCV.cloudinaryId || null,
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
        cloudinaryId: copiedFile.public_id,
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
