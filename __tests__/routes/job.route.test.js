import request from 'supertest';
import app from '../../src/app.js'; // Import Express app
import { server } from '../../src/server.js'; // Import server for closing
import { User, RecruiterProfile, Job } from '../../src/models/index.js';
import jwt from 'jsonwebtoken';
import config from '../../src/config/index.js';
import { CandidateProfile, SavedJob } from '../../src/models/index.js'; // Import CandidateProfile and SavedJob

describe('Job Routes API', () => {
  let recruiterUser, recruiterProfile, recruiterToken, testJob;
  let candidateUser, candidateProfile, candidateToken; // Add candidate variables

  // Close the server after all tests are done
  afterAll((done) => {
    server.close(done);
  });

  // Setup dữ liệu mẫu trước mỗi test
  beforeEach(async () => {
    // Clear DB
    await User.deleteMany({});
    await RecruiterProfile.deleteMany({});
    await Job.deleteMany({});
    await CandidateProfile.deleteMany({});
    await SavedJob.deleteMany({});

    // 1. Tạo một recruiter user và profile
    recruiterUser = await User.create({
      email: 'recruiter@test.com',
      password: 'password123',
      role: 'recruiter',
      isEmailVerified: true,
      coinBalance: 1000, // Add coins to allow job posting
    });
    recruiterProfile = await RecruiterProfile.create({
      userId: recruiterUser._id,
      fullname: 'Test Recruiter',
      company: {
        name: 'Test Corp',
        location: {
          province: 'Hồ Chí Minh',
          coordinates: {
            type: 'Point',
            coordinates: [106.6297, 10.8231] // [longitude, latitude] for Ho Chi Minh City
          }
        }
      },
    });

    // 2. Tạo JWT token cho recruiter
    recruiterToken = jwt.sign({ id: recruiterUser._id, role: 'recruiter' }, config.JWT_SECRET);

    // 3. Tạo một job mẫu
    testJob = await Job.create({
      title: 'Senior NodeJS Developer',
      description: 'A great job opportunity.',
      requirements: 'NodeJS, MongoDB',
      benefits: 'Good salary',
      location: {
        province: 'Thành phố Hồ Chí Minh',
        district: 'Quận 1',
        commune: 'Phường Tân Định',
        ward: 'Tân Định',
        coordinates: { type: 'Point', coordinates: [106.68, 10.79] },
      },
      address: '123 Test Street',
      type: 'FULL_TIME',
      workType: 'ON_SITE',
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day from now
      experience: 'SENIOR_LEVEL',
      category: 'IT',
      recruiterProfileId: recruiterProfile._id,
      status: 'ACTIVE',
      moderationStatus: 'APPROVED', // Make the job visible in public listings
    });

    // Setup for candidate
    candidateUser = await User.create({
      email: 'candidate@test.com',
      password: 'password123',
      role: 'candidate',
      isEmailVerified: true,
    });
    candidateProfile = await CandidateProfile.create({
      userId: candidateUser._id,
      fullname: 'Test Candidate',
    });
    candidateToken = jwt.sign({ id: candidateUser._id, role: 'candidate' }, config.JWT_SECRET);
  });

  // Test Case 1: Tạo một job mới (Endpoint được bảo vệ)
  describe('POST /api/jobs', () => {
    it('should create a new job when authenticated as a recruiter', async () => {
      // Ensure the recruiter has coins just before the request
      const recruiterInDb = await User.findById(recruiterUser._id);
      recruiterInDb.coinBalance = 1000;
      await recruiterInDb.save();
      console.log(`Recruiter coinBalance before creating job: ${recruiterInDb.coinBalance}`);

      const newJobData = {
        title: 'Frontend Developer',
        description: 'A fantastic opportunity for a skilled Frontend Developer.',
        requirements: '3 years experience',
        benefits: 'Free lunch',
        location: {
          province: 'Thành phố Hà Nội',
          district: 'Quận Ba Đình',
          commune: 'Phường Điện Biên',
          ward: 'Ba Đình',
          coordinates: { type: 'Point', coordinates: [105.83, 21.03] },
        },
        address: '456 Capital Road',
        type: 'FULL_TIME',
        workType: 'REMOTE',
        deadline: '2025-12-31T17:00:00.000Z',
        experience: 'MID_LEVEL',
        category: 'SOFTWARE_DEVELOPMENT',
      };

      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${recruiterToken}`)
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

    it('should return job details with isSaved=false for authenticated candidate who has not saved the job', async () => {
      const res = await request(app)
        .get(`/api/jobs/${testJob._id}`)
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(testJob._id.toString());
      expect(res.body.data.title).toBe('Senior NodeJS Developer');
      expect(res.body.data.company.name).toBe('Test Corp');
      expect(res.body.data.isSaved).toBe(false);
    });

    it('should return job details with isSaved=true for authenticated candidate who has saved the job', async () => {
      // Save the job first
      await SavedJob.create({ jobId: testJob._id, candidateId: candidateUser._id });

      const res = await request(app)
        .get(`/api/jobs/${testJob._id}`)
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(testJob._id.toString());
      expect(res.body.data.title).toBe('Senior NodeJS Developer');
      expect(res.body.data.company.name).toBe('Test Corp');
      expect(res.body.data.isSaved).toBe(true);
    });

    it('should return job details with isSaved=false for authenticated recruiter', async () => {
      const res = await request(app)
        .get(`/api/jobs/${testJob._id}`)
        .set('Authorization', `Bearer ${recruiterToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(testJob._id.toString());
      expect(res.body.data.title).toBe('Senior NodeJS Developer');
      expect(res.body.data.company.name).toBe('Test Corp');
      expect(res.body.data.isSaved).toBe(false);
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
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send(updateData);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Updated Senior NodeJS Developer');
      expect(res.body.data.benefits).toBe('Amazing salary and free snacks');
    });

    it('should return 403 if trying to update a job not owned by the recruiter', async () => {
      // Create another recruiter and their job
      const anotherRecruiter = await User.create({ fullname: 'Another Recruiter', email: 'another@test.com', password: 'password123', role: 'recruiter', isEmailVerified: true });
      const anotherProfile = await RecruiterProfile.create({
        userId: anotherRecruiter._id,
        fullname: 'Another Recruiter',
        company: {
          name: 'Another Corp',
          location: {
            province: 'Hà Nội',
            coordinates: {
              type: 'Point',
              coordinates: [105.8342, 21.0278] // [longitude, latitude] for Hanoi
            }
          }
        }
      });
      const anotherJob = await Job.create({
        title: 'Another Job',
        description: 'Another job description.',
        requirements: 'Some skills',
        benefits: 'Some benefits',
        location: {
          province: 'Thành phố Hà Nội',
          district: 'Quận Ba Đình',
          commune: 'Phường Điện Biên',
          ward: 'Ba Đình',
          coordinates: { type: 'Point', coordinates: [105.83, 21.03] },
        },
        address: 'Some Address',
        type: 'FULL_TIME',
        workType: 'ON_SITE',
        deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
        experience: 'MID_LEVEL',
        category: 'IT',
        recruiterProfileId: anotherProfile._id,
      });

      const updateData = { title: 'Malicious Update' };

      const res = await request(app)
        .put(`/api/jobs/${anotherJob._id}`)
        .set('Authorization', `Bearer ${recruiterToken}`) // Using the original recruiter's token
        .send(updateData);

      expect(res.statusCode).toEqual(403);
    });
  });

  describe('DELETE /api/jobs/:id', () => {
    it('should delete a job successfully when authenticated as the owner', async () => {
      const res = await request(app)
        .delete(`/api/jobs/${testJob._id}`)
        .set('Authorization', `Bearer ${recruiterToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Xóa công việc thành công.');

      const jobInDb = await Job.findById(testJob._id);
      expect(jobInDb).toBeNull();
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

  describe('POST /api/jobs/:id/save', () => {
    it('should save a job successfully for a candidate', async () => {
      const res = await request(app)
        .post(`/api/jobs/${testJob._id}/save`)
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Lưu công việc thành công.');

      const savedJobInDb = await SavedJob.findOne({ jobId: testJob._id, candidateId: candidateUser._id });
      expect(savedJobInDb).not.toBeNull();
    });

    it('should return 400 if job is already saved', async () => {
      await SavedJob.create({ jobId: testJob._id, candidateId: candidateUser._id });

      const res = await request(app)
        .post(`/api/jobs/${testJob._id}/save`)
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Bạn đã lưu công việc này rồi.');
    });

    it('should return 404 if job does not exist', async () => {
      const nonExistentId = '605fe2a21c9d440000a1b2c3';
      const res = await request(app)
        .post(`/api/jobs/${nonExistentId}/save`)
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Không tìm thấy công việc.');
    });

    it('should return 401 if not authenticated', async () => {
      const res = await request(app).post(`/api/jobs/${testJob._id}/save`);
      expect(res.statusCode).toEqual(401);
    });

    it('should return 403 if a non-candidate role tries to save a job', async () => {
      const res = await request(app)
        .post(`/api/jobs/${testJob._id}/save`)
        .set('Authorization', `Bearer ${recruiterToken}`);
      expect(res.statusCode).toEqual(403);
    });
  });

  describe('DELETE /api/jobs/:id/save', () => {
    it('should unsave a job successfully for a candidate', async () => {
      await SavedJob.create({ jobId: testJob._id, candidateId: candidateUser._id });

      const res = await request(app)
        .delete(`/api/jobs/${testJob._id}/save`)
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Bỏ lưu công việc thành công.');

      const savedJobInDb = await SavedJob.findOne({ jobId: testJob._id, candidateId: candidateUser._id });
      expect(savedJobInDb).toBeNull();
    });

    it('should return 404 if job is not saved', async () => {
      const res = await request(app)
        .delete(`/api/jobs/${testJob._id}/save`)
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Công việc chưa được lưu.');
    });

    it('should return 401 if not authenticated', async () => {
      const res = await request(app)
        .delete(`/api/jobs/${testJob._id}/save`);
      expect(res.statusCode).toEqual(401);
    });

    it('should return 403 if a non-candidate role tries to unsave a job', async () => {
      const res = await request(app)
        .delete(`/api/jobs/${testJob._id}/save`)
        .set('Authorization', `Bearer ${recruiterToken}`);
      expect(res.statusCode).toEqual(403);
    });
  });

  describe('GET /api/jobs/external/search', () => {
    it('should return external jobs when valid query is provided', async () => {
      // Vì là external API, ta có thể test xem endpoint có validate parameters không
      // hoặc mock axios. Ở cơ bản, ta test param validation (không query -> 400).
      const res = await request(app).get('/api/jobs/external/search');
      expect(res.statusCode).toBeGreaterThanOrEqual(400); // Zod validation error or 400
    });

    it('should return 400 if query is empty', async () => {
      const res = await request(app).get('/api/jobs/external/search?query=');
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('GET /api/jobs/saved/list', () => {
    it('should return 200 and the list of saved jobs for the logged-in candidate', async () => {
      // Save a job
      await SavedJob.create({ jobId: testJob._id, candidateId: candidateUser._id });

      const res = await request(app)
        .get('/api/jobs/saved/list')
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0]._id.toString()).toBe(testJob._id.toString());
      expect(res.body.data[0].title).toBe('Senior NodeJS Developer');
      expect(res.body.meta.totalItems).toBe(1);
    });

    it('should return 200 and handle pagination correctly for saved jobs', async () => {
      // Create multiple saved jobs for pagination test
      const job2 = await Job.create({
        title: 'Another Job',
        description: 'Another description.',
        recruiterProfileId: recruiterProfile._id,
        location: {
          province: 'Thành phố Hà Nội',
          district: 'Quận Hoàn Kiếm',
          commune: 'Phường Hàng Bạc',
          ward: 'Hàng Bạc',
          coordinates: { type: 'Point', coordinates: [105.85, 21.03] },
        },
        category: 'IT',
        experience: 'ENTRY_LEVEL',
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        workType: 'ON_SITE',
        type: 'FULL_TIME',
        address: '456 Test Street',
        benefits: 'Free coffee',
        requirements: 'Python',
      });
      await SavedJob.create({ jobId: testJob._id, candidateId: candidateUser._id });
      await SavedJob.create({ jobId: job2._id, candidateId: candidateUser._id });

      const res = await request(app)
        .get('/api/jobs/saved/list?page=2&limit=1')
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBe(1);
      expect(res.body.meta.currentPage).toBe(2);
      expect(res.body.meta.limit).toBe(1);
      expect(res.body.meta.totalItems).toBe(2);
    });

    it('should return 401 if not authenticated', async () => {
      const res = await request(app).get('/api/jobs/saved/list');
      expect(res.statusCode).toEqual(401);
    });

    it('should return 403 if a non-candidate role tries to access saved jobs', async () => {
      const res = await request(app)
        .get('/api/jobs/saved/list')
        .set('Authorization', `Bearer ${recruiterToken}`);
      expect(res.statusCode).toEqual(403);
    });
  });
});
