import {
  Application,
  CandidateProfile,
  InterviewRoom,
  Job,
  RecruiterProfile,
  User
} from '../../src/models/index.js';
import { getApplicationById } from '../../src/services/candidate.service.js';

describe('Candidate application detail interview history', () => {
  it('returns all interview rounds in chronological order', async () => {
    const recruiterUser = await User.create({
      email: 'candidate-detail-recruiter@test.com',
      password: 'password123',
      role: 'recruiter',
      isEmailVerified: true
    });

    const candidateUser = await User.create({
      email: 'candidate-detail-candidate@test.com',
      password: 'password123',
      role: 'candidate',
      isEmailVerified: true
    });

    const recruiterProfile = await RecruiterProfile.create({
      userId: recruiterUser._id,
      fullname: 'Recruiter Owner',
      company: {
        name: 'Workflow Co',
        location: {
          coordinates: {
            type: 'Point',
            coordinates: [106.6297, 10.8231]
          }
        }
      }
    });

    const candidateProfile = await CandidateProfile.create({
      userId: candidateUser._id,
      fullname: 'Candidate Test'
    });

    const job = await Job.create({
      title: 'Backend Engineer',
      description: 'A great job opportunity.',
      requirements: 'NodeJS, MongoDB',
      benefits: 'Good salary',
      location: {
        province: 'Thành phố Hồ Chí Minh',
        district: 'Quận 1',
        commune: 'Phường Tân Định',
        coordinates: { type: 'Point', coordinates: [106.68, 10.79] }
      },
      address: '1 Test Street',
      type: 'FULL_TIME',
      workType: 'REMOTE',
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      experience: 'MID_LEVEL',
      category: 'IT',
      skills: ['NodeJS'],
      recruiterProfileId: recruiterProfile._id,
      status: 'ACTIVE',
      moderationStatus: 'APPROVED'
    });

    const application = await Application.create({
      jobId: job._id,
      candidateProfileId: candidateProfile._id,
      candidateName: 'Candidate Test',
      candidateEmail: 'candidate@test.com',
      candidatePhone: '0900000000',
      jobSnapshot: {
        title: job.title,
        company: 'Workflow Co',
        logo: 'https://example.com/logo.png'
      }
    });

    await InterviewRoom.create([
      {
        roomName: 'Round 2',
        recruiterId: recruiterUser._id,
        candidateId: candidateUser._id,
        applicationId: application._id,
        sequence: 2,
        scheduledTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        status: 'SCHEDULED'
      },
      {
        roomName: 'Round 1',
        recruiterId: recruiterUser._id,
        candidateId: candidateUser._id,
        applicationId: application._id,
        sequence: 1,
        scheduledTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: 'COMPLETED',
        result: 'PASSED'
      }
    ]);

    const result = await getApplicationById(candidateUser._id.toString(), application._id.toString());

    expect(result.interviewHistory).toHaveLength(2);
    expect(result.interviewHistory.map((interview) => interview.roomName)).toEqual(['Round 1', 'Round 2']);
    expect(result.interview._id.toString()).toBe(result.interviewHistory[0].interviewId.toString());
  });
});
