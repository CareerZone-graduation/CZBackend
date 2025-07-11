// src/controllers/template.controller.js
import asyncHandler from 'express-async-handler';
import * as templateService from '../services/template.service.js';

export const getAllTemplates = asyncHandler(async (req, res) => {
    const allTemplates = await templateService.getAllTemplates();
    res.status(200).json({
        success: true,
        message: 'Lấy danh sách mẫu CV thành công.',
        data: allTemplates,
    });
});

export const getTemplateById = asyncHandler(async (req, res) => {
    const template = await templateService.getTemplateById(req.params.id);
    res.status(200).json({
        success: true,
        message: 'Lấy chi tiết mẫu CV thành công.',
        data: template,
    });
});
