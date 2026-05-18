import mongoose from 'mongoose';
import { jest } from '@jest/globals';
import {
  Application,
  CandidateProfile,
  Job,
} from '../../src/models/index.js';

const extractCVTextMock = jest.fn(() => 'Experienced backend engineer with NodeJS, MongoDB, API design, testing, and deployment experience.');
const validateCVMock = jest.fn(() => ({ isValid: true, reason: '' }));
const scoreCVWithLLMMock = jest.fn(async () => ({
  overall_score: 82,
  summary: 'Phu hop voi JD',
}));
const getEnhancedAnalysisMock = jest.fn(async () => null);

jest.unstable_mockModule('../../src/services/cvScoring.service.js', () => ({
  extractCVText: extractCVTextMock,
  validateCV: validateCVMock,
  scoreCVWithLLM: scoreCVWithLLMMock,
}));

jest.unstable_mockModule('../../src/services/cvEnhancedAnalysis.service.js', () => ({
  getEnhancedAnalysis: getEnhancedAnalysisMock,
}));

const { scoreApplicationCV } = await import('../../src/services/application.service.js');

describe('application CV scoring', () => {
  it('validates the submitted template snapshot and saves the score', async () => {
    const userId = new mongoose.Types.ObjectId();
    const candidateProfile = await CandidateProfile.create({
      userId,
      fullname: 'Candidate Test',
    });

    const job = await Job.create({
      title: 'Backend Engineer',
      description: 'Build APIs',
      requirements: 'NodeJS, MongoDB',
      benefits: 'Good salary',
      location: {
        province: 'Thanh pho Ho Chi Minh',
        district: 'Quan 1',
        commune: 'Phuong Tan Dinh',
        coordinates: { type: 'Point', coordinates: [106.68, 10.79] },
      },
      address: '1 Test Street',
      type: 'FULL_TIME',
      workType: 'REMOTE',
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      experience: 'MID_LEVEL',
      category: 'IT',
      skills: ['NodeJS'],
      recruiterProfileId: new mongoose.Types.ObjectId(),
      status: 'ACTIVE',
      moderationStatus: 'APPROVED',
    });

    const templateSnapshot = {
      personalInfo: {
        fullName: 'Candidate Test',
        email: 'candidate@test.com',
        phone: '0900000000',
      },
      objective: 'Build reliable backend systems.',
      experience: [
        {
          title: 'Backend Developer',
          company: 'CareerZone',
          startDate: '2023',
          description: 'Built NodeJS APIs and MongoDB services.',
        },
      ],
      skills: ['NodeJS', 'MongoDB'],
    };

    const application = await Application.create({
      jobId: job._id,
      candidateProfileId: candidateProfile._id,
      candidateName: 'Candidate Test',
      candidateEmail: 'candidate@test.com',
      candidatePhone: '0900000000',
      submittedCV: {
        name: 'Backend CV',
        source: 'TEMPLATE',
        templateSnapshot,
        templateId: 'modern-blue',
      },
      jobSnapshot: {
        title: job.title,
        company: 'CareerZone',
        logo: 'https://example.com/logo.png',
      },
    });

    const result = await scoreApplicationCV(application._id.toString(), userId.toString());

    expect(validateCVMock).toHaveBeenCalledWith(templateSnapshot);
    expect(scoreCVWithLLMMock).toHaveBeenCalledWith(expect.objectContaining({
      jdText: expect.stringContaining('Backend Engineer'),
      jobType: 'technical',
    }));
    expect(result.overall_score).toBe(82);

    const updated = await Application.findById(application._id).lean();
    expect(updated.cvScore.overall_score).toBe(82);
  });
});
