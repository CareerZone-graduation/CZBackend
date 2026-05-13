import mongoose from 'mongoose';
import {
  Application,
  InterviewRoom,
  Job,
  RecruiterProfile,
} from '../../src/models/index.js';
import { evaluateInterviewResult } from '../../src/services/application.service.js';

describe('application interview evaluation', () => {
  it('stores feedback on interview evaluationNote without appending to application notes', async () => {
    const recruiterId = new mongoose.Types.ObjectId();
    const recruiterProfile = await RecruiterProfile.create({
      userId: recruiterId,
      fullname: 'Recruiter Test',
      company: {
        name: 'CareerZone Test',
        location: {
          coordinates: {
            type: 'Point',
            coordinates: [0, 0],
          },
        },
      },
    });

    const job = await Job.create({
      title: 'Workflow Tester',
      description: 'Test job',
      requirements: 'Testing',
      benefits: 'Benefits',
      location: {
        province: 'Thành phố Hồ Chí Minh',
        district: 'Quận 1',
        coordinates: {
          type: 'Point',
          coordinates: [0, 0],
        },
      },
      address: '123 Test St',
      type: 'FULL_TIME',
      workType: 'ON_SITE',
      deadline: new Date(Date.now() + 86400000),
      experience: 'MID_LEVEL',
      category: 'IT',
      recruiterProfileId: recruiterProfile._id,
      status: 'ACTIVE',
      moderationStatus: 'APPROVED',
    });

    const application = await Application.create({
      jobId: job._id,
      candidateProfileId: new mongoose.Types.ObjectId(),
      status: 'SCHEDULED_INTERVIEW',
      candidateName: 'Candidate Test',
      candidateEmail: 'candidate@test.com',
      candidatePhone: '0900000000',
      notes: 'internal only',
      jobSnapshot: {
        title: job.title,
        company: recruiterProfile.company.name,
        logo: 'https://example.com/logo.png',
      },
    });

    const interview = await InterviewRoom.create({
      roomName: 'Interview Round 1',
      recruiterId,
      candidateId: new mongoose.Types.ObjectId(),
      applicationId: application._id,
      jobId: job._id,
      sequence: 1,
      scheduledTime: new Date(Date.now() + 3600000),
      status: 'COMPLETED',
      result: null,
    });

    await evaluateInterviewResult(application._id, recruiterId, 'PASSED', 'ok1');

    const updatedApplication = await Application.findById(application._id).lean();
    const updatedInterview = await InterviewRoom.findById(interview._id).lean();

    expect(updatedApplication.notes).toBe('internal only');
    expect(updatedInterview.result).toBe('PASSED');
    expect(updatedInterview.evaluationNote).toBe('ok1');
  });
});
