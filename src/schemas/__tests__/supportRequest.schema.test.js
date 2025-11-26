import { describe, it, expect } from '@jest/globals';
import {
  createSupportRequestSchema,
  addFollowUpMessageSchema,
  respondToRequestSchema,
  updateStatusSchema,
  updatePrioritySchema,
  getSupportRequestsQuerySchema,
  getUserSupportRequestsQuerySchema,
  getAnalyticsQuerySchema,
  validateAttachments,
  categoryEnum,
  statusEnum,
  priorityEnum
} from '../supportRequest.schema.js';

describe('Support Request Schemas', () => {
  describe('createSupportRequestSchema', () => {
    it('should validate valid support request data', () => {
      const validData = {
        subject: 'Test Subject',
        description: 'This is a test description with at least 20 characters',
        category: 'technical-issue'
      };

      const result = createSupportRequestSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject subject shorter than 5 characters', () => {
      const invalidData = {
        subject: 'Test',
        description: 'This is a test description with at least 20 characters',
        category: 'technical-issue'
      };

      const result = createSupportRequestSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject description shorter than 20 characters', () => {
      const invalidData = {
        subject: 'Test Subject',
        description: 'Short desc',
        category: 'technical-issue'
      };

      const result = createSupportRequestSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid category', () => {
      const invalidData = {
        subject: 'Test Subject',
        description: 'This is a test description with at least 20 characters',
        category: 'invalid-category'
      };

      const result = createSupportRequestSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('addFollowUpMessageSchema', () => {
    it('should validate valid follow-up message', () => {
      const validData = {
        content: 'This is a follow-up message'
      };

      const result = addFollowUpMessageSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject empty content', () => {
      const invalidData = {
        content: ''
      };

      const result = addFollowUpMessageSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('respondToRequestSchema', () => {
    it('should validate valid admin response', () => {
      const validData = {
        response: 'This is an admin response',
        statusUpdate: 'in-progress',
        priorityUpdate: 'high'
      };

      const result = respondToRequestSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate response without status or priority update', () => {
      const validData = {
        response: 'This is an admin response'
      };

      const result = respondToRequestSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject empty response', () => {
      const invalidData = {
        response: ''
      };

      const result = respondToRequestSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('updateStatusSchema', () => {
    it('should validate valid status', () => {
      statusEnum.forEach(status => {
        const result = updateStatusSchema.safeParse({ status });
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid status', () => {
      const invalidData = {
        status: 'invalid-status'
      };

      const result = updateStatusSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('updatePrioritySchema', () => {
    it('should validate valid priority', () => {
      priorityEnum.forEach(priority => {
        const result = updatePrioritySchema.safeParse({ priority });
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid priority', () => {
      const invalidData = {
        priority: 'invalid-priority'
      };

      const result = updatePrioritySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('getSupportRequestsQuerySchema', () => {
    it('should validate valid query with all filters', () => {
      const validData = {
        page: '1',
        limit: '10',
        status: 'pending',
        category: 'technical-issue',
        priority: 'high',
        userType: 'candidate',
        fromDate: '2024-01-01',
        toDate: '2024-12-31',
        keyword: 'test',
        sortBy: '-priority'
      };

      const result = getSupportRequestsQuerySchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should apply default values', () => {
      const result = getSupportRequestsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(10);
      expect(result.data.sortBy).toBe('-priority');
    });

    it('should reject invalid date range', () => {
      const invalidData = {
        fromDate: '2024-12-31',
        toDate: '2024-01-01'
      };

      const result = getSupportRequestsQuerySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('getAnalyticsQuerySchema', () => {
    it('should validate valid date range', () => {
      const validData = {
        fromDate: '2024-01-01',
        toDate: '2024-12-31'
      };

      const result = getAnalyticsQuerySchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid date range', () => {
      const invalidData = {
        fromDate: '2024-12-31',
        toDate: '2024-01-01'
      };

      const result = getAnalyticsQuerySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('validateAttachments', () => {
    it('should validate valid files', () => {
      const files = [
        {
          originalname: 'test.pdf',
          mimetype: 'application/pdf',
          size: 1024 * 1024 // 1MB
        }
      ];

      const result = validateAttachments(files);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject more than 5 files', () => {
      const files = Array(6).fill({
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024 * 1024
      });

      const result = validateAttachments(files);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject files larger than 10MB', () => {
      const files = [
        {
          originalname: 'large.pdf',
          mimetype: 'application/pdf',
          size: 11 * 1024 * 1024 // 11MB
        }
      ];

      const result = validateAttachments(files);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid file types', () => {
      const files = [
        {
          originalname: 'test.exe',
          mimetype: 'application/x-msdownload',
          size: 1024 * 1024
        }
      ];

      const result = validateAttachments(files);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should accept empty files array', () => {
      const result = validateAttachments([]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept null or undefined', () => {
      const result1 = validateAttachments(null);
      expect(result1.valid).toBe(true);

      const result2 = validateAttachments(undefined);
      expect(result2.valid).toBe(true);
    });
  });
});
