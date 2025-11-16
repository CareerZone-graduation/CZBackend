import asyncHandler from 'express-async-handler';
import * as interviewAnalytics from '../services/interviewAnalytics.service.js';

/**
 * Log connection quality metrics
 * @route POST /api/interviews/:id/analytics/connection-quality
 * @access Private
 */
export const logConnectionQuality = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;
  const { metrics } = req.body;

  await interviewAnalytics.logConnectionQuality(id, userId, metrics);

  res.status(200).json({
    success: true,
    message: 'Connection quality logged successfully'
  });
});

/**
 * Log WebRTC failure
 * @route POST /api/interviews/:id/analytics/webrtc-failure
 * @access Private
 */
export const logWebRTCFailure = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;
  const { errorDetails } = req.body;

  await interviewAnalytics.logWebRTCFailure(id, userId, errorDetails);

  res.status(200).json({
    success: true,
    message: 'WebRTC failure logged successfully'
  });
});

/**
 * Log recording upload status
 * @route POST /api/interviews/:id/analytics/recording-upload
 * @access Private
 */
export const logRecordingUpload = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { success, details } = req.body;

  await interviewAnalytics.logRecordingUpload(id, success, details);

  res.status(200).json({
    success: true,
    message: 'Recording upload logged successfully'
  });
});

/**
 * Log interview event
 * @route POST /api/interviews/:id/analytics/event
 * @access Private
 */
export const logInterviewEvent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { eventType, eventData } = req.body;

  await interviewAnalytics.logInterviewEvent(id, eventType, eventData);

  res.status(200).json({
    success: true,
    message: 'Interview event logged successfully'
  });
});

/**
 * Get completion rate statistics
 * @route GET /api/interviews/analytics/completion-rate
 * @access Private/Admin
 */
export const getCompletionRate = asyncHandler(async (req, res) => {
  const { timeRange = '30d' } = req.query;

  const stats = await interviewAnalytics.calculateCompletionRate(timeRange);

  res.status(200).json({
    success: true,
    data: stats
  });
});

/**
 * Get WebRTC failure statistics
 * @route GET /api/interviews/analytics/webrtc-failures
 * @access Private/Admin
 */
export const getWebRTCFailureStats = asyncHandler(async (req, res) => {
  const { timeRange = '30d' } = req.query;

  const stats = await interviewAnalytics.getWebRTCFailureStats(timeRange);

  res.status(200).json({
    success: true,
    data: stats
  });
});

/**
 * Get average connection quality for interview
 * @route GET /api/interviews/:id/analytics/connection-quality
 * @access Private
 */
export const getAverageConnectionQuality = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const stats = await interviewAnalytics.getAverageConnectionQuality(id);

  res.status(200).json({
    success: true,
    data: stats
  });
});
