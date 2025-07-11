// src/controllers/cv.controller.js
import asyncHandler from 'express-async-handler';
import * as cvService from '../services/cv.service.js';

/**
 * Tạo CV mới
 */
export const createCv = asyncHandler(async (req, res) => {
    const cv = await cvService.createCv(req.user._id, req.body);
    res.status(201).json({ 
        success: true, 
        message: 'Tạo CV thành công.', 
        data: cv 
    });
});

/**
 * Lấy CV theo ID
 */
export const getCvById = asyncHandler(async (req, res) => {
    const cv = await cvService.getCvById(req.params.id, req.user._id);
    res.status(200).json({ 
        success: true, 
        data: cv 
    });
});

/**
 * Cập nhật CV
 */
export const updateCv = asyncHandler(async (req, res) => {
    const cv = await cvService.updateCv(req.params.id, req.user._id, req.body);
    res.status(200).json({ 
        success: true, 
        message: 'Cập nhật CV thành công.', 
        data: cv 
    });
});

/**
 * Xóa CV
 */
export const deleteCv = asyncHandler(async (req, res) => {
    await cvService.deleteCv(req.params.id, req.user._id);
    res.status(200).json({ 
        success: true, 
        message: 'Xóa CV thành công.' 
    });
});

/**
 * Lấy tất cả CV của user hiện tại
 */
export const getAllCvsByUser = asyncHandler(async (req, res) => {
    const cvs = await cvService.getAllCvsByUser(req.user._id);
    res.status(200).json({ 
        success: true, 
        message: 'Lấy tất cả CV thành công.',
        data: cvs 
    });
});


/**
 * Duplicate CV
 */
export const duplicateCv = asyncHandler(async (req, res) => {
    const { name } = req.body;
    const cv = await cvService.duplicateCv(req.params.id, req.user._id, name);
    res.status(201).json({
        success: true,
        message: 'Sao chép CV thành công.',
        data: cv
    });
});
