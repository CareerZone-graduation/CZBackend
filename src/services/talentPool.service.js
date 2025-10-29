import mongoose from 'mongoose';
import {
  TalentPool,
  Application,
  CandidateProfile,
  RecruiterProfile,
} from '../models/index.js';
import { NotFoundError, UnauthorizedError, BadRequestError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

/**
 * Thêm candidate vào talent pool
 * @param {string} recruiterId - ID của nhà tuyển dụng
 * @param {string} applicationId - ID của đơn ứng tuyển
 * @param {Object} data - Tags và notes
 * @returns {Object} - Talent pool entry đã tạo
 */
export const addToTalentPool = async (recruiterId, applicationId, data = {}) => {
  // Verify recruiter
  const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId });
  if (!recruiterProfile) {
    throw new UnauthorizedError('Bạn không phải là nhà tuyển dụng');
  }

  // Get application
  const application = await Application.findById(applicationId)
    .populate('jobId')
    .populate('candidateProfileId');
  
  if (!application) {
    throw new NotFoundError('Không tìm thấy đơn ứng tuyển');
  }

  // Verify ownership
  if (application.jobId.recruiterProfileId.toString() !== recruiterProfile._id.toString()) {
    throw new UnauthorizedError('Bạn không có quyền thêm ứng viên này vào talent pool');
  }

  // Check if already in talent pool
  const existing = await TalentPool.findOne({
    recruiterProfileId: recruiterProfile._id,
    candidateProfileId: application.candidateProfileId._id
  });

  if (existing) {
    throw new BadRequestError('Ứng viên này đã có trong talent pool của bạn');
  }

  // Create talent pool entry
  const talentPoolEntry = await TalentPool.create({
    recruiterProfileId: recruiterProfile._id,
    candidateProfileId: application.candidateProfileId._id,
    applicationId: application._id,
    tags: data.tags || [],
    notes: data.notes || '',
    candidateSnapshot: {
      name: application.candidateName,
      email: application.candidateEmail,
      phone: application.candidatePhone,
      title: application.candidateProfileId.title,
      avatar: application.candidateProfileId.avatar,
      appliedJobTitle: application.jobSnapshot.title,
      appliedJobId: application.jobId._id
    }
  });

  logger.info(`Added candidate ${application.candidateProfileId._id} to talent pool`);

  return talentPoolEntry;
};

/**
 * Xóa candidate khỏi talent pool
 * @param {string} recruiterId - ID của nhà tuyển dụng
 * @param {string} talentPoolId - ID của talent pool entry
 * @returns {Object} - Kết quả xóa
 */
export const removeFromTalentPool = async (recruiterId, talentPoolId) => {
  // Verify recruiter
  const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId });
  if (!recruiterProfile) {
    throw new UnauthorizedError('Bạn không phải là nhà tuyển dụng');
  }

  // Get talent pool entry
  const entry = await TalentPool.findById(talentPoolId);
  if (!entry) {
    throw new NotFoundError('Không tìm thấy ứng viên trong talent pool');
  }

  // Verify ownership
  if (entry.recruiterProfileId.toString() !== recruiterProfile._id.toString()) {
    throw new UnauthorizedError('Bạn không có quyền xóa ứng viên này khỏi talent pool');
  }

  await TalentPool.findByIdAndDelete(talentPoolId);

  return { success: true };
};

/**
 * Lấy danh sách talent pool
 * @param {string} recruiterId - ID của nhà tuyển dụng
 * @param {Object} options - Filter và pagination options
 * @returns {Object} - Data và meta
 */
export const getTalentPool = async (recruiterId, options = {}) => {
  // Verify recruiter
  const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId });
  if (!recruiterProfile) {
    throw new UnauthorizedError('Bạn không phải là nhà tuyển dụng');
  }

  // Pagination
  const page = options.page || 1;
  const limit = options.limit || 10;
  const skip = (page - 1) * limit;

  // Build filter
  const filter = { recruiterProfileId: recruiterProfile._id };

  // Filter by tags
  if (options.tags && options.tags.length > 0) {
    filter.tags = { $in: options.tags };
  }

  // Sort
  let sortOptions = { addedAt: -1 };
  if (options.sort) {
    if (options.sort.startsWith('-')) {
      sortOptions = { [options.sort.substring(1)]: -1 };
    } else {
      sortOptions = { [options.sort]: 1 };
    }
  }

  // Build aggregation pipeline
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
    { $unwind: '$candidateProfile' },
    {
      $project: {
        _id: 1,
        tags: 1,
        notes: 1,
        addedAt: 1,
        applicationId: 1,
        candidateProfileId: 1,
        candidateSnapshot: 1,
        candidateProfile: {
          _id: 1,
          title: 1,
          skills: 1,
          yearsOfExperience: 1,
          avatar: 1
        }
      }
    }
  ];

  // Search
  if (options.search) {
    const searchRegex = new RegExp(options.search, 'i');
    pipeline.push({
      $match: {
        $or: [
          { 'candidateSnapshot.name': searchRegex },
          { 'candidateSnapshot.email': searchRegex },
          { tags: searchRegex }
        ]
      }
    });
  }

  pipeline.push({ $sort: sortOptions });
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: limit });

  // Execute
  const results = await TalentPool.aggregate(pipeline);

  // Count
  const countFilter = { ...filter };
  if (options.search) {
    const searchRegex = new RegExp(options.search, 'i');
    countFilter.$or = [
      { 'candidateSnapshot.name': searchRegex },
      { 'candidateSnapshot.email': searchRegex },
      { tags: searchRegex }
    ];
  }
  
  const total = await TalentPool.countDocuments(countFilter);

  return {
    data: results,
    meta: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      limit
    }
  };
};

/**
 * Cập nhật tags và notes cho talent pool entry
 * @param {string} recruiterId - ID của nhà tuyển dụng
 * @param {string} talentPoolId - ID của talent pool entry
 * @param {Object} data - Tags và notes mới
 * @returns {Object} - Entry đã cập nhật
 */
export const updateTalentPoolEntry = async (recruiterId, talentPoolId, data) => {
  // Verify recruiter
  const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId });
  if (!recruiterProfile) {
    throw new UnauthorizedError('Bạn không phải là nhà tuyển dụng');
  }

  // Get talent pool entry
  const entry = await TalentPool.findById(talentPoolId);
  if (!entry) {
    throw new NotFoundError('Không tìm thấy ứng viên trong talent pool');
  }

  // Verify ownership
  if (entry.recruiterProfileId.toString() !== recruiterProfile._id.toString()) {
    throw new UnauthorizedError('Bạn không có quyền cập nhật ứng viên này');
  }

  // Update
  if (data.tags !== undefined) {
    entry.tags = data.tags;
  }
  if (data.notes !== undefined) {
    entry.notes = data.notes;
  }

  await entry.save();

  return entry;
};
