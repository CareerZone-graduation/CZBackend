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

// ==========================================================
// === NEW: ALL CANDIDATES MANAGEMENT CONTROLLERS ====
// ==========================================================

/**
 * @desc      Get all applications across all jobs of the recruiter's company
 * @route     GET /api/recruiter/applications
 * @access    Private - Recruiter Only
 */
export const getAllApplications = asyncHandler(async (req, res) => {
  const options = req.validatedQuery || req.query;

  const serviceResult = await applicationService.getAllApplications(req.user._id, options);

  res.status(200).json({
    success: true,
    message: 'Lấy danh sách tất cả ứng viên thành công',
    data: serviceResult.data,
    meta: serviceResult.meta
  });
});

/**
 * @desc      Get statistics for all applications
 * @route     GET /api/recruiter/applications/statistics
 * @access    Private - Recruiter Only
 */
export const getApplicationsStatistics = asyncHandler(async (req, res) => {
  const filters = req.validatedQuery || req.query;

  const statistics = await applicationService.getApplicationsStatistics(req.user._id, filters);

  res.status(200).json({
    success: true,
    message: 'Lấy thống kê thành công',
    data: statistics
  });
});

/**
 * @desc      Bulk update status for multiple applications
 * @route     PATCH /api/recruiter/applications/bulk/status
 * @access    Private - Recruiter Only
 */
export const bulkUpdateStatus = asyncHandler(async (req, res) => {
  const { applicationIds, status } = req.body;

  const result = await applicationService.bulkUpdateStatus(req.user._id, applicationIds, status);

  res.status(200).json({
    success: true,
    message: `Cập nhật trạng thái cho ${result.count} đơn ứng tuyển thành công`,
    data: result
  });
});



/**
 * @desc      Export applications to CSV
 * @route     POST /api/recruiter/applications/export
 * @access    Private - Recruiter Only
 */
export const exportApplications = asyncHandler(async (req, res) => {
  const { applicationIds } = req.body;

  const csvData = await applicationService.exportApplicationsToCSV(req.user._id, applicationIds);

  res.status(200).json({
    success: true,
    message: 'Export dữ liệu thành công',
    data: csvData
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
