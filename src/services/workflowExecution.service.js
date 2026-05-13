import mongoose from 'mongoose';
import axios from 'axios';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
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
import CandidateProfile from '../models/CandidateProfile.js';
import Job from '../models/Job.js';
import RecruiterProfile from '../models/RecruiterProfile.js';
import InterviewRoom from '../models/InterviewRoom.js';
import { EmailTemplate } from '../models/index.js';
import { applyApplicationStatusChange } from './application.service.js';

const WORKFLOW_EXECUTION_RETRY_MAX = parseInt(process.env.WORKFLOW_EXECUTION_RETRY_MAX || '3', 10);
const WORKFLOW_EXECUTION_RETRY_DELAY_MS = 5000;
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL;
const LLM_MODEL = process.env.LLM_MODEL || 'gemini-3-flash';
const APPLICATION_STATUS_VALUES = new Set(Application.schema.path('status').enumValues);

const extractTextFromPDF = async (buffer) => {
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += `${pageText}\n`;
  }

  return fullText;
};

const getApplicationCVText = async (application) => {
  if (!application?.submittedCV) return '';

  if (application.submittedCV.source === 'TEMPLATE' && application.submittedCV.templateSnapshot) {
    const snapshot = application.submittedCV.templateSnapshot;
    const rawText = typeof snapshot === 'object' ? JSON.stringify(snapshot) : String(snapshot);
    return rawText.slice(0, 5000);
  }

  if (application.submittedCV.source === 'UPLOADED' && application.submittedCV.path) {
    const response = await fetch(application.submittedCV.path);
    if (!response.ok) {
      throw new Error(`Không thể tải CV từ URL: ${application.submittedCV.path}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const pdfText = await extractTextFromPDF(uint8Array);
    return (pdfText || '').slice(0, 5000);
  }

  return '';
};

const scoreCVWithLLM = async ({ application, candidateProfile, job }) => {
  if (!LLM_API_KEY || !LLM_BASE_URL) {
    throw new AppError('Hệ thống AI chấm CV chưa được cấu hình', 500);
  }

  const cvText = await getApplicationCVText(application);
  const prompt = `Bạn là chuyên gia tuyển dụng. Hãy chấm điểm độ phù hợp CV ứng viên với JD theo thang 0-100.

BẮT BUỘC:
- Chỉ trả về JSON hợp lệ.
- Không thêm markdown, không thêm giải thích ngoài JSON.
- Format:
{
  "cv_score": number
}

Thông tin công việc:
- Tiêu đề: ${job?.title || 'N/A'}
- Mô tả: ${job?.description || 'N/A'}
- Yêu cầu: ${job?.requirements || 'N/A'}
- Kỹ năng: ${(job?.skills || []).join(', ') || 'N/A'}
- Kinh nghiệm: ${job?.experience || 'N/A'}

Thông tin ứng viên:
- Họ tên: ${candidateProfile?.fullname || application?.candidateName || 'N/A'}
- Bio: ${candidateProfile?.bio || 'N/A'}
- Skills: ${(candidateProfile?.skills || []).map((s) => `${s?.name || ''} (${s?.level || ''})`).filter(Boolean).join(', ') || 'N/A'}
- Kinh nghiệm: ${(candidateProfile?.experiences || []).map((e) => `${e?.position || ''} tại ${e?.company || ''}: ${e?.description || ''}`).join(' | ') || 'N/A'}
- Học vấn: ${(candidateProfile?.educations || []).map((e) => `${e?.degree || ''} ${e?.major || ''} ${e?.school || ''}`).join(' | ') || 'N/A'}
- Nội dung CV: ${cvText || 'N/A'}
`;

  const response = await axios.post(
    `${LLM_BASE_URL}/chat/completions`,
    {
      model: LLM_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Bạn là chuyên gia sàng lọc CV. Luôn trả về JSON hợp lệ.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.5,
      max_tokens: 120
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_API_KEY}`
      },
      timeout: 30000
    }
  );

  const content = response?.data?.choices?.[0]?.message?.content || '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('LLM không trả về JSON hợp lệ cho cv_score');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  logger.info(`LLM parsed response for CV scoring: ${JSON.stringify(parsed)}`);
  logger.info(`LLM raw cv_score value: ${parsed.cv_score}`);
  const rawScore = Number(parsed.cv_score);
  if (!Number.isFinite(rawScore)) {
    throw new Error('LLM trả về cv_score không hợp lệ');
  }

  return Math.max(0, Math.min(100, Math.round(rawScore)));
};

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

    // Cập nhật node hiện tại
    if (!application.workflowData) {
      application.workflowData = {};
    }
    application.workflowData.currentNodeId = currentNodeId.toString();
    application.workflowData.lastExecutionAt = new Date();
    await application.save();

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
      case 'ACTION_AI':
        nextNodeData = await executeActionAINode(application, node, executionLog);
        break;
      case 'ACTION_TEST':
        nextNodeData = await executeActionTestNode(application, node, executionLog);
        break;
      case 'ACTION_DELAY':
        nextNodeData = await executeActionDelayNode(application, node, executionLog);
        break;
      case 'END':
        nextNodeData = null;
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
  if (!application.workflowData) application.workflowData = {};

  const alreadyWaitingForThisInterview = application.workflowData.waitingFor?.type === 'INTERVIEW'
    && application.workflowData.waitingFor?.workflowNodeId === node._id.toString();

  if (node.config?.statusMapping && APPLICATION_STATUS_VALUES.has(node.config.statusMapping)) {
    applyApplicationStatusChange(application, node.config.statusMapping, {
      detail: node.config.statusMapping === 'SCHEDULED_INTERVIEW'
        ? 'Workflow đã chuyển hồ sơ sang vòng phỏng vấn'
        : `Workflow đã tự động chuyển hồ sơ sang trạng thái ${node.config.statusMapping}`
    });
  } else if (node.config?.statusMapping) {
    logger.warn(`Workflow node ${node._id} has unsupported application statusMapping "${node.config.statusMapping}". Skipping status update.`);
  }

  if (node.config && node.config.statusMapping !== 'SCHEDULED_INTERVIEW' && application.workflowData.waitingFor?.type === 'INTERVIEW') {
    application.workflowData.waitingFor = {
      type: null,
      workflowNodeId: null,
      interviewRoomId: null,
      requestedAt: null
    };
  }
  
  const connection = await WorkflowConnection.findOne({ sourceNodeId: node._id });

  // Nếu là vòng Phỏng vấn, thì dừng lại không chạy tiếp (tương tự như ACTION_TEST chờ làm bài)
  if (node.config && node.config.statusMapping === 'SCHEDULED_INTERVIEW') {
    application.workflowData.isWorkflowPaused = true;
    application.workflowData.pendingNextNodeId = connection ? connection.targetNodeId.toString() : null;
    application.workflowData.waitingFor = {
      type: 'INTERVIEW',
      workflowNodeId: node._id.toString(),
      interviewRoomId: null,
      requestedAt: new Date()
    };
    await application.save();

    if (!alreadyWaitingForThisInterview) {
      try {
        const job = await Job.findById(application.jobId);
        if (job && job.recruiterProfileId) {
          const recruiterProfile = await RecruiterProfile.findById(job.recruiterProfileId);
          if (recruiterProfile && recruiterProfile.userId) {
            const payload = {
              type: 'INTERVIEW_SCHEDULING_REQUIRED',
              recipientId: recruiterProfile.userId.toString(),
              data: {
                applicationId: application._id.toString(),
                title: 'Cần xếp lịch phỏng vấn',
                message: `Hồ sơ của ứng viên ${application.candidateName || 'Ứng viên'} (vị trí ${application.jobSnapshot?.title || job.title}) đã bước vào vòng Phỏng vấn. Vui lòng xếp lịch phỏng vấn cho ứng viên.`
              }
            };
            await queueService.publishNotificationStrict(ROUTING_KEYS.STATUS_UPDATE, payload);
          }
        }
      } catch (error) {
        logger.error(`Error sending INTERVIEW_SCHEDULING_REQUIRED notification to recruiter for application ${application._id}:`, error);
      }
    }

    return null; // Dừng lại chờ HR lên lịch, phỏng vấn và đánh giá
  }


  await application.save();

  if (connection) {
    return { nextNodeId: connection.targetNodeId };
  }
  return null;
};

const resolveConditionValue = async (application, field) => {
  if (field === 'test_score') {
    return application.test_score;
  }

  if (field === 'interview_result') {
    const workflowNodeId = application.workflowData?.waitingFor?.workflowNodeId || application.workflowData?.currentNodeId || null;

    const query = workflowNodeId
      ? {
        applicationId: application._id,
        workflowNodeId,
        result: { $in: ['PASSED', 'FAILED'] }
      }
      : {
        applicationId: application._id,
        result: { $in: ['PASSED', 'FAILED'] }
      };

    let interview = await InterviewRoom.findOne(query)
      .sort({ sequence: -1, createdAt: -1 });

    if (!interview && workflowNodeId) {
      interview = await InterviewRoom.findOne({
        applicationId: application._id,
        result: { $in: ['PASSED', 'FAILED'] }
      }).sort({ sequence: -1, createdAt: -1 });
    }

    if (!interview) {
      throw new Error(`Interview result not found for application ${application._id}`);
    }

    return interview.result;
  }

  return application[field];
};

const executeConditionNode = async (application, node, executionLog) => {
  const { field, operator, value } = node.config;
  let conditionResult = false;

  const actualValue = await resolveConditionValue(application, field);

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
  let { subject, template, recipient, customEmail, body, templateId } = node.config;

  // Fetch template content from DB if templateId is provided
  if (templateId) {
    try {
      const emailTemplate = await EmailTemplate.findById(templateId);
      if (emailTemplate) {
        subject = emailTemplate.subject;
        body = emailTemplate.body;
      }
    } catch (err) {
      logger.warn('Failed to fetch email template, falling back to inline config', err);
    }
  }

  const toAddress = recipient === 'CUSTOM' ? customEmail : application.candidateEmail;

  // --- PARSE VARIABLES ---
  const replaceVars = (text) => {
    let newText = text || '';
    const candidateName = application.candidateName || '';
    const jobTitle = application.jobSnapshot?.title || '';
    const companyName = application.jobSnapshot?.company || '';
    
    newText = newText.replace(/{{candidateName}}/g, candidateName);
    newText = newText.replace(/{{jobTitle}}/g, jobTitle);
    newText = newText.replace(/{{companyName}}/g, companyName);
    return newText;
  };

  const parsedSubject = replaceVars(subject || 'Thông báo từ hệ thống tuyển dụng');
  const parsedBody = replaceVars(body || '');

  try {
    await emailService.sendEmail({
      to: toAddress,
      subject: parsedSubject,
      template: template || 'basicNotification',
      data: {
        candidateName: application.candidateName,
        jobTitle: application.jobSnapshot?.title,
        companyName: application.jobSnapshot?.company,
        content: parsedBody
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

const executeActionAINode = async (application, node, executionLog) => {
  const { aiActionType } = node.config || {};

  if (aiActionType === 'CV_SCREENING') {
    const [candidateProfile, job] = await Promise.all([
      CandidateProfile.findById(application.candidateProfileId).lean(),
      Job.findById(application.jobId).lean()
    ]);

    const cvScore = await scoreCVWithLLM({ application, candidateProfile, job });

    application.cv_score = cvScore;
    await application.save();

    logger.info(`AI CV_SCREENING completed for application ${application._id}: ${cvScore} points`);
    executionLog.result.metadata = { aiActionType, score: cvScore };
  } else {
    logger.warn(`Unknown AI Action Type: ${aiActionType}`);
    executionLog.result.metadata = { aiActionType, warning: 'Unknown type' };
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

    if (candidateUserId) {
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
    }
    
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

const executeActionDelayNode = async (application, node, executionLog) => {
  const { delayValue, delayUnit } = node.config || {};
  
  if (!delayValue || isNaN(delayValue)) {
    logger.warn(`Action Delay Node ${node._id} has invalid delay config. Skipping delay.`);
    const connection = await WorkflowConnection.findOne({ sourceNodeId: node._id });
    if (connection) {
      return { nextNodeId: connection.targetNodeId };
    }
    return null;
  }

  let delayMs = 0;
  if (delayUnit === 'DAYS') {
    delayMs = delayValue * 24 * 60 * 60 * 1000;
  } else if (delayUnit === 'HOURS') {
    delayMs = delayValue * 60 * 60 * 1000;
  } else if (delayUnit === 'MINUTES') {
    delayMs = delayValue * 60 * 1000;
  } else {
    delayMs = delayValue * 24 * 60 * 60 * 1000;
  }

  const connection = await WorkflowConnection.findOne({ sourceNodeId: node._id });
  if (connection) {
    const targetNodeId = connection.targetNodeId.toString();
    application.workflowData.isWorkflowPaused = true;
    application.workflowData.resumeAt = new Date(Date.now() + delayMs);
    application.workflowData.pendingNextNodeId = targetNodeId;
    await application.save();

    logger.info(`Workflow for application ${application._id} paused at Delay Node ${node._id}. Resuming at ${application.workflowData.resumeAt}`);
    executionLog.result.metadata = { paused: true, resumeAt: application.workflowData.resumeAt };
    
    return null;
  }
  
  return null;
};

export const __private__ = {
  resolveConditionValue
};

export const retryFailedExecution = async (userId, executionId) => {
  const execution = await WorkflowExecution.findById(executionId);
  
  if (!execution) {
    throw new AppError('Không tìm thấy lịch sử thực thi này', 404);
  }

  if (execution.status !== 'FAILED') {
    throw new AppError('Chỉ có thể chạy lại các task đã bị THẤT BẠI (FAILED)', 400);
  }

  // Lấy workflow để check quyền
  const workflow = await Workflow.findById(execution.workflowId);
  if (!workflow) {
    throw new AppError('Workflow của task này không tồn tại', 404);
  }

  const recruiterProfile = await mongoose.model('RecruiterProfile').findOne({ userId }).lean();
  if (!recruiterProfile || workflow.companyId.toString() !== recruiterProfile._id.toString()) {
    throw new AppError('Bạn không có quyền thực hiện thao tác trên workflow này', 403);
  }

  // Update status and reset retry
  execution.status = 'RETRYING';
  execution.retryCount = 0;
  await execution.save();

  // Re-queue
  await queueService.publishNotificationStrict(ROUTING_KEYS.WORKFLOW_EXECUTION_CONTINUE, {
    applicationId: execution.applicationId.toString(),
    workflowId: execution.workflowId.toString(),
    currentNodeId: execution.nodeId.toString(),
    retryCount: 0
  });

  return { message: 'Đã đưa task vào hàng đợi chạy lại thành công' };
};
