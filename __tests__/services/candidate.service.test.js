import mongoose from 'mongoose';
import { User, CandidateProfile, Job, SavedJob } from '../../src/models/index.js';
import * as candidateService from '../../src/services/candidate.service.js';
import { NotFoundError, BadRequestError } from '../../src/utils/AppError.js';
import * as uploadService from '../../src/services/upload.service.js';

jest.mock('../../src/services/upload.service.js');

describe('Candidate Service', () => {
  let candidateUser, job;

  beforeAll(async () => {
    // Connect to a test database if not already connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI_TEST, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    }
  });

  beforeEach(async () => {
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

    job = await Job.create({
      title: 'Software Engineer',
      description: 'A great job',
      company: 'Tech Corp',
      recruiterId: new mongoose.Types.ObjectId(),
    });
  });

  afterEach(async () => {
    await User.deleteMany({});
    await CandidateProfile.deleteMany({});
    await Job.deleteMany({});
    await SavedJob.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('getProfile', () => {
    it('should return the candidate profile if found', async () => {
      const profile = await candidateService.getProfile(candidateUser._id);
      expect(profile).not.toBeNull();
      expect(profile.userId.toString()).toBe(candidateUser._id.toString());
      expect(profile.fullname).toBe('Test Candidate');
    });

    it('should throw NotFoundError if profile is not found', async () => {
      const nonExistentUserId = new mongoose.Types.ObjectId();
      // Note: The service function name is getProfile, not getProfileByUserId
      await expect(candidateService.getProfile(nonExistentUserId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateProfile', () => {
    it('should update candidate profile data correctly', async () => {
      const updateData = {
        bio: 'A new bio',
        phone: '987654321',
      };
      const updatedProfile = await candidateService.updateProfile(candidateUser._id, updateData);

      expect(updatedProfile.bio).toBe('A new bio');
      expect(updatedProfile.phone).toBe('987654321');
    });

    it('should update fullname in both User and CandidateProfile models', async () => {
      const updateData = {
        fullname: 'New Full Name',
        bio: 'Another bio',
      };
      const updatedProfile = await candidateService.updateProfile(candidateUser._id, updateData);

      const updatedUser = await User.findById(candidateUser._id);
      expect(updatedUser.fullname).toBe('New Full Name');
      expect(updatedProfile.fullname).toBe('New Full Name');
      expect(updatedProfile.bio).toBe('Another bio');
    });

    it('should create a new profile if one does not exist (upsert)', async () => {
      const newUser = await User.create({
        username: 'newuser',
        email: 'new@example.com',
        password: 'password123',
        fullname: 'New User',
        role: 'candidate',
      });

      const updateData = {
        fullname: 'New User Fullname',
        phone: '555555555',
      };

      const newProfile = await candidateService.updateProfile(newUser._id, updateData);
      expect(newProfile).not.toBeNull();
      expect(newProfile.userId.toString()).toBe(newUser._id.toString());
      expect(newProfile.phone).toBe('555555555');

      const userInDb = await User.findById(newUser._id);
      expect(userInDb.fullname).toBe('New User Fullname');
    });
  });

  describe('CV Management', () => {
    beforeEach(() => {
      // Reset mocks before each test
      uploadService.uploadToCloudinary.mockClear();
    });

    describe('uploadCv', () => {
      it('should upload a CV and add it to the profile', async () => {
        const mockFile = { buffer: Buffer.from('test cv'), originalname: 'my_cv.pdf' };
        uploadService.uploadToCloudinary.mockResolvedValue({
          secure_url: 'http://cloudinary.com/cv.pdf',
          public_id: 'cv_public_id',
        });

        const cvs = await candidateService.uploadCv(candidateUser._id, mockFile);

        expect(uploadService.uploadToCloudinary).toHaveBeenCalledTimes(1);
        expect(cvs.length).toBe(1);
        expect(cvs[0].name).toBe('my_cv.pdf');
        expect(cvs[0].path).toBe('http://cloudinary.com/cv.pdf');
        expect(cvs[0].isDefault).toBe(true); // First CV is default

        const profileInDb = await CandidateProfile.findOne({ userId: candidateUser._id });
        expect(profileInDb.cvs.length).toBe(1);
      });

      it('should throw BadRequestError if no file is provided', async () => {
        await expect(candidateService.uploadCv(candidateUser._id, null)).rejects.toThrow(BadRequestError);
      });
    });

    describe('getCvs', () => {
      it('should return all CVs for a candidate', async () => {
        // First, upload a CV to test with
        const profile = await CandidateProfile.findOne({ userId: candidateUser._id });
        profile.cvs.push({
          _id: new mongoose.Types.ObjectId(),
          name: 'existing_cv.pdf',
          path: 'http://path.to/cv.pdf',
          isDefault: true,
        });
        await profile.save();

        const cvs = await candidateService.getCvs(candidateUser._id);
        expect(cvs.length).toBe(1);
        expect(cvs[0].name).toBe('existing_cv.pdf');
      });

      it('should return an empty array if profile does not exist', async () => {
        const nonExistentUserId = new mongoose.Types.ObjectId();
        const cvs = await candidateService.getCvs(nonExistentUserId);
        expect(cvs).toEqual([]);
      });
    });

    describe('setDefaultCv', () => {
      let cv1, cv2;
      beforeEach(async () => {
        const profile = await CandidateProfile.findOne({ userId: candidateUser._id });
        cv1 = { _id: new mongoose.Types.ObjectId(), name: 'cv1.pdf', path: 'p1', isDefault: true };
        cv2 = { _id: new mongoose.Types.ObjectId(), name: 'cv2.pdf', path: 'p2', isDefault: false };
        profile.cvs.push(cv1, cv2);
        await profile.save();
      });

      it('should set a new default CV', async () => {
        const updatedCvs = await candidateService.setDefaultCv(candidateUser._id, cv2._id.toString());
        const defaultCv = updatedCvs.find(cv => cv.isDefault);
        const oldDefaultCv = updatedCvs.find(cv => cv._id.toString() === cv1._id.toString());

        expect(defaultCv._id.toString()).toBe(cv2._id.toString());
        expect(oldDefaultCv.isDefault).toBe(false);
      });

      it('should throw NotFoundError if CV does not exist', async () => {
        const nonExistentCvId = new mongoose.Types.ObjectId().toString();
        await expect(candidateService.setDefaultCv(candidateUser._id, nonExistentCvId)).rejects.toThrow(NotFoundError);
      });
    });

    describe('deleteCv', () => {
        let cv1, cv2;
        beforeEach(async () => {
            const profile = await CandidateProfile.findOne({ userId: candidateUser._id });
            cv1 = { _id: new mongoose.Types.ObjectId(), name: 'cv1.pdf', path: 'p1', isDefault: true, cloudinaryId: 'id1' };
            cv2 = { _id: new mongoose.Types.ObjectId(), name: 'cv2.pdf', path: 'p2', isDefault: false, cloudinaryId: 'id2' };
            profile.cvs.push(cv1, cv2);
            await profile.save();
        });

        it('should delete a CV and return the updated list', async () => {
            const updatedCvs = await candidateService.deleteCv(candidateUser._id, cv2._id.toString());
            expect(updatedCvs.length).toBe(1);
            expect(updatedCvs.find(cv => cv._id.toString() === cv2._id.toString())).toBeUndefined();
        });

        it('should set a new default if the deleted CV was the default', async () => {
            const updatedCvs = await candidateService.deleteCv(candidateUser._id, cv1._id.toString());
            expect(updatedCvs.length).toBe(1);
            expect(updatedCvs[0].isDefault).toBe(true);
            expect(updatedCvs[0]._id.toString()).toBe(cv2._id.toString());
        });

        it('should throw NotFoundError if CV to delete is not found', async () => {
            const nonExistentCvId = new mongoose.Types.ObjectId().toString();
            await expect(candidateService.deleteCv(candidateUser._id, nonExistentCvId)).rejects.toThrow(NotFoundError);
        });
    });
  });
});
