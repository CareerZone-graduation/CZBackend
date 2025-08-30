import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/app.js';
import { server } from '../../src/server.js';
import { User, Job, RecruiterProfile, CandidateProfile, Application } from '../../src/models/index.js';

describe('Admin Routes API', () => {
  let adminToken;
  let recruiterToken;
  let candidateToken;
  let adminUser;
  let recruiterUser;
  let candidateUser;
  let recruiterProfile;
  let candidateProfile;
  let job;

  // Close the server after all tests are done
  afterAll((done) => {
    server.close(done);
  });

  // Setup test data
  beforeEach(async () => {
    // Clean collections
    await User.deleteMany({});
    await Job.deleteMany({});
    await RecruiterProfile.deleteMany({});
    await CandidateProfile.deleteMany({});
    await Application.deleteMany({});

    // Create admin user
    adminUser = await User.create({
      email: 'admin@example.com',
      password: 'password123',
      fullname: 'Admin User',
      role: 'admin',
      isEmailVerified: true
    });

    // Create recruiter user
    recruiterUser = await User.create({
      email: 'recruiter@example.com',
      password: 'password123',
      fullname: 'Recruiter User',
      role: 'recruiter',
      isEmailVerified: true
    });

    // Create candidate user
    candidateUser = await User.create({
      email: 'candidate@example.com',
      password: 'password123',
      fullname: 'Candidate User',
      role: 'candidate',
      isEmailVerified: true
    });

    // Create recruiter profile
    recruiterProfile = await RecruiterProfile.create({
      userId: recruiterUser._id,
      fullname: 'Recruiter User',
      company: {
        name: 'Test Company',
        industry: 'Công nghệ thông tin',
        size: '100-500',
        website: 'https://testcompany.com',
        about: 'A test company'
      }
    });

    // Create candidate profile
    candidateProfile = await CandidateProfile.create({
      userId: candidateUser._id,
      fullname: 'Candidate User',
      phone: '0987654321',
      bio: 'A test candidate profile'
    });

    // Create test job
    job = await Job.create({
      title: 'Software Engineer',
      description: 'A test job description',
      requirements: 'Test requirements',
      benefits: 'Test benefits for employees',
      location: {
        province: 'Ho Chi Minh City',
        ward: 'District 1'
      },
      address: '123 Test Street, District 1, Ho Chi Minh City',
      type: 'FULL_TIME',
      workType: 'ON_SITE',
      minSalary: 1000,
      maxSalary: 2000,
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      experience: 'MID_LEVEL',
      category: 'IT',
      area: 'HO_CHI_MINH',
      status: 'ACTIVE',
      approved: false,
      recruiterProfileId: recruiterProfile._id
    });

    // Generate tokens
    adminToken = jwt.sign(
      { id: adminUser._id, role: adminUser.role },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    recruiterToken = jwt.sign(
      { id: recruiterUser._id, role: recruiterUser.role },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    candidateToken = jwt.sign(
      { id: candidateUser._id, role: candidateUser.role },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  describe('Authentication & Authorization', () => {
    it('should deny access without token', async () => {
      const res = await request(app)
        .get('/api/admin/jobs');

      expect(res.statusCode).toEqual(401);
    });

    it('should deny access with non-admin token', async () => {
      const res = await request(app)
        .get('/api/admin/jobs')
        .set('Authorization', `Bearer ${recruiterToken}`);

      expect(res.statusCode).toEqual(403);
    });

    it('should allow access with admin token', async () => {
      const res = await request(app)
        .get('/api/admin/jobs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
    });
  });

  describe('GET /api/admin/jobs', () => {
    it('should get all jobs for admin', async () => {
      const res = await request(app)
        .get('/api/admin/jobs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Lấy danh sách tin tuyển dụng thành công.');
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta).toBeDefined();
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].title).toBe('Software Engineer');
    });

    it('should filter jobs by search query', async () => {
      const res = await request(app)
        .get('/api/admin/jobs?search=Software')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].title).toContain('Software');
    });

    it('should filter jobs by company name', async () => {
      const res = await request(app)
        .get('/api/admin/jobs?company=Test Company')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toBe(1);
    });

    it('should filter jobs by status', async () => {
      const res = await request(app)
        .get('/api/admin/jobs?status=pending')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toBe(1); // Our job is not approved yet
    });

    it('should paginate results', async () => {
      const res = await request(app)
        .get('/api/admin/jobs?page=1&limit=5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.meta.currentPage).toBe(1);
      expect(res.body.meta.totalItems).toBe(1);
    });
  });

  describe('GET /api/admin/jobs/:id', () => {
    it('should get job detail by id', async () => {
      const res = await request(app)
        .get(`/api/admin/jobs/${job._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Lấy chi tiết tin tuyển dụng thành công.');
      expect(res.body.data.title).toBe('Software Engineer');
    });

    it('should return 404 for non-existent job', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .get(`/api/admin/jobs/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(404);
    });

    it('should return 400 for invalid job id', async () => {
      const res = await request(app)
        .get('/api/admin/jobs/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(400);
    });
  });

  describe('PATCH /api/admin/jobs/:id/approve', () => {
    it('should approve a pending job', async () => {
      const res = await request(app)
        .patch(`/api/admin/jobs/${job._id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Phê duyệt tin tuyển dụng thành công.');
      expect(res.body.data.approved).toBe(true);

      // Verify in database
      const updatedJob = await Job.findById(job._id);
      expect(updatedJob.approved).toBe(true);
    });

    it('should return 404 for non-existent job', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .patch(`/api/admin/jobs/${fakeId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(404);
    });
  });

  describe('PATCH /api/admin/jobs/:id/reject', () => {
    it('should reject a pending job', async () => {
      const res = await request(app)
        .patch(`/api/admin/jobs/${job._id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Từ chối tin tuyển dụng thành công.');
      expect(res.body.data.approved).toBe(false);

      // Verify in database
      const updatedJob = await Job.findById(job._id);
      expect(updatedJob.approved).toBe(false);
    });
  });

  describe('GET /api/admin/users', () => {
    it('should get all users for admin', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Lấy danh sách người dùng thành công.');
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBe(3); // admin, recruiter, candidate
    });

    it('should filter users by search query', async () => {
      const res = await request(app)
        .get('/api/admin/users?search=recruiter')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toBe(1);
    });

    it('should filter users by role', async () => {
      const res = await request(app)
        .get('/api/admin/users?role=candidate')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].role).toBe('candidate');
    });

    it('should filter users by status', async () => {
      // First ban a user
      await User.findByIdAndUpdate(candidateUser._id, { active: false });

      const res = await request(app)
        .get('/api/admin/users?status=banned')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].active).toBe(false);
    });
  });

  describe('PATCH /api/admin/users/:id/status', () => {
    it('should update user status to banned', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${candidateUser._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'banned' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Cập nhật trạng thái người dùng thành công.');
      expect(res.body.data.active).toBe(false);

      // Verify in database
      const updatedUser = await User.findById(candidateUser._id);
      expect(updatedUser.active).toBe(false);
    });

    it('should update user status to active', async () => {
      // First ban the user
      await User.findByIdAndUpdate(candidateUser._id, { active: false });

      const res = await request(app)
        .patch(`/api/admin/users/${candidateUser._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'active' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.active).toBe(true);
    });

    it('should return 400 for invalid status', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${candidateUser._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'invalid-status' });

      expect(res.statusCode).toEqual(400);
    });
  });

  describe('GET /api/admin/companies', () => {
    it('should get all companies for admin', async () => {
      const res = await request(app)
        .get('/api/admin/companies')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Lấy danh sách công ty thành công.');
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].company.name).toBe('Test Company');
    });

    it('should filter companies by search query', async () => {
      const res = await request(app)
        .get('/api/admin/companies?search=Test')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].company.name).toContain('Test');
    });

    it('should filter companies by verified status', async () => {
      const res = await request(app)
        .get('/api/admin/companies?verified=false')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].company.verified).toBe(false);
    });
  });

  describe('GET /api/admin/companies/:id', () => {
    it('should get company detail by id', async () => {
      const res = await request(app)
        .get(`/api/admin/companies/${recruiterProfile._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Lấy chi tiết hồ sơ nhà tuyển dụng thành công.');
      expect(res.body.data.company.name).toBe('Test Company');
    });

    it('should return 404 for non-existent company', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .get(`/api/admin/companies/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(404);
    });
  });

  describe('PATCH /api/admin/companies/:id/approve', () => {
    it('should approve a company', async () => {
      const res = await request(app)
        .patch(`/api/admin/companies/${recruiterProfile._id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Phê duyệt công ty thành công.');
      expect(res.body.data.company.verified).toBe(true);

      // Verify in database
      const updatedProfile = await RecruiterProfile.findById(recruiterProfile._id);
      expect(updatedProfile.company.verified).toBe(true);
    });
  });

  describe('PATCH /api/admin/companies/:id/reject', () => {
    it('should reject a company', async () => {
      const res = await request(app)
        .patch(`/api/admin/companies/${recruiterProfile._id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Từ chối công ty thành công.');
      expect(res.body.data.company.verified).toBe(false);
    });
  });

  describe('GET /api/admin/stats', () => {
    beforeEach(async () => {
      // Create some applications for stats
      await Application.create({
        candidateProfileId: candidateProfile._id,
        jobId: job._id,
        candidateName: 'Test Candidate',
        candidateEmail: 'test@candidate.com',
        candidatePhone: '0123456789',
        status: 'PENDING',
        submittedCV: {
          name: 'Test CV',
          path: '/path/to/cv.pdf',
          source: 'UPLOADED'
        },
        jobSnapshot: {
          title: 'Software Engineer',
          company: 'Test Company',
          logo: 'https://example.com/logo.png'
        }
      });
    });

    it('should get admin statistics', async () => {
      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Lấy thống kê hệ thống thành công.');
      expect(res.body.data).toHaveProperty('overview');
      expect(res.body.data.overview).toHaveProperty('totalUsers');
      expect(res.body.data.overview).toHaveProperty('totalJobs');
      expect(res.body.data.overview).toHaveProperty('totalApplications');
      expect(res.body.data.overview.totalUsers).toBe(3);
      expect(res.body.data.overview.totalJobs).toBe(1);
      expect(res.body.data.overview.totalApplications).toBe(1);
      expect(res.body.data).toHaveProperty('jobs');
      expect(res.body.data).toHaveProperty('users');
      expect(res.body.data).toHaveProperty('companies');
    });
  });
});
