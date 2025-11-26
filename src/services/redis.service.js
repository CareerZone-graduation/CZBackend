import redisClient from '../config/redis.js';
import logger from '../utils/logger.js';

/**
 * Check if Redis is available
 * @returns {boolean} True if Redis is connected and ready
 */
const isRedisAvailable = () => {
  return redisClient.isOpen && redisClient.isReady;
};

/**
 * Sets a key-value pair in Redis with an expiration time.
 * @param {string} key The key to set.
 * @param {string} value The value to set.
 * @param {number} expirationInSeconds The expiration time in seconds.
 */
export const setWithExpiry = async (key, value, expirationInSeconds) => {
  try {
    if (!isRedisAvailable()) {
      logger.warn(`Redis not available, skipping set for key: ${key}`);
      return;
    }
    await redisClient.set(key, value, {
      EX: expirationInSeconds,
    });
  } catch (error) {
    logger.error(`Error setting key ${key} in Redis`, error);
    // Don't throw - allow app to continue without Redis
  }
};

/**
 * Gets the value of a key from Redis.
 * @param {string} key The key to get.
 * @returns {Promise<string|null>} The value of the key, or null if it doesn't exist.
 */
export const get = async (key) => {
  try {
    if (!isRedisAvailable()) {
      logger.warn(`Redis not available, returning null for key: ${key}`);
      return null;
    }
    return await redisClient.get(key);
  } catch (error) {
    logger.error(`Error getting key ${key} from Redis`, error);
    return null; // Return null instead of throwing
  }
};

/**
 * Deletes a key from Redis.
 * @param {string} key The key to delete.
 */
export const del = async (key) => {
  try {
    if (!isRedisAvailable()) {
      logger.warn(`Redis not available, skipping delete for key: ${key}`);
      return;
    }
    await redisClient.del(key);
  } catch (error) {
    logger.error(`Error deleting key ${key} from Redis`, error);
    // Don't throw - allow app to continue without Redis
  }
};
