import cron from 'node-cron';
import SupportRequest from '../models/SupportRequest.js';
import { sendEmail } from '../services/email.service.js';
import logger from '../utils/logger.js';

// Auto-close deadline: 48 hours from creation
const AUTO_CLOSE_HOURS = 48;

/**
 * Calculate priority based on remaining time until auto-close (48 hours from creation)
 * - 48-24 hours remaining: low
 * - 24-12 hours remaining: medium
 * - 12-6 hours remaining: high
 * - 6-0 hours remaining: urgent
 * - 0 or less: should be auto-closed
 * @param {Date} createdAt - Creation timestamp
 * @returns {{ priority: string, hoursRemaining: number, shouldClose: boolean }}
 */
const calculatePriorityByDeadline = (createdAt) => {
  const now = new Date();
  const deadline = new Date(createdAt.getTime() + AUTO_CLOSE_HOURS * 60 * 60 * 1000);
  const hoursRemaining = (deadline - now) / (1000 * 60 * 60);

  if (hoursRemaining <= 0) {
    return { priority: 'urgent', hoursRemaining: 0, shouldClose: true };
  }
  if (hoursRemaining <= 6) {
    return { priority: 'urgent', hoursRemaining, shouldClose: false };
  }
  if (hoursRemaining <= 12) {
    return { priority: 'high', hoursRemaining, shouldClose: false };
  }
  if (hoursRemaining <= 24) {
    return { priority: 'medium', hoursRemaining, shouldClose: false };
  }
  return { priority: 'low', hoursRemaining, shouldClose: false };
};

/**
 * Send auto-close notification email to requester
 * @param {Object} request - Support request document
 */
const sendAutoCloseEmail = async (request) => {
  try {
    const categoryLabels = {
      'technical-issue': 'Vấn đề kỹ thuật',
      'account-issue': 'Vấn đề tài khoản',
      'payment-issue': 'Vấn đề thanh toán',
      'job-posting-issue': 'Vấn đề đăng tin',
      'application-issue': 'Vấn đề ứng tuyển',
      'general-inquiry': 'Thắc mắc chung'
    };

    await sendEmail({
      to: request.requester.email,
      subject: `[CareerZone] Yêu cầu hỗ trợ #${request._id.toString().slice(-8)} đã được đóng tự động`,
      template: 'supportRequestAutoClosed',
      context: {
        name: request.requester.name,
        requestId: request._id.toString().slice(-8),
        subject: request.subject,
        category: categoryLabels[request.category] || request.category,
        createdAt: new Date(request.createdAt).toLocaleString('vi-VN'),
        closedAt: new Date().toLocaleString('vi-VN'),
        supportPhone: '1900 1234'
      }
    });

    logger.info(`Auto-close email sent to ${request.requester.email} for request ${request._id}`);
  } catch (error) {
    logger.error(`Failed to send auto-close email for request ${request._id}:`, error);
  }
};

/**
 * Update priority for pending support requests
 * Auto-close only PENDING requests that exceed 48 hours without admin response
 * In-progress requests (admin already responded) will NOT be auto-closed
 */
const updateSupportRequestPriorities = async () => {
  try {
    logger.info('Running support request priority update cron job...');

    // Find only PENDING requests (not yet responded by admin)
    // In-progress means admin has responded, so we don't auto-close those
    const pendingRequests = await SupportRequest.find({
      status: 'pending'
    });

    let updatedCount = 0;
    let closedCount = 0;

    for (const request of pendingRequests) {
      const { priority: newPriority, shouldClose } = calculatePriorityByDeadline(
        request.createdAt
      );

      if (shouldClose) {
        // Auto-close ONLY pending requests (no admin response yet)
        request.status = 'closed';
        request.closedAt = new Date();
        request.priority = 'urgent';
        await request.save();
        closedCount++;

        // Send notification email
        await sendAutoCloseEmail(request);

        logger.info(
          `Auto-closed support request ${request._id} (exceeded 48 hours without admin response)`
        );
      } else if (request.priority !== newPriority) {
        // Update priority for pending requests
        const oldPriority = request.priority;
        request.priority = newPriority;
        await request.save();
        updatedCount++;

        logger.info(
          `Updated support request ${request._id} priority: ${oldPriority} -> ${newPriority}`
        );
      }
    }

    logger.info(
      `Cron job completed: Updated ${updatedCount} priorities, auto-closed ${closedCount} pending requests out of ${pendingRequests.length} total`
    );
  } catch (error) {
    logger.error('Error updating support request priorities:', error);
  }
};

// Run every 15 minutes for more accurate priority updates
cron.schedule('*/15 * * * *', updateSupportRequestPriorities);

logger.info(
  'Support request priority update cron job scheduled (every 15 minutes)'
);

export default updateSupportRequestPriorities;
