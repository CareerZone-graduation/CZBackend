// workers/notification.worker.js
import path from 'path';
import dotenv from 'dotenv';

// Load .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { getChannel, QUEUES, ROUTING_KEYS } from '../src/queues/rabbitmq.js';
import * as notificationService from '../src/services/notification.service.js'; // Import toàn bộ service
import * as emailService from '../src/services/email.service.js';
import connectDB from '../src/utils/connectDB.js';
import logger from '../src/utils/logger.js';

/**
 * Khởi động worker để xử lý notification tasks
 */
async function startWorker() {
  await connectDB();
  const channel = await getChannel();
  logger.info('🚀 Notification worker started. Waiting for tasks...');

  /**
   * Message handler - Orchestrator chính xử lý các loại message khác nhau
   * @param {Object} msg - Message từ RabbitMQ
   */
  const messageHandler = async (msg) => {
    if (msg === null) return;

    const startTime = Date.now();
    let routingKey, payload;

    try {
      payload = JSON.parse(msg.content.toString());
      routingKey = msg.fields.routingKey;
      
      logger.info(`📨 Received task from [${routingKey}]`, { 
        payloadType: payload.type,
        timestamp: new Date().toISOString()
      });

      // === ROUTING LOGIC - Điều phối message đến hàm service tương ứng ===
      switch (routingKey) {
        
        // === Email Services ===
        case ROUTING_KEYS.EMAIL_SEND:
          await emailService.sendEmail(payload);
          break;
        
        // === New Application - Tạo thông báo gộp cho nhà tuyển dụng ===
        case ROUTING_KEYS.NEW_APPLICATION:
          await notificationService.upsertRecruiterApplicantsRollup(payload);
          logger.info(`👥 Recruiter rollup notification processed successfully`);
          break;

        // === Status Updates - Xử lý cập nhật trạng thái ứng tuyển ===
        case ROUTING_KEYS.STATUS_UPDATE:
          await handleStatusUpdate(payload);
          break;

        // === Interview Related ===
        case ROUTING_KEYS.INTERVIEW_REMINDER:
          // await notificationService.createInterviewReminderNotification(payload);
          // logger.info(`⏰ Interview reminder notification created successfully`);
          break;

        case ROUTING_KEYS.INTERVIEW_RESCHEDULE:
          await notificationService.createInterviewRescheduledNotification(payload.data.interviewId, payload.data.newScheduledTime);
          break;

        case ROUTING_KEYS.INTERVIEW_CANCEL:
          await notificationService.createInterviewCanceledNotification(payload.data.interviewId);
          break;

        case ROUTING_KEYS.INTERVIEW_COMPLETE:
          // Xử lý qua hàm legacy cho các loại interview khác
          await notificationService.processLegacyNotification(payload);
          logger.info(`📅 Interview notification processed via legacy handler`);
          break;

        // === Daily Digest ===
        case ROUTING_KEYS.DAILY_DIGEST:
          await handleDailyDigest(payload);
          break;

        // === Job and Company Related ===
        case ROUTING_KEYS.JOB_APPROVAL:
        case ROUTING_KEYS.COMPANY_VERIFICATION:
          await notificationService.processLegacyNotification(payload);
          logger.info(`🏢 Job/Company notification processed via legacy handler`);
          break;

        // === Default Handler - Dành cho các routing key cũ ===
        default:
          logger.warn(`⚠️ Unknown routing key [${routingKey}], processing via legacy handler`);
          await notificationService.processLegacyNotification(payload);
          break;
      }

      // Acknowledge message thành công
      channel.ack(msg);
      
      const processingTime = Date.now() - startTime;
      logger.info(`✅ Message processed successfully`, {
        routingKey,
        processingTimeMs: processingTime,
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('❌ Error processing message, sending to DLQ', {
        error: error.message,
        stack: error.stack,
        routingKey: routingKey || 'unknown',
        payloadType: payload?.type || 'unknown',
        processingTimeMs: processingTime,
        messageId: msg.properties?.messageId
      });

      // Reject message và gửi vào Dead Letter Queue
      channel.nack(msg, false, false);
    }
  };

  // === Lắng nghe cả hai queue với cùng handler ===
  channel.consume(QUEUES.IMMEDIATE, messageHandler, { noAck: false });
  channel.consume(QUEUES.DIGEST, messageHandler, { noAck: false });
  
  logger.info(`🎧 Worker is now consuming from queues: [${QUEUES.IMMEDIATE}, ${QUEUES.DIGEST}]`);
}

/**
 * Xử lý các loại STATUS_UPDATE khác nhau
 * @param {Object} payload - Message payload
 */
async function handleStatusUpdate(payload) {
  const applicationId = payload.data.applicationId;
  switch (payload.type) {
    case 'APPLICATION_SUBMITTED':
      // Tạo thông báo xác nhận cho ứng viên
      await notificationService.createApplicationSubmittedNotification(applicationId);
      break;
    
    case 'RATING_UPDATE':
      // Cập nhật đánh giá ứng viên
      const newRating = payload.data.newRating;
      await notificationService.createRatingUpdateNotification(applicationId, newRating);
      break;

    case 'INTERVIEW_SCHEDULED':
      const interviewId = payload.data.interviewId;
      // Cập nhật trạng thái ứng tuyển (rating, interview schedule, etc.)
      await notificationService.createInterviewScheduledNotification(applicationId, interviewId);
      logger.info(`📋 Interview scheduled notification created`);
      break;
    
    case 'PROFILE_VIEW':
      // Thông báo khi hồ sơ được xem
      await notificationService.createProfileViewNotification(payload);
      logger.info(`👀 Profile view notification created`);
      break;
    
    default:
      // Fallback cho các loại status update khác
      logger.warn(`⚠️ Unknown STATUS_UPDATE type: ${payload.type}, using legacy handler`);
      await notificationService.processLegacyNotification(payload);
      break;
  }
}

/**
 * Xử lý daily digest notifications
 * @param {Object} payload - Message payload
 */
async function handleDailyDigest(payload) {
  // TODO: Implement daily digest logic
  logger.info(`📊 Daily digest processing - TODO: Implement this feature`);
  // Tạm thời xử lý qua legacy handler
  await notificationService.processLegacyNotification(payload);
}

// === Error Handling ===
process.on('unhandledRejection', (reason, promise) => {
  logger.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging, throwing an error, or other logic here
});

process.on('uncaughtException', (error) => {
  logger.error('🚨 Uncaught Exception thrown:', error);
  process.exit(1);
});

// === Graceful Shutdown ===
process.on('SIGINT', () => {
  logger.info('🛑 Received SIGINT. Graceful shutdown...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('🛑 Received SIGTERM. Graceful shutdown...');
  process.exit(0);
});

// Start the worker
startWorker().catch((error) => {
  logger.error('🚨 Failed to start notification worker:', error);
  process.exit(1);
});
