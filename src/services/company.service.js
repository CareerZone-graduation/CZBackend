/**
 * Company Service
 * Handles company management and related operations
 * @module CompanyService
 */

import { Company, User, Job, Role } from '../models/index.js'; // Removed Candidate, added User and Role
import { cloudinaryService } from './cloudinary.service.js';
import logger from '../utils/logger.js';

// Fetch role IDs once for efficiency
let candidateRoleId = null;
let recruiterRoleId = null;

const initializeRoleIds = async () => {
  if (!candidateRoleId) {
    const candidateRole = await Role.findOne({ roleName: 'CANDIDATE' });
    if (candidateRole) candidateRoleId = candidateRole._id;
  }
  if (!recruiterRoleId) {
    const recruiterRole = await Role.findOne({ roleName: 'RECRUITER' });
    if (recruiterRole) recruiterRoleId = recruiterRole._id;
  }
};

/**
 * Create a new company
 * @param {Object} companyData - Company data
 * @param {string} userId - User ID (recruiter)
 * @returns {Promise<Object>} Created company
 */
export const createCompany = async (companyData, userId) => {
  try {
    await initializeRoleIds(); // Ensure role IDs are fetched

    // Check if recruiter already has a company
    const existingCompany = await Company.findOne({ recruiterId: userId }); // Use userId
    if (existingCompany) {
      throw new Error('Recruiter already has a company registered');
    }

    // Verify user exists and has correct role
    const user = await User.findById(userId).populate('role'); // Populate role
    if (!user || user.role.roleName !== 'RECRUITER') { // Check roleName
      throw new Error('Invalid user role for creating a company');
    }

    const company = new Company({
      ...companyData,
      recruiterId: userId, // Use userId
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await company.save();
    
    // Populate recruiter info (now user info)
    await company.populate('recruiterId', 'email fullname'); // Changed fullName to fullname

    logger.info(`Company created: ${company._id} by user: ${userId}`); // Log userId
    return company;
  } catch (error) {
    logger.error('Create company failed:', error);
    throw error;
  }
};

/**
 * Get company by ID
 * @param {string} companyId - Company ID
 * @returns {Promise<Object>} Company details
 */
export const getCompanyById = async (companyId) => {
  try {
    await initializeRoleIds(); // Ensure role IDs are fetched

    const company = await Company.findById(companyId)
      .populate('recruiterId', 'email fullname') // Changed fullName to fullname
      .lean();

    if (!company) {
      throw new Error('Company not found');
    }

    // Get additional statistics
    const [jobCount, followerCount] = await Promise.all([
      Job.countDocuments({ companyId, status: 'ACTIVE' }),
      candidateRoleId ? User.countDocuments({ followedCompanies: companyId, role: candidateRoleId }) : 0 // Use User model and candidateRoleId
    ]);

    return {
      ...company,
      statistics: {
        activeJobs: jobCount,
        followers: followerCount
      }
    };
  } catch (error) {
    logger.error('Get company by ID failed:', error);
    throw error;
  }
};

/**
 * Update company information
 * @param {string} companyId - Company ID
 * @param {Object} updateData - Update data
 * @param {string} userId - User ID (recruiter)
 * @returns {Promise<Object>} Updated company
 */
export const updateCompany = async (companyId, updateData, userId) => {
  try {
    const company = await Company.findById(companyId);
    
    if (!company) {
      throw new Error('Company not found');
    }

    // Check if user owns this company
    if (company.recruiterId.toString() !== userId) { // Use userId
      throw new Error('Not authorized to update this company');
    }

    // Update company
    Object.assign(company, updateData, { updatedAt: new Date() });
    await company.save();

    // Populate recruiter info (now user info)
    await company.populate('recruiterId', 'email fullname'); // Changed fullName to fullname

    logger.info(`Company updated: ${companyId} by user: ${userId}`); // Log userId
    return company;
  } catch (error) {
    logger.error('Update company failed:', error);
    throw error;
  }
};

/**
 * Delete company
 * @param {string} companyId - Company ID
 * @param {string} userId - User ID (recruiter)
 * @returns {Promise<void>}
 */
export const deleteCompany = async (companyId, userId) => {
  try {
    const company = await Company.findById(companyId);
    
    if (!company) {
      throw new Error('Company not found');
    }

    // Check if user owns this company
    if (company.recruiterId.toString() !== userId) { // Use userId
      throw new Error('Not authorized to delete this company');
    }

    // Check if company has active jobs
    const activeJobsCount = await Job.countDocuments({ 
      companyId, 
      status: { $in: ['ACTIVE', 'PAUSED'] } 
    });

    if (activeJobsCount > 0) {
      throw new Error('Cannot delete company with active jobs');
    }

    await Company.findByIdAndDelete(companyId);

    logger.info(`Company deleted: ${companyId} by user: ${userId}`); // Log userId
  } catch (error) {
    logger.error('Delete company failed:', error);
    throw error;
  }
};

/**
 * Get companies with filters and pagination
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Companies list with pagination
 */
export const getCompanies = async (options = {}) => {
  try {
    await initializeRoleIds(); // Ensure role IDs are fetched

    const {
      search,
      industry,
      location,
      companySize,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = options;

    // Build query
    const query = {};

    if (search) {
      query.$or = [
        { companyName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (industry) {
      query.industry = industry;
    }

    if (location) {
      query.location = { $regex: location, $options: 'i' };
    }

    if (companySize) {
      query.companySize = companySize;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query
    const [companies, total] = await Promise.all([
      Company.find(query)
        .populate('recruiterId', 'email fullname') // Changed fullName to fullname
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Company.countDocuments(query)
    ]);

    // Add statistics for each company
    const companiesWithStats = await Promise.all(
      companies.map(async (company) => {
        const [jobCount, followerCount] = await Promise.all([
          Job.countDocuments({ companyId: company._id, status: 'ACTIVE' }),
          candidateRoleId ? User.countDocuments({ followedCompanies: company._id, role: candidateRoleId }) : 0 // Use User model and candidateRoleId
        ]);

        return {
          ...company,
          statistics: {
            activeJobs: jobCount,
            followers: followerCount
          }
        };
      })
    );

    return {
      companies: companiesWithStats,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    };
  } catch (error) {
    logger.error('Get companies failed:', error);
    throw error;
  }
};

/**
 * Get companies by recruiter
 * @param {string} userId - User ID (recruiter)
 * @returns {Promise<Array>} Companies list
 */
export const getCompaniesByRecruiter = async (userId) => {
  try {
    await initializeRoleIds(); // Ensure role IDs are fetched

    const companies = await Company.find({ recruiterId: userId }) // Use userId
      .populate('recruiterId', 'email fullname') // Changed fullName to fullname
      .sort({ createdAt: -1 })
      .lean();

    // Add statistics for each company
    const companiesWithStats = await Promise.all(
      companies.map(async (company) => {
        const [jobCount, followerCount] = await Promise.all([
          Job.countDocuments({ companyId: company._id, status: 'ACTIVE' }),
          candidateRoleId ? User.countDocuments({ followedCompanies: company._id, role: candidateRoleId }) : 0 // Use User model and candidateRoleId
        ]);

        return {
          ...company,
          statistics: {
            activeJobs: jobCount,
            followers: followerCount
          }
        };
      })
    );

    return companiesWithStats;
  } catch (error) {
    logger.error('Get companies by recruiter failed:', error);
    throw error;
  }
};

/**
 * Upload company logo
 * @param {string} companyId - Company ID
 * @param {Object} file - File object
 * @param {string} userId - User ID (recruiter)
 * @returns {Promise<Object>} Updated company
 */
export const uploadCompanyLogo = async (companyId, file, userId) => {
  try {
    const company = await Company.findById(companyId);
    
    if (!company) {
      throw new Error('Company not found');
    }

    // Check if user owns this company
    if (company.recruiterId.toString() !== userId) { // Use userId
      throw new Error('Not authorized to update this company');
    }

    // Upload logo to Cloudinary
    const logoUrl = await cloudinaryService.uploadFile(
      file,
      'company-logos',
      `company_${companyId}_logo`
    );

    // Update company with new logo
    company.logoUrl = logoUrl;
    company.updatedAt = new Date();
    await company.save();

    // Populate recruiter info (now user info)
    await company.populate('recruiterId', 'email fullname'); // Changed fullName to fullname

    logger.info(`Company logo uploaded: ${companyId}`);
    return company;
  } catch (error) {
    logger.error('Upload company logo failed:', error);
    throw error;
  }
};

/**
 * Toggle follow/unfollow company
 * @param {string} companyId - Company ID
 * @param {string} userId - User ID (candidate)
 * @returns {Promise<Object>} Follow status
 */
export const toggleFollowCompany = async (companyId, userId) => {
  try {
    await initializeRoleIds(); // Ensure role IDs are fetched

    const company = await Company.findById(companyId);
    if (!company) {
      throw new Error('Company not found');
    }

    const user = await User.findById(userId); // Changed Candidate to User
    if (!user) {
      throw new Error('User not found');
    }

    // Ensure the user is a candidate
    if (!user.role || user.role.toString() !== candidateRoleId.toString()) { // Check role ObjectId
      throw new Error('Only candidates can follow companies');
    }

    // Check if already following
    // Assuming 'followedCompanies' is an array of ObjectIds on the User model
    const isFollowing = user.followedCompanies.includes(companyId);

    if (isFollowing) {
      // Unfollow
      user.followedCompanies = user.followedCompanies.filter(
        id => id.toString() !== companyId
      );
      await user.save();

      logger.info(`User ${userId} unfollowed company ${companyId}`); // Log userId
      return { isFollowing: false, message: 'Company unfollowed successfully' };
    } else {
      // Follow
      user.followedCompanies.push(companyId);
      await user.save();

      logger.info(`User ${userId} followed company ${companyId}`); // Log userId
      return { isFollowing: true, message: 'Company followed successfully' };
    }
  } catch (error) {
    logger.error('Toggle follow company failed:', error);
    throw error;
  }
};

/**
 * Get company followers
 * @param {string} companyId - Company ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Followers list with pagination
 */
export const getCompanyFollowers = async (companyId, options = {}) => {
  try {
    await initializeRoleIds(); // Ensure role IDs are fetched

    const company = await Company.findById(companyId);
    if (!company) {
      throw new Error('Company not found');
    }

    const { page = 1, limit = 10 } = options;
    const skip = (page - 1) * limit;

    // Get followers (Users with CANDIDATE role who follow this company)
    const [followers, total] = await Promise.all([
      candidateRoleId ? User.find({ followedCompanies: companyId, role: candidateRoleId }) // Use User model and candidateRoleId
        .select('fullname email avatar skills experiences educations cvs') // Updated select fields
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean() : [],
      candidateRoleId ? User.countDocuments({ followedCompanies: companyId, role: candidateRoleId }) : 0 // Use User model and candidateRoleId
    ]);

    return {
      followers,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    };
  } catch (error) {
    logger.error('Get company followers failed:', error);
    throw error;
  }
};

/**
 * Get company statistics
 * @param {string} companyId - Company ID
 * @returns {Promise<Object>} Company statistics
 */
export const getCompanyStats = async (companyId) => {
  try {
    await initializeRoleIds(); // Ensure role IDs are fetched

    const company = await Company.findById(companyId);
    if (!company) {
      throw new Error('Company not found');
    }

    const [
      totalJobs,
      activeJobs,
      totalApplications,
      totalFollowers,
      pendingApplications,
      hiredCandidates
    ] = await Promise.all([
      Job.countDocuments({ companyId }),
      Job.countDocuments({ companyId, status: 'ACTIVE' }),
      Job.aggregate([
        { $match: { companyId: company._id } },
        { $lookup: { from: 'applications', localField: '_id', foreignField: 'jobId', as: 'applications' } },
        { $group: { _id: null, total: { $sum: { $size: '$applications' } } } }
      ]).then(result => result[0]?.total || 0),
      candidateRoleId ? User.countDocuments({ followedCompanies: companyId, role: candidateRoleId }) : 0, // Use User model and candidateRoleId
      Job.aggregate([
        { $match: { companyId: company._id } },
        { $lookup: { from: 'applications', localField: '_id', foreignField: 'jobId', as: 'applications' } },
        { $unwind: '$applications' },
        { $match: { 'applications.status': 'PENDING' } },
        { $group: { _id: null, total: { $sum: 1 } } }
      ]).then(result => result[0]?.total || 0),
      Job.aggregate([
        { $match: { companyId: company._id } },
        { $lookup: { from: 'applications', localField: '_id', foreignField: 'jobId', as: 'applications' } },
        { $unwind: '$applications' },
        { $match: { 'applications.status': 'HIRED' } },
        { $group: { _id: null, total: { $sum: 1 } } }
      ]).then(result => result[0]?.total || 0)
    ]);

    return {
      totalJobs,
      activeJobs,
      totalApplications,
      totalFollowers,
      pendingApplications,
      hiredCandidates
    };
  } catch (error) {
    logger.error('Get company statistics failed:', error);
    throw error;
  }
};

/**
 * Company Service Object
 * Contains all company-related service methods
 */
export const companyService = {
  createCompany,
  getCompanyById,
  updateCompany,
  deleteCompany,
  getCompanies,
  getCompaniesByRecruiter,
  uploadCompanyLogo,
  toggleFollowCompany,
  getCompanyFollowers,
  getCompanyStats
};
