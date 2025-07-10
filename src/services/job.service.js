import Application from '../models/Application.js';
import CandidateProfile from '../models/CandidateProfile.js';
import Job from '../models/Job.js';
import RecruiterProfile from '../models/RecruiterProfile.js';
import CV from '../models/CV.js';
import SavedJob from '../models/SavedJob.js';
import { sendUserInteraction, sendJobEvent } from './kafka.service.js';
import { NotFoundError, UnauthorizedError, BadRequestError } from '../utils/AppError.js';
import { copyFileFromUrlToCloudinary } from './upload.service.js';
import logger from '../utils/logger.js';
import mongoose from 'mongoose';
import { ca } from 'zod/v4/locales';

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
  sendJobEvent({
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
        city: newJob.location.city,
        district: newJob.location.district,
        address: newJob.location.address
      },
      type: newJob.type,
      workType: newJob.workType,
      experience: newJob.experience,
      deadline: newJob.deadline,
    }
  });

  return newJob;
};

/**
 * Lấy danh sách các tin tuyển dụng của một nhà tuyển dụng
 * @param {string} userId - ID của User (Recruiter)
 * @param {object} options - Tùy chọn truy vấn (phân trang, lọc)
 * @returns {Promise<object>} Danh sách tin tuyển dụng và thông tin phân trang
 */
export const getJobsByRecruiter = async (userId, options) => {
  const { page = 1, limit = 10, status, sortBy } = options;
  
  const recruiterProfile = await findRecruiterProfileByUserId(userId);
  const recruiterProfileId = recruiterProfile._id;

  const query = { recruiterProfileId };
  if (status) {
    query.status = status;
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

  return {
    data: jobs,
    meta: {
      currentPage: page,
      totalPages: Math.ceil(totalJobs / limit),
      totalItems: totalJobs,
      limit,
    },
  };
};

/**
 * Lấy chi tiết một tin tuyển dụng bằng ID
 * @param {string} jobId - ID của tin tuyển dụng
 * @param {string|null} userId - ID của người dùng (nếu có)
 * @returns {Promise<Document>} Chi tiết tin tuyển dụng
 */
export const getJobById = async (jobId, userId = null) => {
    const job = await Job.findById(jobId).populate({
        path: 'recruiterProfileId',
        select: 'company.name company.logo'
    }).lean();

    if (!job) {
        throw new NotFoundError('Không tìm thấy tin tuyển dụng.');
    }
    
    // Gửi sự kiện xem việc làm nếu có userId
    if (userId) {
      sendUserInteraction({
        eventType: 'VIEW_JOB',
        userId,
        jobId,
        timestamp: new Date().toISOString(),
        details: { weight: 1 }
      });
    }

    // rename the recruiterProfileId to recruiter
    if (job) {
        job.company = job.recruiterProfileId.company;
        delete job.recruiterProfileId;
    }
    
    return job;
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
    throw new UnauthorizedError('Bạn không có quyền cập nhật tin tuyển dụng này.');
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
    throw new UnauthorizedError('Bạn không có quyền xóa tin tuyển dụng này.');
  }

  // Soft-delete bằng cách chuyển status thành 'INACTIVE'
  job.status = 'INACTIVE';
  await job.save();
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
  const job = await Job.findById(jobId).populate('recruiterProfileId', 'company');
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

    // 5. Tạo bản sao của CV trên Cloudinary
    logger.info(`Tạo bản sao CV cho đơn ứng tuyển: ${job.title}, ứng viên: ${userId}`);
    
    const uniqueSuffix = `${jobId}-${Date.now()}`;
    const publicId = `application-cv-${userId}-${uniqueSuffix}`;
    
    const copiedFile = await copyFileFromUrlToCloudinary(
      sourceFileInfo.path,
      'application-cvs',
      publicId
    );

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

    // Gửi sự kiện APPLY_JOB
    sendUserInteraction({
        eventType: 'APPLY_JOB',
        userId,
        jobId,
        timestamp: new Date().toISOString(),
        details: { weight: 5 }
    });
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
  // 1. Tìm hồ sơ ứng viên
  const candidateProfile = await findCandidateProfileByUserId(userId);
  
  // 2. Kiểm tra tin tuyển dụng có tồn tại và đang hoạt động không
  const job = await Job.findById(jobId);
  if (!job || job.status !== 'ACTIVE') {
    throw new NotFoundError('Tin tuyển dụng không tồn tại hoặc đã hết hạn.');
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
  const savedJob = await SavedJob.create({
    candidateId: userId,
    jobId,
  });

  // Gửi sự kiện SAVE_JOB
  sendUserInteraction({
      eventType: 'SAVE_JOB',
      userId,
      jobId,
      timestamp: new Date().toISOString(),
      details: { weight: 3 }
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
    throw new NotFoundError('Không tìm thấy công việc đã lưu để xóa.');
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
          minSalary: '$job.minSalary',
          maxSalary: '$job.maxSalary',
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
