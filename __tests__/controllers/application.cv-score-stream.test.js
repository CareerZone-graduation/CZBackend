import request from 'supertest';
import app from '../../src/app.js';
import { server } from '../../src/server.js';
import { User, CandidateProfile, RecruiterProfile, Job, Application } from '../../src/models/index.js';
import jwt from 'jsonwebtoken';
import config from '../../src/config/index.js';

describe('application cv score stream controllers', () => {
  let candidateToken;
  let otherCandidateToken;
  let applicationId;
  let analysisId;

  beforeEach(async () => {
    const recruiterUser = await User.create({
      email: 'stream-recruiter@test.com',
      password: 'password123',
      fullname: 'Recruiter Stream',
      role: 'recruiter',
      isEmailVerified: true,
    });

    const recruiterProfile = await RecruiterProfile.create({
      userId: recruiterUser._id,
      fullname: 'Recruiter Stream',
      company: {
        name: 'Stream Corp',
        location: {
          coordinates: {
            type: 'Point',
            coordinates: [0, 0],
          },
        },
      },
    });

    const job = await Job.create({
      title: 'Backend Engineer',
      description: 'Node.js role',
      requirements: 'Node.js',
      benefits: 'Good',
      location: {
        province: 'HCM',
        district: 'Q1',
        ward: 'Ben Nghe',
        coordinates: {
          type: 'Point',
          coordinates: [0, 0],
        },
      },
      address: '123 Street',
      type: 'FULL_TIME',
      workType: 'ON_SITE',
      deadline: new Date(Date.now() + 86400000),
      experience: 'MID_LEVEL',
      category: 'IT',
      recruiterProfileId: recruiterProfile._id,
      status: 'ACTIVE',
      moderationStatus: 'APPROVED',
    });

    const candidateUser = await User.create({
      email: 'stream-candidate@test.com',
      password: 'password123',
      fullname: 'Candidate Stream',
      role: 'candidate',
      isEmailVerified: true,
    });

    const candidateProfile = await CandidateProfile.create({
      userId: candidateUser._id,
      fullname: 'Candidate Stream',
      cvs: [{ name: 'Uploaded CV', path: 'http://example.com/cv.pdf' }],
    });

    const application = await Application.create({
      jobId: job._id,
      candidateProfileId: candidateProfile._id,
      candidateName: 'Candidate Stream',
      candidateEmail: 'stream-candidate@test.com',
      candidatePhone: '0123456789',
      jobSnapshot: { title: 'Backend Engineer', company: 'Stream Corp', logo: 'https://example.com/logo.png' },
      submittedCV: {
        source: 'UPLOADED',
        name: 'Uploaded CV',
        path: 'http://example.com/cv.pdf',
      },
    });

    applicationId = application._id.toString();
    candidateToken = jwt.sign({ id: candidateUser._id, role: 'candidate' }, config.JWT_SECRET);

    const otherCandidateUser = await User.create({
      email: 'stream-other-candidate@test.com',
      password: 'password123',
      fullname: 'Other Candidate Stream',
      role: 'candidate',
      isEmailVerified: true,
    });

    await CandidateProfile.create({
      userId: otherCandidateUser._id,
      fullname: 'Other Candidate Stream',
      cvs: [{ name: 'Other Uploaded CV', path: 'http://example.com/other-cv.pdf' }],
    });

    otherCandidateToken = jwt.sign({ id: otherCandidateUser._id, role: 'candidate' }, config.JWT_SECRET);

    const initRes = await request(app)
      .post(`/api/applications/${applicationId}/cv-score/analysis`)
      .set('Authorization', `Bearer ${candidateToken}`)
      .send();

    analysisId = initRes.body?.data?.analysisId;
  });

  afterEach(async () => {
    await User.deleteMany({});
    await CandidateProfile.deleteMany({});
    await RecruiterProfile.deleteMany({});
    await Job.deleteMany({});
    await Application.deleteMany({});
  });

  afterAll((done) => {
    server.close(done);
  });

  it('POST /api/applications/:applicationId/cv-score/analysis returns analysisId', async () => {
    const res = await request(app)
      .post(`/api/applications/${applicationId}/cv-score/analysis`)
      .set('Authorization', `Bearer ${candidateToken}`)
      .send();

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.analysisId).toBeTruthy();
  });

  it('GET /api/applications/cv-score/stream/:analysisId returns text/event-stream and contract events', async () => {
    const res = await request(app)
      .get(`/api/applications/cv-score/stream/${analysisId}`)
      .set('Authorization', `Bearer ${candidateToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['cache-control']).toContain('no-cache');
    expect(res.headers['x-accel-buffering']).toBe('no');
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.text).toContain('event: progress_update');

    const dataLine = res.text
      .split('\n')
      .find((line) => line.startsWith('data: {'));

    expect(dataLine).toBeTruthy();
    const payload = JSON.parse(dataLine.replace('data: ', ''));
    expect(payload).toHaveProperty('type');
    expect(payload).toHaveProperty('analysisProgress');
  });

  it('GET /api/applications/cv-score/stream/:analysisId returns auth error for analysis of another user', async () => {
    const res = await request(app)
      .get(`/api/applications/cv-score/stream/${analysisId}`)
      .set('Authorization', `Bearer ${otherCandidateToken}`);

    expect([401, 403]).toContain(res.status);
  });

  it('GET /api/applications/cv-score/stream/:analysisId returns 404 when analysisId does not exist', async () => {
    const missingAnalysisId = '550e8400-e29b-41d4-a716-446655440000';
    const res = await request(app)
      .get(`/api/applications/cv-score/stream/${missingAnalysisId}`)
      .set('Authorization', `Bearer ${candidateToken}`);

    expect(res.status).toBe(404);
  });
});
