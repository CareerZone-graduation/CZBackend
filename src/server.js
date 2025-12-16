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

// Python Proxy - for WebSocket upgrade handling
import { getPythonProxyInstance } from './middleware/pythonProxy.middleware.js';

// Import cron jobs to activate them
import './cron/interviewReminder.cron.js';
import './cron/jobAlert.cron.js';
import './cron/emailVerificationCleanup.cron.js';
import './cron/jobExpiration.cron.js';
import './cron/updateSupportRequestPriority.cron.js';
import './cron/paymentTimeout.cron.js';

// Import watchers
// import { watchCandidateProfileChanges } from './watchers/candidateEmbedding.watcher.js';

dotenv.config();

// Tạo HTTP server và Socket.IO
const server = http.createServer(app);
// const io = new socketio.Server(server, {
//   cors: {
//     origin: [config.CANDIDATE_FE_URL, config.RECRUITER_FE_URL, "http://localhost:3001", "http://localhost:3000", "http://localhost:3002", "http://localhost:3003", "http://localhost:3200"],
//     methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
//     credentials: true,
//   },
//   path: '/socket.io',
// });

const io = new socketio.Server(server, {
  cors: {
    origin: "*", // <--- Thay thế mảng cũ bằng dấu "*"
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    credentials: false // <--- Quan trọng: Phải tắt cái này nếu dùng "*"
  },
  path: '/socket.io',
});
socket.initializeSocket(io);

// === WEBSOCKET UPGRADE HANDLER CHO PYTHON PROXY ===
// Quan trọng: Cần handle WebSocket upgrade thủ công cho proxy
if (config.NODE_ENV === 'development' || process.env.ENABLE_PYTHON_PROXY === 'true') {
  server.on('upgrade', (req, socket, head) => {
    // Debug log to trace what URLs are hitting the upgrade handler
    if (req.url && !req.url.includes('/socket.io/')) {
      logger.debug(`[Server] Upgrade request: ${req.url}`);
    }

    // Explicitly ignore socket.io requests to let Socket.IO handle them
    // Socket.IO listens to the same 'upgrade' event, so we must not interfere
    if (req.url?.includes('/socket.io/') || req.url?.includes('transport=websocket')) {
      return;
    }

    // Kiểm tra nếu là request tới Python proxy
    if (req.url?.startsWith('/api/python')) {
      const pythonProxy = getPythonProxyInstance();
      if (pythonProxy && pythonProxy.handleUpgrade) {
        logger.info(`[Python Proxy] WebSocket upgrade request: ${req.url}`);
        pythonProxy.handleUpgrade(req, socket, head);
      }
    }
    // Lưu ý: Socket.IO xử lý upgrade riêng qua path '/socket.io'
  });
  logger.info('[Python Proxy] WebSocket upgrade handler registered');
}

// Khởi động
const startServer = async () => {
  try {
    await connectDB();
    await rabbitmq.getChannel(); // Khởi tạo kết nối RabbitMQ
    // await kafkaService.connectProducer();

    // Initialize change stream watchers
    // watchCandidateProfileChanges(); // Now handled by worker
    // logger.info('Change stream watchers initialized');

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
