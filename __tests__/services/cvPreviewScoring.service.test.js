import mongoose from 'mongoose';
import { jest } from '@jest/globals';
import { Application, CandidateProfile, Job, CV } from '../../src/models/index.js';

const extractCVTextMock = jest.fn(() => 'Extracted CV text');
const extractUploadedCVTextMock = jest.fn(async () => 'Extracted uploaded CV text');
const validateCVMock = jest.fn(() => ({ isValid: true, reason: '' }));
const scoreCVWithLLMMock = jest.fn(async () => ({ overall_score: 75, summary: 'OK' }));

jest.unstable_mockModule('../../src/services/cvScoring.service.js', () => ({
  extractCVText: extractCVTextMock,
  extractUploadedCVText: extractUploadedCVTextMock,
  validateCV: validateCVMock,
  scoreCVWithLLM: scoreCVWithLLMMock,
}));

const { previewCVScore } = await import('../../src/services/cvPreviewScoring.service.js');

describe('cvPreviewScoring.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses cvTemplate.cvData for extraction and validation', async () => {
    const userId = new mongoose.Types.ObjectId();

    await CandidateProfile.create({
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

    const cv = await CV.create({
      userId,
      templateId: 'modern-blue',
      title: 'My CV',
      cvData: {
        personalInfo: {
          fullName: 'Candidate Test',
          email: 'candidate@test.com',
          phone: '0900000000',
        },
        professionalSummary: 'Backend engineer',
        workExperience: [
          {
            position: 'Backend Developer',
            company: 'CareerZone',
            startDate: '2023-01',
            endDate: '',
            isCurrentJob: true,
            description: 'Built NodeJS APIs',
          },
        ],
        skills: [{ name: 'NodeJS', level: 'Advanced', category: 'Technical' }],
      },
    });

    const result = await previewCVScore(userId.toString(), job._id.toString(), {
      cvTemplateId: cv._id.toString(),
    });

    expect(extractCVTextMock).toHaveBeenCalledWith(expect.objectContaining({
      personalInfo: expect.objectContaining({ fullName: 'Candidate Test' }),
    }));
    expect(validateCVMock).toHaveBeenCalledWith(expect.objectContaining({
      personalInfo: expect.objectContaining({ fullName: 'Candidate Test' }),
    }));
    expect(scoreCVWithLLMMock).toHaveBeenCalled();
    expect(result.overall_score).toBe(75);
  });

  it('caches preview score outside Application and reuses it for the same job and CV', async () => {
    const userId = new mongoose.Types.ObjectId();

    await CandidateProfile.create({
      userId,
      fullname: 'Candidate Cache',
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

    const cv = await CV.create({
      userId,
      templateId: 'modern-blue',
      title: 'My CV',
      cvData: {
        personalInfo: {
          fullName: 'Candidate Cache',
          email: 'candidate.cache@test.com',
          phone: '0900000004',
        },
        professionalSummary: 'Backend engineer',
        workExperience: [
          {
            position: 'Backend Developer',
            company: 'CareerZone',
            startDate: '2023-01',
            endDate: '',
            isCurrentJob: true,
            description: 'Built NodeJS APIs',
          },
        ],
        skills: [{ name: 'NodeJS', level: 'Advanced', category: 'Technical' }],
      },
    });

    const params = { cvTemplateId: cv._id.toString() };
    const firstResult = await previewCVScore(userId.toString(), job._id.toString(), params);
    const secondResult = await previewCVScore(userId.toString(), job._id.toString(), params);

    expect(firstResult.isCached).toBe(false);
    expect(secondResult.isCached).toBe(true);
    expect(secondResult.overall_score).toBe(75);
    expect(scoreCVWithLLMMock).toHaveBeenCalledTimes(1);
    expect(await Application.countDocuments({ source: 'CV_SCORING_PREVIEW' })).toBe(0);
  });

  it('bypasses preview cache when forceRefresh is true', async () => {
    const userId = new mongoose.Types.ObjectId();

    await CandidateProfile.create({
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

    const cv = await CV.create({
      userId,
      templateId: 'modern-blue',
      title: 'My CV',
      cvData: {
        personalInfo: {
          fullName: 'Candidate Refresh',
          email: 'candidate.refresh@test.com',
          phone: '0900000005',
        },
        professionalSummary: 'Backend engineer',
        workExperience: [
          {
            position: 'Backend Developer',
            company: 'CareerZone',
            startDate: '2023-01',
            description: 'Built NodeJS APIs',
          },
        ],
        skills: [{ name: 'NodeJS', level: 'Advanced', category: 'Technical' }],
      },
    });

    const params = { cvTemplateId: cv._id.toString() };
    await previewCVScore(userId.toString(), job._id.toString(), params);
    const refreshedResult = await previewCVScore(userId.toString(), job._id.toString(), {
      ...params,
      forceRefresh: true,
    });

    expect(refreshedResult.isCached).toBe(false);
    expect(scoreCVWithLLMMock).toHaveBeenCalledTimes(2);
  });
});
