import * as candidateService from '../services/candidate.service.js';
import { uploadToCloudinary } from '../services/upload.service.js';
import { BadRequestError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

export const getProfile = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const profile = await candidateService.getProfile(userId);
        res.status(200).json({
            success: true,
            message: 'Lấy thông tin hồ sơ thành công.',
            data: profile,
        });
    } catch (error) {
        next(error);
    }
};

export const uploadCv = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const cvs = await candidateService.uploadCv(userId, req.file);
        res.status(201).json({
            success: true,
            message: 'Tải lên CV thành công.',
            data: cvs,
        });
    } catch (error) {
        next(error);
    }
};

export const getCvs = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const cvs = await candidateService.getCvs(userId);
        res.status(200).json({
            success: true,
            message: 'Lấy danh sách CV thành công.',
            data: cvs,
        });
    } catch (error) {
        next(error);
    }
};

export const setDefaultCv = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { cvId } = req.params;
        const cvs = await candidateService.setDefaultCv(userId, cvId);
        res.status(200).json({
            success: true,
            message: 'Đặt CV làm mặc định thành công.',
            data: cvs,
        });
    } catch (error) {
        next(error);
    }
};

export const deleteCv = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { cvId } = req.params;
        const cvs = await candidateService.deleteCv(userId, cvId);
        res.status(200).json({
            success: true,
            message: 'Xóa CV thành công.',
            data: cvs,
        });
    } catch (error) {
        next(error);
    }
};

export const updateProfile = async (req, res, next) => {
    try {
        const userId = req.user._id;
        logger.info('Updating candidate profile', { userId, body: req.body });
        const profile = await candidateService.updateProfile(userId, req.body);
        
        res.status(200).json({
            success: true,
            message: 'Cập nhật hồ sơ thành công.',
            data: profile,
        });
    } catch (error) {
        next(error);
    }
};

export const updateAvatar = async (req, res, next) => {
    try {
        const userId = req.user._id;
        if (!req.file) {
            throw new BadRequestError('Vui lòng tải lên một file ảnh.');
        }

        logger.info(`Uploading avatar for user: ${userId}`);
        const result = await uploadToCloudinary(req.file.buffer, 'avatars');
        
        const updatedProfile = await candidateService.updateAvatar(userId, result.secure_url);

        res.status(200).json({
            success: true,
            message: 'Cập nhật ảnh đại diện thành công.',
            data: updatedProfile,
        });
    } catch (error) {
        next(error);
    }
};
