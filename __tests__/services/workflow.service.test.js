import mongoose from 'mongoose';
import {
  Application,
  RecruiterProfile,
  User,
  Workflow,
  WorkflowConnection,
  WorkflowNode
} from '../../src/models/index.js';
import {
  activateWorkflow,
  cloneWorkflow,
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

  it('blocks update when applications have not reached END', async () => {
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

    await expect(
      updateWorkflow(recruiterUser._id.toString(), workflow._id.toString(), { name: 'WF Updated' })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Không thể chỉnh sửa hoặc xóa workflow khi còn hồ sơ chưa tới node END'
    });
  });

  it('allows update when all applications reached END', async () => {
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

    const updated = await updateWorkflow(recruiterUser._id.toString(), workflow._id.toString(), { name: 'WF Updated' });
    expect(updated.name).toBe('WF Updated');
  });

  it('blocks delete when applications have not reached END', async () => {
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

    await expect(
      deleteWorkflow(recruiterUser._id.toString(), workflow._id.toString())
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Không thể chỉnh sửa hoặc xóa workflow khi còn hồ sơ chưa tới node END'
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
