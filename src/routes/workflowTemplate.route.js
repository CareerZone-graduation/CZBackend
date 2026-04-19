import express from 'express';
import passport from 'passport';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as validation from '../middleware/validation.middleware.js';
import * as workflowSchema from '../schemas/workflow.schema.js';
import * as workflowTemplateService from '../services/workflowTemplate.service.js';
import asyncHandler from 'express-async-handler';

const router = express.Router();

router.get('/', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, asyncHandler(async (req, res) => {
  const data = await workflowTemplateService.listTemplates(req.user._id);
  res.status(200).json({ success: true, message: 'Lấy danh sách template thành công', data });
}));

router.get('/:templateId', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, asyncHandler(async (req, res) => {
  const data = await workflowTemplateService.getTemplateById(req.params.templateId, req.user._id);
  res.status(200).json({ success: true, message: 'Lấy chi tiết template thành công', data });
}));

router.post('/:templateId/apply', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateBody(workflowSchema.createWorkflowBody.pick({ name: true, description: true, jobId: true })), asyncHandler(async (req, res) => {
  const data = await workflowTemplateService.applyTemplate(req.params.templateId, req.user._id, req.body);
  res.status(201).json({ success: true, message: 'Áp dụng template thành công', data });
}));

export default router;
