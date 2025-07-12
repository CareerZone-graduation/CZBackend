import asyncHandler from 'express-async-handler';
import * as jobService from '../services/job.service.js';

export const createJob = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const jobData = req.body;
  const job = await jobService.createJob(userId, jobData);
  res.status(201).json({
    success: true,
    message: 'Tạo công việc thành công.',
    data: job,
  });
});

export const getMyJobs = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const options = req.query;
  console.log('getMyJobs options:', options);
  const result = await jobService.getJobsByRecruiter(userId, options);
  res.status(200).json({
    success: true,
    message: 'Lấy danh sách công việc thành công.',
    meta: result.meta,
    data: result.data
  });
});

export const getJobById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user ? req.user._id : null;
    const job = await jobService.getJobById(id, userId);
    res.status(200).json({
      success: true,
      message: 'Lấy thông tin công việc thành công.',
      data: job,
    });
});

export const updateJob = asyncHandler(async (req, res) => {
  const { id: jobId } = req.params;
  const userId = req.user._id;
  const updateData = req.body;
  const updatedJob = await jobService.updateJob(jobId, userId, updateData);
  res.status(200).json({
    success: true,
    message: 'Cập nhật công việc thành công.',
    data: updatedJob,
  });
});

export const deleteJob = asyncHandler(async (req, res) => {
  const { id: jobId } = req.params;
  const userId = req.user._id;
  await jobService.deleteJob(jobId, userId);
  res.status(200).json({
    success: true,
    message: 'Xóa (soft-delete) công việc thành công.',
  });
});

export const getApplicantCount = asyncHandler(async (req, res) => {
  const { id: jobId } = req.params;
  const userId = req.user._id;

  const result = await jobService.getApplicantCount(jobId, userId);

  res.status(200).json({
    success: true,
    message: 'Lấy số lượng ứng viên thành công. 10 xu đã được trừ từ tài khoản của bạn.',
    data: result,
  });
});

export const applyToJob = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id: jobId } = req.params;
  const applicationData = req.body;

  await jobService.applyToJob(userId, jobId, applicationData);

  res.status(201).json({
    success: true,
    message: 'Nộp đơn ứng tuyển thành công.'
  });
});

export const saveJob = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id: jobId } = req.params;

  await jobService.saveJob(userId, jobId);

  res.status(201).json({
    success: true,
    message: 'Lưu công việc thành công.',
  });
});

export const unsaveJob = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id: jobId } = req.params;

  await jobService.unsaveJob(userId, jobId);

  res.status(200).json({
    success: true,
    message: 'Bỏ lưu công việc thành công.',
  });
});

export const getSavedJobs = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const options = req.query;

  const result = await jobService.getSavedJobs(userId, options);

  res.status(200).json({
    success: true,
    message: 'Lấy danh sách công việc đã lưu thành công.',
    meta: result.meta,
    data: result.data,
  });
});
