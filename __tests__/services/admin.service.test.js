import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { getJobDetail } from '../../src/services/admin.service.js';
import { Job, Application, RecruiterProfile, User, CandidateProfile } from '../../src/models/index.js';
import { NotFoundError } from '../../src/utils/AppError.js';

describe('Admin Service - getJobDetail', () => {
  let mongoServer;
  let recruiterUser, candidateUser, recruiterProfile, candidateProfile, job, application;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create Users
    recruiterUser = await User.create({
      email: 'recruiter@example.com',
      password: 'password123',
      role: 'recruiter',
    });
    candidateUser = await User.create({
      email: 'candidate@example.com',
      password: 'password123',
      role: 'candidate',
    });

    // Create Profiles
    recruiterProfile = await RecruiterProfile.create({
      userId: recruiterUser._id,
      fullname: 'Recruiter Name',
      company: { name: 'Test Company' },
    });
    candidateProfile = await CandidateProfile.create({
      userId: candidateUser._id,
      fullname: 'Candidate Name',
    });

    // Create Job
    job = await Job.create({
      title: 'Software Engineer',
      description: 'Job description',
      requirements: 'Job requirements',
      benefits: 'Job benefits',
      location: { province: 'Test Province', ward: 'Test Ward' },
      address: '123 Test St',
      type: 'FULL_TIME',
      workType: 'ON_SITE',
      deadline: new Date(),
      experience: 'ENTRY_LEVEL',
      category: 'IT',
      recruiterProfileId: recruiterProfile._id,
    });

    // Create Application
    application = await Application.create({
      jobId: job._id,
      candidateProfileId: candidateProfile._id,
      status: 'PENDING',
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('should return job details with analytics', async () => {
    const result = await getJobDetail(job._id.toString());

    expect(result).toBeDefined();
    expect(result.title).toBe('Software Engineer');
    expect(result.analytics).toBeDefined();
    expect(result.analytics.applicationStats).toBeDefined();
    expect(result.analytics.applicationStats.total).toBe(1);
    expect(result.analytics.applicationStats.pending).toBe(1);
    expect(result.analytics.recentApplications).toBeDefined();
    expect(result.analytics.recentApplications.length).toBe(1);
    expect(result.analytics.recentApplications[0].candidateProfileId.fullname).toBe('Candidate Name');
  });

  it('should throw NotFoundError if job does not exist', async () => {
    const nonExistentId = new mongoose.Types.ObjectId();
    await expect(getJobDetail(nonExistentId.toString())).rejects.toThrow(NotFoundError);
  });
});