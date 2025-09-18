import mongoose from 'mongoose';
import JobAlertSubscription from '../../src/models/JobAlertSubscription.js';
import NotificationHistory from '../../src/models/NotificationHistory.js';
import { User } from '../../src/models/index.js';
import { BadRequestError, NotFoundError } from '../../src/utils/AppError.js';

// Import service functions directly to test them
import {
  updateNotificationPreferences,
  getNotificationHistory,
} from '../../src/services/jobAlert.service.js';

describe('JobAlert Service - Enhanced Functionality', () => {
  let candidateUser;

  beforeAll(async () => {
    // Create test user
    candidateUser = await User.create({
      email: 'candidate@example.com',
      password: 'password123',
      role: 'candidate',
    });
  });

  afterEach(async () => {
    // Clean up collections after each test
    await JobAlertSubscription.deleteMany({});
    await NotificationHistory.deleteMany({});
  });

  // Test the enhanced model functionality directly
  describe('JobAlertSubscription Model', () => {
    it('should create subscription with new enhanced fields', async () => {
      const subscription = await JobAlertSubscription.create({
        candidateId: candidateUser._id,
        keyword: 'nodejs',
        location: { province: 'Ho Chi Minh', district: 'District 1' },
        frequency: 'daily',
        salaryRange: 'ALL',
        type: 'ALL',
        workType: 'ALL',
        experience: 'ALL',
        category: 'ALL'
            });

      expect(subscription.active).toBe(true);
    });
  });


  describe('getNotificationHistory', () => {
    let subscription;

    beforeEach(async () => {
      subscription = await JobAlertSubscription.create({
        candidateId: candidateUser._id,
        keyword: 'nodejs',
        location: { province: 'Ho Chi Minh', district: 'District 1' },
        frequency: 'daily',
        salaryRange: 'ALL',
        type: 'ALL',
        workType: 'ALL',
        experience: 'ALL',
        category: 'ALL'
      });

      // Create test notification history
      await NotificationHistory.create({
        userId: candidateUser._id,
        subscriptionId: subscription._id,
        notificationType: 'DAILY',
        jobIds: [new mongoose.Types.ObjectId()],
        deliveryMethod: 'EMAIL',
        status: 'SENT'
      });
    });

    it('should return paginated notification history', async () => {
      const result = await getNotificationHistory(candidateUser._id, {
        page: 1,
        limit: 20
      });

      expect(result.meta.totalItems).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].notificationType).toBe('DAILY');
    });

    it('should filter by subscription ID', async () => {
      const result = await getNotificationHistory(candidateUser._id, {
        subscriptionId: subscription._id
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].subscriptionId._id.toString()).toBe(subscription._id.toString());
    });
  });

});