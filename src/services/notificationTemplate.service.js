import pug from 'pug';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { BadRequestError } from '../utils/AppError.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * NotificationTemplate Service
 * Handles email template generation for job notifications
 */
class NotificationTemplateService {
  
  /**
   * Generate email template for different notification types
   * @param {string} templateType - Type of template ('DAILY', 'WEEKLY)
   * @param {Object} data - Template data
   * @param {Object} data.user - User information
   * @param {Array} data.jobs - Array of job objects
   * @param {Object} data.subscription - Job alert subscription
   * @param {string} data.notificationId - Notification ID for tracking
   * @returns {Promise<string>} Rendered HTML template
   */
  async generateEmailTemplate(templateType, data) {
    try {
      const { user, jobs, subscription, notificationId } = data;
      
      if (!user || !jobs || !subscription || !notificationId) {
        throw new BadRequestError('Missing required template data');
      }

      // Prepare template data
      const templateData = {
        user: {
          name: user.fullName || user.email || 'Người dùng',
          email: user.email
        },
        jobs: jobs.map(job => ({
          ...job,
          formattedSalary: this._formatSalary(job.minSalary, job.maxSalary),
          formattedDeadline: this._formatDeadline(job.deadline),
          trackingUrl: this._generateJobTrackingUrl(job._id, notificationId)
        })),
        subscription: {
          keyword: subscription.keyword,
          location: `${subscription.location.district}, ${subscription.location.province}`,
          frequency: subscription.frequency
        },
        notificationId,
        totalJobs: jobs.length,
        templateType: templateType.toLowerCase()
      };

      // Select template file based on type
      const templateFile = this._getTemplateFile(templateType);
      
      // Render template
      const html = pug.renderFile(
        path.join(__dirname, `../views/emails/${templateFile}`),
        templateData
      );

      logger.info(`Email template generated successfully for ${templateType} notification ${notificationId}`);
      return html;

    } catch (error) {
      logger.error(`Error generating email template for ${templateType}:`, error);
      throw error;
    }
  }

  /**
   * Generate dynamic email subject based on jobs and frequency
   * @param {Array} jobs - Array of job objects
   * @param {string} keyword - Search keyword
   * @param {string} frequency - Notification frequency ('daily', 'weekly')
   * @returns {string} Email subject
   */
  generateSubject(jobs, keyword, frequency) {
    const jobCount = jobs.length;
    const frequencyText = frequency === 'daily' ? 'hôm nay' : 'tuần này';
    
    if (jobCount === 0) {
      return `Không có việc làm mới cho "${keyword}" ${frequencyText}`;
    } else if (jobCount === 1) {
      return `1 việc làm mới cho "${keyword}" ${frequencyText}`;
    } else {
      return `${jobCount} việc làm mới cho "${keyword}" ${frequencyText}`;
    }
  }

  /**
   * Get template file name based on notification type
   * @private
   * @param {string} templateType - Template type
   * @returns {string} Template file name
   */
  _getTemplateFile(templateType) {
    const templateMap = {
      'DAILY': 'jobAlertDaily.pug',
      'WEEKLY': 'jobAlertWeekly.pug'
        };
    
    return templateMap[templateType] || 'jobAlertDaily.pug';
  }

  /**
   * Format salary range for display
   * @private
   * @param {string} minSalary - Minimum salary
   * @param {string} maxSalary - Maximum salary
   * @returns {string} Formatted salary string
   */
  _formatSalary(minSalary, maxSalary) {
    if (!minSalary && !maxSalary) {
      return 'Thỏa thuận';
    }
    
    const formatNumber = (num) => {
      if (!num) return '';
      const numValue = parseFloat(num);
      if (numValue >= 1000000) {
        return `${(numValue / 1000000).toFixed(1)}M`;
      } else if (numValue >= 1000) {
        return `${(numValue / 1000).toFixed(0)}K`;
      }
      return numValue.toLocaleString('vi-VN');
    };

    if (minSalary && maxSalary) {
      return `${formatNumber(minSalary)} - ${formatNumber(maxSalary)} VNĐ`;
    } else if (minSalary) {
      return `Từ ${formatNumber(minSalary)} VNĐ`;
    } else {
      return `Lên đến ${formatNumber(maxSalary)} VNĐ`;
    }
  }

  /**
   * Format deadline for display
   * @private
   * @param {Date} deadline - Application deadline
   * @returns {string} Formatted deadline string
   */
  _formatDeadline(deadline) {
    if (!deadline) return 'Không xác định';
    
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diffTime = deadlineDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return 'Đã hết hạn';
    } else if (diffDays === 0) {
      return 'Hôm nay';
    } else if (diffDays === 1) {
      return 'Ngày mai';
    } else if (diffDays <= 7) {
      return `${diffDays} ngày nữa`;
    } else {
      return deadlineDate.toLocaleDateString('vi-VN');
    }
  }

  /**
   * Generate job tracking URL with click tracking
   * @private
   * @param {string} jobId - Job ID
   * @param {string} notificationId - Notification ID
   * @returns {string} Tracking URL
   */
  _generateJobTrackingUrl(jobId, notificationId) {
    const baseUrl = config.CLIENT_URL;
    return `${baseUrl}/jobs/${jobId}?utm_source=email&utm_medium=notification&utm_campaign=job_alert&notification_id=${notificationId}`;
  }

}

export default new NotificationTemplateService();