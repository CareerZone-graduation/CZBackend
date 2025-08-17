// workers/notification.worker.js
import path from 'path';
import dotenv from 'dotenv';

// Load .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { getChannel, QUEUES, ROUTING_KEYS } from '../src/queues/rabbitmq.js';
import { processNotification } from '../src/services/notification.service.js';
import * as emailService from '../src/services/email.service.js';
import connectDB from '../src/utils/connectDB.js';
import logger from '../src/utils/logger.js';

async function startWorker() {
  await connectDB();
  const channel = await getChannel();
  logger.info('Notification worker started. Waiting for tasks...');

  // Hàm helper để xử lý message, tránh lặp code
  const messageHandler = async (msg) => {
    logger.info(`Received message from queue: ${msg.fields.routingKey}`);
    if (msg === null) return;

    try {
      const payload = JSON.parse(msg.content.toString());
      const routingKey = msg.fields.routingKey;
      logger.info(`Received task from [${routingKey}]`, payload);

      // Routing logic
      switch (routingKey) {
        case ROUTING_KEYS.EMAIL_SEND:
          await emailService.sendEmail(payload);
          break;
        // Thêm các case khác ở đây nếu cần
        // case ROUTING_KEYS.STATUS_UPDATE:
        //   await someOtherService(payload);
        //   break;
        default:
          // Mặc định gọi processNotification cho các routing key cũ
          await processNotification(payload);
          break;
      }

      channel.ack(msg); // Báo đã xử lý xong
    } catch (error) {
      logger.error('Error processing task, sending to DLQ.', {
        error: error.message,
        routingKey: msg.fields.routingKey,
        payload: msg.content.toString(),
      });
      // Nack và không requeue, message sẽ tự động vào DLQ
      channel.nack(msg, false, false);
    }
  };

  // Lắng nghe cả 2 queue với cùng một handler
  channel.consume(QUEUES.IMMEDIATE, messageHandler, { noAck: false });
  channel.consume(QUEUES.DIGEST, messageHandler, { noAck: false });
}

startWorker();
