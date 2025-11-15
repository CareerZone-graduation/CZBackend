import { RecruiterProfile } from '../models/index.js';
import { BadRequestError, NotFoundError } from '../utils/AppError.js';
import * as uploadService from './upload.service.js';

/**
 * Get the recruiter profile document for a given user ID.
 * @param {string} recruiterUserId - The ID of the recruiter user.
 * @returns {Promise<object>} The recruiter profile document.
 * @throws {NotFoundError} If the profile is not found.
 */
const getRecruiterProfile = async (recruiterUserId) => {
  const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterUserId });
  if (!recruiterProfile) {
    throw new NotFoundError('Không tìm thấy hồ sơ nhà tuyển dụng.');
  }
  return recruiterProfile;
};

/**
 * Creates a new company for a recruiter by embedding it in their profile.
 * Handles optional file upload for business registration.
 * @param {object} companyData - The data for the new company.
 * @param {string} recruiterUserId - The ID of the recruiter user creating the company.
 * @param {object} [file] - Optional uploaded file for business registration.
 * @returns {Promise<object>} The newly created company sub-document.
 */
export const createCompany = async (companyData, recruiterUserId, file) => {
  const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterUserId });
  if (recruiterProfile) {
  if (recruiterProfile.company && recruiterProfile.company.name) {
    throw new BadRequestError('Bạn đã đăng ký thông tin công ty rồi.');
  }
}

  const existingCompany = await RecruiterProfile.findOne({ 'company.name': companyData.name });
  if (existingCompany) {
    throw new BadRequestError(`Tên công ty '${companyData.name}' đã tồn tại.`);
  }

  const dataToCreate = { ...companyData };

  // Xử lý coordinates: nếu location có province, district, commune nhưng thiếu coordinates
  if (dataToCreate.location && 
      (!dataToCreate.location.coordinates || 
       !dataToCreate.location.coordinates.coordinates || 
       dataToCreate.location.coordinates.coordinates.length !== 2)) {
    // Nếu coordinates không đầy đủ, tạo tọa độ mặc định
    dataToCreate.location.coordinates = {
      type: 'Point',
      coordinates: [106.6297, 10.8231] // Tọa độ mặc định (TP.HCM)
    };
  }

  if (file) {
    const folder = `CareerZone/business_registrations`;
    const uploadResult = await uploadService.uploadToCloudinary(file.buffer, folder);
    dataToCreate.businessRegistrationUrl = uploadResult.secure_url;
  }

  recruiterProfile.company = dataToCreate;
  await recruiterProfile.save();

  return recruiterProfile.company;
};

/**
 * Update the company info for the logged-in recruiter.
 * Handles optional file upload for business registration.
 * @param {string} recruiterUserId - The ID of the recruiter user.
 * @param {object} companyData - The data for the company.
 * @param {object} [file] - Optional uploaded file for business registration.
 * @returns {Promise<object>} The updated company info.
 */
export const updateMyCompany = async (recruiterUserId, companyData, file) => {
  const recruiterProfile = await getRecruiterProfile(recruiterUserId);

  if (!recruiterProfile.company) {
    throw new BadRequestError('Bạn chưa có công ty. Vui lòng tạo công ty trước.');
  }

  const dataToUpdate = { ...companyData };

  // Xử lý coordinates nếu có cập nhật location
  if (dataToUpdate.location && 
      (!dataToUpdate.location.coordinates || 
       !dataToUpdate.location.coordinates.coordinates || 
       dataToUpdate.location.coordinates.coordinates.length !== 2)) {
    // Nếu coordinates không đầy đủ, tạo tọa độ mặc định
    dataToUpdate.location.coordinates = {
      type: 'Point',
      coordinates: [106.6297, 10.8231] // Tọa độ mặc định (TP.HCM)
    };
  }

  if (file) {
    const folder = `CareerZone/business_registrations/${recruiterProfile.company._id}`;
    const uploadResult = await uploadService.uploadToCloudinary(file.buffer, folder);
    dataToUpdate.businessRegistrationUrl = uploadResult.secure_url;
  }
  
  Object.assign(recruiterProfile.company, dataToUpdate);
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
  if (!recruiterProfile.company || !recruiterProfile.company.name) {
    throw new NotFoundError('Nhà tuyển dụng này chưa cập nhật thông tin công ty.');
  }
  
  const companyObject = recruiterProfile.company.toObject();
  companyObject.representativeName = recruiterProfile.fullname;
  
  return companyObject;
};

/**
 * Get my company address for the logged-in recruiter.
 * @param {string} recruiterUserId - The ID of the recruiter user.
 * @returns {Promise<object>} The company address object containing location and address fields.
 */
export const getMyCompanyAddress = async (recruiterUserId) => {
  const recruiterProfile = await getRecruiterProfile(recruiterUserId);
  
  if (!recruiterProfile.company || !recruiterProfile.company.name) {
    throw new NotFoundError('Nhà tuyển dụng này chưa cập nhật thông tin công ty.');
  }

  return {
    location: recruiterProfile.company.location,
    address: recruiterProfile.company.address
  };
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
  const uploadResult = await uploadService.uploadToCloudinary(file.buffer, folder);

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

  const query = { 'company.name': { $exists: true, $ne: null } };

  if (options.search) {
    query['company.name'] = { $regex: options.search, $options: 'i' };
  }
  if (options.industry) {
    query['company.industry'] = options.industry;
  }

  const totalCompanies = await RecruiterProfile.countDocuments(query);

  const profiles = await RecruiterProfile.find(query)
    .sort({ 'company.createdAt': -1 })
    .skip(skip)
    .limit(limit);

  const companies = profiles.map(p => p.company);

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
  // Thử tìm theo RecruiterProfile _id trước (dùng cho analytics)
  let recruiterProfile = await RecruiterProfile.findById(companyId);
  
  // Nếu không tìm thấy, thử tìm theo company._id (subdocument id)
  if (!recruiterProfile) {
    recruiterProfile = await RecruiterProfile.findOne({ 'company._id': companyId });
  }
  
  if (!recruiterProfile || !recruiterProfile.company) {
    throw new NotFoundError('Không tìm thấy công ty.');
  }
  
  // Trả về company data với _id của RecruiterProfile để navigate đúng
  return {
    ...recruiterProfile.company.toObject(),
    _id: recruiterProfile._id // Override với RecruiterProfile ID
  };
};
