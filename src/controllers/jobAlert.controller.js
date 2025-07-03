import asyncHandler from 'express-async-handler';
import * as jobAlertService from '../services/jobAlert.service.js';

export const createJobAlert = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const subscription = await jobAlertService.createJobAlert(userId, req.body);
    res.status(201).json({
        success: true,
        message: 'Đăng ký nhận thông báo việc làm thành công.',
        data: subscription,
    });
});

export const getMyJobAlerts = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const data = await jobAlertService.getMyJobAlerts(userId);
    res.status(200).json({
        success: true,
        message: 'Lấy danh sách đăng ký thành công.',
        data,
    });
});

export const updateJobAlert = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { id } = req.params;
    const subscription = await jobAlertService.updateJobAlert(userId, id, req.body);
    res.status(200).json({
        success: true,
        message: 'Cập nhật đăng ký thành công.',
        data: subscription,
    });
});

export const deleteJobAlert = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { id } = req.params;
    await jobAlertService.deleteJobAlert(userId, id);
    res.status(200).json({
        success: true,
        message: 'Xóa đăng ký thành công.',
    });
});
