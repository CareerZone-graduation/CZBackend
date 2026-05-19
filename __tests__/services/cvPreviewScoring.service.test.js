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
const { getLatestAnalysisState } = await import('../../src/services/cvScoreStream.service.js');

const waitForAnalysisState = async (analysisId) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const state = getLatestAnalysisState(analysisId);
    if (state?.status === 'completed' || state?.status === 'error') {
      return state;
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for analysis ${analysisId}`);
};

const getScoreUpdate = (state) => state.events.find(event => event.type === 'score_update');

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
    await waitForAnalysisState(result.analysisId);

    expect(extractCVTextMock).toHaveBeenCalledWith(expect.objectContaining({
      personalInfo: expect.objectContaining({ fullName: 'Candidate Test' }),
    }));
    expect(validateCVMock).toHaveBeenCalledWith(expect.objectContaining({
      personalInfo: expect.objectContaining({ fullName: 'Candidate Test' }),
    }));
    expect(scoreCVWithLLMMock).toHaveBeenCalled();
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
    const firstState = await waitForAnalysisState(firstResult.analysisId);
    const secondResult = await previewCVScore(userId.toString(), job._id.toString(), params);
    const secondState = await waitForAnalysisState(secondResult.analysisId);
    const firstScoreUpdate = getScoreUpdate(firstState);
    const secondScoreUpdate = getScoreUpdate(secondState);

    expect(firstScoreUpdate.isCached).toBe(false);
    expect(secondScoreUpdate.isCached).toBe(true);
    expect(secondScoreUpdate.overall_score).toBe(75);
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
    const firstResult = await previewCVScore(userId.toString(), job._id.toString(), params);
    await waitForAnalysisState(firstResult.analysisId);
    const refreshedResult = await previewCVScore(userId.toString(), job._id.toString(), {
      ...params,
      forceRefresh: true,
    });
    const refreshedState = await waitForAnalysisState(refreshedResult.analysisId);
    const refreshedScoreUpdate = getScoreUpdate(refreshedState);

    expect(refreshedScoreUpdate.isCached).toBe(false);
    expect(scoreCVWithLLMMock).toHaveBeenCalledTimes(2);
  });
});
