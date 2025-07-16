// workers/notification.worker.js
import path from 'path';
import dotenv from 'dotenv';

// Load .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { getChannel, QUEUES } from '../src/queues/rabbitmq.js';
import { processNotification } from '../src/services/notification.service.js';
import connectDB from '../src/utils/connectDB.js';
import logger from '../src/utils/logger.js';

async function startWorker() {
  await connectDB();
  const channel = await getChannel();
  logger.info('Notification worker started. Waiting for tasks...');

  // Hàm helper để xử lý message, tránh lặp code
  const messageHandler = async (msg) => {
    if (msg === null) return;

    try {
      const payload = JSON.parse(msg.content.toString());
      logger.info(`Received task from [${msg.fields.routingKey}]`, payload);
      await processNotification(payload); // Gọi service xử lý logic
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
  channel.consume(rabbitmq.QUEUES.IMMEDIATE, messageHandler, { noAck: false });
  channel.consume(rabbitmq.QUEUES.DIGEST, messageHandler, { noAck: false });
}

startWorker();
