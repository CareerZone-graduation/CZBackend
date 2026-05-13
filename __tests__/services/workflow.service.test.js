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
import {
  activateWorkflow,
  cloneWorkflow,
  createNode,
  deleteWorkflow,
  updateWorkflow
} from '../../src/services/workflow.service.js';

describe('Workflow END guards', () => {
  let recruiterUser;
  let recruiterProfile;

  beforeEach(async () => {
    recruiterUser = await User.create({
      email: 'workflow-owner@test.com',
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

  const createWorkflowBase = async () => {
    return Workflow.create({
      name: 'WF Test',
      description: '',
      companyId: recruiterProfile._id,
      isTemplate: false,
      status: 'INACTIVE',
      createdBy: recruiterUser._id,
      metadata: {
        version: 1,
        totalNodes: 0,
        totalConnections: 0
      }
    });
  };

  const createApplicationInWorkflow = async (workflowId, currentNodeId) => {
    return Application.create({
      jobId: new mongoose.Types.ObjectId(),
      candidateProfileId: new mongoose.Types.ObjectId(),
      workflowId,
      workflowData: {
        currentNodeId: currentNodeId ? currentNodeId.toString() : null
      },
      candidateName: 'Candidate Test',
      candidateEmail: 'candidate@test.com',
      candidatePhone: '0900000000',
      jobSnapshot: {
        title: 'Job Test',
        company: 'Workflow Co',
        logo: 'https://example.com/logo.png'
      }
    });
  };

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

  it('rejects activation when workflow has no END node', async () => {
    const workflow = await createWorkflowBase();

    await WorkflowNode.create({
      workflowId: workflow._id,
      type: 'STAGE',
      name: 'Start',
      position: { x: 0, y: 0 },
      config: { statusMapping: 'PENDING' }
    });

    await expect(
      activateWorkflow(recruiterUser._id.toString(), workflow._id.toString())
    ).rejects.toMatchObject({
      statusCode: 422,
      message: 'Workflow phải có ít nhất một node END'
    });
  });

  it('rejects update to ACTIVE when workflow graph is invalid', async () => {
    const workflow = await createWorkflowBase();

    await WorkflowNode.create({
      workflowId: workflow._id,
      type: 'STAGE',
      name: 'Start',
      position: { x: 0, y: 0 },
      config: { statusMapping: 'PENDING' }
    });

    await expect(
      updateWorkflow(recruiterUser._id.toString(), workflow._id.toString(), { status: 'ACTIVE' })
    ).rejects.toMatchObject({
      statusCode: 422,
      message: 'Workflow phải có ít nhất một node END'
    });
  });

  it('rejects activation when condition node is missing false branch', async () => {
    const workflow = await createWorkflowBase();

    const [startNode, conditionNode, endNode] = await WorkflowNode.create([
      {
        workflowId: workflow._id,
        type: 'STAGE',
        name: 'Start',
        position: { x: 0, y: 0 },
        config: { statusMapping: 'PENDING' }
      },
      {
        workflowId: workflow._id,
        type: 'CONDITION',
        name: 'Score Check',
        position: { x: 240, y: 0 },
        config: { field: 'cv_score', operator: '>=', value: 70 }
      },
      {
        workflowId: workflow._id,
        type: 'END',
        name: 'End',
        position: { x: 480, y: 0 },
        config: {}
      }
    ]);

    await WorkflowConnection.create([
      {
        workflowId: workflow._id,
        sourceNodeId: startNode._id,
        sourcePort: 'default',
        targetNodeId: conditionNode._id,
        targetPort: 'input'
      },
      {
        workflowId: workflow._id,
        sourceNodeId: conditionNode._id,
        sourcePort: 'true',
        targetNodeId: endNode._id,
        targetPort: 'input'
      }
    ]);

    await expect(
      activateWorkflow(recruiterUser._id.toString(), workflow._id.toString())
    ).rejects.toMatchObject({
      statusCode: 422,
      message: 'Node điều kiện phải có đúng một kết nối cho nhánh true và đúng một kết nối cho nhánh false'
    });
  });

  it('rejects activation when a branch cannot reach END', async () => {
    const workflow = await createWorkflowBase();

    const [startNode, emailNode, endNode] = await WorkflowNode.create([
      {
        workflowId: workflow._id,
        type: 'STAGE',
        name: 'Start',
        position: { x: 0, y: 0 },
        config: { statusMapping: 'PENDING' }
      },
      {
        workflowId: workflow._id,
        type: 'ACTION_EMAIL',
        name: 'Email',
        position: { x: 0, y: 140 },
        config: {}
      },
      {
        workflowId: workflow._id,
        type: 'END',
        name: 'End',
        position: { x: 240, y: 140 },
        config: {}
      }
    ]);

    await WorkflowConnection.create([
      {
        workflowId: workflow._id,
        sourceNodeId: startNode._id,
        sourcePort: 'default',
        targetNodeId: emailNode._id,
        targetPort: 'input'
      },
      {
        workflowId: workflow._id,
        sourceNodeId: startNode._id,
        sourcePort: 'default',
        targetNodeId: endNode._id,
        targetPort: 'input'
      }
    ]);

    await expect(
      activateWorkflow(recruiterUser._id.toString(), workflow._id.toString())
    ).rejects.toMatchObject({
      statusCode: 422,
      message: 'Workflow không hợp lệ: mọi nhánh phải dẫn đến node END'
    });
  });

  it('rejects activation when stage maps to unsupported application status', async () => {
    const workflow = await createWorkflowBase();

    const [startNode, endNode] = await WorkflowNode.create([
      {
        workflowId: workflow._id,
        type: 'STAGE',
        name: 'Start',
        position: { x: 0, y: 0 },
        config: { statusMapping: 'REVIEWING' }
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

    await expect(
      activateWorkflow(recruiterUser._id.toString(), workflow._id.toString())
    ).rejects.toMatchObject({
      statusCode: 422,
      message: 'Trạng thái "REVIEWING" không hợp lệ cho workflow'
    });
  });

  it('allows updating workflow metadata even when applications exist', async () => {
    const workflow = await createWorkflowBase();

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

    await createApplicationInWorkflow(workflow._id, startNode._id);

    const updated = await updateWorkflow(recruiterUser._id.toString(), workflow._id.toString(), {
      name: 'WF Updated',
      description: 'WF Description Updated'
    });
    expect(updated.name).toBe('WF Updated');
    expect(updated.description).toBe('WF Description Updated');
  });

  it('blocks structural edits when applications already exist, including applications at END node', async () => {
    const workflow = await createWorkflowBase();

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

    await createApplicationInWorkflow(workflow._id, endNode._id);

    await expect(
      createNode(recruiterUser._id.toString(), workflow._id.toString(), {
        type: 'ACTION_EMAIL',
        name: 'Email Node',
        position: { x: 320, y: 0 },
        config: {}
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Không thể chỉnh sửa cấu trúc workflow sau khi đã có ứng viên ứng tuyển'
    });
  });

  it('blocks delete when applications already exist, even when all are at END', async () => {
    const workflow = await createWorkflowBase();

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

    await createApplicationInWorkflow(workflow._id, endNode._id);

    await expect(
      deleteWorkflow(recruiterUser._id.toString(), workflow._id.toString())
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Không thể chỉnh sửa cấu trúc workflow sau khi đã có ứng viên ứng tuyển'
    });
  });

  it('archives linked workflow when linked job is expired, even when applications already exist', async () => {
    const workflow = await createWorkflowBase();

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

    await Job.create(createJobPayload({
      title: 'Job Current',
      workflowId: workflow._id,
      hasCustomWorkflow: true,
      status: 'EXPIRED',
      deadline: new Date(Date.now() - 24 * 60 * 60 * 1000)
    }));

    await createApplicationInWorkflow(workflow._id, endNode._id);

    const result = await deleteWorkflow(recruiterUser._id.toString(), workflow._id.toString());
    expect(result.message).toBe('Lưu trữ workflow thành công');

    const archivedWorkflow = await Workflow.findById(workflow._id).lean();
    expect(archivedWorkflow.isArchived).toBe(true);
    expect(archivedWorkflow.status).toBe('INACTIVE');

    expect(await WorkflowNode.countDocuments({ workflowId: workflow._id })).toBe(2);
    expect(await WorkflowConnection.countDocuments({ workflowId: workflow._id })).toBe(1);
  });

  it('blocks archive when linked job is not expired yet', async () => {
    const workflow = await createWorkflowBase();

    await Job.create(createJobPayload({
      title: 'Job Active',
      workflowId: workflow._id,
      hasCustomWorkflow: true,
      status: 'ACTIVE',
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }));

    await expect(
      deleteWorkflow(recruiterUser._id.toString(), workflow._id.toString())
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Chỉ có thể lưu trữ workflow khi tất cả job liên kết đã hết hạn ứng tuyển'
    });
  });

  it('clones workflow with nodes and connections', async () => {
    const workflow = await createWorkflowBase();

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

    const cloned = await cloneWorkflow(recruiterUser._id.toString(), workflow._id.toString(), {});
    expect(cloned._id.toString()).not.toBe(workflow._id.toString());
    expect(cloned.status).toBe('INACTIVE');
    expect(cloned.nodes).toHaveLength(2);
    expect(cloned.connections).toHaveLength(1);
    expect(cloned.name).toContain('(Bản sao)');
  });
});
