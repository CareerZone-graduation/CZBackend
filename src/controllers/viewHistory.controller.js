import asyncHandler from 'express-async-handler';
import * as viewHistoryService from '../services/viewHistory.service.js';

/**
 * Save or update job view history
 * POST /api/job-view-history
 */
export const saveViewHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { jobId } = req.body;

  if (!jobId) {
    return res.status(400).json({
      success: false,
      message: 'Job ID là bắt buộc'
    });
  }

  const entry = await viewHistoryService.saveViewHistory(userId, jobId);

  res.status(201).json({
    success: true,
    message: 'Đã lưu lịch sử xem',
    data: entry
  });
});

/**
 * Get user's job view history with pagination
 * GET /api/job-view-history
 */
export const getUserViewHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { limit = 10, page = 1 } = req.query;

  const result = await viewHistoryService.getUserViewHistory(userId, { 
    limit: parseInt(limit), 
    page: parseInt(page) 
  });

  res.status(200).json({
    success: true,
    message: 'Lấy lịch sử xem thành công',
    data: result.data,
    pagination: result.pagination
  });
});

/**
 * Get user's view history statistics
 * GET /api/job-view-history/stats
 */
export const getUserViewStats = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const stats = await viewHistoryService.getUserViewStats(userId);

  res.status(200).json({
    success: true,
    message: 'Lấy thống kê thành công',
    data: stats
  });
});

/**
 * Delete a specific view history entry
 * DELETE /api/job-view-history/:id
 */
export const deleteViewHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id: entryId } = req.params;

  await viewHistoryService.deleteViewHistory(userId, entryId);

  res.status(200).json({
    success: true,
    message: 'Đã xóa lịch sử xem'
  });
});

/**
 * Clear all view history for the user
 * DELETE /api/job-view-history
 */
export const clearAllViewHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const deletedCount = await viewHistoryService.clearAllViewHistory(userId);

  res.status(200).json({
    success: true,
    message: 'Đã xóa toàn bộ lịch sử xem',
    data: { deletedCount }
  });
});
