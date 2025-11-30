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

export const getAllJobs = asyncHandler(async (req, res) => {
  const options = req.validatedQuery || req.query;
  const result = await jobService.getAllJobs(options);
  res.status(200).json({
    success: true,
    message: 'Lấy danh sách công việc thành công.',
    meta: result.meta,
    data: result.data,
  });
});

export const getMyJobs = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const options = req.validatedQuery || req.query;
  
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

export const reapplyToJob = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id: jobId } = req.params;
  const applicationData = req.body;

  await jobService.reapplyToJob(userId, jobId, applicationData);

  res.status(201).json({
    success: true,
    message: 'Nộp đơn ứng tuyển lại thành công.'
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
  const { search, ...options } = req.validatedQuery || req.query;

  const result = await jobService.getSavedJobs(userId, { search, ...options });

  res.status(200).json({
    success: true,
    message: 'Lấy danh sách công việc đã lưu thành công.',
    meta: result.meta,
    data: result.data,
  });
});

export const getJobDetailsForRecruiter = asyncHandler(async (req, res) => {
  const { id: jobId } = req.params;
  const userId = req.user._id;
  const jobDetails = await jobService.getJobDetailsForRecruiter(jobId, userId);
  res.status(200).json({
    success: true,
    message: 'Lấy chi tiết tin tuyển dụng cho nhà tuyển dụng thành công.',
    data: jobDetails,
  });
});

export const hybridSearchJobs = asyncHandler(async (req, res) => {
  const searchParams = { ...req.validatedQuery || req.query };
  const userId = req.user ? req.user._id : null;
  const result = await jobService.hybridSearchJobs(searchParams, userId);
  res.status(200).json({
    success: true,
    message: 'Tìm kiếm hybrid công việc thành công.',
    meta: result.meta,
    data: result.data,
  });
});
export const autocompleteJobTitles = asyncHandler(async (req, res) => {
  const { query, limit } = req.validatedQuery || req.query;
  console.log('Autocomplete query:', query, 'limit:', limit);
  const suggestions = await jobService.autocompleteJobTitles(query, limit);
  
  res.status(200).json({
    success: true,
    message: 'Lấy gợi ý tiêu đề công việc thành công.',
    data: suggestions,
  });
});

export const searchJobsOnMap = asyncHandler(async (req, res) => {
  const bounds = req.validatedQuery || req.query;
  const jobs = await jobService.findJobsInBounds(bounds);
  
  res.status(200).json({
    success: true,
    message: 'Lấy danh sách công việc trên bản đồ thành công.',
    data: jobs,
  });
});

export const getJobClusters = asyncHandler(async (req, res) => {
  const { zoom, ...bounds } = req.validatedQuery || req.query;
  const clusters = await jobService.getMapClusters(bounds, parseInt(zoom));
  
  res.status(200).json({
    success: true,
    message: 'Lấy cụm công việc trên bản đồ thành công.',
    data: clusters,
  });
});

/**
 * Get multiple jobs by their IDs
 * Used for job alert notifications to display jobs from metadata.jobIds
 */
export const getJobsByIds = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  const jobs = await jobService.getJobsByIds(ids);
  res.status(200).json({
    success: true,
    message: 'Lấy danh sách công việc thành công.',
    data: jobs,
  });
});
