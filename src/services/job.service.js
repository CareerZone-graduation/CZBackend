import Application from '../models/Application.js';
import CandidateProfile from '../models/CandidateProfile.js';
import Job from '../models/Job.js';
import RecruiterProfile from '../models/RecruiterProfile.js';
import CV from '../models/CV.js';
import { NotFoundError, UnauthorizedError, BadRequestError } from '../utils/AppError.js';
import { copyFileFromUrlToCloudinary } from './upload.service.js';
import logger from '../utils/logger.js';

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
 * @returns {Promise<Document>} Chi tiết tin tuyển dụng
 */
export const getJobById = async (jobId) => {
    const job = await Job.findById(jobId).populate({
        path: 'recruiterProfileId',
        select: 'company.name company.logo'
    }).lean();
    // rename the recruiterProfileId to recruiter
    if (job) {
        job.company = job.recruiterProfileId.company;
        delete job.recruiterProfileId;
    }
    if (!job) {
        throw new NotFoundError('Không tìm thấy tin tuyển dụng.');
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
      const selectedCV = candidateProfile.cvs.id(cvId);
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
      // const cvFromTemplate = await CV.findOne({ _id: cvTemplateId, userId });
      // if (!cvFromTemplate) {
      //   throw new BadRequestError('CV tạo từ mẫu không hợp lệ hoặc không tìm thấy.');
      // }
      // // Giả sử CV template có một endpoint để render CV thành PDF
      // sourceFileInfo = {
      //   name: cvFromTemplate.name || `CV-${cvFromTemplate._id}`,
      //   path: `/api/cv-templates/${cvTemplateId}/render`, // Endpoint giả định để render CV
      //   templateData: cvFromTemplate.toObject(),
      // };
      // sourceType = 'TEMPLATE';
    } else {
      // Trường hợp không cung cấp ID nào (dù đã được validate bởi Zod)
      throw new BadRequestError('Phải cung cấp một CV để ứng tuyển.');
    }

    // 5. Tạo bản sao của CV trên Cloudinary
    logger.info(`Tạo bản sao CV cho đơn ứng tuyển: ${job.title}, ứng viên: ${userId}`);
    
    const uniqueSuffix = `${jobId}-${Date.now()}`;
    const publicId = `application-cv-${userId}-${uniqueSuffix}`;
    
    // Tạo bản sao (clone) từ file gốc trên Cloudinary
    const copiedFile = await copyFileFromUrlToCloudinary(
      sourceFileInfo.path,
      'application-cvs', // Thư mục đặc biệt để lưu CV đã nộp đơn
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

    return application;
  } catch (error) {
    // Ghi log lỗi
    logger.error(`Lỗi khi nộp đơn: ${error.message}`, { 
      userId, jobId, cvId, cvTemplateId, error 
    });
    
    // Ném lại lỗi để middleware xử lý
    if (error instanceof BadRequestError || error instanceof NotFoundError) {
      throw error;
    }
    throw new BadRequestError('Có lỗi xảy ra khi nộp đơn ứng tuyển.');
  }
};
