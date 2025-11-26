import * as supportRequestService from '../services/supportRequest.service.js';
import logger from '../utils/logger.js';

/**
 * Create a new support request
 * @route POST /api/support-requests
 * @access Private (Candidate, Recruiter)
 */
export const createSupportRequest = async (req, res) => {
  try {
    console.log('📝 Creating support request for user:', req.user);
    
    const userId = req.user._id.toString();
    const userType = req.user.role; // 'candidate' or 'recruiter'
    // Use validatedBody if available, otherwise fallback to body
    const data = req.validatedBody || req.body;
    const files = req.files || [];

    console.log('📝 Support request data:', { userId, userType, data, filesCount: files.length });

    const supportRequest = await supportRequestService.createSupportRequest(
      userId,
      userType,
      data,
      files
    );

    console.log('✅ Support request created:', supportRequest._id);

    res.status(201).json({
      success: true,
      message: 'Yêu cầu hỗ trợ đã được tạo thành công',
      data: supportRequest
    });
  } catch (error) {
    console.error('❌ Error in createSupportRequest controller:', error);
    logger.error('Error in createSupportRequest controller:', error);
    
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi khi tạo yêu cầu hỗ trợ',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Get user's support requests
 * @route GET /api/support-requests
 * @access Private (Candidate, Recruiter)
 */
export const getUserSupportRequests = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const filters = req.validatedQuery;

    const result = await supportRequestService.getUserSupportRequests(userId, filters);

    res.status(200).json({
      success: true,
      message: 'Lấy danh sách yêu cầu hỗ trợ thành công',
      ...result
    });
  } catch (error) {
    logger.error('Error in getUserSupportRequests controller:', error);
    throw error;
  }
};

/**
 * Get support request by ID
 * @route GET /api/support-requests/:id
 * @access Private (Candidate, Recruiter)
 */
export const getSupportRequestById = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const requestId = req.params.id;

    const supportRequest = await supportRequestService.getSupportRequestById(requestId, userId);

    // Auto mark as read when user views the request
    if (supportRequest.hasUnreadAdminResponse) {
      await supportRequestService.markAdminResponseAsRead(requestId, userId);
      supportRequest.hasUnreadAdminResponse = false;
    }

    res.status(200).json({
      success: true,
      message: 'Lấy chi tiết yêu cầu hỗ trợ thành công',
      data: supportRequest
    });
  } catch (error) {
    logger.error('Error in getSupportRequestById controller:', error);
    throw error;
  }
};

/**
 * Add follow-up message to support request
 * @route POST /api/support-requests/:id/messages
 * @access Private (Candidate, Recruiter)
 */
export const addFollowUpMessage = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const requestId = req.params.id;
    const messageData = req.validatedBody;
    const files = req.files || [];

    const supportRequest = await supportRequestService.addFollowUpMessage(
      requestId,
      userId,
      messageData,
      files
    );

    res.status(200).json({
      success: true,
      message: 'Tin nhắn theo dõi đã được thêm thành công',
      data: supportRequest
    });
  } catch (error) {
    logger.error('Error in addFollowUpMessage controller:', error);
    throw error;
  }
};

/**
 * Mark admin response as read
 * @route PATCH /api/support-requests/:id/read
 * @access Private (Candidate, Recruiter)
 */
export const markAdminResponseAsRead = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const requestId = req.params.id;

    const supportRequest = await supportRequestService.markAdminResponseAsRead(requestId, userId);

    res.status(200).json({
      success: true,
      message: 'Đã đánh dấu phản hồi admin là đã đọc',
      data: supportRequest
    });
  } catch (error) {
    logger.error('Error in markAdminResponseAsRead controller:', error);
    throw error;
  }
};
