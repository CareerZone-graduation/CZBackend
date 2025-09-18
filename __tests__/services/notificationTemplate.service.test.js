import notificationTemplateService from '../../src/services/notificationTemplate.service.js';

describe('NotificationTemplateService', () => {
  const mockJobs = [
    {
      _id: '507f1f77bcf86cd799439013',
      title: 'Senior JavaScript Developer',
      minSalary: '20000000',
      maxSalary: '30000000',
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      location: {
        district: 'Quận 1',
        province: 'TP.HCM'
      },
      type: 'FULL_TIME',
      workType: 'HYBRID',
      experience: 'MID_LEVEL',
      description: 'We are looking for a skilled JavaScript developer...',
      recruiterProfile: {
        companyName: 'Tech Company Ltd'
      }
    }
  ];

  describe('generateSubject', () => {
    it('should generate correct subject for single job', () => {
      const subject = notificationTemplateService.generateSubject(
        [mockJobs[0]], 
        'javascript developer', 
        'daily'
      );
      expect(subject).toBe('1 việc làm mới cho "javascript developer" hôm nay');
    });

    it('should generate correct subject for multiple jobs', () => {
      const subject = notificationTemplateService.generateSubject(
        [mockJobs[0], mockJobs[0]], 
        'javascript developer', 
        'weekly'
      );
      expect(subject).toBe('2 việc làm mới cho "javascript developer" tuần này');
    });

    it('should generate correct subject for no jobs', () => {
      const subject = notificationTemplateService.generateSubject(
        [], 
        'javascript developer', 
        'daily'
      );
      expect(subject).toBe('Không có việc làm mới cho "javascript developer" hôm nay');
    });
  });



  describe('generateEmailTemplate', () => {
    it('should throw error for missing required data', async () => {
      await expect(
        notificationTemplateService.generateEmailTemplate('DAILY', {})
      ).rejects.toThrow('Missing required template data');
    });
  });

  describe('_formatSalary', () => {
    it('should format salary range correctly', () => {
      const service = notificationTemplateService;
      
      // Test range
      expect(service._formatSalary('20000000', '30000000')).toBe('20.0M - 30.0M VNĐ');
      
      // Test minimum only
      expect(service._formatSalary('15000000', null)).toBe('Từ 15.0M VNĐ');
      
      // Test maximum only
      expect(service._formatSalary(null, '25000000')).toBe('Lên đến 25.0M VNĐ');
      
      // Test no salary
      expect(service._formatSalary(null, null)).toBe('Thỏa thuận');
    });
  });

  describe('_formatDeadline', () => {
    it('should format deadline correctly', () => {
      const service = notificationTemplateService;
      const now = new Date();
      
      // Test today
      expect(service._formatDeadline(now)).toBe('Hôm nay');
      
      // Test tomorrow
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      expect(service._formatDeadline(tomorrow)).toBe('Ngày mai');
      
      // Test expired
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      expect(service._formatDeadline(yesterday)).toBe('Đã hết hạn');
      
      // Test null
      expect(service._formatDeadline(null)).toBe('Không xác định');
    });
  });
});