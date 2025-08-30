import request from 'supertest';
import app from '../../src/app.js';
import { server } from '../../src/server.js';
import { User, RecruiterProfile } from '../../src/models/index.js';
import mongoose from 'mongoose';

describe('Company Routes', () => {
  let recruiterProfileWithCompany;

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await RecruiterProfile.deleteMany({});

    const recruiterUser = await User.create({
      email: 'recruiter@company.com',
      password: 'password123',
      role: 'recruiter',
      isEmailVerified: true,
    });

    recruiterProfileWithCompany = await RecruiterProfile.create({
      userId: recruiterUser._id,
      fullname: 'Company Recruiter',
      company: {
        name: 'Awesome Inc.',
        about: 'We make awesome things.',
        industry: 'Công nghệ thông tin',
        taxCode: '123456789',
        size: '10-20',
        website: 'https://awesomeinc.com',
        location: {
          province: 'Thành phố Hà Nội',
          ward: 'Phường Trung Hoà'
        },
        address: '123 Main St',
        contactInfo: {
          email: 'contact@awesomeinc.com',
          phone: '0987654321',
        },
        verified: true,
      },
    });
  });

  describe('GET /api/companies/:id', () => {
    it('should return company details for a valid company ID', async () => {
      const res = await request(app).get(`/api/companies/${recruiterProfileWithCompany.company._id}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      // The endpoint returns the company object directly in the data field
      expect(res.body.data.name).toBe('Awesome Inc.');
    });

    it('should return 404 if company not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app).get(`/api/companies/${nonExistentId}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Không tìm thấy công ty.');
    });
  });
});
