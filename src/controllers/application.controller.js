import asyncHandler from 'express-async-handler';
import * as applicationService from '../services/application.service.js';

/**
 * @desc      Get all applications for a specific job
 * @route     GET /api/applications/jobs/:jobId/applications
 * @access    Private - Recruiter Only
 */
export const getApplicationsByJob = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const options = req.validatedQuery || req.query;

  // Gọi service để lấy danh sách ứng viên
  const serviceResult = await applicationService.getApplicationsByJob(jobId, req.user._id, options);

  res.status(200).json({
    success: true,
    message: 'Lấy danh sách ứng viên thành công',
    data: serviceResult.data,
    meta: serviceResult.meta
  });
});

/**
 * @desc      Get application details by ID
 * @route     GET /api/applications/:applicationId
 * @access    Private - Recruiter Only
 */
export const getApplicationById = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;

  const application = await applicationService.getApplicationById(applicationId, req.user._id);

  res.status(200).json({
    success: true,
    message: 'Lấy thông tin đơn ứng tuyển thành công',
    data: application
  });
});

/**
 * @desc      Update application status
 * @route     PATCH /api/applications/:applicationId/status
 * @access    Private - Recruiter Only
 */
export const updateApplicationStatus = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const { status } = req.body;

  const updatedApplication = await applicationService.updateApplicationStatus(
    applicationId,
    req.user._id,
    status
  );

  res.status(200).json({
    success: true,
    message: 'Cập nhật trạng thái đơn ứng tuyển thành công',
    data: updatedApplication
  });
});

export const updateApplicationNotes = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const { notes } = req.body;

  const updatedApplication = await applicationService.updateApplicationNotes(
    applicationId,
    req.user._id,
    notes
  );

  res.status(200).json({
    success: true,
    message: 'Cập nhật ghi chú cho đơn ứng tuyển thành công',
    data: updatedApplication
  });
});



/**
 * @desc      Get CV data for rendering in iframe (for CV template type)
 * @route     GET /api/applications/:applicationId/render-cv
 * @access    Private - Recruiter Only
 */
export const getApplicationCVData = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;

  const cvData = await applicationService.getApplicationCVData(applicationId, req.user._id);

  res.status(200).json({
    success: true,
    message: 'Lấy dữ liệu CV thành công',
    data: cvData
  });
});
