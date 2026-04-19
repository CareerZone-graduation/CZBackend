import asyncHandler from 'express-async-handler';
import * as testService from '../services/test.service.js';

export const listTests = asyncHandler(async (req, res) => {
  const result = await testService.listTests(req.user._id, req.validatedQuery || req.query);
  res.status(200).json({ success: true, message: 'Lấy danh sách test thành công', ...result });
});

export const getTestById = asyncHandler(async (req, res) => {
  const data = await testService.getTestById(req.user._id, req.params.testId);
  res.status(200).json({ success: true, message: 'Lấy chi tiết test thành công', data });
});

export const createTest = asyncHandler(async (req, res) => {
  const data = await testService.createTest(req.user._id, req.body);
  res.status(201).json({ success: true, message: 'Tạo test thành công', data });
});

export const updateTest = asyncHandler(async (req, res) => {
  const data = await testService.updateTest(req.user._id, req.params.testId, req.body);
  res.status(200).json({ success: true, message: 'Cập nhật test thành công', data });
});

export const deleteTest = asyncHandler(async (req, res) => {
  await testService.deleteTest(req.user._id, req.params.testId);
  res.status(200).json({ success: true, message: 'Xóa test thành công' });
});

export const duplicateTest = asyncHandler(async (req, res) => {
  const data = await testService.duplicateTest(req.user._id, req.params.testId);
  res.status(201).json({ success: true, message: 'Nhân bản test thành công', data });
});

export const addQuestion = asyncHandler(async (req, res) => {
  const data = await testService.addQuestion(req.user._id, req.params.testId, req.body);
  res.status(200).json({ success: true, message: 'Thêm câu hỏi thành công', data });
});

export const updateQuestion = asyncHandler(async (req, res) => {
  const data = await testService.updateQuestion(req.user._id, req.params.testId, req.params.questionId, req.body);
  res.status(200).json({ success: true, message: 'Cập nhật câu hỏi thành công', data });
});

export const deleteQuestion = asyncHandler(async (req, res) => {
  const data = await testService.deleteQuestion(req.user._id, req.params.testId, req.params.questionId);
  res.status(200).json({ success: true, message: 'Xóa câu hỏi thành công', data });
});

export const reorderQuestions = asyncHandler(async (req, res) => {
  const data = await testService.reorderQuestions(req.user._id, req.params.testId, req.body);
  res.status(200).json({ success: true, message: 'Sắp xếp câu hỏi thành công', data });
});
