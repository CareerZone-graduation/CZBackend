import Job from '../models/Job.js';
import RecruiterProfile from '../models/RecruiterProfile.js';
import { NotFoundError, UnauthorizedError, BadRequestError } from '../utils/AppError.js';

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

  if (!recruiterProfile.companyId) {
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
