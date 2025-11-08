import asyncHandler from 'express-async-handler';
import * as recruiterService from '../services/recruiter.service.js';

/**
 * Get the profile of the currently logged-in recruiter.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const getRecruiterProfile = asyncHandler(async (req, res) => {
  const recruiterId = req.user._id;
  const profile = await recruiterService.getRecruiterProfile(recruiterId);

  res.status(200).json({
    success: true,
    message: 'Lấy thông tin hồ sơ nhà tuyển dụng thành công.',
    data: profile,
  });
});

/**
 * Get candidate profile (with masking if not unlocked)
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const getCandidateProfile = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const recruiterId = req.user._id;
  
  const profile = await recruiterService.getCandidateProfile(userId, recruiterId);

  res.status(200).json({
    success: true,
    message: 'Lấy thông tin hồ sơ ứng viên thành công.',
    data: profile,
  });
});

/**
 * Unlock candidate profile (purchase access)
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const unlockCandidateProfile = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const recruiterId = req.user._id;
  
  const result = await recruiterService.unlockCandidateProfile(userId, recruiterId);

  res.status(200).json({
    success: true,
    message: 'Mở khóa hồ sơ ứng viên thành công.',
    data: result,
  });
});
