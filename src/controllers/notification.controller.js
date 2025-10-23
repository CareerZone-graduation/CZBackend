import asyncHandler from 'express-async-handler';
import * as notificationService from '../services/notification.service.js';

export const getNotifications = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const options = req.validatedQuery || req.query;
  const result = await notificationService.getNotifications(userId, options);

  res.status(200).json({
    success: true,
    message: 'Lấy danh sách thông báo thành công.',
    data: result.data,
    meta: result.meta,
  });
});

export const getUnreadCount = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const count = await notificationService.getUnreadNotificationCount(userId);

  res.status(200).json({
    success: true,
    message: 'Lấy số lượng thông báo chưa đọc thành công.',
    data: { unreadCount: count },
  });
});

export const markNotificationAsRead = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id: notificationId } = req.params;
  const notification = await notificationService.markNotificationAsRead(
    userId,
    notificationId
  );

  res.status(200).json({
    success: true,
    message: 'Đánh dấu thông báo đã đọc thành công.',
    data: notification,
  });
});

export const markAllNotificationsAsRead = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  await notificationService.markAllNotificationsAsRead(userId);

  res.status(200).json({
    success: true,
    message: 'Đã đánh dấu tất cả thông báo là đã đọc.',
  });
});
