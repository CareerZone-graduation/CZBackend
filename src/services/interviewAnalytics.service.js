import logger from '../utils/logger.js';
import Interview from '../models/Interview.js';

/**
 * Interview Analytics Service
 * Tracks and logs interview metrics for monitoring and analytics
 * Requirements: 8.4, 3.3
 */

/**
 * Log connection quality metrics
 * @param {string} interviewId - Interview ID
 * @param {string} userId - User ID
 * @param {object} metrics - Connection quality metrics
 */
export const logConnectionQuality = async (interviewId, userId, metrics) => {
  try {
    logger.info('Interview connection quality metrics', {
      interviewId,
      userId,
      quality: metrics.quality,
      latency: metrics.details?.latency,
      videoPacketLoss: metrics.details?.videoPacketLoss,
      audioPacketLoss: metrics.details?.audioPacketLoss,
      videoBitrate: metrics.details?.videoBitrate,
      fps: metrics.details?.fps,
      timestamp: new Date().toISOString()
    });

    // Store in interview metadata for future analysis
    await Interview.findByIdAndUpdate(
      interviewId,
      {
        $push: {
          'metadata.connectionQualityLogs': {
            userId,
            timestamp: new Date(),
            quality: metrics.quality,
            metrics: metrics.details
          }
        }
      },
      { new: true }
    );
  } catch (error) {
    logger.error('Failed to log connection quality', {
      interviewId,
      userId,
      error: error.message
    });
  }
};

/**
 * Log WebRTC connection failure
 * @param {string} interviewId - Interview ID
 * @param {string} userId - User ID
 * @param {object} errorDetails - Error details
 */
export const logWebRTCFailure = async (interviewId, userId, errorDetails) => {
  try {
    logger.error('WebRTC connection failure', {
      interviewId,
      userId,
      errorType: errorDetails.type,
      errorMessage: errorDetails.message,
      iceConnectionState: errorDetails.iceConnectionState,
      connectionState: errorDetails.connectionState,
      timestamp: new Date().toISOString()
    });

    // Store failure in interview metadata
    await Interview.findByIdAndUpdate(
      interviewId,
      {
        $push: {
          'metadata.webrtcFailures': {
            userId,
            timestamp: new Date(),
            errorType: errorDetails.type,
            errorMessage: errorDetails.message,
            state: {
              ice: errorDetails.iceConnectionState,
              connection: errorDetails.connectionState
            }
          }
        }
      },
      { new: true }
    );
  } catch (error) {
    logger.error('Failed to log WebRTC failure', {
      interviewId,
      userId,
      error: error.message
    });
  }
};

/**
 * Log recording upload status
 * @param {string} interviewId - Interview ID
 * @param {boolean} success - Whether upload succeeded
 * @param {object} details - Upload details
 */
export const logRecordingUpload = async (interviewId, success, details) => {
  try {
    const logData = {
      interviewId,
      success,
      size: details.size,
      duration: details.duration,
      uploadTime: details.uploadTime,
      timestamp: new Date().toISOString()
    };

    if (success) {
      logger.info('Recording upload successful', logData);
    } else {
      logger.error('Recording upload failed', {
        ...logData,
        error: details.error
      });
    }

    // Store in interview metadata
    await Interview.findByIdAndUpdate(
      interviewId,
      {
        $push: {
          'metadata.recordingUploadLogs': {
            timestamp: new Date(),
            success,
            details
          }
        }
      },
      { new: true }
    );
  } catch (error) {
    logger.error('Failed to log recording upload', {
      interviewId,
      error: error.message
    });
  }
};

/**
 * Calculate and log interview completion rate
 * @param {string} timeRange - Time range for calculation (e.g., '7d', '30d')
 * @returns {object} Completion statistics
 */
export const calculateCompletionRate = async (timeRange = '30d') => {
  try {
    const days = parseInt(timeRange) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [total, completed, cancelled, scheduled] = await Promise.all([
      Interview.countDocuments({ createdAt: { $gte: startDate } }),
      Interview.countDocuments({ 
        createdAt: { $gte: startDate },
        status: 'completed'
      }),
      Interview.countDocuments({ 
        createdAt: { $gte: startDate },
        status: 'cancelled'
      }),
      Interview.countDocuments({ 
        createdAt: { $gte: startDate },
        status: 'scheduled'
      })
    ]);

    const completionRate = total > 0 ? (completed / total * 100).toFixed(2) : 0;
    const cancellationRate = total > 0 ? (cancelled / total * 100).toFixed(2) : 0;

    const stats = {
      timeRange: `${days} days`,
      total,
      completed,
      cancelled,
      scheduled,
      inProgress: total - completed - cancelled - scheduled,
      completionRate: parseFloat(completionRate),
      cancellationRate: parseFloat(cancellationRate)
    };

    logger.info('Interview completion statistics', stats);
    return stats;
  } catch (error) {
    logger.error('Failed to calculate completion rate', {
      error: error.message
    });
    throw error;
  }
};

/**
 * Get WebRTC failure statistics
 * @param {string} timeRange - Time range for statistics
 * @returns {object} Failure statistics
 */
export const getWebRTCFailureStats = async (timeRange = '30d') => {
  try {
    const days = parseInt(timeRange) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const interviews = await Interview.find({
      createdAt: { $gte: startDate },
      'metadata.webrtcFailures': { $exists: true, $ne: [] }
    }).select('metadata.webrtcFailures status');

    const stats = {
      totalInterviews: interviews.length,
      totalFailures: 0,
      failuresByType: {},
      affectedInterviewIds: []
    };

    interviews.forEach(interview => {
      const failures = interview.metadata?.webrtcFailures || [];
      stats.totalFailures += failures.length;
      stats.affectedInterviewIds.push(interview._id);

      failures.forEach(failure => {
        const type = failure.errorType || 'unknown';
        stats.failuresByType[type] = (stats.failuresByType[type] || 0) + 1;
      });
    });

    logger.info('WebRTC failure statistics', stats);
    return stats;
  } catch (error) {
    logger.error('Failed to get WebRTC failure stats', {
      error: error.message
    });
    throw error;
  }
};

/**
 * Log interview event (start, end, join, leave)
 * @param {string} interviewId - Interview ID
 * @param {string} eventType - Event type
 * @param {object} eventData - Event data
 */
export const logInterviewEvent = async (interviewId, eventType, eventData) => {
  try {
    logger.info(`Interview event: ${eventType}`, {
      interviewId,
      eventType,
      ...eventData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to log interview event', {
      interviewId,
      eventType,
      error: error.message
    });
  }
};

/**
 * Get average connection quality for an interview
 * @param {string} interviewId - Interview ID
 * @returns {object} Average quality metrics
 */
export const getAverageConnectionQuality = async (interviewId) => {
  try {
    const interview = await Interview.findById(interviewId).select('metadata.connectionQualityLogs');
    
    if (!interview || !interview.metadata?.connectionQualityLogs?.length) {
      return null;
    }

    const logs = interview.metadata.connectionQualityLogs;
    const qualityScores = { excellent: 4, good: 3, fair: 2, poor: 1 };
    
    let totalLatency = 0;
    let totalPacketLoss = 0;
    let totalQualityScore = 0;
    let count = logs.length;

    logs.forEach(log => {
      totalLatency += log.metrics?.latency || 0;
      totalPacketLoss += (log.metrics?.videoPacketLoss || 0) + (log.metrics?.audioPacketLoss || 0);
      totalQualityScore += qualityScores[log.quality] || 0;
    });

    return {
      averageLatency: Math.round(totalLatency / count),
      averagePacketLoss: (totalPacketLoss / count).toFixed(2),
      averageQualityScore: (totalQualityScore / count).toFixed(2),
      overallQuality: totalQualityScore / count >= 3.5 ? 'excellent' :
                      totalQualityScore / count >= 2.5 ? 'good' :
                      totalQualityScore / count >= 1.5 ? 'fair' : 'poor',
      sampleCount: count
    };
  } catch (error) {
    logger.error('Failed to calculate average connection quality', {
      interviewId,
      error: error.message
    });
    return null;
  }
};
