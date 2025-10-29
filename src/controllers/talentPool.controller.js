import asyncHandler from 'express-async-handler';
import * as talentPoolService from '../services/talentPool.service.js';

/**
 * @desc      Add a candidate to talent pool
 * @route     POST /api/talent-pool
 * @access    Private - Recruiter Only
 */
export const addToTalentPool = asyncHandler(async (req, res) => {
  const { applicationId, tags, notes } = req.body;
  
  const result = await talentPoolService.addToTalentPool(
    req.user._id,
    applicationId,
    { tags, notes }
  );

  res.status(201).json({
    success: true,
    message: 'Đã thêm ứng viên vào talent pool',
    data: result
  });
});

/**
 * @desc      Remove a candidate from talent pool
 * @route     DELETE /api/talent-pool/:talentPoolId
 * @access    Private - Recruiter Only
 */
export const removeFromTalentPool = asyncHandler(async (req, res) => {
  const { talentPoolId } = req.params;
  
  await talentPoolService.removeFromTalentPool(req.user._id, talentPoolId);

  res.status(200).json({
    success: true,
    message: 'Đã xóa ứng viên khỏi talent pool'
  });
});

/**
 * @desc      Get all candidates in talent pool
 * @route     GET /api/talent-pool
 * @access    Private - Recruiter Only
 */
export const getTalentPool = asyncHandler(async (req, res) => {
  const options = req.validatedQuery || req.query;
  
  const result = await talentPoolService.getTalentPool(req.user._id, options);

  res.status(200).json({
    success: true,
    message: 'Lấy danh sách talent pool thành công',
    data: result.data,
    meta: result.meta
  });
});

/**
 * @desc      Update talent pool entry (tags, notes)
 * @route     PATCH /api/talent-pool/:talentPoolId
 * @access    Private - Recruiter Only
 */
export const updateTalentPoolEntry = asyncHandler(async (req, res) => {
  const { talentPoolId } = req.params;
  const { tags, notes } = req.body;
  
  const result = await talentPoolService.updateTalentPoolEntry(
    req.user._id,
    talentPoolId,
    { tags, notes }
  );

  res.status(200).json({
    success: true,
    message: 'Cập nhật talent pool thành công',
    data: result
  });
});
