// src/services/cv.service.js
import CV from '../models/CV.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../utils/AppError.js';
import { validateTemplateId } from './template.service.js';

/**
 * Tạo CV mới
 * @param {string} userId - ID của user
 * @param {Object} cvData - Dữ liệu CV
 * @returns {Promise<Object>} CV được tạo
 */
export const createCv = async (userId, cvData) => {
    // Kiểm tra templateId có hợp lệ không
    if (!validateTemplateId(cvData.templateId)) {
        throw new ValidationError('Mẫu CV không hợp lệ hoặc không tồn tại.');
    }
    
    const newCv = await CV.create({
        ...cvData,
        userId,
    });
    return newCv;
};

/**
 * Lấy CV theo ID và kiểm tra quyền
 * @param {string} cvId - ID của CV
 * @param {string} userId - ID của user
 * @returns {Promise<Object>} CV
 */
export const getCvById = async (cvId, userId) => {
    const cv = await CV.findById(cvId);
    if (!cv) {
        throw new NotFoundError('Không tìm thấy CV.');
    }
    if (cv.userId.toString() !== userId) {
        throw new UnauthorizedError('Bạn không có quyền truy cập CV này.');
    }
    return cv;
};

/**
 * Cập nhật CV
 * @param {string} cvId - ID của CV
 * @param {string} userId - ID của user
 * @param {Object} updateData - Dữ liệu cập nhật
 * @returns {Promise<Object>} CV đã cập nhật
 */
export const updateCv = async (cvId, userId, updateData) => {
    if (updateData.templateId && !validateTemplateId(updateData.templateId)) {
        throw new ValidationError('Mẫu CV không hợp lệ.');
    }

    const cv = await getCvById(cvId, userId); // Tái sử dụng hàm get để kiểm tra quyền
    
    Object.assign(cv, updateData);
    await cv.save();
    return cv;
};

/**
 * Xóa CV
 * @param {string} cvId - ID của CV
 * @param {string} userId - ID của user
 */
export const deleteCv = async (cvId, userId) => {
    const cv = await getCvById(cvId, userId);
    await cv.deleteOne();
};

/**
 * Lấy tất cả CV của user
 * @param {string} userId - ID của user
 * @returns {Promise<Array>} Danh sách CV
 */
export const getAllCvsByUser = async (userId) => {
    return await CV.find({ userId }).sort({ createdAt: -1 });
};

/**
 * Tạo bản sao CV từ template
 * @param {string} userId - ID của user
 * @param {string} templateId - ID của template
 * @param {string} cvName - Tên CV mới
 * @returns {Promise<Object>} CV được tạo
 */
export const createCvFromTemplate = async (userId, templateId, cvName) => {
    if (!validateTemplateId(templateId)) {
        throw new ValidationError('Mẫu CV không hợp lệ.');
    }

    const newCv = await CV.create({
        userId,
        name: cvName || 'CV mới',
        templateId,
        personalInfo: {},
        summary: '',
        skills: [],
        educations: [],
        experiences: [],
        awardsAndCertifications: [],
        projects: [],
        references: []
    });

    return newCv;
};

/**
 * Duplicate một CV hiện tại
 * @param {string} cvId - ID của CV gốc
 * @param {string} userId - ID của user
 * @param {string} newName - Tên CV mới
 * @returns {Promise<Object>} CV được duplicate
 */
export const duplicateCv = async (cvId, userId, newName) => {
    const originalCv = await getCvById(cvId, userId);
    
    const cvData = originalCv.toObject();
    delete cvData._id;
    delete cvData.createdAt;
    delete cvData.updatedAt;
    
    cvData.name = newName || `${originalCv.name} - Copy`;
    
    const newCv = await CV.create(cvData);
    return newCv;
};
