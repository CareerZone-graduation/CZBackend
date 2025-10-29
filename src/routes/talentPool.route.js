import express from 'express';
import passport from 'passport';
import * as talentPoolController from '../controllers/talentPool.controller.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as talentPoolSchema from '../schemas/talentPool.schema.js';

const router = express.Router();

// Route để thêm candidate vào talent pool
router.post(
  '/',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  validationMiddleware.validateBody(talentPoolSchema.addToTalentPoolBody),
  talentPoolController.addToTalentPool
);

// Route để lấy danh sách talent pool
router.get(
  '/',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  validationMiddleware.validateQuery(talentPoolSchema.getTalentPoolQuery),
  talentPoolController.getTalentPool
);

// Route để cập nhật talent pool entry
router.patch(
  '/:talentPoolId',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(talentPoolSchema.talentPoolIdParam),
  validationMiddleware.validateBody(talentPoolSchema.updateTalentPoolBody),
  talentPoolController.updateTalentPoolEntry
);

// Route để xóa khỏi talent pool
router.delete(
  '/:talentPoolId',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(talentPoolSchema.talentPoolIdParam),
  talentPoolController.removeFromTalentPool
);

export default router;
