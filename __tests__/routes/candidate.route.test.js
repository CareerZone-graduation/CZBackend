import request from 'supertest';
import app from '../../src/app.js';
import { server } from '../../src/server.js';
import { User, CandidateProfile } from '../../src/models/index.js';
import jwt from 'jsonwebtoken';
import config from '../../src/config/index.js';
import mongoose from 'mongoose';
import { Job, SavedJob, RecruiterProfile } from '../../src/models/index.js'; // Import Job and SavedJob models

describe('Candidate Profile Routes API', () => {
  let candidateUser, candidateToken, recruiterUser, recruiterProfile, job;

  beforeEach(async () => {
    // Clear DB
    await User.deleteMany({});
    await CandidateProfile.deleteMany({});
    await RecruiterProfile.deleteMany({});
    await Job.deleteMany({});
    await SavedJob.deleteMany({});

    // Create users
    candidateUser = await User.create({
      email: 'candidate@example.com',
      password: 'password123',
      role: 'candidate',
      isEmailVerified: true,
    });

    recruiterUser = await User.create({
      email: 'recruiter@example.com',
      password: 'password123',
      role: 'recruiter',
      isEmailVerified: true,
    });

    // Create candidate profile
    await CandidateProfile.create({
      userId: candidateUser._id,
      fullname: 'Test Candidate',
      phone: '0987654321',
      bio: 'Initial bio',
      skills: [{ name: 'Node.js' }],
    });

    // Create recruiter profile
    recruiterProfile = await RecruiterProfile.create({
      userId: recruiterUser._id,
      fullname: 'Test Recruiter',
      company: {
        name: 'Test Company',
        email: 'company@example.com',
      },
    });

    // Create a job
    job = await Job.create({
      title: 'Software Engineer',
      description: 'Develop amazing things.',
      recruiterProfileId: recruiterProfile._id,
      locations: ['Hanoi'],
      salary: { min: 1000, max: 2000, unit: 'Tri', negotiable: false },
      category: 'IT',
      experience: 'ENTRY_LEVEL',
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      workType: 'ON_SITE',
      type: 'FULL_TIME',
      address: '123 Test Street',
      'location.ward': 'Test Ward',
      'location.province': 'Test Province',
      benefits: 'Health insurance, free snacks',
      requirements: 'Node.js, React',
    });

    // Tạo token cho ứng viên này
    candidateToken = jwt.sign({ id: candidateUser._id, role: 'candidate' }, config.JWT_SECRET);
  });

  afterEach(async () => {
    // Dọn dẹp DB
    await User.deleteMany({});
    await CandidateProfile.deleteMany({});
    await RecruiterProfile.deleteMany({});
    await Job.deleteMany({});
    await SavedJob.deleteMany({});
  });

  afterAll((done) => {
    server.close(done);
  });

  describe('GET /api/candidate/my-profile', () => {
    it('should fetch the authenticated candidate profile successfully', async () => {
      const res = await request(app)
        .get('/api/candidate/my-profile')
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.userId.toString()).toBe(candidateUser._id.toString());
      expect(res.body.data.fullname).toBe('Test Candidate');
      expect(res.body.data.phone).toBe('0987654321');
      expect(res.body.data.skills[0].name).toBe('Node.js');
    });

    it('should return 401 if not authenticated', async () => {
      const res = await request(app).get('/api/candidate/my-profile');
      expect(res.statusCode).toEqual(401);
    });
  });

  describe('PUT /api/candidate/my-profile', () => {
    const validProfileData = {
      fullname: 'Updated Fullname',
      phone: '0123456789',
      bio: 'This is an updated bio.',
      skills: [{ name: 'React' }, { name: 'TypeScript' }],
      educations: [
        {
          school: 'University of Code',
          major: 'Computer Science',
          degree: 'Bachelor',
          startDate: '2018-09-01',
          endDate: '2022-06-01',
        },
      ],
      experiences: [
        {
          company: 'Tech Corp',
          position: 'Software Engineer',
          startDate: '2022-07-01',
        },
      ],
    };

    it('should update the entire candidate profile with valid data', async () => {
      const res = await request(app)
        .put('/api/candidate/my-profile')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send(validProfileData);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Cập nhật hồ sơ thành công.');
      expect(res.body.data.fullname).toBe(validProfileData.fullname);
      expect(res.body.data.phone).toBe(validProfileData.phone);
      expect(res.body.data.bio).toBe(validProfileData.bio);
      expect(res.body.data.skills.length).toBe(2);
      expect(res.body.data.skills[0].name).toBe('React');
      expect(res.body.data.educations[0].school).toBe('University of Code');
      expect(res.body.data.experiences[0].company).toBe('Tech Corp');

      // Xác thực lại trong DB
      const profileInDb = await CandidateProfile.findOne({ userId: candidateUser._id });
      expect(profileInDb.fullname).toBe(validProfileData.fullname);
      expect(profileInDb.phone).toBe(validProfileData.phone);
      expect(profileInDb.skills.length).toBe(2);
    });

    it('should return 401 if not authenticated', async () => {
      const res = await request(app)
        .put('/api/candidate/my-profile')
        .send(validProfileData);
      expect(res.statusCode).toEqual(401);
    });

    it('should return 400 for invalid phone number', async () => {
      const invalidData = { ...validProfileData, phone: 'invalid-phone' };
      const res = await request(app)
        .put('/api/candidate/my-profile')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send(invalidData);

      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors[0].message).toBe('Số điện thoại không hợp lệ');
    });

    it('should return 400 for missing fullname', async () => {
      const invalidData = { ...validProfileData };
      delete invalidData.fullname;

      const res = await request(app)
        .put('/api/candidate/my-profile')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send(invalidData);

      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors[0].message).toContain('Required');
    });

    it('should return 400 for extra fields due to .strict()', async () => {
      const extraFieldData = { ...validProfileData, notAllowedField: 'test' };
      const res = await request(app)
        .put('/api/candidate/my-profile')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send(extraFieldData);

      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors[0].message).toContain('Unrecognized key(s)');
    });
  });

})
