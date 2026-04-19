import mongoose from 'mongoose';
import { Application, CandidateProfile, Test, TestAssignment } from '../models/index.js';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../utils/AppError.js';
import * as queueService from './queue.service.js';
import * as rabbitmq from '../queues/rabbitmq.js';

const toObjectId = (value, fieldName = 'ID') => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new BadRequestError(`${fieldName} không hợp lệ`);
  }
  return new mongoose.Types.ObjectId(value);
};

const getCandidateProfileByUserId = async (userId) => {
  const candidateProfile = await CandidateProfile.findOne({ userId }).select('_id userId').lean();
  if (!candidateProfile) {
    throw new UnauthorizedError('Bạn không có quyền truy cập chức năng này');
  }
  return candidateProfile;
};

const getAssignmentOwnershipContext = async (assignmentId, userId) => {
  const [candidateProfile, assignment] = await Promise.all([
    getCandidateProfileByUserId(userId),
    TestAssignment.findById(toObjectId(assignmentId, 'Assignment ID'))
      .populate('testId')
      .populate('applicationId')
  ]);

  if (!assignment) {
    throw new NotFoundError('Không tìm thấy bài test được giao');
  }

  const candidateOwnsByUser = String(assignment.candidateId) === String(userId);
  const candidateOwnsByProfile = assignment.applicationId?.candidateProfileId
    ? String(assignment.applicationId.candidateProfileId) === String(candidateProfile._id)
    : false;

  if (!candidateOwnsByUser || !candidateOwnsByProfile) {
    throw new UnauthorizedError('Bạn không có quyền truy cập bài test này');
  }

  return { candidateProfile, assignment };
};

const ensureAssignmentUsable = async (assignment, options = {}) => {
  const { allowCompleted = false } = options;

  if (!assignment.testId) {
    throw new NotFoundError('Không tìm thấy bài test');
  }

  if (!assignment.applicationId) {
    throw new NotFoundError('Không tìm thấy đơn ứng tuyển liên quan');
  }

  if (allowCompleted && assignment.status === 'COMPLETED') {
    return;
  }

  if (!allowCompleted && assignment.status === 'COMPLETED') {
    throw new BadRequestError('Bài test đã được nộp');
  }

  if (assignment.status === 'EXPIRED') {
    throw new BadRequestError('Bài test đã hết hạn');
  }

  if (assignment.expiresAt && new Date(assignment.expiresAt).getTime() < Date.now()) {
    assignment.status = 'EXPIRED';
    await assignment.save();
    throw new BadRequestError('Bài test đã hết hạn');
  }
};

const sanitizeQuestion = (question, includeCorrectAnswer = false) => ({
  _id: question._id,
  type: 'MULTIPLE_CHOICE',
  question: question.question,
  score: question.score,
  options: (question.options || []).map((opt) => ({
    _id: opt._id,
    text: opt.text,
    ...(includeCorrectAnswer && { isCorrect: opt.isCorrect })
  }))
});

const sanitizeAssignment = (assignment, { includeAnswers = true, includeResult = false } = {}) => {
  const obj = assignment.toObject ? assignment.toObject() : assignment;

  const safeQuestions = (obj.testId?.questions || []).map((q) => sanitizeQuestion(q, includeResult));

  const response = {
    _id: obj._id,
    status: obj.status,
    assignedAt: obj.assignedAt,
    expiresAt: obj.expiresAt,
    startedAt: obj.startedAt,
    completedAt: obj.completedAt,
    timeSpent: obj.timeSpent,
    answers: includeAnswers ? obj.answers : [],
    test: obj.testId
      ? {
        _id: obj.testId._id,
        name: obj.testId.name,
        description: obj.testId.description,
        duration: obj.testId.duration,
        passingScore: obj.testId.passingScore,
        totalScore: obj.testId.totalScore,
        questions: safeQuestions
      }
      : null,
    applicationId: obj.applicationId?._id || obj.applicationId
  };

  if (includeResult) {
    response.result = {
      score: obj.score,
      totalScore: obj.totalScore,
      passed: obj.passed
    };
  }

  return response;
};

const gradeAnswers = (test, incomingAnswers = []) => {
  const questionMap = new Map((test.questions || []).map((q) => [String(q._id), q]));
  const dedupMap = new Map();

  for (const ans of incomingAnswers) {
    if (!ans?.questionId) continue;
    dedupMap.set(String(ans.questionId), ans);
  }

  const gradedAnswers = [];
  let score = 0;

  for (const question of test.questions || []) {
    const key = String(question._id);
    const submitted = dedupMap.get(key);

    let isCorrect = false;
    let selectedOptionId = null;
    let booleanAnswer = null;

    if (submitted) {
      if (question.type === 'MULTIPLE_CHOICE') {
        const submittedOptionId = submitted.selectedOptionId ? String(submitted.selectedOptionId) : null;
        selectedOptionId = submittedOptionId ? new mongoose.Types.ObjectId(submittedOptionId) : null;

        const correctOption = (question.options || []).find((opt) => !!opt.isCorrect);
        isCorrect = !!correctOption && String(correctOption._id) === submittedOptionId;
      }
    }

    const scoreEarned = isCorrect ? (Number(question.score) || 0) : 0;
    score += scoreEarned;

    gradedAnswers.push({
      questionId: question._id,
      selectedOptionId,
      booleanAnswer,
      isCorrect,
      scoreEarned
    });
  }

  return {
    gradedAnswers,
    score,
    totalScore: Number(test.totalScore) || 0,
    passed: score >= (Number(test.passingScore) || 0)
  };
};

const WORKFLOW_CONTINUE_ROUTING_KEY = rabbitmq.ROUTING_KEYS.WORKFLOW_EXECUTION_CONTINUE;

const publishWorkflowContinueEvent = async ({ applicationId, testAssignmentId, score, totalScore, passed }) => {
  if (!WORKFLOW_CONTINUE_ROUTING_KEY) {
    throw new BadRequestError('Cấu hình workflow execution routing key chưa sẵn sàng');
  }

  try {
    await queueService.publishNotificationStrict(WORKFLOW_CONTINUE_ROUTING_KEY, {
      applicationId: String(applicationId),
      trigger: 'TEST_COMPLETED',
      data: {
        testAssignmentId: String(testAssignmentId),
        score,
        totalScore,
        passed
      }
    });
  } catch (error) {
    throw new BadRequestError('Không thể gửi tín hiệu tiếp tục workflow, vui lòng thử lại');
  }
};

export const getAssignmentForCandidate = async (userId, assignmentId) => {
  const { assignment } = await getAssignmentOwnershipContext(assignmentId, userId);

  await ensureAssignmentUsable(assignment);

  return sanitizeAssignment(assignment, { includeAnswers: true, includeResult: false });
};

export const startAssignment = async (userId, assignmentId) => {
  const { assignment } = await getAssignmentOwnershipContext(assignmentId, userId);

  await ensureAssignmentUsable(assignment);

  if (!assignment.startedAt) {
    assignment.startedAt = new Date();
  }

  if (assignment.status === 'PENDING') {
    assignment.status = 'IN_PROGRESS';
  }

  await assignment.save();

  return sanitizeAssignment(assignment, { includeAnswers: true, includeResult: false });
};

export const saveAnswer = async (userId, assignmentId, payload = {}) => {
  const { assignment } = await getAssignmentOwnershipContext(assignmentId, userId);

  await ensureAssignmentUsable(assignment);

  if (assignment.status === 'PENDING') {
    assignment.status = 'IN_PROGRESS';
    assignment.startedAt = assignment.startedAt || new Date();
  }

  const questionId = toObjectId(payload.questionId, 'Question ID');
  const question = assignment.testId.questions.id(questionId);

  if (!question) {
    throw new BadRequestError('Câu trả lời không thuộc bài test này');
  }

  if (!payload.selectedOptionId) {
    throw new BadRequestError('Vui lòng chọn đáp án');
  }

  const selectedOptionId = toObjectId(payload.selectedOptionId, 'Option ID');
  const optionExists = (question.options || []).some((opt) => String(opt._id) === String(selectedOptionId));

  if (!optionExists) {
    throw new BadRequestError('Đáp án không hợp lệ cho câu hỏi này');
  }

  const correctOption = (question.options || []).find((opt) => opt.isCorrect);
  const isCorrect = correctOption ? String(correctOption._id) === String(selectedOptionId) : false;
  const scoreEarned = isCorrect ? (Number(question.score) || 0) : 0;

  const index = assignment.answers.findIndex((a) => String(a.questionId) === String(questionId));
  const answerDoc = {
    questionId,
    selectedOptionId,
    booleanAnswer: null,
    isCorrect,
    scoreEarned
  };

  if (index >= 0) {
    assignment.answers[index] = answerDoc;
    assignment.markModified('answers');
  } else {
    assignment.answers.push(answerDoc);
  }

  await assignment.save();

  return {
    message: 'Lưu câu trả lời thành công',
    answers: assignment.answers
  };
};

export const submitAssignment = async (userId, assignmentId, payload = {}) => {
  const { assignment } = await getAssignmentOwnershipContext(assignmentId, userId);

  await ensureAssignmentUsable(assignment, { allowCompleted: true });

  const application = await Application.findById(assignment.applicationId._id || assignment.applicationId);
  if (!application) {
    throw new NotFoundError('Không tìm thấy đơn ứng tuyển liên quan');
  }

  if (assignment.status === 'COMPLETED') {
    if (application.workflowData?.isWorkflowPaused) {
      await publishWorkflowContinueEvent({
        applicationId: application._id,
        testAssignmentId: assignment._id,
        score: assignment.score,
        totalScore: assignment.totalScore,
        passed: assignment.passed
      });

      application.workflowData.isWorkflowPaused = false;
      application.workflowData.lastExecutionAt = new Date();
      await application.save();

      return {
        message: 'Đã gửi lại tín hiệu tiếp tục workflow thành công',
        assignment: sanitizeAssignment(assignment, { includeAnswers: true, includeResult: true })
      };
    }

    throw new BadRequestError('Bài test đã được nộp');
  }

  if (assignment.status === 'PENDING') {
    assignment.status = 'IN_PROGRESS';
    assignment.startedAt = assignment.startedAt || new Date();
  }

  const { gradedAnswers, score, totalScore, passed } = gradeAnswers(assignment.testId, assignment.answers || []);

  assignment.answers = gradedAnswers;
  assignment.score = score;
  assignment.totalScore = totalScore;
  assignment.passed = passed;
  assignment.status = 'COMPLETED';
  assignment.completedAt = new Date();

  if (Number.isFinite(payload.timeSpent) && payload.timeSpent >= 0) {
    assignment.timeSpent = payload.timeSpent;
  } else if (assignment.startedAt) {
    assignment.timeSpent = Math.max(0, Math.floor((Date.now() - new Date(assignment.startedAt).getTime()) / 1000));
  }

  application.test_score = score;

  if (!application.workflowData) {
    application.workflowData = {};
  }

  application.workflowData.isWorkflowPaused = true;
  application.workflowData.lastExecutionAt = new Date();

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await assignment.save({ session });
      await application.save({ session });
    });
  } finally {
    await session.endSession();
  }

  await publishWorkflowContinueEvent({
    applicationId: application._id,
    testAssignmentId: assignment._id,
    score,
    totalScore,
    passed
  });

  application.workflowData.isWorkflowPaused = false;
  application.workflowData.lastExecutionAt = new Date();
  await application.save();

  return {
    message: 'Nộp bài test thành công',
    assignment: sanitizeAssignment(assignment, { includeAnswers: true, includeResult: true })
  };
};

export const getAssignmentResult = async (userId, assignmentId) => {
  const { assignment } = await getAssignmentOwnershipContext(assignmentId, userId);

  if (assignment.status !== 'COMPLETED') {
    throw new BadRequestError('Bài test chưa được nộp');
  }

  return sanitizeAssignment(assignment, { includeAnswers: true, includeResult: true });
};

export const ensureCandidateOwnsAssignment = async (userId, assignmentId) => {
  const { assignment } = await getAssignmentOwnershipContext(assignmentId, userId);
  return assignment;
};

export const createAssignment = async ({ testId, applicationId, candidateId, expiresAt }) => {
  const [test, application] = await Promise.all([
    Test.findById(toObjectId(testId, 'Test ID')).lean(),
    Application.findById(toObjectId(applicationId, 'Application ID')).lean()
  ]);

  if (!test) {
    throw new NotFoundError('Không tìm thấy bài test');
  }

  if (!application) {
    throw new NotFoundError('Không tìm thấy đơn ứng tuyển');
  }

  const expiresAtDate = new Date(expiresAt);
  if (Number.isNaN(expiresAtDate.getTime())) {
    throw new BadRequestError('Thời gian hết hạn không hợp lệ');
  }

  if (expiresAtDate.getTime() <= Date.now()) {
    throw new BadRequestError('Thời gian hết hạn phải lớn hơn thời điểm hiện tại');
  }

  const assignment = await TestAssignment.create({
    testId: test._id,
    applicationId: application._id,
    candidateId: toObjectId(candidateId, 'Candidate ID'),
    expiresAt: expiresAtDate,
    totalScore: test.totalScore || 0,
    status: 'PENDING'
  });

  await Test.findByIdAndUpdate(test._id, { $inc: { usageCount: 1 } });

  return assignment.toObject();
};
