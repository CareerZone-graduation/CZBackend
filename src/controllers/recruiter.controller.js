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
