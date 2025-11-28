import asyncHandler from 'express-async-handler';
import * as adminService from '../services/admin.service.js';

// Quản lý Tin tuyển dụng
export const getJobs = asyncHandler(async (req, res) => {
  const result = await adminService.getJobsForAdmin(req.validatedQuery || req.query);
  res.json({
    success: true,
    message: 'Lấy danh sách tin tuyển dụng thành công.',
    ...result
  });
});

export const getJobDetail = asyncHandler(async (req, res) => {
  const data = await adminService.getJobDetail(req.params.id);
  res.json({
    success: true,
    message: 'Lấy chi tiết tin tuyển dụng thành công.',
    data
  });
});

export const approveJob = asyncHandler(async (req, res) => {
  const data = await adminService.approveJob(req.params.id);
  res.json({
    success: true,
    message: 'Phê duyệt tin tuyển dụng thành công.',
    data
  });
});

export const rejectJob = asyncHandler(async (req, res) => {
  const data = await adminService.rejectJob(req.params.id);
  res.json({
    success: true,
    message: 'Từ chối tin tuyển dụng thành công.',
    data
  });
});

// Quản lý Người dùng
export const getUsers = asyncHandler(async (req, res) => {
  const result = await adminService.getUsersForAdmin(req.validatedQuery || req.query);
  res.json({
    success: true,
    message: 'Lấy danh sách người dùng thành công.',
    ...result
  });
});

export const updateUserStatus = asyncHandler(async (req, res) => {
  const data = await adminService.updateUserStatus(req.params.id, req.body);
  res.json({
    success: true,
    message: 'Cập nhật trạng thái người dùng thành công.',
    data
  });
});

export const getUserDetail = asyncHandler(async (req, res) => {
  const data = await adminService.getUserDetail(req.params.id);
  res.json({
    success: true,
    message: 'Lấy chi tiết người dùng thành công.',
    data
  });
});

// Quản lý Công ty
export const getCompanies = asyncHandler(async (req, res) => {
  const result = await adminService.getCompaniesForAdmin(req.validatedQuery || req.query);
  res.json({
    success: true,
    message: 'Lấy danh sách công ty thành công.',
    ...result
  });
});


export const getCompanyDetail = asyncHandler(async (req, res) => {
  const data = await adminService.getCompanyDetail(req.params.id);
  res.json({
    success: true,
    message: 'Lấy chi tiết hồ sơ nhà tuyển dụng thành công.',
    data
  });
});

export const approveCompany = asyncHandler(async (req, res) => {
  const data = await adminService.approveCompany(req.params.id);
  res.json({
    success: true,
    message: 'Phê duyệt công ty thành công.',
    data
  });
});

export const rejectCompany = asyncHandler(async (req, res) => {
  const data = await adminService.rejectCompany(req.params.id, req.body);
  res.json({
    success: true,
    message: 'Từ chối công ty thành công.',
    data
  });
});

// Dashboard Thống kê
export const getStats = asyncHandler(async (req, res) => {
  const data = await adminService.getAdminStats();
  res.json({
    success: true,
    message: 'Lấy thống kê hệ thống thành công.',
    data
  });
});

// Quản lý Jobs của Công ty
export const getCompanyJobs = asyncHandler(async (req, res) => {
  const result = await adminService.getCompanyJobs(req.params.id, req.validatedQuery || req.query);
  res.json({
    success: true,
    message: 'Lấy danh sách tin tuyển dụng của công ty thành công.',
    ...result
  });
});

export const updateJobStatusByAdmin = asyncHandler(async (req, res) => {
  const data = await adminService.updateJobStatusByAdmin(req.params.id, req.body.status);
  res.json({
    success: true,
    message: 'Cập nhật trạng thái tin tuyển dụng thành công.',
    data
  });
});

export const activateJob = asyncHandler(async (req, res) => {
  const data = await adminService.activateJob(req.params.id);
  res.json({
    success: true,
    message: 'Kích hoạt tin tuyển dụng thành công.',
    data
  });
});

export const deactivateJob = asyncHandler(async (req, res) => {
  const data = await adminService.deactivateJob(req.params.id);
  res.json({
    success: true,
    message: 'Vô hiệu hóa tin tuyển dụng thành công.',
    data
  });
});



// =================================================================
// Quản lý Yêu cầu Hỗ trợ (Support Requests)
// =================================================================

import * as supportRequestService from '../services/supportRequest.service.js';
import logger from '../utils/logger.js';

/**
 * Get all support requests with filters
 * @route GET /api/admin/support-requests
 * @access Private (Admin only)
 */
export const getAllSupportRequests = asyncHandler(async (req, res) => {
  // Use req.query directly if validatedQuery is not available
  const query = req.validatedQuery || req.query;
  
  const filters = {
    status: query?.status,
    category: query?.category,
    priority: query?.priority,
    userType: query?.userType,
    keyword: query?.keyword,
    dateFrom: query?.fromDate,
    dateTo: query?.toDate,
    isGuest: query?.isGuest
  };
  
  console.log('📥 Admin getAllSupportRequests - Raw query:', req.query);
  console.log('📥 Admin getAllSupportRequests - Filters:', filters);

  const sort = {
    sortBy: query?.sortBy || '-createdAt'
  };

  const pagination = {
    page: parseInt(query?.page) || 1,
    limit: parseInt(query?.limit) || 10
  };
  
  console.log('📥 Admin getAllSupportRequests - Sort:', sort);
  console.log('📥 Admin getAllSupportRequests - Pagination:', pagination);

  const result = await supportRequestService.getAllSupportRequests(filters, sort, pagination);

  res.status(200).json({
    success: true,
    message: 'Lấy danh sách yêu cầu hỗ trợ thành công',
    ...result
  });
});

/**
 * Get support request by ID (admin view)
 * @route GET /api/admin/support-requests/:id
 * @access Private (Admin only)
 */
export const getAdminSupportRequestById = asyncHandler(async (req, res) => {
  const requestId = req.params.id;
  
  const { SupportRequest } = await import('../models/index.js');
  const supportRequest = await SupportRequest.findById(requestId).lean();

  if (!supportRequest) {
    return res.status(404).json({
      success: false,
      message: 'Không tìm thấy yêu cầu hỗ trợ'
    });
  }

  res.status(200).json({
    success: true,
    message: 'Lấy chi tiết yêu cầu hỗ trợ thành công',
    data: supportRequest
  });
});

/**
 * Respond to support request
 * @route POST /api/admin/support-requests/:id/respond
 * @access Private (Admin only)
 */
export const respondToRequest = asyncHandler(async (req, res) => {
  const adminId = req.user._id.toString();
  const requestId = req.params.id;
  const { response, statusUpdate, priorityUpdate } = req.validatedBody || req.body;

  const supportRequest = await supportRequestService.respondToRequest(
    requestId,
    adminId,
    response,
    statusUpdate,
    priorityUpdate
  );

  res.status(200).json({
    success: true,
    message: 'Phản hồi yêu cầu hỗ trợ thành công',
    data: supportRequest
  });
});

/**
 * Update support request status
 * @route PATCH /api/admin/support-requests/:id/status
 * @access Private (Admin only)
 */
export const updateRequestStatus = asyncHandler(async (req, res) => {
  const adminId = req.user._id.toString();
  const requestId = req.params.id;
  const { status } = req.validatedBody || req.body;

  const supportRequest = await supportRequestService.updateRequestStatus(
    requestId,
    adminId,
    status
  );

  res.status(200).json({
    success: true,
    message: 'Cập nhật trạng thái yêu cầu hỗ trợ thành công',
    data: supportRequest
  });
});

/**
 * Update support request priority
 * @route PATCH /api/admin/support-requests/:id/priority
 * @access Private (Admin only)
 */
export const updateRequestPriority = asyncHandler(async (req, res) => {
  const adminId = req.user._id.toString();
  const requestId = req.params.id;
  const { priority } = req.validatedBody || req.body;

  const supportRequest = await supportRequestService.updateRequestPriority(
    requestId,
    adminId,
    priority
  );

  res.status(200).json({
    success: true,
    message: 'Cập nhật độ ưu tiên yêu cầu hỗ trợ thành công',
    data: supportRequest
  });
});

/**
 * Reopen closed support request
 * @route POST /api/admin/support-requests/:id/reopen
 * @access Private (Admin only)
 */
export const reopenRequest = asyncHandler(async (req, res) => {
  const adminId = req.user._id.toString();
  const requestId = req.params.id;

  const supportRequest = await supportRequestService.reopenRequest(requestId, adminId);

  res.status(200).json({
    success: true,
    message: 'Mở lại yêu cầu hỗ trợ thành công',
    data: supportRequest
  });
});

/**
 * Get support request analytics
 * @route GET /api/admin/support-requests/analytics
 * @access Private (Admin only)
 */
export const getAnalytics = asyncHandler(async (req, res) => {
  const dateRange = {
    dateFrom: req.validatedQuery?.fromDate,
    dateTo: req.validatedQuery?.toDate
  };

  const analytics = await supportRequestService.getAnalytics(dateRange);

  res.status(200).json({
    success: true,
    message: 'Lấy dữ liệu phân tích thành công',
    data: analytics
  });
});
