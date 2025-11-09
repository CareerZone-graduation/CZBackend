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
 * Unlock candidate profile for messaging
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const unlockProfile = asyncHandler(async (req, res) => {
  const { candidateId } = req.body;
  const recruiterId = req.user._id;
  
  try {
    const result = await recruiterService.unlockCandidateProfile(candidateId, recruiterId);

    res.status(200).json({
      success: true,
      message: result.alreadyUnlocked 
        ? 'Hồ sơ đã được mở khóa trước đó.' 
        : 'Mở khóa hồ sơ ứng viên thành công.',
      data: {
        transaction: result.transaction,
        remainingBalance: result.remainingBalance,
        candidateName: result.candidateName,
        alreadyUnlocked: result.alreadyUnlocked || false,
      },
    });
  } catch (error) {
    // Handle insufficient credits error with specific error code
    if (error.message && error.message.includes('Không đủ xu')) {
      return res.status(400).json({
        success: false,
        message: 'Không đủ xu để mở khóa hồ sơ.',
        error: 'INSUFFICIENT_CREDITS',
      });
    }
    // Re-throw other errors to be handled by error middleware
    throw error;
  }
});
