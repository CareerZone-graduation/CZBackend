// workers/notification.worker.js
import path from 'path';
import dotenv from 'dotenv';

// Load .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { getChannel, QUEUES, ROUTING_KEYS } from '../src/queues/rabbitmq.js';
import * as notificationService from '../src/services/notification.service.js';
import * as emailService from '../src/services/email.service.js';
import connectDB from '../src/utils/connectDB.js';
import logger from '../src/utils/logger.js';

/**
 * ==========================================
 * HANDLER REGISTRY - Strategy Pattern
 * ==========================================
 * Ánh xạ Routing Key tới hàm xử lý tương ứng.
 * TẤT CẢ các hàm này đều chỉ nhận (payload) làm tham số.
 * Worker chỉ là một bộ điều phối (Orchestrator) thuần túy.
 */
const handlerRegistry = {
  // === Email Services ===
  [ROUTING_KEYS.EMAIL_SEND]: emailService.sendEmail,

  // === Application Related ===
  [ROUTING_KEYS.NEW_APPLICATION]: notificationService.handleNewApplication,
  [ROUTING_KEYS.STATUS_UPDATE]: notificationService.handleStatusUpdate,

  // === Interview Related ===
  [ROUTING_KEYS.INTERVIEW_REMINDER]: notificationService.handleInterviewReminder,
  [ROUTING_KEYS.INTERVIEW_RESCHEDULE]: notificationService.handleInterviewReschedule,
  [ROUTING_KEYS.INTERVIEW_CANCEL]: notificationService.handleInterviewCancel,
  [ROUTING_KEYS.INTERVIEW_COMPLETE]: () => {}, // No-op for now

  // === Job Alerts ===
  [ROUTING_KEYS.JOB_ALERT_DAILY]: notificationService.processJobAlertNotification,
  [ROUTING_KEYS.JOB_ALERT_WEEKLY]: notificationService.processJobAlertNotification,

  // === Legacy/System Notifications ===
  [ROUTING_KEYS.JOB_APPROVAL]: () => {},
  [ROUTING_KEYS.COMPANY_VERIFICATION]: () => {},
};

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

      // === ROUTING LOGIC MỚI - Strategy Pattern ===
      const handler = handlerRegistry[routingKey];

      if (handler) {
        // Chỉ cần gọi handler với toàn bộ payload
        await handler(payload);
      } else {
        // Xử lý cho các key không xác định (fallback)
        logger.warn(`⚠️ Unknown routing key [${routingKey}]`);
      }
      // ============================================

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

// Start the worker
startWorker().catch((error) => {
  logger.error('🚨 Failed to start notification worker:', error);
  process.exit(1);
});
