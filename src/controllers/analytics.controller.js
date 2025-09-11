// src/controllers/analytics.controller.js
import asyncHandler from 'express-async-handler';
import * as analyticsService from '../services/analytics.service.js';

export const getDashboardStats = asyncHandler(async (req, res) => {
  const data = await analyticsService.getDashboardStats();
  res.json({ success: true, data });
});

export const getUserGrowth = asyncHandler(async (req, res) => {
  const data = await analyticsService.getUserGrowth(req.query);
  res.json({ success: true, data });
});

export const getRevenueTrends = asyncHandler(async (req, res) => {
  const data = await analyticsService.getRevenueTrends(req.query);
  res.json({ success: true, data });
});

export const getUserDemographics = asyncHandler(async (req, res) => {
  const data = await analyticsService.getUserDemographics();
  res.json({ success: true, data });
});

export const getJobCategories = asyncHandler(async (req, res) => {
  const data = await analyticsService.getJobCategories();
  res.json({ success: true, data });
});
export const getCompanyStats = asyncHandler(async (req, res) => {
  const data = await analyticsService.getCompanyStats();
  res.json({ success: true, data });
});

export const getTransactionTrends = asyncHandler(async (req, res) => {
  const data = await analyticsService.getTransactionAnalytics(req.query);
  res.json({
    success: true,
    message: 'Lấy dữ liệu phân tích giao dịch thành công',
    ...data // Spread để trải phẳng { meta, data } từ service
  });
});

export const getTransactionToday = asyncHandler(async (req, res) => {
  const data = await analyticsService.getTransactionTodayStats();
  res.json({
    success: true,
    message: 'Lấy thống kê giao dịch hôm nay thành công',
    data
  });
});

export const getTopSpendingUsers = asyncHandler(async (req, res) => {
  const data = await analyticsService.getTopSpendingUsers(req.query);
  res.json({
    success: true,
    message: 'Lấy danh sách người dùng chi tiêu nhiều nhất thành công',
    data
  });
});