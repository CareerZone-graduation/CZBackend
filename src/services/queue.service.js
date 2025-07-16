// src/services/queue.service.js
import * as rabbitmq from '../queues/rabbitmq.js';
import logger from '../utils/logger.js';

const EXCHANGE = 'notifications_exchange';

/**
 * Gửi một message vào exchange chính của hệ thống thông báo.
 * @param {string} routingKey - Key để định tuyến message (e.g., 'notification.status_update').
 * @param {object} payload - Dữ liệu của message.
 */
export const publishNotification = async (routingKey, payload) => {
  try {
    const channel = await rabbitmq.getChannel();
    const message = Buffer.from(JSON.stringify(payload));

    channel.publish(EXCHANGE, routingKey, message, {
      persistent: true, // Đảm bảo message được lưu vào đĩa
    });

    logger.info(`Published notification task with key [${routingKey}]`, payload);
  } catch (error) {
    logger.error(`Error publishing notification with key [${routingKey}]`, { error, payload });
  }
};
