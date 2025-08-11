import request from 'supertest';
import app from '../../src/app.js';
import { server } from '../../src/server.js';
import { User, CandidateProfile, Job, SavedJob } from '../../src/models/index.js';
import jwt from 'jsonwebtoken';
import config from '../../src/config/index.js';

describe('Candidate Routes API', () => {
  let candidateUser, candidateToken, job1, job2;

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

    job1 = await Job.create({
      title: 'Software Engineer',
      description: 'A great job',
      company: 'Tech Corp',
      recruiterId: '60d21b4667d0d8992e610c85', // Dummy ID
    });

    job2 = await Job.create({
      title: 'Data Scientist',
      description: 'Another great job',
      company: 'Data Inc.',
      recruiterId: '60d21b4667d0d8992e610c86', // Dummy ID
    });

    // Generate a token for this candidate
    candidateToken = jwt.sign({ id: candidateUser._id, role: 'candidate' }, config.JWT_SECRET);
  });

  afterEach(async () => {
    // Clean up database
    await User.deleteMany({});
    await CandidateProfile.deleteMany({});
    await Job.deleteMany({});
    await SavedJob.deleteMany({});
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
      expect(profileInDb.fullname).toBe('Updated Candidate Name');
      expect(profileInDb.bio).toBe('This is my new bio.');
    });

    it('should return 401 if not authenticated', async () => {
      const res = await request(app)
        .put('/api/candidate/my-profile')
        .send({ fullname: 'New Name' });
      expect(res.statusCode).toEqual(401);
    });

    it('should return 400 for invalid data', async () => {
      const invalidUpdate = {
        email: 'newemail@example.com', // Not allowed to change email here
      };

      const res = await request(app)
        .put('/api/candidate/my-profile')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send(invalidUpdate);

      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Saved Jobs', () => {
    beforeEach(async () => {
      // Pre-save a job for the candidate
      await SavedJob.create({
        userId: candidateUser._id,
        jobId: job1._id,
      });
    });

    describe('GET /api/candidate/saved-jobs', () => {
      it('should fetch the list of saved jobs for the authenticated candidate', async () => {
        const res = await request(app)
          .get('/api/candidate/saved-jobs')
          .set('Authorization', `Bearer ${candidateToken}`);

        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBeInstanceOf(Array);
        expect(res.body.data.length).toBe(1);
        expect(res.body.data[0].jobId._id.toString()).toBe(job1._id.toString());
        expect(res.body.data[0].jobId.title).toBe('Software Engineer');
      });

      it('should return 401 if not authenticated', async () => {
        const res = await request(app).get('/api/candidate/saved-jobs');
        expect(res.statusCode).toEqual(401);
      });
    });

    describe('POST /api/candidate/saved-jobs/:jobId', () => {
      it('should save a new job for the candidate', async () => {
        const res = await request(app)
          .post(`/api/candidate/saved-jobs/${job2._id}`)
          .set('Authorization', `Bearer ${candidateToken}`);

        expect(res.statusCode).toEqual(201);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toMatch(/successfully/);

        const savedJobInDb = await SavedJob.findOne({ userId: candidateUser._id, jobId: job2._id });
        expect(savedJobInDb).not.toBeNull();
      });

      it('should return 409 if the job is already saved', async () => {
        const res = await request(app)
          .post(`/api/candidate/saved-jobs/${job1._id}`) // job1 is pre-saved
          .set('Authorization', `Bearer ${candidateToken}`);

        expect(res.statusCode).toEqual(409);
        expect(res.body.success).toBe(false);
      });

      it('should return 404 if the job does not exist', async () => {
        const nonExistentJobId = '60d21b4667d0d8992e610c99';
        const res = await request(app)
          .post(`/api/candidate/saved-jobs/${nonExistentJobId}`)
          .set('Authorization', `Bearer ${candidateToken}`);

        expect(res.statusCode).toEqual(404);
      });

      it('should return 401 if not authenticated', async () => {
        const res = await request(app).post(`/api/candidate/saved-jobs/${job2._id}`);
        expect(res.statusCode).toEqual(401);
      });
    });

    describe('DELETE /api/candidate/saved-jobs/:jobId', () => {
      it('should unsave a job for the candidate', async () => {
        const res = await request(app)
          .delete(`/api/candidate/saved-jobs/${job1._id}`) // job1 is pre-saved
          .set('Authorization', `Bearer ${candidateToken}`);

        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toMatch(/successfully/);

        const savedJobInDb = await SavedJob.findOne({ userId: candidateUser._id, jobId: job1._id });
        expect(savedJobInDb).toBeNull();
      });

      it('should return 404 if the job to unsave is not found in saved list', async () => {
        const res = await request(app)
          .delete(`/api/candidate/saved-jobs/${job2._id}`) // job2 is not saved yet
          .set('Authorization', `Bearer ${candidateToken}`);

        expect(res.statusCode).toEqual(404);
        expect(res.body.success).toBe(false);
      });

      it('should return 401 if not authenticated', async () => {
        const res = await request(app).delete(`/api/candidate/saved-jobs/${job1._id}`);
        expect(res.statusCode).toEqual(401);
      });
    });
  });
});
