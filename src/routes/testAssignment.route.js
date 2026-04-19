import express from 'express';
import passport from 'passport';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as validation from '../middleware/validation.middleware.js';
import * as testSchema from '../schemas/test.schema.js';
import * as testAssignmentController from '../controllers/testAssignment.controller.js';

const router = express.Router();

router.get('/:assignmentId', passport.authenticate('jwt', { session: false }), authMiddleware.candidateOnly, validation.validateParams(testSchema.assignmentIdParam), testAssignmentController.getAssignment);
router.post('/:assignmentId/start', passport.authenticate('jwt', { session: false }), authMiddleware.candidateOnly, validation.validateParams(testSchema.assignmentIdParam), testAssignmentController.startAssignment);
router.put('/:assignmentId/answer', passport.authenticate('jwt', { session: false }), authMiddleware.candidateOnly, validation.validateParams(testSchema.assignmentIdParam), validation.validateBody(testSchema.answerBody), testAssignmentController.saveAnswer);
router.post('/:assignmentId/submit', passport.authenticate('jwt', { session: false }), authMiddleware.candidateOnly, validation.validateParams(testSchema.assignmentIdParam), validation.validateBody(testSchema.submitBody), testAssignmentController.submitAssignment);
router.get('/:assignmentId/result', passport.authenticate('jwt', { session: false }), authMiddleware.candidateOnly, validation.validateParams(testSchema.assignmentIdParam), testAssignmentController.getAssignmentResult);

export default router;
