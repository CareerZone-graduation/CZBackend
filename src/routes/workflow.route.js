import express from 'express';
import passport from 'passport';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as validation from '../middleware/validation.middleware.js';
import * as workflowSchema from '../schemas/workflow.schema.js';
import * as workflowController from '../controllers/workflow.controller.js';

const router = express.Router();

router.get('/', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateQuery(workflowSchema.listWorkflowQuery), workflowController.listWorkflows);
router.post('/', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateBody(workflowSchema.createWorkflowBody), workflowController.createWorkflow);
router.get('/:workflowId', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateParams(workflowSchema.workflowIdParam), workflowController.getWorkflowById);
router.put('/:workflowId', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateParams(workflowSchema.workflowIdParam), validation.validateBody(workflowSchema.updateWorkflowBody), workflowController.updateWorkflow);
router.delete('/:workflowId', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateParams(workflowSchema.workflowIdParam), workflowController.deleteWorkflow);
router.post('/:workflowId/unarchive', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateParams(workflowSchema.workflowIdParam), workflowController.unarchiveWorkflow);
router.post('/:workflowId/clone', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateParams(workflowSchema.workflowIdParam), validation.validateBody(workflowSchema.cloneWorkflowBody), workflowController.cloneWorkflow);
router.post('/:workflowId/activate', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateParams(workflowSchema.workflowIdParam), workflowController.activateWorkflow);
router.get('/:workflowId/tracking', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateParams(workflowSchema.workflowIdParam), workflowController.getWorkflowTracking);

router.post('/:workflowId/nodes', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateParams(workflowSchema.workflowIdParam), validation.validateBody(workflowSchema.createNodeBody), workflowController.createNode);
router.put('/:workflowId/nodes/:nodeId', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateParams(workflowSchema.workflowIdParam.merge(workflowSchema.nodeIdParam)), validation.validateBody(workflowSchema.updateNodeBody), workflowController.updateNode);
router.delete('/:workflowId/nodes/:nodeId', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateParams(workflowSchema.workflowIdParam.merge(workflowSchema.nodeIdParam)), workflowController.deleteNode);
router.post('/:workflowId/nodes/batch', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateParams(workflowSchema.workflowIdParam), validation.validateBody(workflowSchema.batchNodesBody), workflowController.batchSaveNodes);

router.post('/:workflowId/connections', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateParams(workflowSchema.workflowIdParam), validation.validateBody(workflowSchema.createConnectionBody), workflowController.createConnection);
router.delete('/:workflowId/connections/:connectionId', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateParams(workflowSchema.workflowIdParam.merge(workflowSchema.connectionIdParam)), workflowController.deleteConnection);
router.post('/:workflowId/connections/batch', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateParams(workflowSchema.workflowIdParam), validation.validateBody(workflowSchema.batchConnectionsBody), workflowController.batchSaveConnections);

router.get('/:workflowId/executions', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, validation.validateParams(workflowSchema.workflowIdParam), workflowController.getExecutionHistory);

router.post('/executions/:executionId/retry', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, workflowController.retryExecution);

export default router;
