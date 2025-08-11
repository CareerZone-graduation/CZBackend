import request from 'supertest';
import app from '../../src/app.js';
import { server } from '../../src/server.js';
import { User, CandidateProfile } from '../../src/models/index.js';
import jwt from 'jsonwebtoken';
import config from '../../src/config/index.js';

describe('Candidate Routes API', () => {
  let candidateUser, candidateToken;

  beforeEach(async () => {
    // Create a candidate user and profile for the tests
    candidateUser = await User.create({
      username: 'testcandidate',
      email: 'candidate@example.com',
      password: 'password123',
      fullname: 'Test Candidate',
      role: 'candidate',
      isEmailVerified: true,
    });

    await CandidateProfile.create({
      userId: candidateUser._id,
      fullname: 'Test Candidate',
      phone: '111222333',
    });

    // Generate a token for this candidate
    candidateToken = jwt.sign({ id: candidateUser._id, role: 'candidate' }, config.JWT_SECRET);
  });

  afterEach(async () => {
    // Clean up database
    await User.deleteMany({});
    await CandidateProfile.deleteMany({});
  });

  afterAll((done) => {
    server.close(done);
  });

  describe('GET /api/candidate/my-profile', () => {
    it('should fetch the authenticated candidate profile', async () => {
      const res = await request(app)
        .get('/api/candidate/my-profile')
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.userId.toString()).toBe(candidateUser._id.toString());
      expect(res.body.data.fullname).toBe('Test Candidate');
      expect(res.body.data.phone).toBe('111222333');
    });

    it('should return 401 if not authenticated', async () => {
      const res = await request(app).get('/api/candidate/my-profile');
      expect(res.statusCode).toEqual(401);
    });
  });

  describe('PUT /api/candidate/my-profile', () => {
    it('should update the authenticated candidate profile', async () => {
      const updateData = {
        fullname: 'Updated Candidate Name',
        bio: 'This is my new bio.',
      };

      const res = await request(app)
        .put('/api/candidate/my-profile')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send(updateData);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.fullname).toBe('Updated Candidate Name');
      expect(res.body.data.bio).toBe('This is my new bio.');

      // Verify in DB
      const userInDb = await User.findById(candidateUser._id);
      expect(userInDb.fullname).toBe('Updated Candidate Name');
      const profileInDb = await CandidateProfile.findOne({ userId: candidateUser._id });
      expect(profileInDb.bio).toBe('This is my new bio.');
    });
  });
});
