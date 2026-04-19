import mongoose from 'mongoose';
import { RecruiterProfile, Test, TestAssignment } from '../models/index.js';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../utils/AppError.js';

const toObjectId = (value, fieldName = 'ID') => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new BadRequestError(`${fieldName} không hợp lệ`);
  }
  return new mongoose.Types.ObjectId(value);
};

const ensureValidPagination = (query = {}) => {
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);

  if (Number.isNaN(page) || page < 1 || Number.isNaN(limit) || limit < 1 || limit > 100) {
    throw new BadRequestError('Thông tin phân trang không hợp lệ');
  }

  return { page, limit, skip: (page - 1) * limit };
};

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const countCorrectOptions = (options = []) => options.filter((opt) => !!opt.isCorrect).length;

const validateMultipleChoiceOptions = (options = [], { allowUndefined = false } = {}) => {
  if (typeof options === 'undefined' && allowUndefined) return;

  if (!Array.isArray(options) || options.length < 2) {
    throw new BadRequestError('Câu hỏi trắc nghiệm phải có ít nhất 2 đáp án');
  }

  const correctCount = countCorrectOptions(options);
  if (correctCount !== 1) {
    throw new BadRequestError('Câu hỏi trắc nghiệm phải có đúng 1 đáp án đúng');
  }
};

const validateQuestionByType = (question, { partial = false } = {}) => {
  if (!partial && !question?.type) {
    throw new BadRequestError('Loại câu hỏi là bắt buộc');
  }

  const type = question?.type;
  if (!type) return;

  if (!['MULTIPLE_CHOICE'].includes(type)) {
    throw new BadRequestError('Loại câu hỏi không hợp lệ');
  }

  if (type === 'MULTIPLE_CHOICE') {
    validateMultipleChoiceOptions(question.options, { allowUndefined: partial });
  }

  if (!partial && (!question.question || !question.question.trim())) {
    throw new BadRequestError('Nội dung câu hỏi là bắt buộc');
  }

  if (!partial && (!Number.isFinite(question.score) || question.score < 1)) {
    throw new BadRequestError('Điểm câu hỏi phải lớn hơn 0');
  }
};

const normalizeQuestionForPersist = (question = {}) => {
  return {
    type: 'MULTIPLE_CHOICE',
    question: question.question,
    score: question.score,
    options: question.options
  };
};

const recalculateTotalScore = (questions = []) =>
  questions.reduce((sum, q) => sum + (Number(q.score) || 0), 0);

export const findRecruiterProfileByUserId = async (userId) => {
  const recruiterProfile = await RecruiterProfile.findOne({ userId }).lean();
  if (!recruiterProfile) {
    throw new UnauthorizedError('Bạn không có quyền truy cập chức năng này');
  }
  return recruiterProfile;
};

const getTestOwnershipContext = async (testId, userId) => {
  const [recruiterProfile, test] = await Promise.all([
    findRecruiterProfileByUserId(userId),
    Test.findById(toObjectId(testId, 'Test ID'))
  ]);

  if (!test) {
    throw new NotFoundError('Không tìm thấy bài test');
  }

  if (String(test.companyId) !== String(recruiterProfile._id)) {
    throw new UnauthorizedError('Bạn không có quyền truy cập bài test này');
  }

  return { recruiterProfile, test };
};

export const listTests = async (userId, query = {}) => {
  const recruiterProfile = await findRecruiterProfileByUserId(userId);
  const { page, limit, skip } = ensureValidPagination(query);

  const filter = { companyId: recruiterProfile._id };

  if (query.search) {
    filter.name = { $regex: escapeRegex(query.search.trim()), $options: 'i' };
  }

  const [items, totalItems] = await Promise.all([
    Test.find(filter)
      .sort({ updatedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Test.countDocuments(filter)
  ]);

  return {
    data: items,
    meta: {
      currentPage: page,
      totalPages: Math.ceil(totalItems / limit) || 1,
      totalItems,
      limit
    }
  };
};

export const getTestById = async (userId, testId) => {
  const { test } = await getTestOwnershipContext(testId, userId);
  return test.toObject();
};

export const createTest = async (userId, payload = {}) => {
  const recruiterProfile = await findRecruiterProfileByUserId(userId);

  if (!payload.name?.trim()) {
    throw new BadRequestError('Tên bài test là bắt buộc');
  }

  if (!Number.isFinite(payload.duration) || payload.duration < 1) {
    throw new BadRequestError('Thời lượng bài test phải lớn hơn 0');
  }

  if (!Array.isArray(payload.questions) || payload.questions.length < 1) {
    throw new BadRequestError('Bài test phải có ít nhất 1 câu hỏi');
  }

  payload.questions.forEach((q) => validateQuestionByType(q));

  const questions = payload.questions.map((q) => normalizeQuestionForPersist(q));
  const totalScore = recalculateTotalScore(questions);

  if (!Number.isFinite(payload.passingScore) || payload.passingScore < 0 || payload.passingScore > totalScore) {
    throw new BadRequestError('Điểm đạt không hợp lệ');
  }

  const test = await Test.create({
    companyId: recruiterProfile._id,
    createdBy: toObjectId(userId, 'User ID'),
    name: payload.name.trim(),
    description: payload.description || '',
    duration: payload.duration,
    passingScore: payload.passingScore,
    totalScore,
    questions
  });

  return test.toObject();
};

export const updateTest = async (userId, testId, payload = {}) => {
  const { test } = await getTestOwnershipContext(testId, userId);

  if (typeof payload.name !== 'undefined') {
    if (!payload.name?.trim()) {
      throw new BadRequestError('Tên bài test không được để trống');
    }
    test.name = payload.name.trim();
  }

  if (typeof payload.description !== 'undefined') {
    test.description = payload.description || '';
  }

  if (typeof payload.duration !== 'undefined') {
    if (!Number.isFinite(payload.duration) || payload.duration < 1) {
      throw new BadRequestError('Thời lượng bài test phải lớn hơn 0');
    }
    test.duration = payload.duration;
  }

  if (typeof payload.questions !== 'undefined') {
    if (!Array.isArray(payload.questions) || payload.questions.length < 1) {
      throw new BadRequestError('Bài test phải có ít nhất 1 câu hỏi');
    }

    payload.questions.forEach((q) => validateQuestionByType(q));
    test.questions = payload.questions.map((q) => normalizeQuestionForPersist(q));
  }

  const totalScore = recalculateTotalScore(test.questions);
  const nextPassingScore = typeof payload.passingScore !== 'undefined' ? payload.passingScore : test.passingScore;

  if (!Number.isFinite(nextPassingScore) || nextPassingScore < 0 || nextPassingScore > totalScore) {
    throw new BadRequestError('Điểm đạt không hợp lệ');
  }

  test.totalScore = totalScore;
  test.passingScore = nextPassingScore;

  await test.save();
  return test.toObject();
};

export const deleteTest = async (userId, testId) => {
  const { test } = await getTestOwnershipContext(testId, userId);

  if (test.usageCount > 0) {
    throw new BadRequestError('Không thể xóa bài test đang được sử dụng');
  }

  const assignmentCount = await TestAssignment.countDocuments({ testId: test._id });
  if (assignmentCount > 0) {
    throw new BadRequestError('Không thể xóa bài test đã được gán cho ứng viên');
  }

  await Test.deleteOne({ _id: test._id });

  return { message: 'Xóa bài test thành công' };
};

export const duplicateTest = async (userId, testId) => {
  const { recruiterProfile, test } = await getTestOwnershipContext(testId, userId);

  const cloned = await Test.create({
    companyId: recruiterProfile._id,
    createdBy: toObjectId(userId, 'User ID'),
    name: `${test.name} (Bản sao)`,
    description: test.description,
    duration: test.duration,
    passingScore: test.passingScore,
    totalScore: test.totalScore,
    questions: test.questions.map((q) => ({
      type: 'MULTIPLE_CHOICE',
      question: q.question,
      score: q.score,
      options: q.options?.map((opt) => ({ text: opt.text, isCorrect: !!opt.isCorrect })) || []
    })),
    usageCount: 0
  });

  return cloned.toObject();
};

export const addQuestion = async (userId, testId, payload = {}) => {
  const { test } = await getTestOwnershipContext(testId, userId);

  validateQuestionByType(payload);

  test.questions.push(normalizeQuestionForPersist(payload));
  test.totalScore = recalculateTotalScore(test.questions);

  if (test.passingScore > test.totalScore) {
    throw new BadRequestError('Điểm đạt không được lớn hơn tổng điểm bài test');
  }

  await test.save();

  return test.toObject();
};

export const updateQuestion = async (userId, testId, questionId, payload = {}) => {
  const { test } = await getTestOwnershipContext(testId, userId);
  const questionObjectId = toObjectId(questionId, 'Question ID');

  const question = test.questions.id(questionObjectId);
  if (!question) {
    throw new NotFoundError('Không tìm thấy câu hỏi trong bài test');
  }

  const currentQuestion = question.toObject();
  const nextQuestion = {
    ...currentQuestion,
    ...payload,
    type: payload.type || currentQuestion.type
  };

  validateQuestionByType(nextQuestion);

  question.type = nextQuestion.type;
  question.question = nextQuestion.question;
  question.score = nextQuestion.score;

  question.options = nextQuestion.options;

  test.totalScore = recalculateTotalScore(test.questions);
  if (test.passingScore > test.totalScore) {
    throw new BadRequestError('Điểm đạt không được lớn hơn tổng điểm bài test');
  }

  await test.save();

  return test.toObject();
};

export const deleteQuestion = async (userId, testId, questionId) => {
  const { test } = await getTestOwnershipContext(testId, userId);
  const questionObjectId = toObjectId(questionId, 'Question ID');

  const question = test.questions.id(questionObjectId);
  if (!question) {
    throw new NotFoundError('Không tìm thấy câu hỏi trong bài test');
  }

  if (test.questions.length <= 1) {
    throw new BadRequestError('Bài test phải có ít nhất 1 câu hỏi');
  }

  question.deleteOne();

  test.totalScore = recalculateTotalScore(test.questions);
  if (test.passingScore > test.totalScore) {
    throw new BadRequestError('Điểm đạt không được lớn hơn tổng điểm bài test');
  }

  await test.save();

  return test.toObject();
};

export const reorderQuestions = async (userId, testId, payload = {}) => {
  const { test } = await getTestOwnershipContext(testId, userId);

  const questionIds = Array.isArray(payload.questionIds) ? payload.questionIds : [];
  if (!questionIds.length) {
    throw new BadRequestError('Danh sách câu hỏi không hợp lệ');
  }

  if (questionIds.length !== test.questions.length) {
    throw new BadRequestError('Danh sách câu hỏi sắp xếp không đầy đủ');
  }

  const uniqueIds = new Set(questionIds.map(String));
  if (uniqueIds.size !== questionIds.length) {
    throw new BadRequestError('Danh sách câu hỏi sắp xếp bị trùng lặp');
  }

  const existingMap = new Map(test.questions.map((q) => [String(q._id), q.toObject()]));
  const reordered = [];

  for (const id of questionIds) {
    const objId = toObjectId(id, 'Question ID');
    const key = String(objId);
    const question = existingMap.get(key);

    if (!question) {
      throw new BadRequestError('Danh sách câu hỏi chứa phần tử không thuộc bài test');
    }

    reordered.push(question);
  }

  test.questions = reordered;
  test.totalScore = recalculateTotalScore(test.questions);

  await test.save();

  return test.toObject();
};

export const increaseUsageCount = async (testId, amount = 1) => {
  if (!Number.isFinite(amount) || amount < 1) {
    throw new BadRequestError('Số lượng tăng không hợp lệ');
  }

  const updated = await Test.findByIdAndUpdate(
    toObjectId(testId, 'Test ID'),
    { $inc: { usageCount: amount } },
    { new: true }
  ).lean();

  if (!updated) {
    throw new NotFoundError('Không tìm thấy bài test');
  }

  return updated;
};

export const decreaseUsageCount = async (testId, amount = 1) => {
  if (!Number.isFinite(amount) || amount < 1) {
    throw new BadRequestError('Số lượng giảm không hợp lệ');
  }

  const test = await Test.findById(toObjectId(testId, 'Test ID'));
  if (!test) {
    throw new NotFoundError('Không tìm thấy bài test');
  }

  test.usageCount = Math.max(0, (test.usageCount || 0) - amount);
  await test.save();

  return test.toObject();
};
