import redisClient from '../config/redis.js';
import logger from '../utils/logger.js';

/**
 * Sets a key-value pair in Redis with an expiration time.
 * @param {string} key The key to set.
 * @param {string} value The value to set.
 * @param {number} expirationInSeconds The expiration time in seconds.
 */
export const setWithExpiry = async (key, value, expirationInSeconds) => {
  try {
    await redisClient.set(key, value, {
      EX: expirationInSeconds,
    });
  } catch (error) {
    logger.error(`Error setting key ${key} in Redis`, error);
    throw error;
  }
};

/**
 * Gets the value of a key from Redis.
 * @param {string} key The key to get.
 * @returns {Promise<string|null>} The value of the key, or null if it doesn't exist.
 */
export const get = async (key) => {
  try {
    return await redisClient.get(key);
  } catch (error) {
    logger.error(`Error getting key ${key} from Redis`, error);
    throw error;
  }
};

/**
 * Deletes a key from Redis.
 * @param {string} key The key to delete.
 */
export const del = async (key) => {
  try {
    await redisClient.del(key);
  } catch (error) {
    logger.error(`Error deleting key ${key} from Redis`, error);
    throw error;
  }
};
