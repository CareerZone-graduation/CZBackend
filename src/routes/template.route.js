// src/routes/template.route.js
import express from 'express';
import * as templateController from '../controllers/template.controller.js';
import * as authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();

// Lấy danh sách tất cả template (công khai)
router.get('/', templateController.getAllTemplates);

// Lấy chi tiết một template theo ID
router.get('/:id', templateController.getTemplateById);

export default router;
