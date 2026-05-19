import mongoose from 'mongoose';
import { jest } from '@jest/globals';
import {
  Application,
  CandidateProfile,
  CVScoreCache,
  Job,
} from '../../src/models/index.js';

const extractCVTextMock = jest.fn(() => 'Experienced backend engineer with NodeJS, MongoDB, API design, testing, and deployment experience.');
const extractUploadedCVTextMock = jest.fn(async () => 'Uploaded CV text with NodeJS, MongoDB, API design, testing, and deployment experience.');
const validateCVMock = jest.fn(() => ({ isValid: true, reason: '' }));
const scoreCVWithLLMMock = jest.fn(async () => ({
  overall_score: 82,
  summary: 'Phu hop voi JD',
}));
const getEnhancedAnalysisMock = jest.fn(async () => null);

jest.unstable_mockModule('../../src/services/cvScoring.service.js', () => ({
  extractCVText: extractCVTextMock,
  extractUploadedCVText: extractUploadedCVTextMock,
  validateCV: validateCVMock,
  scoreCVWithLLM: scoreCVWithLLMMock,
}));

jest.unstable_mockModule('../../src/services/cvEnhancedAnalysis.service.js', () => ({
  getEnhancedAnalysis: getEnhancedAnalysisMock,
}));

const { scoreApplicationCV } = await import('../../src/services/application.service.js');

describe('application CV scoring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates the submitted template snapshot and saves the candidate score cache', async () => {
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

    const cache = await CVScoreCache.findOne({
      userId,
      jobId: job._id,
    }).lean();
    expect(cache.scoringResult.overall_score).toBe(82);

    scoreCVWithLLMMock.mockClear();
    const cachedResult = await scoreApplicationCV(application._id.toString(), userId.toString());

    expect(cachedResult.overall_score).toBe(82);
    expect(cachedResult.isCached).toBe(true);
    expect(scoreCVWithLLMMock).not.toHaveBeenCalled();
  });

  it('does not treat application.cvScore as the candidate self-scoring cache', async () => {
    const userId = new mongoose.Types.ObjectId();
    const candidateProfile = await CandidateProfile.create({
      userId,
      fullname: 'Candidate Zero',
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

    const application = await Application.create({
      jobId: job._id,
      candidateProfileId: candidateProfile._id,
      candidateName: 'Candidate Zero',
      candidateEmail: 'candidate.zero@test.com',
      candidatePhone: '0900000001',
      submittedCV: {
        name: 'Backend CV',
        source: 'TEMPLATE',
        templateSnapshot: {
          personalInfo: {
            fullName: 'Candidate Zero',
            email: 'candidate.zero@test.com',
            phone: '0900000001',
          },
          objective: 'Backend engineer',
          experience: [{ title: 'Dev', company: 'X' }],
          skills: ['NodeJS'],
        },
        templateId: 'modern-blue',
      },
      cvScore: {
        overall_score: 0,
        summary: 'Workflow score from recruiter automation',
      },
      jobSnapshot: {
        title: job.title,
        company: 'CareerZone',
        logo: 'https://example.com/logo.png',
      },
    });

    const result = await scoreApplicationCV(application._id.toString(), userId.toString());

    expect(result.overall_score).toBe(82);
    expect(result.isCached).toBe(false);
    expect(result.canReanalyze).toBe(true);
    expect(scoreCVWithLLMMock).toHaveBeenCalledTimes(1);

    const updated = await Application.findById(application._id).lean();
    expect(updated.cvScore.overall_score).toBe(0);

    const cache = await CVScoreCache.findOne({
      userId,
      jobId: job._id,
    }).lean();
    expect(cache.scoringResult.overall_score).toBe(82);
  });

  it('extracts uploaded CV text before scoring', async () => {
    const userId = new mongoose.Types.ObjectId();
    const candidateProfile = await CandidateProfile.create({
      userId,
      fullname: 'Candidate Upload',
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

    const application = await Application.create({
      jobId: job._id,
      candidateProfileId: candidateProfile._id,
      candidateName: 'Candidate Upload',
      candidateEmail: 'candidate.upload@test.com',
      candidatePhone: '0900000002',
      submittedCV: {
        name: 'Backend CV.pdf',
        source: 'UPLOADED',
        path: 'https://example.com/backend-cv.pdf',
      },
      jobSnapshot: {
        title: job.title,
        company: 'CareerZone',
        logo: 'https://example.com/logo.png',
      },
    });

    await scoreApplicationCV(application._id.toString(), userId.toString());

    expect(extractUploadedCVTextMock).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Backend CV.pdf',
      path: 'https://example.com/backend-cv.pdf',
    }));
    expect(validateCVMock).not.toHaveBeenCalled();
    expect(scoreCVWithLLMMock).toHaveBeenCalledWith(expect.objectContaining({
      cvText: expect.stringContaining('Uploaded CV text with NodeJS'),
    }));
  });

  it('bypasses cached score when forceRefresh is true', async () => {
    const userId = new mongoose.Types.ObjectId();
    const candidateProfile = await CandidateProfile.create({
      userId,
      fullname: 'Candidate Refresh',
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
        fullName: 'Candidate Refresh',
        email: 'candidate.refresh@test.com',
        phone: '0900000003',
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
      candidateName: 'Candidate Refresh',
      candidateEmail: 'candidate.refresh@test.com',
      candidatePhone: '0900000003',
      submittedCV: {
        name: 'Backend CV',
        source: 'TEMPLATE',
        templateSnapshot,
        templateId: 'modern-blue',
      },
      cvScore: {
        overall_score: 50,
        summary: 'Old score',
      },
      jobSnapshot: {
        title: job.title,
        company: 'CareerZone',
        logo: 'https://example.com/logo.png',
      },
    });

    const result = await scoreApplicationCV(application._id.toString(), userId.toString(), {
      forceRefresh: true,
    });

    expect(scoreCVWithLLMMock).toHaveBeenCalled();
    expect(result.overall_score).toBe(82);
    expect(result.isCached).toBe(false);

    const updated = await Application.findById(application._id).lean();
    expect(updated.cvScore.overall_score).toBe(50);
  });
});
