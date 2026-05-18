import { extractCVText, validateCV } from '../../src/services/cvScoring.service.js';

describe('cvScoring.service', () => {
  it('extracts text from CV document shape (cvData) without object artifacts', () => {
    const cvDocument = {
      cvData: {
        personalInfo: {
          fullName: 'Nguyen Van A',
          email: 'a@test.com',
          phone: '0900000000',
        },
        professionalSummary: 'Backend engineer với 5 năm kinh nghiệm thiết kế API.',
        workExperience: [
          {
            position: 'Senior Backend Engineer',
            company: 'CareerZone',
            startDate: '2021-01',
            endDate: '2025-01',
            description:
              'Thiết kế hệ thống microservices, tối ưu truy vấn MongoDB và triển khai CI/CD cho nhiều sản phẩm nội bộ.',
            achievements: [
              'Giảm 35% latency trung bình cho API',
              'Xây dựng kiến trúc queue cho xử lý nền',
            ],
          },
        ],
        skills: [
          { name: 'Node.js', level: 'Advanced', category: 'Technical' },
          { name: 'MongoDB', level: 'Advanced', category: 'Technical' },
        ],
      },
    };

    const text = extractCVText(cvDocument);

    expect(text).toContain('Nguyen Van A');
    expect(text).toContain('Backend engineer');
    expect(text).toContain('Senior Backend Engineer');
    expect(text).toContain('Node.js (Advanced)');
    expect(text).not.toContain('[object Object]');
  });

  it('validates CV document shape (cvData) as valid when required sections exist', () => {
    const cvDocument = {
      cvData: {
        personalInfo: {
          fullName: 'Nguyen Van A',
          email: 'a@test.com',
          phone: '0900000000',
        },
        professionalSummary:
          'Backend engineer với 5 năm kinh nghiệm trong phát triển hệ thống phân tán và tối ưu hiệu năng.',
        workExperience: [
          {
            position: 'Senior Backend Engineer',
            company: 'CareerZone',
            startDate: '2021-01',
            endDate: '2025-01',
            description:
              'Phát triển API quy mô lớn, triển khai caching nhiều tầng, monitoring, alerting, và xử lý sự cố production.',
            achievements: [
              'Giảm 35% latency trung bình cho API',
              'Nâng tỷ lệ ổn định hệ thống lên 99.95%',
            ],
          },
        ],
        skills: [
          { name: 'Node.js', level: 'Advanced', category: 'Technical' },
          { name: 'MongoDB', level: 'Advanced', category: 'Technical' },
        ],
      },
    };

    const validation = validateCV(cvDocument);

    expect(validation.isValid).toBe(true);
    expect(validation.reason).toBe('');
  });
});
