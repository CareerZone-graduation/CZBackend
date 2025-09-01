import mongoose from 'mongoose';
import {
  Application,
  CandidateProfile,
  Job,
  RecruiterProfile,
  CV,
  SavedJob,
  User,
} from '../models/index.js';
import * as kafkaService from './kafka.service.js';
import * as queueService from './queue.service.js';
import { ROUTING_KEYS } from '../queues/rabbitmq.js';
import { NotFoundError, UnauthorizedError, BadRequestError, ForbiddenError } from '../utils/AppError.js';
import * as uploadService from './upload.service.js';
import logger from '../utils/logger.js';
import { logActivity } from './application.service.js';

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

  const newJob = await Job.create({
    ...jobData,
    recruiterProfileId: recruiterProfile._id,
  });

  // Gửi sự kiện JOB_CREATED đến Kafka
  // Không cần await để tránh block response trả về cho client
  //gửi all thông tin cần thiết để tạo sự kiện JOB_CREATED
  kafkaService.sendJobEvent({
    eventType: 'JOB_CREATED',
    timestamp: new Date().toISOString(),
    payload: {
      jobId: newJob._id.toString(),
      description: newJob.description,
      requirements: newJob.requirements,
      benefits: newJob.benefits,
      title: newJob.title,
      skills: newJob.skills,
      category: newJob.category,
      area: newJob.area,
      minSalary: newJob.minSalary,
      maxSalary: newJob.maxSalary,
      companyName: recruiterProfile.company.name,
      location: {
        province: newJob.location.province,
        ward: newJob.location.ward,
      },
      address: newJob.address,
      type: newJob.type,
      workType: newJob.workType,
      experience: newJob.experience,
      deadline: newJob.deadline,
    }
  });

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
  if (status) {
    query.status = status;
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
    .sort(sortOptions)
    .skip(skip)
    .limit(limit)
    .lean();

  const totalJobs = await Job.countDocuments(query);

  const plainJobs = jobs.map(job => ({
    _id: job._id,
    title: job.title,
    description: job.description,
    requirements: job.requirements,
    benefits: job.benefits,
    location: job.location,
    address: job.address,
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
        reviewingCount: { $sum: { $cond: [{ $eq: ['$status', 'REVIEWING'] }, 1, 0] } },
        interviewedCount: { $sum: { $cond: [{ $eq: ['$status', 'INTERVIEWED'] }, 1, 0] } },
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
        reviewing: stats?.reviewingCount || 0,
        interviewed: stats?.interviewedCount || 0,
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
        select: 'company.name company.logo company._id'
    });

    if (!jobDoc) {
        throw new NotFoundError('Không tìm thấy tin tuyển dụng.');
    }

    const job = jobDoc.toObject();
    logger.info(job);

    // Kiểm tra xem user có phải là candidate và job có được lưu không
    let isSaved = false;
    if (userId) {
      // Gửi sự kiện xem việc làm
      kafkaService.sendUserInteraction({
        eventType: 'VIEW_JOB',
        userId,
        jobId,
        timestamp: new Date().toISOString(),
        details: { weight: 1 }
      });

      // Kiểm tra xem user có phải là candidate và đã lưu job này không
      try {
        const candidateProfile = await CandidateProfile.findOne({ userId });
        if (candidateProfile) {
          const savedJob = await SavedJob.findOne({
            candidateId: userId,
            jobId
          });
          isSaved = !!savedJob;
        }
      } catch (error) {
        // Nếu có lỗi khi kiểm tra, isSaved vẫn là false
        logger.warn('Error checking saved job status', { userId, jobId, error: error.message });
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
      company: {
        name: job.recruiterProfileId.company.name,
        logo: job.recruiterProfileId.company.logo,
        _id: job.recruiterProfileId.company._id
      },
      isSaved

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

  Object.assign(job, updateData);
  await job.save();

  return job;
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
      // --- Trường hợp 2: Dùng CV tạo từ mẫu ---
      // TODO: CHƯA XỬ LÝ
      throw new BadRequestError('Chức năng nộp CV từ mẫu chưa được hỗ trợ.');
    } else {
      // Trường hợp không cung cấp ID nào (dù đã được validate bởi Zod)
      throw new BadRequestError('Phải cung cấp một CV để ứng tuyển.');
    }

    let copiedFile;
    // 5. In a test environment, bypass the actual upload and use a mock response.
    if (process.env.NODE_ENV === 'test') {
      copiedFile = {
        secure_url: 'http://mocked.com/cv.pdf',
        public_id: 'mocked_public_id',
      };
    } else {
      // In a non-test environment, perform the actual upload.
      logger.info(`Tạo bản sao CV cho đơn ứng tuyển: ${job.title}, ứng viên: ${userId}`);
      const uniqueSuffix = `${jobId}-${Date.now()}`;
      const publicId = `application-cv-${userId}-${uniqueSuffix}`;
      copiedFile = await uploadService.copyFileFromUrlToCloudinary(
        sourceFileInfo.path,
        'application-cvs',
        publicId
      );
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
      submittedCV: {
        name: sourceFileInfo.name,
        path: copiedFile.secure_url, // Đường dẫn đến bản sao
        cloudinaryId: copiedFile.public_id,
        source: sourceType,
        // Nếu là CV template, lưu trữ dữ liệu để tham khảo
        ...(sourceType === 'TEMPLATE' ? { templateSnapshot: sourceFileInfo.templateData } : {})
      },
      jobSnapshot: {
        title: job.title,
        company: job.recruiterProfileId.company.name,
        logo: job.recruiterProfileId.company.logo,
      },
    });
    logActivity(application, 'APPLICATION_SUBMITTED', 'Ứng viên đã nộp đơn');

    // Gửi sự kiện APPLY_JOB
    kafkaService.sendUserInteraction({
        eventType: 'APPLY_JOB',
        userId,
        jobId,
        timestamp: new Date().toISOString(),
        details: { weight: 5 }
    });

    // --- BẮT ĐẦU GỬI SỰ KIỆN THÔNG BÁO ---
    try {
      const recruiterUserId = job.recruiterProfileId.userId;

      // 1. Gửi sự kiện để thông báo cho ỨNG VIÊN
      queueService.publishNotification(ROUTING_KEYS.STATUS_UPDATE, {
        type: 'APPLICATION_SUBMITTED', // Type để worker nhận diện
        recipientId: userId.toString(),
        data: {
          applicationId: application._id.toString(),
          // jobId: job._id.toString(),
          // jobTitle: job.title,
          // companyName: job.recruiterProfileId.company.name,
        }
      });

      // 2. Gửi sự kiện để thông báo cho NHÀ TUYỂN DỤNG
      queueService.publishNotification(ROUTING_KEYS.NEW_APPLICATION, {
        type: 'NEW_APPLICATION',
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

  // Gửi sự kiện SAVE_JOB
  kafkaService.sendUserInteraction({
    eventType: 'SAVE_JOB',
    userId,
    jobId,
    timestamp: new Date().toISOString(),
    details: { weight: 3 },
  });
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
  const { page = 1, limit = 10, sortBy } = options;

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
          _id: 1,
          jobId: '$job._id',
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
