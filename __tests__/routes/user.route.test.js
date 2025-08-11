import request from 'supertest';
import app from '../../src/app.js';
import { server } from '../../src/server.js';
import { User, CandidateProfile } from '../../src/models/index.js';
import jwt from 'jsonwebtoken';
import config from '../../src/config/index.js';

describe('User Routes API', () => {
  let testUser, token;

  // Use beforeEach to ensure a clean state for every test
  beforeEach(async () => {
    // Create a user and corresponding profile
    testUser = await User.create({
      username: 'testuser',
      email: 'testuser@example.com',
      password: 'password123',
      fullname: 'Test User',
      role: 'candidate',
      isEmailVerified: true,
    });

    await CandidateProfile.create({
      userId: testUser._id,
      fullname: 'Test User',
    });

    // Generate a token for this user
    token = jwt.sign({ id: testUser._id, role: testUser.role }, config.JWT_SECRET);
  });

  // Use afterEach to clean up after every test
  afterEach(async () => {
    await User.deleteMany({});
    await CandidateProfile.deleteMany({});
  });

  // Close the server once after all tests are done
  afterAll((done) => {
    server.close(done);
  });

  describe('GET /api/users/me', () => {
    it('should return the current user profile when authenticated', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user._id).toBe(testUser._id.toString());
      expect(res.body.data.profile.fullname).toBe('Test User');
    });

    it('should return 401 if not authenticated', async () => {
      const res = await request(app).get('/api/users/me');
      expect(res.statusCode).toEqual(401);
    });
  });

  describe('PUT /api/users/me', () => {
    it('should update the current user profile successfully', async () => {
      const updateData = {
        fullname: 'Updated Test User',
        phone: '123456789',
      };

      const res = await request(app)
        .put('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send(updateData);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Cập nhật thông tin thành công.');
      expect(res.body.data.profile.fullname).toBe('Updated Test User');
      expect(res.body.data.profile.phone).toBe('123456789');

      // Verify the update in the database
      const updatedProfile = await CandidateProfile.findOne({ userId: testUser._id });
      expect(updatedProfile.fullname).toBe('Updated Test User');
    });

    it('should return 401 if not authenticated', async () => {
        const res = await request(app).put('/api/users/me').send({});
        expect(res.statusCode).toEqual(401);
    });
  });
});
