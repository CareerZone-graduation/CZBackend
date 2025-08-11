import request from 'supertest';
import app from '../../src/app.js'; // Import Express app
import { server } from '../../src/server.js'; // Import server for closing
import { User, RecruiterProfile, Job } from '../../src/models/index.js';
import jwt from 'jsonwebtoken';
import config from '../../src/config/index.js';

describe('Job Routes API', () => {
  let recruiterUser, recruiterProfile, token, testJob;

  // Close the server after all tests are done
  afterAll((done) => {
    server.close(done);
  });

  // Setup dữ liệu mẫu trước mỗi test
  beforeEach(async () => {
    // 1. Tạo một recruiter user và profile
    recruiterUser = await User.create({
      username: 'recruiter_test',
      email: 'recruiter@test.com',
      password: 'password123',
      role: 'recruiter',
      isEmailVerified: true,
    });
    recruiterProfile = await RecruiterProfile.create({
      userId: recruiterUser._id,
      fullname: 'Test Recruiter',
      company: { name: 'Test Corp' },
    });

    // 2. Tạo JWT token cho recruiter
    token = jwt.sign({ id: recruiterUser._id, role: 'recruiter' }, config.JWT_SECRET);

    // 3. Tạo một job mẫu
    testJob = await Job.create({
      title: 'Senior NodeJS Developer',
      description: 'A great job opportunity.',
      requirements: 'NodeJS, MongoDB',
      benefits: 'Good salary',
      location: { province: 'Hồ Chí Minh', ward: 'Tân Định' },
      address: '123 Test Street',
      type: 'FULL_TIME',
      workType: 'ON_SITE',
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day from now
      experience: 'SENIOR_LEVEL',
      category: 'IT',
      recruiterProfileId: recruiterProfile._id,
      status: 'ACTIVE',
      approved: true, // Make the job visible in public listings
    });
  });

  // Test Case 1: Tạo một job mới (Endpoint được bảo vệ)
  describe('POST /api/jobs', () => {
    it('should create a new job when authenticated as a recruiter', async () => {
      const newJobData = {
        title: 'Frontend Developer',
        description: 'A fantastic opportunity for a skilled Frontend Developer.',
        requirements: '3 years experience',
        benefits: 'Free lunch',
        location: { province: 'Hà Nội', ward: 'Ba Đình' },
        address: '456 Capital Road',
        type: 'FULL_TIME',
        workType: 'REMOTE',
        deadline: '2025-12-31T17:00:00.000Z',
        experience: 'MID_LEVEL',
        category: 'SOFTWARE_DEVELOPMENT',
      };

      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send(newJobData);

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Frontend Developer');

      // Kiểm tra job đã được tạo trong DB chưa
      const jobInDb = await Job.findById(res.body.data._id);
      expect(jobInDb).not.toBeNull();
      expect(jobInDb.title).toBe('Frontend Developer');
    });

    it('should return 401 if not authenticated', async () => {
      const res = await request(app).post('/api/jobs').send({});
      expect(res.statusCode).toEqual(401);
    });
  });

  // Test Case 2: Lấy chi tiết một job (Endpoint công khai)
  describe('GET /api/jobs/:id', () => {
    it('should return job details for a valid job ID', async () => {
      const res = await request(app).get(`/api/jobs/${testJob._id}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(testJob._id.toString());
      expect(res.body.data.title).toBe('Senior NodeJS Developer');
      expect(res.body.data.company.name).toBe('Test Corp');
    });

    it('should return 404 for a non-existent job ID', async () => {
      const nonExistentId = '605fe2a21c9d440000a1b2c3';
      const res = await request(app).get(`/api/jobs/${nonExistentId}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toContain('Không tìm thấy tin tuyển dụng');
    }, 30000); // Increase timeout to 30 seconds for this specific test
  });

  describe('PUT /api/jobs/:id', () => {
    it('should update a job successfully when authenticated as the owner', async () => {
      const updateData = {
        title: 'Updated Senior NodeJS Developer',
        benefits: 'Amazing salary and free snacks',
      };

      const res = await request(app)
        .put(`/api/jobs/${testJob._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updateData);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Updated Senior NodeJS Developer');
      expect(res.body.data.benefits).toBe('Amazing salary and free snacks');
    });

    it('should return 403 if trying to update a job not owned by the recruiter', async () => {
      // Create another recruiter and their job
      const anotherRecruiter = await User.create({ username: 'anotherrecruiter', fullname: 'Another Recruiter', email: 'another@test.com', password: 'password123', role: 'recruiter', isEmailVerified: true });
      const anotherProfile = await RecruiterProfile.create({ userId: anotherRecruiter._id, fullname: 'Another Recruiter', company: { name: 'Another Corp' } });
      const anotherJob = await Job.create({
        title: 'Another Job',
        description: 'Another job description.',
        requirements: 'Some skills',
        benefits: 'Some benefits',
        location: { province: 'Hà Nội', ward: 'Ba Đình' },
        address: 'Some Address',
        type: 'FULL_TIME',
        workType: 'ON_SITE',
        deadline: new Date(),
        experience: 'MID_LEVEL',
        category: 'IT',
        recruiterProfileId: anotherProfile._id,
      });
      
      const updateData = { title: 'Malicious Update' };

      const res = await request(app)
        .put(`/api/jobs/${anotherJob._id}`)
        .set('Authorization', `Bearer ${token}`) // Using the original recruiter's token
        .send(updateData);

      expect(res.statusCode).toEqual(403);
    });
  });

  describe('DELETE /api/jobs/:id', () => {
    it('should delete a job successfully when authenticated as the owner', async () => {
      const res = await request(app)
        .delete(`/api/jobs/${testJob._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Xóa (soft-delete) công việc thành công.');

      const jobInDb = await Job.findById(testJob._id);
      expect(jobInDb.status).toBe('INACTIVE');
    });
  });

  describe('GET /api/jobs', () => {
    it('should return a list of jobs with pagination', async () => {
      const res = await request(app).get('/api/jobs?page=1&limit=10');

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.meta).toHaveProperty('totalItems');
      expect(res.body.meta).toHaveProperty('currentPage');
    });
  });
});
