import request from 'supertest';
import app from '../../src/app.js';
import { server } from '../../src/server.js';
import { User, CandidateProfile, RecruiterProfile, Job, Application } from '../../src/models/index.js';
import jwt from 'jsonwebtoken';
import config from '../../src/config/index.js';

// Jest will automatically use the mock from src/services/__mocks__/upload.service.js
// No explicit jest.mock call is needed when the __mocks__ directory is used.

describe('Application Routes API', () => {
  let candidateUser, candidateToken, recruiterUser, testJob, cvId;

  beforeEach(async () => {
    // 1. Create Recruiter and Job
    recruiterUser = await User.create({
      username: 'recruiter',
      email: 'recruiter@test.com',
      password: 'password123',
      fullname: 'Recruiter User',
      role: 'recruiter',
      isEmailVerified: true,
    });
    const recruiterProfile = await RecruiterProfile.create({
      userId: recruiterUser._id,
      fullname: 'Recruiter User',
      company: { name: 'Test Corp' },
    });
    testJob = await Job.create({
      title: 'Software Engineer',
      description: 'A great job.',
      requirements: 'Node.js',
      benefits: 'Good pay',
      location: { province: 'Hồ Chí Minh', ward: 'Tân Định' },
      address: '123 Test St',
      type: 'FULL_TIME',
      workType: 'ON_SITE',
      deadline: new Date(Date.now() + 1000 * 60 * 60 * 24),
      experience: 'MID_LEVEL',
      category: 'IT',
      recruiterProfileId: recruiterProfile._id,
      status: 'ACTIVE',
      approved: true,
    });

    // 2. Create Candidate and their CV
    candidateUser = await User.create({
      username: 'candidate',
      email: 'candidate@test.com',
      password: 'password123',
      fullname: 'Candidate User',
      role: 'candidate',
      isEmailVerified: true,
    });
    const candidateProfile = await CandidateProfile.create({
      userId: candidateUser._id,
      fullname: 'Candidate User',
      cvs: [{
        name: 'My CV',
        path: 'http://example.com/cv.pdf',
        cloudinaryId: 'dummy_id',
      }],
    });
    cvId = candidateProfile.cvs[0]._id;

    // 3. Generate token for the candidate
    candidateToken = jwt.sign({ id: candidateUser._id, role: 'candidate' }, config.JWT_SECRET);
  });

  afterEach(async () => {
    // Clean up all collections
    await User.deleteMany({});
    await CandidateProfile.deleteMany({});
    await RecruiterProfile.deleteMany({});
    await Job.deleteMany({});
    await Application.deleteMany({});
  });

  afterAll((done) => {
    server.close(done);
  });

  describe('POST /api/jobs/:jobId/apply', () => {
    it('should allow a candidate to apply for a job successfully', async () => {
      const applicationData = {
        cvId: cvId.toString(),
        candidateName: 'Test Candidate',
        candidateEmail: 'candidate@test.com',
        candidatePhone: '0123456789',
        coverLetter: 'I am very interested in this position.',
      };

      const res = await request(app)
        .post(`/api/jobs/${testJob._id}/apply`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .send(applicationData);

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Nộp đơn ứng tuyển thành công.');

      const applicationInDb = await Application.findOne({ jobId: testJob._id });
      expect(applicationInDb).not.toBeNull();
      expect(applicationInDb.coverLetter).toBe('I am very interested in this position.');
    });

    it('should return 400 if the candidate has already applied', async () => {
      const candidateProfile = await CandidateProfile.findOne({ userId: candidateUser._id });
      await Application.create({
        jobId: testJob._id,
        candidateProfileId: candidateProfile._id,
        submittedCV: { name: 'cv.pdf', path: 'http://example.com/cv.pdf', source: 'UPLOADED' },
        jobSnapshot: { title: 'Software Engineer', company: 'Test Corp', logo: 'logo.png' }
      });

      const applicationData = {
        cvId: cvId.toString(),
        candidateName: 'Test Candidate',
        candidateEmail: 'candidate@test.com',
        candidatePhone: '0123456789',
      };
      const res = await request(app)
        .post(`/api/jobs/${testJob._id}/apply`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .send(applicationData);

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toBe('Bạn đã ứng tuyển vào vị trí này rồi.');
    });
  });
});
