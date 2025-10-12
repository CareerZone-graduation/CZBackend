// src/services/template.service.js
import * as cvTemplatesData from '../data/cvTemplates.data.js';
import { NotFoundError } from '../utils/AppError.js';

/**
 * Lấy tất cả template công khai.
 * Vì dữ liệu nằm trong code, chúng ta chỉ cần filter mảng.
 * @returns {Promise<Array>} Danh sách tóm tắt của các template.
 */
export const getAllTemplates = async () => {
    // Chỉ trả về các thông tin cơ bản để hiển thị danh sách
    return cvTemplatesData.templates.map(t => ({
        _id: t._id,
        name: t.name,
        previewUrl: t.previewUrl,
        theme: {
            primary: t.theme.primary,
            secondary: t.theme.secondary
        }
    }));
};

/**
 * Lấy chi tiết một template bằng ID.
 * @param {string} templateId - ID của template
 * @returns {Promise<Object>} Chi tiết template.
 */
export const getTemplateById = async (templateId) => {
    const template = cvTemplatesData.templates.find(t => t._id === templateId);

    if (!template) {
        throw new NotFoundError('Không tìm thấy mẫu CV này.');
    }
    return template;
};

/**
 * Kiểm tra template ID có tồn tại không
 * @param {string} templateId - ID của template
 * @returns {boolean} True nếu template tồn tại
 */
export const validateTemplateId = (templateId) => {
    return cvTemplatesData.templates.some(t => t.id === templateId);
};
