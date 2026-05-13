import mongoose from 'mongoose';
import { jest } from '@jest/globals';
import {
  Application,
  CandidateProfile,
  Job,
  RecruiterProfile,
  User,
  Workflow,
  WorkflowConnection,
  WorkflowNode
} from '../../src/models/index.js';
import { ROUTING_KEYS } from '../../src/queues/rabbitmq.js';

const publishNotificationMock = jest.fn();
const publishNotificationStrictMock = jest.fn();

jest.unstable_mockModule('../../src/services/queue.service.js', () => ({
  publishNotification: publishNotificationMock,
  publishNotificationStrict: publishNotificationStrictMock
}));

const {
  executeWorkflowNode,
  startWorkflowForApplication
} = await import('../../src/services/workflowExecution.service.js');

describe('Workflow execution status side effects', () => {
  let recruiterUser;
  let candidateUser;
  let recruiterProfile;
  let candidateProfile;
  let workflow;
  let interviewNode;
  let endNode;
  let job;

  beforeEach(async () => {
    publishNotificationMock.mockReset();
    publishNotificationStrictMock.mockReset();

    recruiterUser = await User.create({
      email: 'workflow-status-recruiter@test.com',
      password: 'password123',
      role: 'recruiter',
      isEmailVerified: true
    });

    candidateUser = await User.create({
      email: 'workflow-status-candidate@test.com',
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

    workflow = await Workflow.create({
      name: 'Interview Workflow',
      description: '',
      companyId: recruiterProfile._id,
      status: 'ACTIVE',
      createdBy: recruiterUser._id,
      metadata: { version: 1, totalNodes: 2, totalConnections: 1 }
    });

    [interviewNode, endNode] = await WorkflowNode.create([
      {
        workflowId: workflow._id,
        type: 'STAGE',
        name: 'Interview',
        position: { x: 0, y: 0 },
        config: { statusMapping: 'SCHEDULED_INTERVIEW' }
      },
      {
        workflowId: workflow._id,
        type: 'END',
        name: 'End',
        position: { x: 200, y: 0 },
        config: {}
      }
    ]);

    await WorkflowConnection.create({
      workflowId: workflow._id,
      sourceNodeId: interviewNode._id,
      sourcePort: 'default',
      targetNodeId: endNode._id,
      targetPort: 'input'
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
      address: '1 Test Street',
      type: 'FULL_TIME',
      workType: 'REMOTE',
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      experience: 'MID_LEVEL',
      category: 'IT',
      skills: ['NodeJS'],
      recruiterProfileId: recruiterProfile._id,
      workflowId: workflow._id,
      status: 'ACTIVE',
      moderationStatus: 'APPROVED'
    });
  });

  const createApplication = async () => {
    return Application.create({
      jobId: job._id,
      candidateProfileId: candidateProfile._id,
      status: 'PENDING',
      lastStatusUpdateAt: new Date('2024-01-01T00:00:00.000Z'),
      candidateName: 'Candidate Test',
      candidateEmail: 'candidate@test.com',
      candidatePhone: '0900000000',
      jobSnapshot: {
        title: job.title,
        company: 'Workflow Co',
        logo: 'https://example.com/logo.png'
      }
    });
  };

  it('does not change application status before the first workflow node executes', async () => {
    const application = await createApplication();

    await startWorkflowForApplication(application._id.toString());

    const updated = await Application.findById(application._id).lean();
    expect(updated.status).toBe('PENDING');
    expect(updated.currentStageNodeId.toString()).toBe(interviewNode._id.toString());
    expect(publishNotificationStrictMock).toHaveBeenCalledWith(
      ROUTING_KEYS.WORKFLOW_EXECUTION_CONTINUE,
      expect.objectContaining({
        applicationId: application._id.toString(),
        currentNodeId: interviewNode._id.toString()
      })
    );
  });

  it('records status timestamp, activity history, and scheduling notification when first interview stage executes', async () => {
    const application = await createApplication();

    await startWorkflowForApplication(application._id.toString());
    await executeWorkflowNode({
      applicationId: application._id.toString(),
      workflowId: workflow._id.toString(),
      currentNodeId: interviewNode._id.toString(),
      retryCount: 0
    });

    const updated = await Application.findById(application._id).lean();
    expect(updated.status).toBe('SCHEDULED_INTERVIEW');
    expect(updated.lastStatusUpdateAt.getTime()).toBeGreaterThan(application.lastStatusUpdateAt.getTime());
    expect(updated.activityHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'SCHEDULED_INTERVIEW',
          detail: 'Workflow đã chuyển hồ sơ sang vòng phỏng vấn'
        })
      ])
    );
    expect(publishNotificationStrictMock).toHaveBeenCalledWith(
      ROUTING_KEYS.STATUS_UPDATE,
      expect.objectContaining({
        type: 'INTERVIEW_SCHEDULING_REQUIRED',
        recipientId: recruiterUser._id.toString()
      })
    );
  });

  it('does not write unsupported application status values to activity history', async () => {
    await WorkflowNode.findByIdAndUpdate(interviewNode._id, {
      $set: { config: { statusMapping: 'PENDING' } }
    });
    const application = await createApplication();

    await expect(executeWorkflowNode({
      applicationId: application._id.toString(),
      workflowId: workflow._id.toString(),
      currentNodeId: interviewNode._id.toString(),
      retryCount: 0
    })).resolves.toBe(true);

    const updated = await Application.findById(application._id).lean();
    expect(updated.status).toBe('PENDING');
    expect(updated.activityHistory).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'PENDING' })
      ])
    );
  });

  it('skips invalid stage status mappings instead of failing execution', async () => {
    await WorkflowNode.findByIdAndUpdate(interviewNode._id, {
      $set: { config: { statusMapping: 'REVIEWING' } }
    });
    const application = await createApplication();

    await expect(executeWorkflowNode({
      applicationId: application._id.toString(),
      workflowId: workflow._id.toString(),
      currentNodeId: interviewNode._id.toString(),
      retryCount: 0
    })).resolves.toBe(true);

    const updated = await Application.findById(application._id).lean();
    expect(updated.status).toBe('PENDING');
    expect(updated.activityHistory).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'REVIEWING' })
      ])
    );
  });
});
