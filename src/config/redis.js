import { createClient } from 'redis';
import config from './index.js';
import logger from '../utils/logger.js';

const redisClient = createClient({
  url: config.REDIS_URL,
  password: config.REDIS_PASSWORD,
  socket: {
    connectTimeout: 10000, // 10 seconds
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        logger.error('Redis: Max reconnection attempts reached');
        return new Error('Redis: Max reconnection attempts reached');
      }
      // Exponential backoff: wait longer between each retry
      const delay = Math.min(retries * 100, 3000);
      logger.info(`Redis: Reconnecting in ${delay}ms (attempt ${retries})`);
      return delay;
    },
  },
});

redisClient.on('error', (err) => {
  logger.error('Redis Client Error', err);
});

redisClient.on('connect', () => {
  logger.info('Redis client connected');
});

redisClient.on('ready', () => {
  logger.info('Redis client ready to use');
});

redisClient.on('reconnecting', () => {
  logger.info('Redis client reconnecting...');
});

redisClient.on('end', () => {
  logger.info('Redis client connection closed');
});

const connectRedis = async () => {
  if (!redisClient.isOpen) {
    try {
      await redisClient.connect();
      logger.info('Connected to Redis successfully!');
    } catch (error) {
      logger.error('Could not connect to Redis:', error);
      logger.warn('Application will continue without Redis. Some features may be limited.');
      // Don't exit - allow app to run without Redis
    }
  }
};

// Connect on application startup
connectRedis();

// Helper function to safely execute Redis commands
export const safeRedisCommand = async (command, fallback = null) => {
  try {
    if (!redisClient.isOpen || !redisClient.isReady) {
      logger.warn('Redis not available, using fallback');
      return fallback;
    }
    return await command();
  } catch (error) {
    logger.error('Redis command failed:', error);
    return fallback;
  }
};

export default redisClient;
