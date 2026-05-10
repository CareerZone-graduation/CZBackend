import asyncHandler from 'express-async-handler';
import * as workflowService from '../services/workflow.service.js';
import * as workflowExecutionService from '../services/workflowExecution.service.js';

export const listWorkflows = asyncHandler(async (req, res) => {
  const result = await workflowService.listWorkflows(req.user._id, req.validatedQuery || req.query);
  res.status(200).json({ success: true, message: 'Lấy danh sách workflow thành công', ...result });
});

export const getWorkflowById = asyncHandler(async (req, res) => {
  const result = await workflowService.getWorkflowById(req.user._id, req.params.workflowId);
  res.status(200).json({ success: true, message: 'Lấy chi tiết workflow thành công', data: result });
});

export const createWorkflow = asyncHandler(async (req, res) => {
  const data = await workflowService.createWorkflow(req.user._id, req.body);
  res.status(201).json({ success: true, message: 'Tạo workflow thành công', data });
});

export const updateWorkflow = asyncHandler(async (req, res) => {
  const data = await workflowService.updateWorkflow(req.user._id, req.params.workflowId, req.body);
  res.status(200).json({ success: true, message: 'Cập nhật workflow thành công', data });
});

export const deleteWorkflow = asyncHandler(async (req, res) => {
  await workflowService.deleteWorkflow(req.user._id, req.params.workflowId);
  res.status(200).json({ success: true, message: 'Xóa workflow thành công' });
});

export const activateWorkflow = asyncHandler(async (req, res) => {
  const data = await workflowService.activateWorkflow(req.user._id, req.params.workflowId);
  res.status(200).json({ success: true, message: 'Kích hoạt workflow thành công', data });
});

export const getWorkflowTracking = asyncHandler(async (req, res) => {
  const data = await workflowService.getWorkflowTracking(
    req.user._id, 
    req.params.workflowId, 
    req.query.jobId
  );
  res.status(200).json({ success: true, message: 'Lấy dữ liệu tracking workflow thành công', data });
});

export const createNode = asyncHandler(async (req, res) => {
  const data = await workflowService.createNode(req.user._id, req.params.workflowId, req.body);
  res.status(201).json({ success: true, message: 'Tạo node thành công', data });
});

export const updateNode = asyncHandler(async (req, res) => {
  const data = await workflowService.updateNode(req.user._id, req.params.workflowId, req.params.nodeId, req.body);
  res.status(200).json({ success: true, message: 'Cập nhật node thành công', data });
});

export const deleteNode = asyncHandler(async (req, res) => {
  await workflowService.deleteNode(req.user._id, req.params.workflowId, req.params.nodeId);
  res.status(200).json({ success: true, message: 'Xóa node thành công' });
});

export const batchSaveNodes = asyncHandler(async (req, res) => {
  const data = await workflowService.batchSaveNodes(req.user._id, req.params.workflowId, req.body);
  res.status(200).json({ success: true, message: 'Lưu nodes thành công', data });
});

export const createConnection = asyncHandler(async (req, res) => {
  const data = await workflowService.createConnection(req.user._id, req.params.workflowId, req.body);
  res.status(201).json({ success: true, message: 'Tạo connection thành công', data });
});

export const deleteConnection = asyncHandler(async (req, res) => {
  await workflowService.deleteConnection(req.user._id, req.params.workflowId, req.params.connectionId);
  res.status(200).json({ success: true, message: 'Xóa connection thành công' });
});

export const batchSaveConnections = asyncHandler(async (req, res) => {
  const data = await workflowService.batchSaveConnections(req.user._id, req.params.workflowId, req.body);
  res.status(200).json({ success: true, message: 'Lưu connections thành công', data });
});

export const getExecutionHistory = asyncHandler(async (req, res) => {
  const data = await workflowService.getExecutionHistory(
    req.user._id,
    req.params.workflowId,
    req.query
  );
  res.status(200).json({ success: true, message: 'Lấy lịch sử thực thi thành công', data });
});

export const manualTransition = asyncHandler(async (req, res) => {
  const data = await workflowExecutionService.manualTransitionToStage({
    applicationId: req.params.applicationId,
    userId: req.user._id,
    targetStageNodeId: req.body.targetStageNodeId,
  });
  res.status(200).json({ success: true, message: 'Chuyển stage thủ công thành công', data });
});

export const retryExecution = asyncHandler(async (req, res) => {
  const data = await workflowExecutionService.retryFailedExecution(
    req.user._id,
    req.params.executionId
  );
  res.status(200).json({ success: true, message: 'Khởi động lại tiến trình thành công', data });
});
