import * as candidateService from '../services/candidate.service.js';

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

export const updateProfile = async (req, res, next) => {
    try {
        const { userId } = req.user;
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
