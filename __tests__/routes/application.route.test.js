import request from 'supertest';
import app from '../../src/app.js';
import { server } from '../../src/server.js';
import { User, CandidateProfile, RecruiterProfile, Job, Application, CV } from '../../src/models/index.js';
import jwt from 'jsonwebtoken';
import config from '../../src/config/index.js';
import logger from '../../src/utils/logger.js';

// Jest will automatically use the mock from src/services/__mocks__/upload.service.js
// No explicit jest.mock call is needed when the __mocks__ directory is used.

describe('Application Routes API', () => {
  let candidateUser, candidateToken, recruiterUser, testJob, uploadedCvId, templateCvId;

  beforeEach(async () => {
    // 1. Create Recruiter and Job
    recruiterUser = await User.create({
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

    // 2. Create Candidate and their CVs
    candidateUser = await User.create({
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
        name: 'My Uploaded CV',
        path: 'http://example.com/cv.pdf',
        cloudinaryId: 'dummy_id',
      }],
    });
    uploadedCvId = candidateProfile.cvs[0]._id;

    // Create a template-based CV
    const templateCv = await CV.create({
      userId: candidateUser._id,
      name: 'My Template CV',
      title: 'My Template CV',
      templateId: "template_1",
      personalInfo: { fullname: 'Candidate User', email: 'candidate@test.com', phone: '1122334455', address: 'Some address' },
    });
    templateCvId = templateCv._id;


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
    await CV.deleteMany({});
  });

  afterAll((done) => {
    server.close(done);
  });

  describe('POST /api/jobs/:jobId/apply', () => {
    const baseApplicationData = {
      candidateName: 'Test Candidate',
      candidateEmail: 'candidate@test.com',
      candidatePhone: '0123456789',
      coverLetter: 'I am very interested in this position.',
    };

    it('should apply successfully with an uploaded CV (cvId)', async () => {
      const applicationData = {
        ...baseApplicationData,
        cvId: uploadedCvId.toString(),
      };

      const res = await request(app)
        .post(`/api/jobs/${testJob._id}/apply`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .send(applicationData);
      logger.info(res);

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Nộp đơn ứng tuyển thành công.');

      const appInDb = await Application.findOne({ jobId: testJob._id });
      expect(appInDb).not.toBeNull();
      expect(appInDb.submittedCV.source).toBe('UPLOADED');
    });

    // TODO chức năng nộp CV từ mẫu chưa hỗ trợ
    // it('should apply successfully with a template CV (cvTemplateId)', async () => {
    //   const applicationData = {
    //     ...baseApplicationData,
    //     cvTemplateId: templateCvId.toString(),
    //   };

    //   const res = await request(app)
    //     .post(`/api/jobs/${testJob._id}/apply`)
    //     .set('Authorization', `Bearer ${candidateToken}`)
    //     .send(applicationData);
    //   logger.info(`Template CV ID: ${templateCvId}`);
    //   expect(res.statusCode).toEqual(201);
    //   expect(res.body.success).toBe(true);
    //   expect(res.body.message).toBe('Nộp đơn ứng tuyển thành công.');

    //   const appInDb = await Application.findOne({ jobId: testJob._id });
    //   expect(appInDb).not.toBeNull();
    //   expect(appInDb.submittedCV.source).toBe('TEMPLATE');
    // });

    it('should return 400 if providing both cvId and cvTemplateId', async () => {
      const applicationData = {
        ...baseApplicationData,
        cvId: uploadedCvId.toString(),
        cvTemplateId: templateCvId.toString(),
      };
      const res = await request(app)
        .post(`/api/jobs/${testJob._id}/apply`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .send(applicationData);

      expect(res.statusCode).toEqual(400);
      expect(res.body.errors[0].message).toContain('Bạn phải cung cấp `cvId` (cho CV tải lên) hoặc `cvTemplateId`');
    });

    it('should return 400 if providing neither cvId nor cvTemplateId', async () => {
      const res = await request(app)
        .post(`/api/jobs/${testJob._id}/apply`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .send(baseApplicationData);

      expect(res.statusCode).toEqual(400);
      expect(res.body.errors[0].message).toContain('Bạn phải cung cấp `cvId` (cho CV tải lên) hoặc `cvTemplateId`');
    });

    it('should return 400 if required fields are missing (e.g., candidateName)', async () => {
      const { candidateName, ...incompleteData } = baseApplicationData;
      const applicationData = {
        ...incompleteData,
        cvId: uploadedCvId.toString(),
      };

      const res = await request(app)
        .post(`/api/jobs/${testJob._id}/apply`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .send(applicationData);

      expect(res.statusCode).toEqual(400);
      expect(res.body.errors[0].message).toBe('Họ tên là bắt buộc');
    });

    it('should return 400 if the candidate has already applied', async () => {
      // First application
      await request(app)
        .post(`/api/jobs/${testJob._id}/apply`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({ ...baseApplicationData, cvId: uploadedCvId.toString() });

      // Second attempt
      const res = await request(app)
        .post(`/api/jobs/${testJob._id}/apply`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({ ...baseApplicationData, cvTemplateId: templateCvId.toString() });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toBe('Bạn đã ứng tuyển vào vị trí này rồi.');
    });
  });
});
