import asyncHandler from 'express-async-handler';
import * as userService from '../services/user.service.js';

/**
 * Get the profile of the currently logged-in user.
 * @route GET /api/users/me
 * @access Private
 */
export const getMe = asyncHandler(async (req, res) => {
  // The user object is attached to the request by the JWT middleware
  const userId = req.user._id;
  const userProfile = await userService.getUserProfile(userId);

  res.status(200).json({
    success: true,
    message: 'Lấy thông tin người dùng thành công.',
    data: userProfile,
  });
});


/**
 * Change the password of the currently logged-in user.
 * @route PUT /api/users/change-password
 * @access Private
 */
export const changePassword = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { currentPassword, newPassword } = req.body;
    await userService.changePassword(userId, currentPassword, newPassword);
    res.status(200).json({
        success: true,
        message: 'Đổi mật khẩu thành công.',
    });
});
