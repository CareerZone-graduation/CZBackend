import * as http from 'http';
import * as socketio from 'socket.io';
import dotenv from 'dotenv';

import connectDB from './utils/connectDB.js';
import config from './config/index.js';
import logger from './utils/logger.js';
import * as socket from './socket/index.js';
import * as rabbitmq from './queues/rabbitmq.js';
// import * as kafkaService from './services/kafka.service.js';

import app from './app.js';

// Import cron jobs to activate them
import './cron/interviewReminder.cron.js';
import './cron/jobAlert.cron.js';
import './cron/emailVerificationCleanup.cron.js';
import './cron/jobExpiration.cron.js';
import './cron/updateSupportRequestPriority.cron.js';
import './cron/paymentTimeout.cron.js';

// Import watchers
import { watchCandidateProfileChanges } from './watchers/candidateEmbedding.watcher.js';

dotenv.config();

// Tạo HTTP server và Socket.IO
const server = http.createServer(app);
const io = new socketio.Server(server, {
  cors: {
    origin: [config.CLIENT_URL, config.RECRUITER_FE_URL, "http://localhost:3001", "http://localhost:3000", "http://localhost:3002", "http://localhost:3003", "http://localhost:3200"],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    credentials: true,
  },
  path: '/socket.io',
});
socket.initializeSocket(io);

// Khởi động
const startServer = async () => {
  try {
    await connectDB();
    await rabbitmq.getChannel(); // Khởi tạo kết nối RabbitMQ
    // await kafkaService.connectProducer();

    // Initialize change stream watchers
    watchCandidateProfileChanges();
    logger.info('Change stream watchers initialized');

    const PORT = config.PORT || 5000;
    server.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
      logger.info(`Environment: ${config.NODE_ENV}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Xử lý lỗi toàn cục
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', err);
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

// Tắt an toàn
process.on('SIGTERM', () => {
  logger.info('SIGTERM received');
  server.close(() => logger.info('Process terminated'));
});

startServer();

export { server };
