import { describe, it, expect } from '@jest/globals';
import {
  createJobAlertSchema,
  createNotificationHistorySchema,
  getNotificationHistorySchema,
} from '../jobAlert.schema.js';

describe('Job Alert Schemas', () => {
  describe('createJobAlertSchema', () => {
    it('should validate a complete job alert subscription', () => {
      const validData = {
        keyword: 'software developer',
        location: {
          province: 'Thành phố Hồ Chí Minh',
          district: 'Quận 1'
        },
        frequency: 'daily',
        salaryRange: '10M_20M',
        type: 'FULL_TIME',
        workType: 'REMOTE',
        experience: 'MID_LEVEL',
        category: 'IT',
        notificationMethod: 'EMAIL'
      };

      const result = createJobAlertSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should apply default values correctly', () => {
      const minimalData = {
        location: {
          province: 'Thành phố Hà Nội',
          district: 'Quận Ba Đình'
        },
        salaryRange: 'ALL',
        type: 'ALL',
        workType: 'ALL',
        experience: 'ALL',
        category: 'ALL'
      };

      const result = createJobAlertSchema.safeParse(minimalData);
      expect(result.success).toBe(true);
      expect(result.data.frequency).toBe('weekly');
      expect(result.data.notificationMethod).toBe('APPLICATION');
    });

    it('should reject invalid frequency', () => {
      const invalidData = {
        location: { province: 'Thành phố Hà Nội', district: 'Quận Ba Đình' },
        frequency: 'hourly',
        salaryRange: 'ALL',
        type: 'ALL',
        workType: 'ALL',
        experience: 'ALL',
        category: 'ALL'
      };

      const result = createJobAlertSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject too many urgent keywords', () => {
      const invalidData = {
        location: { province: 'Thành phố Hà Nội', district: 'Quận Ba Đình' },
        salaryRange: 'ALL',
        type: 'ALL',
        workType: 'ALL',
        experience: 'ALL',
        category: 'ALL',
        urgentKeywords: Array(11).fill('keyword') // More than 10
      };

      const result = createJobAlertSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });


  describe('createNotificationHistorySchema', () => {
    it('should validate notification history creation', () => {
      const validData = {
        userId: '507f1f77bcf86cd799439011',
        subscriptionId: '507f1f77bcf86cd799439012',
        notificationType: 'DAILY',
        jobIds: ['507f1f77bcf86cd799439013', '507f1f77bcf86cd799439014'],
        deliveryMethod: 'EMAIL'
      };

      const result = createNotificationHistorySchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid ObjectId format', () => {
      const invalidData = {
        userId: 'invalid-id',
        subscriptionId: '507f1f77bcf86cd799439012',
        notificationType: 'DAILY',
        jobIds: ['507f1f77bcf86cd799439013'],
        deliveryMethod: 'EMAIL'
      };

      const result = createNotificationHistorySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should require at least one job ID', () => {
      const invalidData = {
        userId: '507f1f77bcf86cd799439011',
        subscriptionId: '507f1f77bcf86cd799439012',
        notificationType: 'DAILY',
        jobIds: [],
        deliveryMethod: 'EMAIL'
      };

      const result = createNotificationHistorySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });


  describe('getNotificationHistorySchema', () => {
    it('should validate query parameters with defaults', () => {
      const result = getNotificationHistorySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(10);
    });

    it('should validate with all parameters', () => {
      const validData = {
        page: '2',
        limit: '20',
        notificationType: 'DAILY',
        status: 'DELIVERED',
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-01-31T23:59:59Z'
      };

      const result = getNotificationHistorySchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(20);
    });

    it('should reject invalid page number', () => {
      const invalidData = { page: '0' };
      const result = getNotificationHistorySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject limit exceeding maximum', () => {
      const invalidData = { limit: '100' };
      const result = getNotificationHistorySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

});