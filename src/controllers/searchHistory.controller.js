import asyncHandler from 'express-async-handler';
import * as searchHistoryService from '../services/searchHistory.service.js';

/**
 * Save or update search history
 * POST /api/search-history
 */
export const saveSearchHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const searchData = req.body;

  const entry = await searchHistoryService.saveSearchHistory(userId, searchData);

  res.status(201).json({
    success: true,
    message: 'Đã lưu lịch sử tìm kiếm',
    data: entry
  });
});

/**
 * Get user's search history with pagination
 * GET /api/search-history
 */
export const getUserSearchHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { limit, page } = req.validatedQuery || req.query;

  const result = await searchHistoryService.getUserSearchHistory(userId, { limit, page });

  res.status(200).json({
    success: true,
    message: 'Lấy lịch sử tìm kiếm thành công',
    data: result.data,
    pagination: result.pagination
  });
});



/**
 * Delete a specific search history entry
 * DELETE /api/search-history/:id
 */
export const deleteSearchHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id: entryId } = req.params;

  await searchHistoryService.deleteSearchHistory(userId, entryId);

  res.status(200).json({
    success: true,
    message: 'Đã xóa lịch sử tìm kiếm'
  });
});

/**
 * Clear all search history for the user
 * DELETE /api/search-history
 */
export const clearAllSearchHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const deletedCount = await searchHistoryService.clearAllSearchHistory(userId);

  res.status(200).json({
    success: true,
    message: 'Đã xóa toàn bộ lịch sử tìm kiếm',
    data: { deletedCount }
  });
});
