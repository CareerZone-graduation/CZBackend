import RecruiterProfile from '../models/RecruiterProfile.js';
import { BadRequestError, NotFoundError } from '../utils/AppError.js';
import { uploadToCloudinary } from './upload.service.js';

/**
 * Get the company profile for a given recruiter user ID.
 * @param {string} recruiterUserId - The ID of the recruiter user.
 * @returns {Promise<object>} The recruiter profile document.
 */
const getRecruiterProfile = async (recruiterUserId) => {
  const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterUserId });
  if (!recruiterProfile) {
    throw new NotFoundError('Không tìm thấy hồ sơ nhà tuyển dụng.');
  }
  return recruiterProfile;
};

/**
 * Update the company info for the logged-in recruiter.
 * @param {string} recruiterUserId - The ID of the recruiter user.
 * @param {object} companyData - The data for the company.
 * @returns {Promise<object>} The updated company info.
 */
export const updateMyCompany = async (recruiterUserId, companyData) => {
  const recruiterProfile = await getRecruiterProfile(recruiterUserId);

  // If company does not exist, create it. Otherwise, update it.
  if (!recruiterProfile.company) {
    recruiterProfile.company = {};
  }
  
  Object.assign(recruiterProfile.company, companyData);
  await recruiterProfile.save();

  return recruiterProfile.company;
};

/**
 * Get the company info for the logged-in recruiter.
 * @param {string} recruiterUserId - The ID of the recruiter user.
 * @returns {Promise<object>} The company info.
 */
export const getMyCompany = async (recruiterUserId) => {
  const recruiterProfile = await getRecruiterProfile(recruiterUserId);
  if (!recruiterProfile.company) {
    throw new NotFoundError('Nhà tuyển dụng này chưa cập nhật thông tin công ty.');
  }
  return recruiterProfile.company;
};

/**
 * Update the company logo for the logged-in recruiter.
 * @param {string} recruiterUserId - The ID of the recruiter user.
 * @param {object} file - The uploaded file object.
 * @returns {Promise<object>} The updated company info.
 */
export const updateMyCompanyLogo = async (recruiterUserId, file) => {
  
  if (!file) {
    throw new BadRequestError('Vui lòng tải lên một file ảnh.');
  }

  const recruiterProfile = await getRecruiterProfile(recruiterUserId);
  if (!recruiterProfile.company) {
    throw new BadRequestError('Vui lòng cập nhật thông tin công ty trước khi thêm logo.');
  }

  const folder = `CareerZone/companies/${recruiterProfile.company._id}`;
  const uploadResult = await uploadToCloudinary(file.buffer, folder);

  recruiterProfile.company.logo = uploadResult.secure_url;
  await recruiterProfile.save();

  return recruiterProfile.company;
};

/**
 * Get all companies with pagination.
 * @param {object} options - Query options (page, limit, search, etc.).
 * @returns {Promise<object>} An object containing the list of companies and pagination metadata.
 */
export const getAllCompanies = async (options = {}) => {
  const page = parseInt(options.page, 10) || 1;
  const limit = parseInt(options.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const pipeline = [
    { $match: { 'company.name': { $exists: true, $ne: null } } },
    { $replaceRoot: { newRoot: '$company' } }
  ];

  if (options.search) {
    pipeline.unshift({ $match: { 'company.name': { $regex: options.search, $options: 'i' } } });
  }
  if (options.industry) {
    pipeline.unshift({ $match: { 'company.industry': options.industry } });
  }

  const countPipeline = [...pipeline, { $count: 'total' }];
  const totalResult = await RecruiterProfile.aggregate(countPipeline);
  const totalCompanies = totalResult.length > 0 ? totalResult[0].total : 0;

  pipeline.push({ $sort: { createdAt: -1 } });
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: limit });

  const companies = await RecruiterProfile.aggregate(pipeline);

  return {
    data: companies,
    meta: {
      currentPage: page,
      totalPages: Math.ceil(totalCompanies / limit),
      totalItems: totalCompanies,
      limit,
    },
  };
};

/**
 * Get a single company by its ID.
 * @param {string} companyId - The ID of the company.
 * @returns {Promise<object>} The company object.
 */
export const getCompanyById = async (companyId) => {
  const recruiterProfile = await RecruiterProfile.findOne({ 'company._id': companyId });
  if (!recruiterProfile || !recruiterProfile.company) {
    throw new NotFoundError('Không tìm thấy công ty.');
  }
  return recruiterProfile.company;
};
