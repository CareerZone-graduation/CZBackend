import request from 'supertest';
import app from '../../src/app.js';
import { server } from '../../src/server.js';
import { User, CandidateProfile, RecruiterProfile, Job, Application, CV, InterviewRoom } from '../../src/models/index.js';
import jwt from 'jsonwebtoken';
import config from '../../src/config/index.js';
import logger from '../../src/utils/logger.js';

// Jest will automatically use the mock from src/services/__mocks__/upload.service.js
// No explicit jest.mock call is needed when the __mocks__ directory is used.

describe('Application Routes API', () => {
  let candidateUser, candidateToken, recruiterUser, recruiterToken, testJob, uploadedCvId, templateCvId, candidateProfile;

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
      company: {
        name: 'Test Corp',
        location: {
          coordinates: {
            type: 'Point',
            coordinates: [0, 0],
          },
        },
      },
    });
    testJob = await Job.create({
      title: 'Software Engineer',
      description: 'A great job.',
      requirements: 'Node.js',
      benefits: 'Good pay',
      location: {
        province: 'Hồ Chí Minh',
        district: 'Quận 1',
        ward: 'Tân Định',
        coordinates: {
          type: 'Point',
          coordinates: [0, 0],
        },
      },
      address: '123 Test St',
      type: 'FULL_TIME',
      workType: 'ON_SITE',
      deadline: new Date(Date.now() + 1000 * 60 * 60 * 24),
      experience: 'MID_LEVEL',
      category: 'IT',
      recruiterProfileId: recruiterProfile._id,
      status: 'ACTIVE',
      moderationStatus: 'APPROVED',
    });
    recruiterToken = jwt.sign({ id: recruiterUser._id, role: 'recruiter' }, config.JWT_SECRET);

    // 2. Create Candidate and their CVs
    candidateUser = await User.create({
      email: 'candidate@test.com',
      password: 'password123',
      fullname: 'Candidate User',
      role: 'candidate',
      isEmailVerified: true,
    });
    candidateProfile = await CandidateProfile.create({
      userId: candidateUser._id,
      fullname: 'Candidate User',
      cvs: [{
        name: 'My Uploaded CV',
        path: 'http://example.com/cv.pdf',
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

  describe('GET /api/applications/:applicationId', () => {
    it('returns sorted interviewHistory and latestInterviewInfo for recruiter application detail', async () => {
      const application = await Application.create({
        jobId: testJob._id,
        candidateProfileId: candidateProfile._id,
        candidateName: 'Test Candidate',
        candidateEmail: 'candidate@test.com',
        candidatePhone: '0123456789',
        jobSnapshot: { title: 'Software Engineer', company: 'Test Corp', logo: 'https://example.com/logo.png' },
      });

      await InterviewRoom.create([
        {
          roomName: 'Round 2',
          recruiterId: recruiterUser._id,
          candidateId: candidateUser._id,
          applicationId: application._id,
          scheduledTime: new Date(Date.now() + 7200000),
          sequence: 2,
          status: 'SCHEDULED',
        },
        {
          roomName: 'Round 1',
          recruiterId: recruiterUser._id,
          candidateId: candidateUser._id,
          applicationId: application._id,
          scheduledTime: new Date(Date.now() + 3600000),
          sequence: 1,
          status: 'COMPLETED',
          result: 'PASSED',
        },
      ]);

      const res = await request(app)
        .get(`/api/applications/${application._id}`)
        .set('Authorization', `Bearer ${recruiterToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.hasInterview).toBe(true);
      expect(res.body.data.interviewHistory).toHaveLength(2);
      expect(res.body.data.interviewHistory[0].sequence).toBe(1);
      expect(res.body.data.interviewHistory[1].sequence).toBe(2);
      expect(res.body.data.latestInterviewInfo.sequence).toBe(2);
    });
  });

  describe('GET /api/interviews/applications/:applicationId/interviews', () => {
    it('returns interview history sorted ascending for recruiter-owned application', async () => {
      const application = await Application.create({
        jobId: testJob._id,
        candidateProfileId: candidateProfile._id,
        candidateName: 'Test Candidate',
        candidateEmail: 'candidate@test.com',
        candidatePhone: '0123456789',
        jobSnapshot: { title: 'Software Engineer', company: 'Test Corp', logo: 'https://example.com/logo.png' },
      });

      await InterviewRoom.create([
        {
          roomName: 'Round 2',
          recruiterId: recruiterUser._id,
          candidateId: candidateUser._id,
          applicationId: application._id,
          scheduledTime: new Date(Date.now() + 7200000),
          sequence: 2,
          status: 'SCHEDULED',
        },
        {
          roomName: 'Round 1',
          recruiterId: recruiterUser._id,
          candidateId: candidateUser._id,
          applicationId: application._id,
          scheduledTime: new Date(Date.now() + 3600000),
          sequence: 1,
          status: 'COMPLETED',
          result: 'PASSED',
        },
      ]);

      const res = await request(app)
        .get(`/api/interviews/applications/${application._id}/interviews`)
        .set('Authorization', `Bearer ${recruiterToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].sequence).toBe(1);
      expect(res.body.data[1].sequence).toBe(2);
    });

    it('denies candidate access to another candidate application interview history', async () => {
      const otherCandidateUser = await User.create({
        email: 'other-candidate@test.com',
        password: 'password123',
        fullname: 'Other Candidate',
        role: 'candidate',
        isEmailVerified: true,
      });
      const otherCandidateProfile = await CandidateProfile.create({
        userId: otherCandidateUser._id,
        fullname: 'Other Candidate',
      });
      const otherCandidateToken = jwt.sign({ id: otherCandidateUser._id, role: 'candidate' }, config.JWT_SECRET);
      const application = await Application.create({
        jobId: testJob._id,
        candidateProfileId: candidateProfile._id,
        candidateName: 'Test Candidate',
        candidateEmail: 'candidate@test.com',
        candidatePhone: '0123456789',
        jobSnapshot: { title: 'Software Engineer', company: 'Test Corp', logo: 'https://example.com/logo.png' },
      });

      await InterviewRoom.create({
        roomName: 'Round 1',
        recruiterId: recruiterUser._id,
        candidateId: candidateUser._id,
        applicationId: application._id,
        scheduledTime: new Date(Date.now() + 3600000),
        sequence: 1,
        status: 'SCHEDULED',
      });

      const res = await request(app)
        .get(`/api/interviews/applications/${application._id}/interviews`)
        .set('Authorization', `Bearer ${otherCandidateToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });
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
