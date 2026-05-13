import mongoose from 'mongoose';
import {
  Application,
  InterviewRoom,
  Workflow,
  WorkflowConnection,
  WorkflowNode
} from '../../src/models/index.js';
import {
  __private__,
  executeWorkflowNode
} from '../../src/services/workflowExecution.service.js';

const { resolveConditionValue } = __private__;

describe('Workflow execution interview stage metadata', () => {
  it('pauses workflow at interview stage with waitingFor metadata', async () => {
    const workflow = await Workflow.create({
      name: 'WF',
      description: '',
      companyId: new mongoose.Types.ObjectId(),
      status: 'ACTIVE',
      createdBy: new mongoose.Types.ObjectId(),
      metadata: { version: 1, totalNodes: 2, totalConnections: 1 }
    });

    const [interviewNode, endNode] = await WorkflowNode.create([
      {
        workflowId: workflow._id,
        type: 'STAGE',
        name: 'Interview 1',
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

    const application = await Application.create({
      jobId: new mongoose.Types.ObjectId(),
      candidateProfileId: new mongoose.Types.ObjectId(),
      workflowId: workflow._id,
      candidateName: 'Candidate Test',
      candidateEmail: 'candidate@test.com',
      candidatePhone: '0900000000',
      jobSnapshot: {
        title: 'Job Test',
        company: 'Workflow Co',
        logo: 'https://example.com/logo.png'
      }
    });

    await executeWorkflowNode({
      applicationId: application._id.toString(),
      workflowId: workflow._id.toString(),
      currentNodeId: interviewNode._id.toString(),
      retryCount: 0
    });

    const updated = await Application.findById(application._id).lean();

    expect(updated.workflowData.isWorkflowPaused).toBe(true);
    expect(updated.workflowData.pendingNextNodeId).toBe(endNode._id.toString());
    expect(updated.workflowData.waitingFor.type).toBe('INTERVIEW');
    expect(updated.workflowData.waitingFor.workflowNodeId).toBe(interviewNode._id.toString());
    expect(updated.workflowData.waitingFor.interviewRoomId).toBeNull();
    expect(updated.workflowData.waitingFor.requestedAt).toEqual(expect.any(Date));
  });

  it('evaluates interview_result from the latest room of the matching workflow node', async () => {
    const workflowId = new mongoose.Types.ObjectId();
    const interviewNodeId = new mongoose.Types.ObjectId();

    const application = await Application.create({
      jobId: new mongoose.Types.ObjectId(),
      candidateProfileId: new mongoose.Types.ObjectId(),
      workflowId,
      candidateName: 'Candidate',
      candidateEmail: 'candidate@test.com',
      candidatePhone: '0900000000',
      jobSnapshot: {
        title: 'Job Test',
        company: 'Workflow Co',
        logo: 'https://example.com/logo.png'
      },
      workflowData: {
        waitingFor: {
          type: null,
          workflowNodeId: interviewNodeId.toString(),
          interviewRoomId: null,
          requestedAt: null
        }
      }
    });

    await InterviewRoom.create({
      roomName: 'Round 1',
      recruiterId: new mongoose.Types.ObjectId(),
      candidateId: new mongoose.Types.ObjectId(),
      applicationId: application._id,
      workflowId,
      workflowNodeId: interviewNodeId,
      sequence: 1,
      scheduledTime: new Date(Date.now() + 3600000),
      status: 'COMPLETED',
      result: 'PASSED'
    });

    const actualValue = await resolveConditionValue(application, 'interview_result');

    expect(actualValue).toBe('PASSED');
  });
});
