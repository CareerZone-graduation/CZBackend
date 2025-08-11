import asyncHandler from 'express-async-handler';
import * as adminService from '../services/admin.service.js';

// Quản lý Tin tuyển dụng
export const getJobs = asyncHandler(async (req, res) => {
  const result = await adminService.getJobsForAdmin(req.query);
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
  const result = await adminService.getUsersForAdmin(req.query);
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

// Quản lý Công ty
export const getCompanies = asyncHandler(async (req, res) => {
  const result = await adminService.getCompaniesForAdmin(req.query);
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
  const data = await adminService.rejectCompany(req.params.id);
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


export const verifyCompany = asyncHandler(async (req, res) => {
  const data = await adminService.verifyCompany(req.params.id, req.body);
  res.json({
    success: true,
    message: 'Xác thực công ty thành công.',
    data
  });
});
