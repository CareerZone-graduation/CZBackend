import mongoose from 'mongoose';
import {
  Application,
  Job,
  RecruiterProfile,
  User,
  Workflow,
  WorkflowConnection,
  WorkflowNode
} from '../../src/models/index.js';
import { updateJob } from '../../src/services/job.service.js';

describe('Job workflow assignment constraints', () => {
  let recruiterUser;
  let recruiterProfile;

  const createJobPayload = (overrides = {}) => ({
    title: 'Senior NodeJS Developer',
    description: 'A great job opportunity.',
    requirements: 'NodeJS, MongoDB',
    benefits: 'Good salary',
    location: {
      province: 'Thành phố Hồ Chí Minh',
      district: 'Quận 1',
      commune: 'Phường Tân Định',
      ward: 'Tân Định',
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
    moderationStatus: 'APPROVED',
    ...overrides
  });

  beforeEach(async () => {
    recruiterUser = await User.create({
      email: 'workflow-assign-owner@test.com',
      password: 'password123',
      role: 'recruiter',
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
  });

  it('blocks assigning one workflow to two jobs at same time', async () => {
    const workflow = await Workflow.create({
      name: 'WF One',
      description: '',
      companyId: recruiterProfile._id,
      status: 'INACTIVE',
      createdBy: recruiterUser._id,
      metadata: { version: 1, totalNodes: 0, totalConnections: 0 }
    });

    await Job.create(createJobPayload({
      title: 'Job A',
      workflowId: workflow._id,
      hasCustomWorkflow: true
    }));

    const jobB = await Job.create(createJobPayload({ title: 'Job B' }));

    await expect(
      updateJob(jobB._id.toString(), recruiterUser._id.toString(), { workflowId: workflow._id.toString() })
    ).rejects.toMatchObject({
      statusCode: 400
    });
  });

  it('blocks unassigning workflow from current job when active applications exist', async () => {
    const workflow = await Workflow.create({
      name: 'WF Active',
      description: '',
      companyId: recruiterProfile._id,
      status: 'INACTIVE',
      createdBy: recruiterUser._id,
      metadata: { version: 1, totalNodes: 0, totalConnections: 0 }
    });

    const [startNode, endNode] = await WorkflowNode.create([
      {
        workflowId: workflow._id,
        type: 'STAGE',
        name: 'Start',
        position: { x: 0, y: 0 },
        config: { statusMapping: 'PENDING' }
      },
      {
        workflowId: workflow._id,
        type: 'END',
        name: 'End',
        position: { x: 240, y: 0 },
        config: {}
      }
    ]);

    await WorkflowConnection.create({
      workflowId: workflow._id,
      sourceNodeId: startNode._id,
      sourcePort: 'default',
      targetNodeId: endNode._id,
      targetPort: 'input'
    });

    const job = await Job.create(createJobPayload({
      title: 'Job Current',
      workflowId: workflow._id,
      hasCustomWorkflow: true
    }));

    await Application.create({
      jobId: job._id,
      candidateProfileId: new mongoose.Types.ObjectId(),
      workflowId: workflow._id,
      workflowData: { currentNodeId: startNode._id.toString() },
      candidateName: 'Candidate Test',
      candidateEmail: 'candidate@test.com',
      candidatePhone: '0900000000',
      jobSnapshot: {
        title: 'Job Current',
        company: 'Workflow Co',
        logo: 'https://example.com/logo.png'
      }
    });

    await expect(
      updateJob(job._id.toString(), recruiterUser._id.toString(), { workflowId: null })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Không thể đổi job gán workflow khi còn hồ sơ chưa tới node END.'
    });
  });
});
