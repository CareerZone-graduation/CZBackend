import mongoose from 'mongoose';
import { SupportRequest, User } from '../models/index.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/AppError.js';
import logger from '../utils/logger.js';
import cloudinary from '../config/cloudinary.js';
import { pushNotification } from './notification.service.js';
import { sendSupportResponseEmail } from './email.service.js';

// =================================================================
// Helper Services
// =================================================================

/**
 * Upload attachments to Cloudinary
 * @param {Array} files - Array of file objects from multer
 * @returns {Promise<Array>} Array of attachment metadata
 */
export const uploadAttachments = async (files) => {
  if (!files || files.length === 0) {
    return [];
  }

  if (files.length > 5) {
    throw new BadRequestError('Cannot upload more than 5 files');
  }

  const uploadPromises = files.map(async (file) => {
    // Validate file size (10MB max)
    if (file.size > 10485760) {
      throw new BadRequestError(`File ${file.originalname} exceeds 10MB limit`);
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 
                          'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                          'text/plain'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestError(`File type ${file.mimetype} is not allowed`);
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'support-requests',
          resource_type: 'auto',
        },
        (error, result) => {
          if (error) {
            logger.error('Cloudinary upload error:', error);
            return reject(new BadRequestError('Failed to upload file'));
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            filename: file.originalname,
            fileType: file.mimetype,
            fileSize: file.size
          });
        }
      );
      uploadStream.end(file.buffer);
    });
  });

  return await Promise.all(uploadPromises);
};

/**
 * Delete attachments from Cloudinary
 * @param {Array<string>} publicIds - Array of Cloudinary public IDs
 * @returns {Promise<void>}
 */
export const deleteAttachments = async (publicIds) => {
  if (!publicIds || publicIds.length === 0) {
    return;
  }

  try {
    await Promise.all(
      publicIds.map(publicId => cloudinary.uploader.destroy(publicId))
    );
    logger.info(`Deleted ${publicIds.length} attachments from Cloudinary`);
  } catch (error) {
    logger.error('Error deleting attachments from Cloudinary:', error);
    // Don't throw error - this is cleanup, shouldn't block main operation
  }
};

/**
 * Sanitize input to prevent XSS attacks
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
export const sanitizeInput = (text) => {
  if (!text || typeof text !== 'string') {
    return text;
  }

  // Remove HTML tags and script content
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
};

/**
 * Send notification to all admins
 * @param {object} supportRequestData - Support request data
 * @returns {Promise<void>}
 */
export const sendNotificationToAdmin = async (supportRequestData) => {
  try {
    // Find all admin users
    const admins = await User.find({ role: 'admin', active: true }).select('_id').lean();
    
    if (admins.length === 0) {
      logger.warn('No active admin users found to send notification');
      return;
    }

    const title = '🆘 Yêu cầu hỗ trợ mới';
    const message = `${supportRequestData.requester.name} đã gửi yêu cầu hỗ trợ: "${supportRequestData.subject}"`;

    // Send notification to all admins
    const notificationPromises = admins.map(admin =>
      pushNotification(admin._id.toString(), {
        title,
        body: message,
        type: 'support_request',
        data: {
          url: `/admin/support-requests/${supportRequestData._id}`,
          supportRequestId: supportRequestData._id.toString()
        }
      })
    );

    await Promise.all(notificationPromises);
    logger.info(`Sent support request notification to ${admins.length} admins`);
  } catch (error) {
    logger.error('Error sending notification to admins:', error);
    // Don't throw - notification failure shouldn't block request creation
  }
};

/**
 * Send notification to user
 * @param {string} userId - User ID
 * @param {object} supportRequestData - Support request data
 * @returns {Promise<void>}
 */
export const sendNotificationToUser = async (userId, supportRequestData) => {
  try {
    const title = '💬 Phản hồi từ quản trị viên';
    const message = `Bạn có phản hồi mới cho yêu cầu hỗ trợ: "${supportRequestData.subject}"`;

    await pushNotification(userId, {
      title,
      body: message,
      type: 'support_request',
      data: {
        url: `/support-requests/${supportRequestData._id}`,
        supportRequestId: supportRequestData._id.toString()
      }
    });

    logger.info(`Sent support request response notification to user ${userId}`);
  } catch (error) {
    logger.error('Error sending notification to user:', error);
    // Don't throw - notification failure shouldn't block response
  }
};

// =================================================================
// User Services
// =================================================================

/**
 * Create a new support request
 * @param {string} userId - User ID
 * @param {string} userType - User type (candidate/recruiter)
 * @param {object} data - Request data (subject, description, category)
 * @param {Array} files - Uploaded files
 * @returns {Promise<SupportRequest>} Created support request
 */
export const createSupportRequest = async (userId, userType, data, files) => {
  try {
    // Get user information
    const user = await User.findById(userId).select('email').lean();
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Get user name based on user type
    let userName;
    if (userType === 'candidate') {
      const { CandidateProfile } = await import('../models/index.js');
      const profile = await CandidateProfile.findOne({ userId }).select('fullname').lean();
      userName = profile?.fullname || user.email;
    } else if (userType === 'recruiter') {
      const { RecruiterProfile } = await import('../models/index.js');
      const profile = await RecruiterProfile.findOne({ userId }).select('fullname').lean();
      userName = profile?.fullname || user.email;
    }

    // Sanitize input
    const sanitizedSubject = sanitizeInput(data.subject);
    const sanitizedDescription = sanitizeInput(data.description);

    // Upload attachments
    const attachments = await uploadAttachments(files);

    // Create support request
    const supportRequest = await SupportRequest.create({
      requester: {
        userId: new mongoose.Types.ObjectId(userId),
        userType,
        name: userName,
        email: user.email
      },
      subject: sanitizedSubject,
      description: sanitizedDescription,
      category: data.category,
      attachments
    });

    // Send notification to admins
    await sendNotificationToAdmin(supportRequest);

    logger.info(`Support request created: ${supportRequest._id} by user ${userId}`);
    return supportRequest;
  } catch (error) {
    logger.error('Error creating support request:', error);
    throw error;
  }
};

/**
 * Get user's support requests with filters
 * @param {string} userId - User ID
 * @param {object} filters - Filter options (status, category, page, limit)
 * @returns {Promise<object>} Support requests with pagination
 */
export const getUserSupportRequests = async (userId, filters = {}) => {
  try {
    const page = parseInt(filters.page, 10) || 1;
    const limit = Math.min(parseInt(filters.limit, 10) || 10, 50);
    const skip = (page - 1) * limit;

    // Build query
    const query = { 'requester.userId': new mongoose.Types.ObjectId(userId) };
    
    logger.info(`Getting support requests for user ${userId} with filters:`, filters);
    logger.info(`Query:`, query);

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.category) {
      query.category = filters.category;
    }

    // Execute query with pagination
    const [requests, totalItems] = await Promise.all([
      SupportRequest.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-messages -adminResponses') // Exclude detailed messages for list view
        .lean(),
      SupportRequest.countDocuments(query)
    ]);

    logger.info(`Found ${requests.length} support requests out of ${totalItems} total`);

    const totalPages = Math.ceil(totalItems / limit);

    return {
      data: requests,
      meta: {
        currentPage: page,
        totalPages,
        totalItems,
        limit
      }
    };
  } catch (error) {
    logger.error('Error getting user support requests:', error);
    throw error;
  }
};

/**
 * Get support request by ID with access control
 * @param {string} requestId - Support request ID
 * @param {string} userId - User ID
 * @returns {Promise<SupportRequest>} Support request details
 */
export const getSupportRequestById = async (requestId, userId) => {
  try {
    const supportRequest = await SupportRequest.findById(requestId).lean();

    if (!supportRequest) {
      throw new NotFoundError('Support request not found');
    }

    // Check if user has access to this request
    // Only check userId if the request has a userId (not public contact form)
    if (supportRequest.requester.userId && supportRequest.requester.userId.toString() !== userId) {
      throw new ForbiddenError('You do not have access to this support request');
    }

    return supportRequest;
  } catch (error) {
    logger.error('Error getting support request by ID:', error);
    throw error;
  }
};

/**
 * Add follow-up message to support request
 * @param {string} requestId - Support request ID
 * @param {string} userId - User ID
 * @param {object} messageData - Message data (content)
 * @param {Array} files - Uploaded files
 * @returns {Promise<SupportRequest>} Updated support request
 */
export const addFollowUpMessage = async (requestId, userId, messageData, files) => {
  try {
    const supportRequest = await SupportRequest.findById(requestId);

    if (!supportRequest) {
      throw new NotFoundError('Support request not found');
    }

    // Check access
    if (supportRequest.requester.userId.toString() !== userId) {
      throw new ForbiddenError('You do not have access to this support request');
    }

    // Check if message can be added
    if (!supportRequest.canAddMessage()) {
      throw new BadRequestError('Cannot add message to a resolved or closed support request');
    }

    // Get user information
    const user = await User.findById(userId).select('email').lean();
    let userName;
    
    if (supportRequest.requester.userType === 'candidate') {
      const { CandidateProfile } = await import('../models/index.js');
      const profile = await CandidateProfile.findOne({ userId }).select('fullname').lean();
      userName = profile?.fullname || user.email;
    } else {
      const { RecruiterProfile } = await import('../models/index.js');
      const profile = await RecruiterProfile.findOne({ userId }).select('fullname').lean();
      userName = profile?.fullname || user.email;
    }

    // Sanitize input
    const sanitizedContent = sanitizeInput(messageData.content);

    // Upload attachments
    const attachments = await uploadAttachments(files);

    // Add message
    supportRequest.messages.push({
      sender: {
        userId: new mongoose.Types.ObjectId(userId),
        userType: supportRequest.requester.userType,
        name: userName
      },
      content: sanitizedContent,
      attachments,
      createdAt: new Date()
    });

    await supportRequest.save();

    // Send notification to admins
    await sendNotificationToAdmin(supportRequest);

    logger.info(`Follow-up message added to support request ${requestId} by user ${userId}`);
    return supportRequest;
  } catch (error) {
    logger.error('Error adding follow-up message:', error);
    throw error;
  }
};

/**
 * Mark admin response as read
 * @param {string} requestId - Support request ID
 * @param {string} userId - User ID
 * @returns {Promise<SupportRequest>} Updated support request
 */
export const markAdminResponseAsRead = async (requestId, userId) => {
  try {
    const supportRequest = await SupportRequest.findById(requestId);

    if (!supportRequest) {
      throw new NotFoundError('Support request not found');
    }

    // Check access
    if (supportRequest.requester.userId.toString() !== userId) {
      throw new ForbiddenError('You do not have access to this support request');
    }

    // Mark as read
    await supportRequest.markAdminResponseAsRead();

    logger.info(`Admin response marked as read for support request ${requestId}`);
    return supportRequest;
  } catch (error) {
    logger.error('Error marking admin response as read:', error);
    throw error;
  }
};

// =================================================================
// Admin Services
// =================================================================

/**
 * Get all support requests with filters, search, and sorting
 * @param {object} filters - Filter options (status, category, priority, dateRange, keyword)
 * @param {object} sort - Sort options
 * @param {object} pagination - Pagination options (page, limit)
 * @returns {Promise<object>} Support requests with pagination
 */
export const getAllSupportRequests = async (filters = {}, sort = {}, pagination = {}) => {
  try {
    console.log('🔍 getAllSupportRequests called with:', { filters, sort, pagination });
    
    const page = parseInt(pagination.page, 10) || 1;
    const limit = Math.min(parseInt(pagination.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    // Build query
    const query = {};

    if (filters.status) {
      // Handle comma-separated status values
      const statusArray = typeof filters.status === 'string' 
        ? filters.status.split(',').map(s => s.trim())
        : filters.status;
      
      if (Array.isArray(statusArray) && statusArray.length > 0) {
        query.status = statusArray.length === 1 ? statusArray[0] : { $in: statusArray };
      } else {
        query.status = filters.status;
      }
    }

    if (filters.category) {
      query.category = filters.category;
    }

    if (filters.priority) {
      query.priority = filters.priority;
    }

    // Date range filter
    if (filters.dateFrom || filters.dateTo) {
      query.createdAt = {};
      if (filters.dateFrom) {
        query.createdAt.$gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        query.createdAt.$lte = new Date(filters.dateTo);
      }
    }

    // Keyword search in subject and description
    if (filters.keyword) {
      query.$or = [
        { subject: { $regex: filters.keyword, $options: 'i' } },
        { description: { $regex: filters.keyword, $options: 'i' } }
      ];
    }

    // Filter by user type (candidate/recruiter)
    if (filters.userType) {
      query['requester.userType'] = filters.userType;
    }

    // Handle isGuest filter - check requester.userId field
    // If logged in: requester.userId has value (ObjectId), if guest: requester.userId is null
    if (filters.isGuest === 'true' || filters.isGuest === true) {
      query['requester.userId'] = null; // Guest: userId is null
    } else if (filters.isGuest === 'false' || filters.isGuest === false) {
      query['requester.userId'] = { $ne: null }; // Logged in: userId has value
    }

    console.log('📝 Query:', JSON.stringify(query, null, 2));
    console.log('📝 isGuest filter:', filters.isGuest);

    // Build sort
    const sortOptions = {};
    
    // Parse sortBy string (e.g., "-createdAt" or "createdAt")
    if (sort.sortBy) {
      const sortBy = sort.sortBy;
      const isDesc = sortBy.startsWith('-');
      const field = isDesc ? sortBy.substring(1) : sortBy;
      sortOptions[field] = isDesc ? -1 : 1;
    } else if (sort.priority) {
      sortOptions.priority = sort.priority === 'desc' ? -1 : 1;
    } else if (sort.createdAt) {
      sortOptions.createdAt = sort.createdAt === 'desc' ? -1 : 1;
    } else {
      // Default: newest first
      sortOptions.createdAt = -1;
    }

    console.log('🔀 Sort options:', sortOptions);

    // Execute query
    const [requests, totalItems] = await Promise.all([
      SupportRequest.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .select('-messages -adminResponses')
        .lean(),
      SupportRequest.countDocuments(query)
    ]);

    console.log(`✅ Found ${requests.length} requests out of ${totalItems} total`);

    const totalPages = Math.ceil(totalItems / limit);

    const result = {
      data: requests,
      meta: {
        currentPage: page,
        totalPages,
        totalItems,
        limit
      }
    };

    console.log('📤 Returning result:', { dataCount: result.data.length, meta: result.meta });

    return result;
  } catch (error) {
    console.error('❌ Error getting all support requests:', error);
    logger.error('Error getting all support requests:', error);
    throw error;
  }
};

/**
 * Respond to a support request
 * @param {string} requestId - Support request ID
 * @param {string} adminId - Admin user ID
 * @param {string} response - Response content
 * @param {string} statusUpdate - Optional status update
 * @param {string} priorityUpdate - Optional priority update
 * @returns {Promise<SupportRequest>} Updated support request
 */
export const respondToRequest = async (requestId, adminId, response, statusUpdate = null, priorityUpdate = null) => {
  try {
    const supportRequest = await SupportRequest.findById(requestId);

    if (!supportRequest) {
      throw new NotFoundError('Support request not found');
    }

    // Get admin information
    const admin = await User.findById(adminId).select('email').lean();
    if (!admin) {
      throw new NotFoundError('Admin user not found');
    }

    // Get admin name (use email as fallback)
    const adminName = admin.email;

    // Sanitize response
    const sanitizedResponse = sanitizeInput(response);

    // Build admin response object
    const adminResponse = {
      adminId: new mongoose.Types.ObjectId(adminId),
      adminName,
      response: sanitizedResponse,
      createdAt: new Date()
    };

    // Auto-change status to 'in-progress' on first admin response if still pending
    const isFirstResponse = supportRequest.adminResponses.length === 0;
    const shouldAutoInProgress = isFirstResponse && supportRequest.status === 'pending' && !statusUpdate;

    // Determine final status update
    let finalStatusUpdate = statusUpdate;
    if (shouldAutoInProgress) {
      finalStatusUpdate = 'in-progress';
    }

    // Track status change
    if (finalStatusUpdate && finalStatusUpdate !== supportRequest.status) {
      adminResponse.statusChange = {
        from: supportRequest.status,
        to: finalStatusUpdate
      };

      // Update status and timestamps
      const oldStatus = supportRequest.status;
      supportRequest.status = finalStatusUpdate;

      if (finalStatusUpdate === 'resolved' && oldStatus !== 'resolved') {
        supportRequest.resolvedAt = new Date();
      }

      if (finalStatusUpdate === 'closed' && oldStatus !== 'closed') {
        supportRequest.closedAt = new Date();
      }
    }

    // Track priority change
    if (priorityUpdate && priorityUpdate !== supportRequest.priority) {
      adminResponse.priorityChange = {
        from: supportRequest.priority,
        to: priorityUpdate
      };
      supportRequest.priority = priorityUpdate;
    }

    // Add admin response
    supportRequest.adminResponses.push(adminResponse);
    
    // Mark as having unread admin response
    supportRequest.hasUnreadAdminResponse = true;

    await supportRequest.save();

    // Send notification and email to user
    if (supportRequest.requester.userId) {
      // For registered users: send in-app notification
      await sendNotificationToUser(supportRequest.requester.userId.toString(), supportRequest);
    }
    
    // Always send email notification to requester (both registered and public users)
    try {
      await sendSupportResponseEmail(supportRequest, adminResponse);
      logger.info(`Support response email sent to ${supportRequest.requester.email}`);
    } catch (emailError) {
      logger.error('Error sending support response email:', emailError);
      // Don't throw error - email failure shouldn't block the response
    }

    logger.info(`Admin ${adminId} responded to support request ${requestId}`);
    return supportRequest;
  } catch (error) {
    logger.error('Error responding to support request:', error);
    throw error;
  }
};

/**
 * Update support request status
 * @param {string} requestId - Support request ID
 * @param {string} adminId - Admin user ID
 * @param {string} newStatus - New status
 * @returns {Promise<SupportRequest>} Updated support request
 */
export const updateRequestStatus = async (requestId, adminId, newStatus) => {
  try {
    const supportRequest = await SupportRequest.findById(requestId);

    if (!supportRequest) {
      throw new NotFoundError('Support request not found');
    }

    // Validate status transition
    const validTransitions = {
      'pending': ['in-progress', 'closed','resolved'],
      'in-progress': ['resolved', 'closed'],
      'resolved': ['closed', 'in-progress'],
      'closed': [] // Closed requests should use reopen function
    };

    const currentStatus = supportRequest.status;
    if (!validTransitions[currentStatus].includes(newStatus)) {
      throw new BadRequestError(`Invalid status transition from ${currentStatus} to ${newStatus}`);
    }

    // Update status
    supportRequest.status = newStatus;

    // Update timestamps
    if (newStatus === 'resolved' && currentStatus !== 'resolved') {
      supportRequest.resolvedAt = new Date();
    }

    if (newStatus === 'closed' && currentStatus !== 'closed') {
      supportRequest.closedAt = new Date();
    }

    await supportRequest.save();

    // Send notification to user
    await sendNotificationToUser(supportRequest.requester.userId.toString(), supportRequest);

    logger.info(`Admin ${adminId} updated status of support request ${requestId} to ${newStatus}`);
    return supportRequest;
  } catch (error) {
    logger.error('Error updating support request status:', error);
    throw error;
  }
};

/**
 * Update support request priority
 * @param {string} requestId - Support request ID
 * @param {string} adminId - Admin user ID
 * @param {string} newPriority - New priority
 * @returns {Promise<SupportRequest>} Updated support request
 */
export const updateRequestPriority = async (requestId, adminId, newPriority) => {
  try {
    const supportRequest = await SupportRequest.findById(requestId);

    if (!supportRequest) {
      throw new NotFoundError('Support request not found');
    }

    // Validate priority
    const validPriorities = ['low', 'medium', 'high', 'urgent'];
    if (!validPriorities.includes(newPriority)) {
      throw new BadRequestError(`Invalid priority: ${newPriority}`);
    }

    // Update priority
    supportRequest.priority = newPriority;
    await supportRequest.save();

    logger.info(`Admin ${adminId} updated priority of support request ${requestId} to ${newPriority}`);
    return supportRequest;
  } catch (error) {
    logger.error('Error updating support request priority:', error);
    throw error;
  }
};

/**
 * Reopen a closed support request
 * @param {string} requestId - Support request ID
 * @param {string} adminId - Admin user ID
 * @returns {Promise<SupportRequest>} Updated support request
 */
export const reopenRequest = async (requestId, adminId) => {
  try {
    const supportRequest = await SupportRequest.findById(requestId);

    if (!supportRequest) {
      throw new NotFoundError('Support request not found');
    }

    // Validate that request can be reopened
    if (!supportRequest.canReopen()) {
      throw new BadRequestError('Only closed support requests can be reopened');
    }

    // Reopen request
    supportRequest.status = 'in-progress';
    supportRequest.reopenedAt = new Date();
    supportRequest.reopenedBy = new mongoose.Types.ObjectId(adminId);

    await supportRequest.save();

    // Send notification to user
    await sendNotificationToUser(supportRequest.requester.userId.toString(), supportRequest);

    logger.info(`Admin ${adminId} reopened support request ${requestId}`);
    return supportRequest;
  } catch (error) {
    logger.error('Error reopening support request:', error);
    throw error;
  }
};

/**
 * Get analytics for support requests
 * @param {object} dateRange - Date range filter (dateFrom, dateTo)
 * @returns {Promise<object>} Analytics data
 */
export const getAnalytics = async (dateRange = {}) => {
  try {
    // Build date filter
    const dateFilter = {};
    if (dateRange.dateFrom || dateRange.dateTo) {
      dateFilter.createdAt = {};
      if (dateRange.dateFrom) {
        dateFilter.createdAt.$gte = new Date(dateRange.dateFrom);
      }
      if (dateRange.dateTo) {
        dateFilter.createdAt.$lte = new Date(dateRange.dateTo);
      }
    }

    // Get count by status
    const statusCounts = await SupportRequest.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get count by category
    const categoryCounts = await SupportRequest.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      }
    ]);

    // Calculate average response time (time from creation to first admin response)
    const responseTimeData = await SupportRequest.aggregate([
      { $match: { ...dateFilter, 'adminResponses.0': { $exists: true } } },
      {
        $project: {
          responseTime: {
            $subtract: [
              { $arrayElemAt: ['$adminResponses.createdAt', 0] },
              '$createdAt'
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgResponseTime: { $avg: '$responseTime' }
        }
      }
    ]);

    // Calculate average resolution time (time from creation to resolved)
    const resolutionTimeData = await SupportRequest.aggregate([
      { $match: { ...dateFilter, resolvedAt: { $exists: true, $ne: null } } },
      {
        $project: {
          resolutionTime: {
            $subtract: ['$resolvedAt', '$createdAt']
          }
        }
      },
      {
        $group: {
          _id: null,
          avgResolutionTime: { $avg: '$resolutionTime' }
        }
      }
    ]);

    // Format results
    const countByStatus = {};
    statusCounts.forEach(item => {
      countByStatus[item._id] = item.count;
    });

    const countByCategory = {};
    categoryCounts.forEach(item => {
      countByCategory[item._id] = item.count;
    });

    // Convert milliseconds to hours
    const avgResponseTimeHours = responseTimeData.length > 0 
      ? Math.round((responseTimeData[0].avgResponseTime / (1000 * 60 * 60)) * 100) / 100 
      : 0;

    const avgResolutionTimeHours = resolutionTimeData.length > 0 
      ? Math.round((resolutionTimeData[0].avgResolutionTime / (1000 * 60 * 60)) * 100) / 100 
      : 0;

    return {
      countByStatus,
      countByCategory,
      avgResponseTimeHours,
      avgResolutionTimeHours,
      totalRequests: statusCounts.reduce((sum, item) => sum + item.count, 0)
    };
  } catch (error) {
    logger.error('Error getting support request analytics:', error);
    throw error;
  }
};
