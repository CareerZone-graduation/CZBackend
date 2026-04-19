import asyncHandler from 'express-async-handler';
import * as testAssignmentService from '../services/testAssignment.service.js';

export const getAssignment = asyncHandler(async (req, res) => {
  const data = await testAssignmentService.getAssignmentForCandidate(req.user._id, req.params.assignmentId);
  res.status(200).json({ success: true, message: 'Lấy bài test thành công', data });
});

export const startAssignment = asyncHandler(async (req, res) => {
  const data = await testAssignmentService.startAssignment(req.user._id, req.params.assignmentId);
  res.status(200).json({ success: true, message: 'Bắt đầu làm bài thành công', data });
});

export const saveAnswer = asyncHandler(async (req, res) => {
  const data = await testAssignmentService.saveAnswer(req.user._id, req.params.assignmentId, req.body);
  res.status(200).json({ success: true, message: 'Lưu câu trả lời thành công', data });
});

export const submitAssignment = asyncHandler(async (req, res) => {
  const data = await testAssignmentService.submitAssignment(
    req.user._id,
    req.params.assignmentId,
    req.body
  );
  res.status(200).json({ success: true, message: 'Nộp bài thành công', data });
});

export const getAssignmentResult = asyncHandler(async (req, res) => {
  const data = await testAssignmentService.getAssignmentResult(req.user._id, req.params.assignmentId);
  res.status(200).json({ success: true, message: 'Lấy kết quả bài test thành công', data });
});
