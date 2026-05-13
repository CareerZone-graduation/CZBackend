import mongoose from 'mongoose';
import { jest } from '@jest/globals';
import {
  Application,
  CandidateProfile,
  InterviewRoom,
  Job,
  RecruiterProfile,
  User
} from '../../src/models/index.js';

const publishNotificationMock = jest.fn();
const publishNotificationStrictMock = jest.fn();

jest.unstable_mockModule('../../src/services/queue.service.js', () => ({
  publishNotification: publishNotificationMock,
  publishNotificationStrict: publishNotificationStrictMock
}));

const { scheduleInterview } = await import('../../src/services/interview.service.js');
const { evaluateInterviewResult } = await import('../../src/services/application.service.js');

describe('scheduleInterview workflow rounds', () => {
  let recruiterUser;
  let candidateUser;
  let recruiterProfile;
  let candidateProfile;
  let job;
  let application;
  let workflowId;
  let workflowNodeId;
  let requestedAt;

  beforeEach(async () => {
    publishNotificationMock.mockReset();
    publishNotificationStrictMock.mockReset();

    recruiterUser = await User.create({
      email: 'recruiter-workflow-rounds@test.com',
      password: 'password123',
      role: 'recruiter',
      isEmailVerified: true
    });

    candidateUser = await User.create({
      email: 'candidate-workflow-rounds@test.com',
      password: 'password123',
      role: 'candidate',
      isEmailVerified: true
    });

    recruiterProfile = await RecruiterProfile.create({
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

    candidateProfile = await CandidateProfile.create({
      userId: candidateUser._id,
      fullname: 'Candidate Test'
    });

    job = await Job.create({
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
      address: '123 Test Street',
      type: 'FULL_TIME',
      workType: 'ON_SITE',
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
      experience: 'SENIOR_LEVEL',
      category: 'IT',
      recruiterProfileId: recruiterProfile._id,
      status: 'ACTIVE',
      moderationStatus: 'APPROVED'
    });

    workflowId = new mongoose.Types.ObjectId();
    workflowNodeId = new mongoose.Types.ObjectId();
    requestedAt = new Date();

    application = await Application.create({
      jobId: job._id,
      candidateProfileId: candidateProfile._id,
      workflowId,
      candidateName: 'Candidate Test',
      candidateEmail: 'candidate@test.com',
      candidatePhone: '0900000000',
      jobSnapshot: {
        title: 'Backend Engineer',
        company: 'Workflow Co',
        logo: 'https://example.com/logo.png'
      },
      workflowData: {
        isWorkflowPaused: true,
        pendingNextNodeId: new mongoose.Types.ObjectId().toString(),
        currentNodeId: workflowNodeId.toString(),
        waitingFor: {
          type: 'INTERVIEW',
          workflowNodeId: workflowNodeId.toString(),
          interviewRoomId: null,
          requestedAt
        }
      }
    });
  });

  it('attaches workflow metadata and waiting interview room id when scheduling', async () => {
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000);

    const interview = await scheduleInterview(
      recruiterUser._id,
      candidateUser._id,
      job._id,
      application._id,
      scheduledAt,
      60
    );

    const updatedApplication = await Application.findById(application._id).lean();

    expect(interview.workflowId?.toString()).toBe(workflowId.toString());
    expect(interview.workflowNodeId?.toString()).toBe(workflowNodeId.toString());
    expect(interview.sequence).toBe(1);
    expect(interview.roundName).toBe('Interview Round 1');
    expect(updatedApplication.workflowData.waitingFor.type).toBe('INTERVIEW');
    expect(updatedApplication.workflowData.waitingFor.workflowNodeId).toBe(workflowNodeId.toString());
    expect(updatedApplication.workflowData.waitingFor.interviewRoomId).toBe(interview._id.toString());
    expect(new Date(updatedApplication.workflowData.waitingFor.requestedAt)).toEqual(requestedAt);
  });

  it('increments sequence across multiple interview rounds of the same application', async () => {
    await InterviewRoom.create({
      roomName: 'Round 1',
      recruiterId: recruiterUser._id,
      candidateId: candidateUser._id,
      applicationId: application._id,
      workflowId,
      workflowNodeId,
      sequence: 1,
      roundName: 'Interview Round 1',
      scheduledTime: new Date(Date.now() + 30 * 60 * 1000),
      roomId: 'existing-round-1'
    });

    const second = await scheduleInterview(
      recruiterUser._id,
      candidateUser._id,
      job._id,
      application._id,
      new Date(Date.now() + 2 * 60 * 60 * 1000),
      60
    );

    expect(second.sequence).toBe(2);
    expect(second.workflowId?.toString()).toBe(workflowId.toString());
    expect(second.workflowNodeId?.toString()).toBe(workflowNodeId.toString());
    expect(second.roundName).toBe('Interview Round 2');
  });

  it('evaluates the active interview room and resumes workflow', async () => {
    const nextNodeId = new mongoose.Types.ObjectId();

    application.workflowData.pendingNextNodeId = nextNodeId.toString();
    await application.save();

    const interview = await InterviewRoom.create({
      roomName: 'Round 1',
      recruiterId: recruiterUser._id,
      candidateId: candidateUser._id,
      applicationId: application._id,
      workflowId,
      workflowNodeId,
      sequence: 1,
      roundName: 'Interview Round 1',
      scheduledTime: new Date(Date.now() + 60 * 60 * 1000),
      status: 'COMPLETED',
      roomId: 'completed-round-1'
    });

    application.workflowData.waitingFor.interviewRoomId = interview._id.toString();
    await application.save();

    await evaluateInterviewResult(application._id, recruiterUser._id, 'PASSED', 'Good round');

    const updatedInterview = await InterviewRoom.findById(interview._id).lean();
    const updatedApplication = await Application.findById(application._id).lean();

    expect(updatedInterview.result).toBe('PASSED');
    expect(updatedInterview.evaluationNote).toBe('Good round');
    expect(updatedInterview.evaluatedAt).toBeTruthy();
    expect(updatedInterview.evaluatedBy.toString()).toBe(recruiterUser._id.toString());
    expect(updatedApplication.workflowData.isWorkflowPaused).toBe(false);
    expect(updatedApplication.workflowData.waitingFor.type).toBeNull();
    expect(updatedApplication.workflowData.waitingFor.workflowNodeId).toBeNull();
    expect(updatedApplication.workflowData.waitingFor.interviewRoomId).toBeNull();
    expect(updatedApplication.interview_result).toBeNull();
    expect(publishNotificationStrictMock).toHaveBeenCalledWith(
      'workflow.execution.continue',
      expect.objectContaining({
        applicationId: application._id.toString(),
        workflowId: workflowId.toString(),
        currentNodeId: nextNodeId.toString(),
        retryCount: 0
      })
    );
  });

  it('falls back to latest matching interview room when legacy workflowData has no waitingFor shape', async () => {
    const nextNodeId = new mongoose.Types.ObjectId();

    application.workflowData = {
      isWorkflowPaused: true,
      pendingNextNodeId: nextNodeId.toString(),
      currentNodeId: workflowNodeId.toString()
    };
    await application.save();

    const interview = await InterviewRoom.create({
      roomName: 'Legacy Round',
      recruiterId: recruiterUser._id,
      candidateId: candidateUser._id,
      applicationId: application._id,
      workflowId,
      workflowNodeId,
      sequence: 1,
      roundName: 'Interview Round 1',
      scheduledTime: new Date(Date.now() + 60 * 60 * 1000),
      status: 'COMPLETED',
      roomId: 'legacy-round-1'
    });

    await expect(
      evaluateInterviewResult(application._id, recruiterUser._id, 'PASSED', 'Legacy flow')
    ).resolves.toBeTruthy();

    const updatedInterview = await InterviewRoom.findById(interview._id).lean();
    const updatedApplication = await Application.findById(application._id).lean();

    expect(updatedInterview.result).toBe('PASSED');
    expect(updatedApplication.workflowData.isWorkflowPaused).toBe(false);
    expect(updatedApplication.workflowData.waitingFor.type).toBeNull();
    expect(updatedApplication.workflowData.waitingFor.interviewRoomId).toBeNull();
    expect(publishNotificationStrictMock).toHaveBeenCalledWith(
      'workflow.execution.continue',
      expect.objectContaining({
        applicationId: application._id.toString(),
        workflowId: workflowId.toString(),
        currentNodeId: nextNodeId.toString(),
        retryCount: 0
      })
    );
  });
});
