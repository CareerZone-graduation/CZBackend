import mongoose from 'mongoose';
import Application from '../models/Application.js';
import Workflow from '../models/Workflow.js';
import WorkflowNode from '../models/WorkflowNode.js';
import WorkflowConnection from '../models/WorkflowConnection.js';
import WorkflowExecution from '../models/WorkflowExecution.js';
import TestAssignment from '../models/TestAssignment.js';
import * as queueService from './queue.service.js';
import { ROUTING_KEYS } from '../queues/rabbitmq.js';
import * as emailService from './email.service.js';
import logger from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';
import config from '../config/index.js';
import CandidateProfile from '../models/CandidateProfile.js';

const WORKFLOW_EXECUTION_RETRY_MAX = parseInt(process.env.WORKFLOW_EXECUTION_RETRY_MAX || '3', 10);
const WORKFLOW_EXECUTION_RETRY_DELAY_MS = 5000;



export const startWorkflowForApplication = async (applicationId) => {
  const application = await Application.findById(applicationId).populate('jobId');
  if (!application) {
    throw new AppError('Application not found', 404);
  }

  const job = application.jobId;
  if (!job.workflowId) {
    logger.info(`Job ${job._id} does not have a workflow attached. Skipping workflow start.`);
    return;
  }

  const workflow = await Workflow.findById(job.workflowId);
  if (!workflow || workflow.status !== 'ACTIVE') {
    logger.info(`Workflow ${job.workflowId} not found or not active. Skipping workflow start.`);
    return;
  }

  // Find the first STAGE node (one with no incoming connections)
  const connections = await WorkflowConnection.find({ workflowId: workflow._id });
  const targetNodeIds = connections.map(conn => conn.targetNodeId.toString());

  const firstNode = await WorkflowNode.findOne({
    workflowId: workflow._id,
    type: 'STAGE',
    _id: { $nin: targetNodeIds }
  });

  if (!firstNode) {
    logger.error(`No starting STAGE node found for workflow ${workflow._id}`);
    return;
  }

  application.workflowId = workflow._id;
  application.currentStageNodeId = firstNode._id;

  // Set application status based on stage config status mapping
  if (firstNode.config && firstNode.config.statusMapping) {
    application.status = firstNode.config.statusMapping;
  }

  if (!application.workflowData) {
    application.workflowData = {};
  }
  application.workflowData.isWorkflowPaused = false;
  application.workflowData.lastExecutionAt = new Date();

  await application.save();

  // Publish to execution queue
  await queueService.publishNotificationStrict(ROUTING_KEYS.WORKFLOW_EXECUTION_CONTINUE, {
    applicationId: application._id.toString(),
    workflowId: workflow._id.toString(),
    currentNodeId: firstNode._id.toString(),
    retryCount: 0
  });

  logger.info(`Started workflow ${workflow._id} for application ${application._id}`);
};

export const executeWorkflowNode = async ({ applicationId, workflowId, currentNodeId, retryCount = 0, trigger }) => {
  let executionLog;
  let actualWorkflowId = workflowId;

  try {
    const application = await Application.findById(applicationId);
    if (!application) throw new AppError(`Application ${applicationId} not found`, 404);

    actualWorkflowId = workflowId || application.workflowId;

    // Handle TEST_COMPLETED trigger - resume from pending node
    if (trigger === 'TEST_COMPLETED') {
      if (application.workflowData?.pendingNextNodeId) {
        const pendingNodeId = application.workflowData.pendingNextNodeId;
        application.workflowData.pendingNextNodeId = null; // Use null instead of delete
        application.workflowData.isWorkflowPaused = false;
        await application.save();

        logger.info(`Resuming workflow after test completion, moving to node ${pendingNodeId}`);

        await queueService.publishNotificationStrict(ROUTING_KEYS.WORKFLOW_EXECUTION_CONTINUE, {
          applicationId,
          workflowId: actualWorkflowId,
          currentNodeId: pendingNodeId,
          retryCount: 0
        });
      } else {
        // Handle case where test node has no outgoing connections
        if (application.workflowData) application.workflowData.isWorkflowPaused = false;
        await application.save();
        logger.info(`Workflow for application ${applicationId} resumed after test but has no pending next node.`);
      }
      return true;
    }

    const node = await WorkflowNode.findById(currentNodeId);
    if (!node) throw new AppError(`Node ${currentNodeId} not found`, 404);

    // Create execution log
    executionLog = await WorkflowExecution.create({
      applicationId,
      workflowId: actualWorkflowId, // Use actualWorkflowId
      nodeId: currentNodeId,
      nodeType: node.type,
      nodeName: node.name,
      status: 'SUCCESS',
      retryCount,
      result: {}
    });

    let nextNodeData = null;

    switch (node.type) {
      case 'STAGE':
        nextNodeData = await executeStageNode(application, node, executionLog);
        break;
      case 'CONDITION':
        nextNodeData = await executeConditionNode(application, node, executionLog);
        break;
      case 'ACTION_EMAIL':
        nextNodeData = await executeActionEmailNode(application, node, executionLog);
        break;
      case 'ACTION_NOTIFY':
        nextNodeData = await executeActionNotifyNode(application, node, executionLog);
        break;
      case 'ACTION_TEST':
        nextNodeData = await executeActionTestNode(application, node, executionLog);
        break;
      default:
        logger.warn(`Unknown node type: ${node.type}`);
    }

    await executionLog.save();

    if (nextNodeData && nextNodeData.nextNodeId) {
      const nextNode = await WorkflowNode.findById(nextNodeData.nextNodeId);
      if (!nextNode) {
        logger.error(`Next node ${nextNodeData.nextNodeId} not found for workflow ${actualWorkflowId}`);
        return true;
      }
      if (nextNode.type === 'STAGE') {
        logger.info(`Workflow ${actualWorkflowId} for application ${applicationId} auto-entering next stage ${nextNode.name}.`);
      }

      await queueService.publishNotificationStrict(ROUTING_KEYS.WORKFLOW_EXECUTION_CONTINUE, {
        applicationId,
        workflowId: actualWorkflowId,
        currentNodeId: nextNodeData.nextNodeId.toString(),
        retryCount: 0
      });
    }

    return true;
  } catch (error) {
    logger.error(`Error executing workflow node ${currentNodeId} for application ${applicationId}`, error);

    if (executionLog) {
      if (retryCount < WORKFLOW_EXECUTION_RETRY_MAX) {
        executionLog.status = 'RETRYING';
        executionLog.result.errorMessage = error.message;
        await executionLog.save();

        const retryAfter = Date.now() + WORKFLOW_EXECUTION_RETRY_DELAY_MS * Math.pow(2, retryCount);
        await queueService.publishNotificationStrict(ROUTING_KEYS.WORKFLOW_EXECUTION_CONTINUE, {
          applicationId,
          workflowId: actualWorkflowId,
          currentNodeId,
          retryCount: retryCount + 1,
          retryAfter
        }).catch(err => logger.error('Failed to requeue retry', err));
      } else {
        executionLog.status = 'FAILED';
        executionLog.result.errorMessage = `Max retries reached: ${error.message}`;
        await executionLog.save();
      }
    }
    throw error;
  }
};

const executeStageNode = async (application, node, executionLog) => {
  application.currentStageNodeId = node._id;
  if (node.config && node.config.statusMapping) {
    application.status = node.config.statusMapping;
  }
  
  const connection = await WorkflowConnection.findOne({ sourceNodeId: node._id });

  // Nếu là vòng Phỏng vấn, thì dừng lại không chạy tiếp (tương tự như ACTION_TEST chờ làm bài)
  if (node.config && node.config.statusMapping === 'SCHEDULED_INTERVIEW') {
    if (!application.workflowData) application.workflowData = {};
    application.workflowData.isWorkflowPaused = true;
    application.workflowData.pendingNextNodeId = connection ? connection.targetNodeId.toString() : null;
    await application.save();
    return null; // Dừng lại chờ HR lên lịch, phỏng vấn và đánh giá
  }

  await application.save();

  if (connection) {
    return { nextNodeId: connection.targetNodeId };
  }
  return null;
};

const executeConditionNode = async (application, node, executionLog) => {
  const { field, operator, value } = node.config;
  let conditionResult = false;

  let actualValue;
  if (field === 'test_score') {
    actualValue = application.test_score;
  } else {
    actualValue = application[field];
  }

  switch (operator) {
    case '>': conditionResult = actualValue > value; break;
    case '<': conditionResult = actualValue < value; break;
    case '==': conditionResult = actualValue == value; break;
    case '>=': conditionResult = actualValue >= value; break;
    case '<=': conditionResult = actualValue <= value; break;
    case '!=': conditionResult = actualValue != value; break;
  }

  executionLog.result.conditionResult = conditionResult;

  const portToFollow = conditionResult ? 'true' : 'false';
  const connection = await WorkflowConnection.findOne({
    sourceNodeId: node._id,
    sourcePort: portToFollow
  });

  if (connection) {
    return { nextNodeId: connection.targetNodeId };
  }
  return null;
};

const executeActionEmailNode = async (application, node, executionLog) => {
  const { subject, template, recipient, customEmail, body } = node.config;

  const toAddress = recipient === 'CUSTOM' ? customEmail : application.candidateEmail;

  try {
    await emailService.sendEmail({
      to: toAddress,
      subject: subject || 'Thông báo từ hệ thống tuyển dụng',
      template: template || 'basicNotification',
      context: {
        candidateName: application.candidateName,
        jobTitle: application.jobSnapshot?.title,
        companyName: application.jobSnapshot?.company,
        content: body || ''
      }
    });

    executionLog.result.metadata = { sentTo: toAddress };
  } catch (err) {
    logger.error('Failed to send email in workflow action', err);
    throw err;
  }

  const connection = await WorkflowConnection.findOne({ sourceNodeId: node._id });
  if (connection) {
    return { nextNodeId: connection.targetNodeId };
  }
  return null;
};

const executeActionNotifyNode = async (application, node, executionLog) => {
  const { title, message, recipientRole } = node.config;

  const payload = {
    type: 'WORKFLOW_NOTIFICATION',
    data: {
      applicationId: application._id,
      title,
      message
    }
  };

  if (recipientRole === 'candidate') {
    const candidateProfile = await mongoose.model('CandidateProfile').findById(application.candidateProfileId);
    payload.recipientId = candidateProfile ? candidateProfile.userId.toString() : application.candidateProfileId;
  } else {
    const job = await mongoose.model('Job').findById(application.jobId).populate('recruiterProfileId');
    if (job && job.recruiterProfileId) {
      payload.recipientId = job.recruiterProfileId.userId.toString();
    }
  }

  if (payload.recipientId) {
    await queueService.publishNotificationStrict(ROUTING_KEYS.STATUS_UPDATE, payload);
    executionLog.result.metadata = { notified: payload.recipientId };
  }

  const connection = await WorkflowConnection.findOne({ sourceNodeId: node._id });
  if (connection) {
    return { nextNodeId: connection.targetNodeId };
  }
  return null;
};

const executeActionTestNode = async (application, node, executionLog) => {
  const { testId, timeLimitMinutes } = node.config;

  if (!testId) {
    throw new Error('Test ID is required for Action Test Node');
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 3);

  const assignment = await TestAssignment.create({
    testId,
    applicationId: application._id,
    candidateId: application.candidateProfileId,
    status: 'PENDING',
    expiresAt,
    timeSpent: 0
  });

  try {
    const candidateProfile = await CandidateProfile.findById(application.candidateProfileId);
    const candidateUserId = candidateProfile ? candidateProfile.userId.toString() : application.candidateProfileId;

    const payload = {
      type: 'WORKFLOW_NOTIFICATION',
      recipientId: candidateUserId,
      data: {
        applicationId: application._id,
        testAssignmentId: assignment._id,
        title: 'Yêu cầu làm bài kiểm tra năng lực',
        message: 'Nhà tuyển dụng vừa yêu cầu bạn hoàn thành một bài kiểm tra cho vòng tuyển dụng này. Vui lòng kiểm tra và hoàn thành trước hạn.'
      }
    };
    await queueService.publishNotificationStrict(ROUTING_KEYS.STATUS_UPDATE, payload);
    
    // await emailService.sendEmail({
    //   to: application.candidateEmail,
    //   subject: 'Yêu cầu làm bài kiểm tra tuyển dụng',
    //   template: 'basicNotification',
    //   context: {
    //     candidateName: application.candidateName,
    //     jobTitle: application.jobSnapshot?.title,
    //     companyName: application.jobSnapshot?.company,
    //     content: `Nhà tuyển dụng đã yêu cầu bạn làm một bài kiểm tra năng lực. Bạn có 3 ngày để hoàn thành bài test này tính từ lúc nhận email. Vui lòng đăng nhập vào hệ thống để làm bài.`
    //   }
    // });
  } catch (err) {
    logger.error('Failed to notify candidate about new test assignment', err);
  }

  // Find next connection to resume after test completion
  const connection = await WorkflowConnection.findOne({ sourceNodeId: node._id });

  if (!application.workflowData) {
    application.workflowData = {};
  }
  application.workflowData.isWorkflowPaused = true;
  if (connection) {
    application.workflowData.pendingNextNodeId = connection.targetNodeId.toString();
  }
  await application.save();

  executionLog.result.metadata = { testId, action: 'Paused workflow for test' };

  return null;
};

export const manualTransitionToStage = async ({ applicationId, userId, targetStageNodeId }) => {
  const application = await Application.findById(applicationId).populate('jobId');
  if (!application) throw new AppError('Application not found', 404);

  const job = application.jobId;

  if (userId) {
     const recruiterProfile = await mongoose.model('RecruiterProfile').findOne({ userId });
     if (!recruiterProfile || recruiterProfile._id.toString() !== job.recruiterProfileId.toString()) {
       throw new AppError('Unauthorized to modify this application', 403);
     }
  }

  const targetNode = await WorkflowNode.findOne({
    _id: targetStageNodeId,
    workflowId: application.workflowId,
    type: 'STAGE'
  });

  if (!targetNode) throw new AppError('Target stage node not found in this workflow', 404);

  if (!application.workflowData) {
    application.workflowData = {};
  }
  application.workflowData.isWorkflowPaused = false;
  application.currentStageNodeId = targetNode._id;

  if (STAGE_STATUS_MAPPING[targetNode.name]) {
    application.status = STAGE_STATUS_MAPPING[targetNode.name];
  }

  await application.save();

  await WorkflowExecution.create({
    applicationId,
    workflowId: application.workflowId,
    nodeId: targetNode._id,
    nodeType: 'STAGE',
    nodeName: targetNode.name,
    status: 'SUCCESS',
    executedBy: userId || 'SYSTEM',
    result: { metadata: { manualTransition: true } }
  });

  const connection = await WorkflowConnection.findOne({ sourceNodeId: targetNode._id });
  if (connection) {
    await queueService.publishNotificationStrict(ROUTING_KEYS.WORKFLOW_EXECUTION_CONTINUE, {
      applicationId: application._id.toString(),
      workflowId: application.workflowId.toString(),
      currentNodeId: connection.targetNodeId.toString(),
      retryCount: 0
    });
  }

  return application;
};
