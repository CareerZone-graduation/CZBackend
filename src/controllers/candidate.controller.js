import asyncHandler from 'express-async-handler';
import * as candidateService from '../services/candidate.service.js';
import * as uploadService from '../services/upload.service.js';
import { BadRequestError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

export const getProfile = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const profile = await candidateService.getProfile(userId);
    res.status(200).json({
        success: true,
        message: 'Lấy thông tin hồ sơ thành công.',
        data: profile,
    });
});

export const uploadCv = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const cvs = await candidateService.uploadCv(userId, req.file);
    res.status(201).json({
        success: true,
        message: 'Tải lên CV thành công.',
        data: cvs,
    });
});

export const getCvs = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const cvs = await candidateService.getCvs(userId);
    res.status(200).json({
        success: true,
        message: 'Lấy danh sách CV thành công.',
        data: cvs,
    });
});

export const setDefaultCv = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { cvId } = req.params;
    const cvs = await candidateService.setDefaultCv(userId, cvId);
    res.status(200).json({
        success: true,
        message: 'Đặt CV làm mặc định thành công.',
        data: cvs,
    });
});

export const deleteCv = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { cvId } = req.params;
    const cvs = await candidateService.deleteCv(userId, cvId);
    res.status(200).json({
        success: true,
        message: 'Xóa CV thành công.',
        data: cvs,
    });
});

export const updateProfile = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    logger.info('Updating candidate profile', { 
        userId, 
        fields: Object.keys(req.body) 
    });
    
    const updatedProfile = await candidateService.updateProfile(userId, req.body);
    
    res.status(200).json({
        success: true,
        message: 'Cập nhật hồ sơ thành công.',
        data: updatedProfile,
    });
});

export const updateAvatar = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    if (!req.file) {
        throw new BadRequestError('Vui lòng tải lên một file ảnh.');
    }

    logger.info(`Uploading avatar for user: ${userId}`);
    const result = await uploadService.uploadToCloudinary(req.file.buffer, 'avatars');
    
    const updatedProfile = await candidateService.updateAvatar(userId, result.secure_url);

    res.status(200).json({
        success: true,
        message: 'Cập nhật ảnh đại diện thành công.',
        data: updatedProfile,
    });
});

export const getMyApplications = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const options = req.validatedQuery || req.query;
    
    const result = await candidateService.getMyApplications(userId, options);
    
    res.status(200).json({
        success: true,
        message: 'Lấy danh sách đơn ứng tuyển thành công.',
        meta: result.meta,
        data: result.data
    });
});

export const getApplicationById = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { applicationId } = req.params;
    
    const application = await candidateService.getApplicationById(userId, applicationId);
    
    res.status(200).json({
        success: true,
        message: 'Lấy chi tiết đơn ứng tuyển thành công.',
        data: application
    });
});
