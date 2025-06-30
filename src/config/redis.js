import { createClient } from 'redis';
import config from './index.js';
import logger from '../utils/logger.js';

const redisClient = createClient({
  url: config.REDIS_URL,
  password: config.REDIS_PASSWORD,
});

redisClient.on('error', (err) => logger.error('Redis Client Error', err));

const connectRedis = async () => {
  if (!redisClient.isOpen) {
    try {
      await redisClient.connect();
      logger.info('Connected to Redis successfully!');
    } catch (error) {
      logger.error('Could not connect to Redis:', error);
      // process.exit(1); // Optional: exit if Redis connection fails on startup
    }
  }
};

// Connect on application startup
connectRedis();

export default redisClient;
