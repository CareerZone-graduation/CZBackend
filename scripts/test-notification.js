import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env.lht
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.lht') });

import { pushNotification } from '../src/services/notification.service.js';
import { User } from '../src/models/index.js';
import config from '../src/config/index.js';
import logger from '../src/utils/logger.js';

const sendTestNotification = async () => {

  const userEmail = "c1@gmail.com";
  const message = "This is a test notification";
  const title = 'Test Notification';

  try {
    // Connect to the database
    await mongoose.connect(config.DB_URI);
    logger.info('MongoDB Connected for script.');

    // Find the user by email
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      logger.error(`User with email ${userEmail} not found.`);
      return;
    }

    if (!user.fcmTokens || user.fcmTokens.length === 0) {
        logger.error(`User ${userEmail} has no registered FCM tokens. Cannot send push notification.`);
        // You might still want to create the notification in the DB
    }

    console.log(`Sending notification to ${user._id}`);
    logger.info(`Sending notification to ${user.email} (ID: ${user._id})`);

    // Send the notification
    const result = await pushNotification(user._id, {
      title: title,
      body: message,
      type: 'system', // Or any other relevant type
      data: {
        url: "/messages/123",
        info: 'This is a test notification from a manual script.',
        sentAt: new Date().toISOString(),
      },
    });

    if (result.success) {
      logger.info('Notification sent successfully!');
      if (result.response) {
        logger.info(`FCM Response: Success: ${result.response.successCount}, Failure: ${result.response.failureCount}`);
      }
      logger.info('Notification saved to DB with ID:', result.notification._id);
    } else {
      logger.error('Failed to send notification:', result.error);
    }

  } catch (error) {
    logger.error('An error occurred during the script:', error);
  } finally {
    // Disconnect from the database
    await mongoose.disconnect();
    logger.info('MongoDB Disconnected.');
  }
};

sendTestNotification();