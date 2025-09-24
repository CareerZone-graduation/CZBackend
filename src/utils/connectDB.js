import mongoose from 'mongoose';
import config from '../config/index.js';
import logger from './logger.js';

const connectDB = async () => {
  // Don't connect to the database in a test environment
  // The test setup will handle the in-memory database connection
  if (config.NODE_ENV === 'test') {
    return;
  }

  try {
    const conn = await mongoose.connect(config.DB_URI);

    logger.info(`${config.DB_URI} MongoDB Connected: ${conn.connection.host}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed');
      process.exit(0);
    });

  } catch (error) {
    logger.error('Database connection failed:', error);
    process.exit(1);
  }
};

export default connectDB;
