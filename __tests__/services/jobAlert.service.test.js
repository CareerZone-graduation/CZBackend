import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { BadRequestError } from '../../src/utils/AppError.js';

// Mock the modules and define their structure
jest.unstable_mockModule('../../src/models/JobAlertSubscription.js', () => ({
  default: {
    countDocuments: jest.fn(),
    create: jest.fn(),
  },
}));

jest.unstable_mockModule('../../src/config/redis.js', () => ({
  default: {
    sAdd: jest.fn(),
    sRem: jest.fn(),
  },
}));

// Dynamically import the modules *after* mocks are defined
const JobAlertSubscription = (await import('../../src/models/JobAlertSubscription.js')).default;
const redisClient = (await import('../../src/config/redis.js')).default;
const jobAlertService = await import('../../src/services/jobAlert.service.js');


describe('Job Alert Service', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createJobAlert', () => {
    it('should create a new subscription and add to Redis', async () => {
      const candidateId = new mongoose.Types.ObjectId().toString();
      const data = {
        keyword: 'nodejs',
        location: { province: 'Hồ Chí Minh' },
        frequency: 'daily',
        salaryRange: 'ALL',
        type: 'ALL',
        workType: 'ALL',
        experience: 'ALL',
        category: 'ALL',
      };
      
      const mockSubscription = { ...data, candidateId, _id: new mongoose.Types.ObjectId() };

      JobAlertSubscription.countDocuments.mockResolvedValue(0);
      JobAlertSubscription.create.mockResolvedValue(mockSubscription);
      redisClient.sAdd.mockResolvedValue(1);

      const result = await jobAlertService.createJobAlert(candidateId, data);

      expect(JobAlertSubscription.countDocuments).toHaveBeenCalledWith({ candidateId, active: true });
      expect(JobAlertSubscription.create).toHaveBeenCalledWith({ ...data, candidateId });
      expect(redisClient.sAdd).toHaveBeenCalledWith('job_alert:keyword:nodejs', candidateId);
      expect(result).toEqual(mockSubscription);
    });

    it('should throw BadRequestError if user already has 3 subscriptions', async () => {
      const candidateId = new mongoose.Types.ObjectId().toString();
      const data = { keyword: 'react' };

      JobAlertSubscription.countDocuments.mockResolvedValue(3);

      await expect(jobAlertService.createJobAlert(candidateId, data))
        .rejects.toThrow(BadRequestError);
      
      await expect(jobAlertService.createJobAlert(candidateId, data))
        .rejects.toThrow('Bạn chỉ có thể tạo tối đa 3 đăng ký.');

      expect(JobAlertSubscription.create).not.toHaveBeenCalled();
      expect(redisClient.sAdd).not.toHaveBeenCalled();
    });
  });
});
