import express from 'express';
import passport from 'passport';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as validation from '../middleware/validation.middleware.js';
import * as testSchema from '../schemas/test.schema.js';
import * as testController from '../controllers/test.controller.js';

const router = express.Router();

router.get('/', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, testController.listTests);
router.post('/', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateBody(testSchema.createTestBody), testController.createTest);
router.get('/:testId', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateParams(testSchema.testIdParam), testController.getTestById);
router.put('/:testId', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateParams(testSchema.testIdParam), validation.validateBody(testSchema.updateTestBody), testController.updateTest);
router.delete('/:testId', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateParams(testSchema.testIdParam), testController.deleteTest);
router.post('/:testId/duplicate', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateParams(testSchema.testIdParam), testController.duplicateTest);
router.post('/:testId/questions', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateParams(testSchema.testIdParam), validation.validateBody(testSchema.addQuestionBody), testController.addQuestion);
router.put('/:testId/questions/:questionId', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateParams(testSchema.testIdParam.merge(testSchema.questionIdParam)), validation.validateBody(testSchema.updateQuestionBody), testController.updateQuestion);
router.delete('/:testId/questions/:questionId', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateParams(testSchema.testIdParam.merge(testSchema.questionIdParam)), testController.deleteQuestion);
router.post('/:testId/questions/reorder', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateParams(testSchema.testIdParam), validation.validateBody(testSchema.reorderQuestionsBody), testController.reorderQuestions);
router.get('/:testId/assignments', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateParams(testSchema.testIdParam), testController.getTestAssignments);

export default router;
