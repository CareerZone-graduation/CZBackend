import request from 'supertest';
import app from '../../src/app.js';
import { server } from '../../src/server.js';
import { User, RecruiterProfile } from '../../src/models/index.js';
import jwt from 'jsonwebtoken';
import config from '../../src/config/index.js';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';

describe('Company Management Routes', () => {
  let recruiterUser, recruiterToken, recruiterProfile;
  let nonRecruiterUser, nonRecruiterToken;

  // Close the server after all tests are done
  afterAll((done) => {
    server.close(done);
  });

  beforeEach(async () => {
    // Clean up the database
    await User.deleteMany({});
    await RecruiterProfile.deleteMany({});

    // Create a recruiter user
    recruiterUser = await User.create({
      email: 'recruiter@test.com',
      password: 'password123',
      fullname: 'Test Recruiter',
      role: 'recruiter',
      isEmailVerified: true,
    });

    // Create a non-recruiter user (candidate)
    nonRecruiterUser = await User.create({
      email: 'candidate@test.com',
      password: 'password123',
      fullname: 'Test Candidate',
      role: 'candidate',
      isEmailVerified: true,
    });

    // Generate tokens
    recruiterToken = jwt.sign(
      { id: recruiterUser._id, role: recruiterUser.role },
      config.JWT_SECRET
    );
    
    nonRecruiterToken = jwt.sign(
      { id: nonRecruiterUser._id, role: nonRecruiterUser.role },
      config.JWT_SECRET
    );

    // Create recruiter profile without company initially
    recruiterProfile = await RecruiterProfile.create({
      userId: recruiterUser._id,
      fullname: 'Test Recruiter',
    });
  });

  describe('POST /api/companies - Tạo hồ sơ công ty', () => {
    const validCompanyData = {
      name: 'Tech Innovation Corp',
      about: 'Chúng tôi là một công ty công nghệ hàng đầu chuyên phát triển các giải pháp sáng tạo cho doanh nghiệp.',
      industry: 'Công nghệ thông tin',
      taxCode: '0123456789',
      size: '50-100',
      website: 'https://techinnovation.com',
      location: {
        province: 'Hà Nội',
        ward: 'Hà Đông',
      },
      address: '123 Nguyễn Huệ',
      contactInfo: {
        email: 'contact@techinnovation.com',
        phone: '0901234567'
      }
    };

    it('should create company profile successfully with valid data', async () => {
      const res = await request(app)
        .post('/api/companies')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .field('companyData', JSON.stringify(validCompanyData))
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Đăng ký công ty thành công.');
      expect(res.body.data.name).toBe(validCompanyData.name);
      expect(res.body.data.about).toBe(validCompanyData.about);
      expect(res.body.data.industry).toBe(validCompanyData.industry);
      expect(res.body.data.taxCode).toBe(validCompanyData.taxCode);
    });

    it('should create company profile with business registration file upload', async () => {
      // Create a mock image file for testing (since filter only allows images)
      const testFilePath = path.join(process.cwd(), 'test-business-license.jpg');
      fs.writeFileSync(testFilePath, 'mock image content');

      try {
        const res = await request(app)
          .post('/api/companies')
          .set('Authorization', `Bearer ${recruiterToken}`)
          .field('companyData', JSON.stringify(validCompanyData))
          .attach('businessRegistrationFile', testFilePath)
          .expect(201);

        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('businessRegistrationUrl');
      } finally {
        // Clean up test file
        if (fs.existsSync(testFilePath)) {
          fs.unlinkSync(testFilePath);
        }
      }
    });

    it('should return 400 for missing required company name', async () => {
      const invalidData = { ...validCompanyData };
      delete invalidData.name;

      const res = await request(app)
        .post('/api/companies')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .field('companyData', JSON.stringify(invalidData))
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Tên công ty là bắt buộc');
    });

    it('should return 400 for missing required company description', async () => {
      const invalidData = { ...validCompanyData };
      delete invalidData.about;

      const res = await request(app)
        .post('/api/companies')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .field('companyData', JSON.stringify(invalidData))
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Giới thiệu công ty là bắt buộc');
    });

    it('should return 400 for company name too short', async () => {
      const invalidData = { ...validCompanyData, name: 'A' };

      const res = await request(app)
        .post('/api/companies')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .field('companyData', JSON.stringify(invalidData))
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Tên công ty phải có ít nhất 2 ký tự');
    });

    it('should return 400 for company description too short', async () => {
      const invalidData = { ...validCompanyData, about: 'Short desc' };

      const res = await request(app)
        .post('/api/companies')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .field('companyData', JSON.stringify(invalidData))
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Giới thiệu công ty phải có ít nhất 20 ký tự');
    });

    it('should return 400 for invalid website URL', async () => {
      const invalidData = { ...validCompanyData, website: 'invalid-url' };

      const res = await request(app)
        .post('/api/companies')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .field('companyData', JSON.stringify(invalidData))
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('URL trang web không hợp lệ');
    });

    it('should return 400 for invalid industry', async () => {
      const invalidData = { ...validCompanyData, industry: 'Invalid Industry' };

      const res = await request(app)
        .post('/api/companies')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .field('companyData', JSON.stringify(invalidData))
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should return 400 for invalid JSON in companyData', async () => {
      const res = await request(app)
        .post('/api/companies')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .field('companyData', 'invalid json')
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Dữ liệu companyData không phải là JSON hợp lệ');
    });

    it('should return 400 if companyData is missing', async () => {
      const res = await request(app)
        .post('/api/companies')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Trường companyData là bắt buộc');
    });

    it('should return 401 if not authenticated', async () => {
      const res = await request(app)
        .post('/api/companies')
        .field('companyData', JSON.stringify(validCompanyData))
        .expect(401);
    });

    it('should return 403 if user is not a recruiter', async () => {
      const res = await request(app)
        .post('/api/companies')
        .set('Authorization', `Bearer ${nonRecruiterToken}`)
        .field('companyData', JSON.stringify(validCompanyData))
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Access denied. Insufficient permissions.');
    });

    it('should return 400 if recruiter already has a company', async () => {
      // First, create a company
      await request(app)
        .post('/api/companies')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .field('companyData', JSON.stringify(validCompanyData))
        .expect(201);

      // Try to create another company with the same recruiter
      const res = await request(app)
        .post('/api/companies')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .field('companyData', JSON.stringify({
          ...validCompanyData,
          name: 'Another Company'
        }))
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Bạn đã đăng ký thông tin công ty rồi');
    });
  });

  describe('GET /api/companies/my-company - Xem hồ sơ công ty của mình', () => {
    beforeEach(async () => {
      // Create a company for the recruiter
      await RecruiterProfile.findByIdAndUpdate(
        recruiterProfile._id,
        {
          company: {
            name: 'My Test Company',
            about: 'This is a test company description for testing purposes.',
            industry: 'Công nghệ thông tin',
            taxCode: '0123456789',
            size: '10-50',
            website: 'https://mytestcompany.com',
            location: {
              province: 'Thành phố Hà Nội',
              ward: 'Phường Cống Vị'
            },
            address: '456 Test Street',
            contactInfo: {
              email: 'info@mytestcompany.com',
              phone: '0987654321'
            },
            verified: false
          }
        }
      );
    });

    it('should return company profile successfully', async () => {
      const res = await request(app)
        .get('/api/companies/my-company')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Lấy thông tin công ty thành công.');
      expect(res.body.data.name).toBe('My Test Company');
      expect(res.body.data.industry).toBe('Công nghệ thông tin');
      expect(res.body.data.verified).toBe(false);
    });

    it('should return 401 if not authenticated', async () => {
      const res = await request(app)
        .get('/api/companies/my-company')
        .expect(401);
    });

    it('should return 403 if user is not a recruiter', async () => {
      const res = await request(app)
        .get('/api/companies/my-company')
        .set('Authorization', `Bearer ${nonRecruiterToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Access denied. Insufficient permissions.');
    });

    it('should return 404 if recruiter has no company', async () => {
      // Create a new recruiter without company
      const newRecruiter = await User.create({
        email: 'newrecruiter@test.com',
        password: 'password123',
        fullname: 'New Recruiter',
        role: 'recruiter',
        isEmailVerified: true,
      });

      await RecruiterProfile.create({
        userId: newRecruiter._id,
        fullname: 'New Recruiter',
      });

      const newToken = jwt.sign(
        { id: newRecruiter._id, role: newRecruiter.role },
        config.JWT_SECRET
      );

      const res = await request(app)
        .get('/api/companies/my-company')
        .set('Authorization', `Bearer ${newToken}`)
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Nhà tuyển dụng này chưa cập nhật thông tin công ty');
    });
  });

  describe('PATCH /api/companies/my-company - Cập nhật hồ sơ công ty', () => {
    const updateData = {
      name: 'Updated Company Name',
      about: 'This is an updated company description with more details about our services and vision.',
      industry: 'Tài chính',
      size: '100-200',
      website: 'https://updatedcompany.com',
      location: {
        province: 'Hà Nội',
        ward: 'Hà Đông'
      },
      address: '789 Updated Street',
      contactInfo: {
        email: 'contact@updatedcompany.com',
        phone: '0912345678'
      }
    };

    beforeEach(async () => {
      // Create a company for the recruiter
      await RecruiterProfile.findByIdAndUpdate(
        recruiterProfile._id,
        {
          company: {
            name: 'Original Company',
            about: 'Original company description for testing update functionality.',
            industry: 'Công nghệ thông tin',
            taxCode: '0123456789',
            verified: false
          }
        }
      );
    });

    it('should update company profile successfully', async () => {
      const res = await request(app)
        .patch('/api/companies/my-company')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .field('companyData', JSON.stringify(updateData))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Cập nhật thông tin công ty thành công.');
      expect(res.body.data.name).toBe(updateData.name);
      expect(res.body.data.about).toBe(updateData.about);
      expect(res.body.data.industry).toBe(updateData.industry);
      expect(res.body.data.size).toBe(updateData.size);
      expect(res.body.data.website).toBe(updateData.website);
    });

    it('should update company profile with business registration file', async () => {
      const testFilePath = path.join(process.cwd(), 'test-updated-license.jpg');
      fs.writeFileSync(testFilePath, 'updated mock image content');

      try {
        const res = await request(app)
          .patch('/api/companies/my-company')
          .set('Authorization', `Bearer ${recruiterToken}`)
          .field('companyData', JSON.stringify(updateData))
          .attach('businessRegistrationFile', testFilePath)
          .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('businessRegistrationUrl');
      } finally {
        if (fs.existsSync(testFilePath)) {
          fs.unlinkSync(testFilePath);
        }
      }
    });

    it('should allow partial updates', async () => {
      const partialUpdate = {
        name: 'Partially Updated Name',
        about: 'This is a partially updated company description with enough characters to meet the minimum requirement.',
        website: 'https://partialupdate.com'
      };

      const res = await request(app)
        .patch('/api/companies/my-company')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .field('companyData', JSON.stringify(partialUpdate))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe(partialUpdate.name);
      expect(res.body.data.website).toBe(partialUpdate.website);
      // Original values should be preserved
      expect(res.body.data.industry).toBe('Công nghệ thông tin');
    });

    it('should return 400 for invalid update data', async () => {
      const invalidUpdate = {
        name: 'A', // Too short
        about: 'Too short desc', // Too short
        website: 'invalid-url'
      };

      const res = await request(app)
        .patch('/api/companies/my-company')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .field('companyData', JSON.stringify(invalidUpdate))
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should return 401 if not authenticated', async () => {
      const res = await request(app)
        .patch('/api/companies/my-company')
        .field('companyData', JSON.stringify(updateData))
        .expect(401);
    });

    it('should return 403 if user is not a recruiter', async () => {
      const res = await request(app)
        .patch('/api/companies/my-company')
        .set('Authorization', `Bearer ${nonRecruiterToken}`)
        .field('companyData', JSON.stringify(updateData))
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Access denied. Insufficient permissions.');
    });

    it('should return 400 if recruiter has no company to update', async () => {
      const newRecruiter = await User.create({
        email: 'nocompany@test.com',
        password: 'password123',
        fullname: 'No Company Recruiter',
        role: 'recruiter',
        isEmailVerified: true,
      });

      await RecruiterProfile.create({
        userId: newRecruiter._id,
        fullname: 'No Company Recruiter',
      });

      const newToken = jwt.sign(
        { id: newRecruiter._id, role: newRecruiter.role },
        config.JWT_SECRET
      );

      const res = await request(app)
        .patch('/api/companies/my-company')
        .set('Authorization', `Bearer ${newToken}`)
        .field('companyData', JSON.stringify(updateData))
        .expect(400); // Changed from 404 to 400 since service throws BadRequestError

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Bạn chưa có công ty');
    });
  });

  describe('POST /api/companies/my-company/logo - Cập nhật logo công ty', () => {
    beforeEach(async () => {
      // Create a company for the recruiter
      await RecruiterProfile.findByIdAndUpdate(
        recruiterProfile._id,
        {
          company: {
            name: 'Logo Test Company',
            about: 'Company for testing logo upload functionality.',
            industry: 'Công nghệ thông tin',
            verified: false
          }
        }
      );
    });

    it('should update company logo successfully', async () => {
      const testImagePath = path.join(process.cwd(), 'test-logo.jpg');
      fs.writeFileSync(testImagePath, 'mock image content');

      try {
        const res = await request(app)
          .post('/api/companies/my-company/logo')
          .set('Authorization', `Bearer ${recruiterToken}`)
          .attach('logo', testImagePath)
          .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.message).toBe('Cập nhật logo công ty thành công.');
        expect(res.body.data).toHaveProperty('logo');
      } finally {
        if (fs.existsSync(testImagePath)) {
          fs.unlinkSync(testImagePath);
        }
      }
    });

    it('should return 400 if no logo file is provided', async () => {
      const res = await request(app)
        .post('/api/companies/my-company/logo')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Vui lòng tải lên một file ảnh');
    });

    it('should return 401 if not authenticated', async () => {
      const res = await request(app)
        .post('/api/companies/my-company/logo')
        .expect(401);
    });

    it('should return 403 if user is not a recruiter', async () => {
      const res = await request(app)
        .post('/api/companies/my-company/logo')
        .set('Authorization', `Bearer ${nonRecruiterToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Access denied. Insufficient permissions.');
    });

    it('should return 404 if recruiter has no company', async () => {
      const newRecruiter = await User.create({
        email: 'logonocompany@test.com',
        password: 'password123',
        fullname: 'Logo No Company',
        role: 'recruiter',
        isEmailVerified: true,
      });

      await RecruiterProfile.create({
        userId: newRecruiter._id,
        fullname: 'Logo No Company',
      });

      const newToken = jwt.sign(
        { id: newRecruiter._id, role: newRecruiter.role },
        config.JWT_SECRET
      );

      const testImagePath = path.join(process.cwd(), 'test-logo-no-company.jpg');
      fs.writeFileSync(testImagePath, 'mock image content');

      try {
        const res = await request(app)
          .post('/api/companies/my-company/logo')
          .set('Authorization', `Bearer ${newToken}`)
          .attach('logo', testImagePath)
          .expect(400); 

        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('Vui lòng cập nhật thông tin công ty trước khi thêm logo');
      } finally {
        if (fs.existsSync(testImagePath)) {
          fs.unlinkSync(testImagePath);
        }
      }
    });
  });
});
