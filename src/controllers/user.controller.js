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
* Get the coin balance of the currently logged-in user.
* @route GET /api/users/me/coins
* @access Private
*/
export const getCoinBalance = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const coinBalance = await userService.getCoinBalance(userId);
  res.status(200).json({
      success: true,
      message: 'Lấy số dư xu thành công.',
      data: {
          coins: coinBalance,
      },
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

/**
 * Register a new device for FCM notifications.
 * @route POST /api/users/register-device
 * @access Private
 */
export const registerDevice = asyncHandler(async (req, res) => {
    const { token } = req.body;
    const userId = req.user._id;
    await userService.registerDevice(userId, token);
    res.status(200).json({
        success: true,
        message: 'Device registered successfully.'
    });
});

/**
 * Get the coin recharge history of the currently logged-in user.
 * @route GET /api/users/me/recharge-history
 * @access Private
 */
export const getRechargeHistory = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { meta, data } = await userService.getRechargeHistory(userId, req.validatedQuery || req.query);
    res.status(200).json({
        success: true,
        message: 'Lấy lịch sử nạp xu thành công.',
        meta,
        data,
    });
});
