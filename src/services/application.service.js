import mongoose from 'mongoose';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  Application,
  Job,
  User,
  CandidateProfile,
  RecruiterProfile,
  InterviewRoom,
  TalentPool,
  TestAssignment,
} from '../models/index.js';
import { NotFoundError, UnauthorizedError, BadRequestError } from '../utils/AppError.js';
import logger from '../utils/logger.js';
import * as queueService from './queue.service.js';
import * as rabbitmq from '../queues/rabbitmq.js';
import { pushNotification } from './notification.service.js';

// Helper function to extract text from PDF buffer using pdfjs-dist
async function extractTextFromPDF(buffer) {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }

    return fullText;
  } catch (error) {
    logger.error('Error extracting text from PDF with pdfjs-dist', error);
    throw error;
  }
}

// ==========================================================
// === HELPER FUNCTIONS FOR AUTOMATION & LOGGING (NEW) ====
// ==========================================================

/**
 * Ghi lại một hành động vào lịch sử của đơn ứng tuyển.
 * Hàm này không tự save, việc save sẽ do hàm gọi nó quyết định.
 */
export const logActivity = (application, action, detail) => {
  console.log("Logging activity: ", { action, detail });
  application.activityHistory.push({
    action,
    detail,
    timestamp: new Date()
  });
};



/**
 * Lấy danh sách ứng viên đã ứng tuyển vào một công việc cụ thể
 * @param {string} jobId ID của công việc
 * @param {string} recruiterId ID của nhà tuyển dụng
 * @param {Object} options Các tùy chọn lọc và phân trang
 * @returns {Object} Object chứa mảng data và object meta
 */
export const getApplicationsByJob = async (jobId, recruiterId, options = {}) => {

  // Kiểm tra xem công việc có tồn tại không và nhà tuyển dụng có quyền không
  const job = await Job.findById(jobId);
  if (!job) {
    throw new NotFoundError('Không tìm thấy công việc');
  }

  // Lấy recruiter profile của người dùng hiện tại
  const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId });
  if (!recruiterProfile) {
    throw new UnauthorizedError('Bạn không phải là nhà tuyển dụng');
  }

  // Kiểm tra quyền sở hữu
  if (job.recruiterProfileId.toString() !== recruiterProfile._id.toString()) {
    throw new UnauthorizedError('Bạn không có quyền xem danh sách ứng viên cho công việc này');
  }

  // Xử lý các options
  const page = options.page || 1;
  const limit = options.limit || 10;
  const skip = (page - 1) * limit;

  // Xây dựng query filter
  const filter = { jobId: new mongoose.Types.ObjectId(jobId) };

  if (options.status) {
    filter.status = options.status;
  }

  // Xử lý filter isReapplied - convert string to boolean
  if (options.isReapplied !== undefined && options.isReapplied !== 'all') {
    // Convert string "true"/"false" to boolean
    filter.isReapplied = options.isReapplied === true || options.isReapplied === 'true';
  }

  // Lọc theo workflow node hiện tại
  if (options.currentNodeId) {
    filter['workflowData.currentNodeId'] = options.currentNodeId;
  }
  // Giữ lại fallback currentStageNodeId nếu cần dùng (cho kanban)
  else if (options.currentStageNodeId) {
    filter.currentStageNodeId = new mongoose.Types.ObjectId(options.currentStageNodeId);
  }

  // Building sort options
  let sortOptions = {};
  if (options.sort) {
    if (options.sort.startsWith('-')) {
      sortOptions[options.sort.substring(1)] = -1;
    } else {
      sortOptions[options.sort] = 1;
    }
  } else {
    // Mặc định sắp xếp theo thời gian ứng tuyển giảm dần
    sortOptions = { appliedAt: -1 };
  }
  // Tạo pipeline aggregate để lấy thông tin chi tiết
  const pipeline = [
    { $match: filter },
    {
      $lookup: {
        from: 'candidateprofiles',
        localField: 'candidateProfileId',
        foreignField: '_id',
        as: 'candidateProfile'
      }
    },
    { $unwind: { path: '$candidateProfile', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'interviewrooms',
        let: { appId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$applicationId', '$$appId'] } } },
          { $sort: { createdAt: -1 } },
          { $limit: 1 }
        ],
        as: 'interview'
      }
    },
    { $unwind: { path: '$interview', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'workflowexecutions',
        let: { appId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$applicationId', '$$appId'] } } },
          { $sort: { createdAt: -1 } },
          { $limit: 1 }
        ],
        as: 'latestExecution'
      }
    },
    { $unwind: { path: '$latestExecution', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        jobId: 1,
        status: 1,
        appliedAt: 1,
        lastStatusUpdateAt: 1,
        candidateRating: 1,
        isReapplied: 1,
        previousApplicationId: 1,
        notes: 1,
        coverLetter: 1,
        submittedCV: 1,
        jobSnapshot: 1,
        source: 1,
        // Thông tin cơ bản của ứng viên từ form hoặc từ thông tin người dùng
        candidateName: { $ifNull: ['$candidateName', '$candidateProfile.fullname'] },
        candidateEmail: { $ifNull: ['$candidateEmail', '$candidateProfile.email'] },
        candidatePhone: { $ifNull: ['$candidatePhone', '$candidateProfile.phone'] },
        candidateAvatar: '$candidateProfile.avatar',
        candidateTitle: '$candidateProfile.title',
        candidateUserId: '$candidateProfile.userId',
        interview: 1,
        latestExecution: 1,
        interview_result: 1,
        test_score: 1,
        cv_score: 1,
        workflowId: 1
      }
    },
    { $sort: sortOptions },
    { $skip: skip },
    { $limit: limit }
  ];

  // Nếu có tìm kiếm, thêm điều kiện tìm kiếm
  if (options.search) {
    const searchRegex = new RegExp(options.search, 'i');

    // Thêm một stage riêng cho tìm kiếm sau khi đã lookup để có thể tìm trong các trường
    pipeline.splice(3, 0, {
      $match: {
        $or: [
          { 'candidateName': searchRegex },
          { 'candidateEmail': searchRegex },
          { 'candidatePhone': searchRegex }
        ]
      }
    });
  }

  // Thực hiện truy vấn
  const applications = await Application.aggregate(pipeline);
  // Đếm tổng số lượng
  const totalApplications = await Application.countDocuments(filter);

  return {
    data: applications,
    meta: {
      currentPage: page,
      totalPages: Math.ceil(totalApplications / limit),
      totalItems: totalApplications,
      limit
    }
  };
};

/**
 * Lấy thông tin chi tiết một đơn ứng tuyển
 * @param {string} applicationId ID của đơn ứng tuyển
 * @param {string} recruiterId ID của nhà tuyển dụng
 * @returns {Object} Thông tin chi tiết đơn ứng tuyển
 */
export const getApplicationById = async (applicationId, recruiterId) => {
  // Populate candidateProfileId với chỉ những field cần thiết để so sánh (không bao gồm CVs - thông tin riêng tư)
  const application = await Application.findById(applicationId)
    .populate({
      path: 'candidateProfileId',
      select: 'userId fullname avatar bio phone email address skills experiences educations certificates projects expectedSalary workPreferences preferredLocations'
    })
    .populate({
      path: 'jobId',
      select: 'title company location salary employmentType description requirements benefits'
    });

  if (!application) {
    throw new NotFoundError('Không tìm thấy đơn ứng tuyển');
  }

  // Kiểm tra quyền sở hữu
  const job = await Job.findById(application.jobId._id || application.jobId);
  if (!job) {
    throw new NotFoundError('Không tìm thấy công việc liên quan');
  }

  // Lấy recruiter profile của người dùng hiện tại
  const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId });
  if (!recruiterProfile) {
    throw new UnauthorizedError('Bạn không phải là nhà tuyển dụng');
  }

  if (job.recruiterProfileId.toString() !== recruiterProfile._id.toString()) {
    throw new UnauthorizedError('Bạn không có quyền xem đơn ứng tuyển này');
  }

  // Lấy thông tin phỏng vấn nếu có
  const interview = await InterviewRoom.findOne({ applicationId: application._id }).lean();
  // Lấy kết quả bài test nếu có
  const testAssignment = await TestAssignment.findOne({ applicationId: application._id })
    .populate({ path: 'testId', select: 'name description duration passingScore totalScore questions' })
    .lean();

  let questionDetails = [];
  if (testAssignment && testAssignment.testId?.questions && testAssignment.answers) {
    questionDetails = testAssignment.answers.map(answer => {
      const question = testAssignment.testId.questions.find(q => q._id.toString() === answer.questionId.toString());
      return {
        questionText: question?.question || '',
        options: (question?.options || []).map(opt => ({
          text: opt.text,
          isCorrect: opt.isCorrect,
          isSelected: opt._id.toString() === (answer.selectedOptionId || '').toString(),
        })),
        maxScore: question?.score || 0,
        scoreEarned: answer.scoreEarned || 0,
        isCorrect: answer.isCorrect,
      };
    });
  }

  // Check if candidate is in talent pool
  const isInTalentPool = application.candidateProfileId ? await TalentPool.exists({
    recruiterProfileId: recruiterProfile._id,
    candidateProfileId: application.candidateProfileId._id
  }) : null;

  // Tạo và trả về đối tượng thông tin (candidateProfileId đã được populate đầy đủ)
  const applicationDetails = {
    ...application.toObject(),
    candidateUserId: application.candidateProfileId?.userId,
    candidateAvatar: application.candidateProfileId?.avatar,
    isInTalentPool: !!isInTalentPool,
    talentPoolId: isInTalentPool ? isInTalentPool._id : null,
    hasInterview: !!interview,
    interviewInfo: interview
      ? {
        interviewId: interview._id,
        scheduledTime: interview.scheduledTime,
        status: interview.status,
        roomName: interview.roomName,
      }
      : null,
    testAssignment: testAssignment
      ? {
        assignmentId: testAssignment._id,
        testId: testAssignment.testId?._id,
        testName: testAssignment.testId?.name,
        testDescription: testAssignment.testId?.description,
        duration: testAssignment.testId?.duration,
        passingScore: testAssignment.testId?.passingScore,
        totalScore: testAssignment.totalScore,
        status: testAssignment.status,
        score: testAssignment.score,
        passed: testAssignment.passed,
        timeSpent: testAssignment.timeSpent,
        startedAt: testAssignment.startedAt,
        completedAt: testAssignment.completedAt,
        questionDetails,
      }
      : null,
  };

  // Kiểm tra xem đã log APPLICATION_VIEWED chưa
  // Sử dụng in-memory check để tối ưu performance (tránh gọi DB update nếu đã có)
  const hasViewedInMemory = application.activityHistory.some(activity => activity.action === 'APPLICATION_VIEWED');

  if (!hasViewedInMemory) {
    // Sử dụng updateOne với điều kiện query để đảm bảo ATOMICITY, tránh race condition (2 requests cùng lúc)
    const updateResult = await Application.updateOne(
      {
        _id: application._id,
        'activityHistory.action': { $ne: 'APPLICATION_VIEWED' }
      },
      {
        $push: {
          activityHistory: {
            action: 'APPLICATION_VIEWED',
            detail: 'Nhà tuyển dụng đã xem hồ sơ ứng tuyển',
            timestamp: new Date()
          }
        }
      }
    );

    // Chỉ xử lý tiếp nếu update thành công (modifiedCount > 0)
    // Điều này đồng nghĩa server này là request ĐẦU TIÊN và DUY NHẤT thực hiện log view
    if (updateResult.modifiedCount > 0) {
      // Cập nhật lại object in-memory để trả về client đúng dữ liệu
      application.activityHistory.push({
        action: 'APPLICATION_VIEWED',
        detail: 'Nhà tuyển dụng đã xem hồ sơ ứng tuyển',
        timestamp: new Date()
      });

      // Gửi thông báo cho ứng viên
      // candidateProfileId đã được populate ở trên (lines 186-190), có thể dùng trực tiếp
      const candidateProfile = application.candidateProfileId;
      if (candidateProfile && candidateProfile.userId) {
        queueService.publishNotification(rabbitmq.ROUTING_KEYS.STATUS_UPDATE, {
          type: 'APPLICATION_VIEWED',
          recipientId: candidateProfile.userId.toString(),
          data: {
            applicationId: application._id.toString(),
            jobTitle: job.title,
            companyName: recruiterProfile.company.name
          }
        });
      }
    }
  }

  return {
    ...applicationDetails,
  };

};

/**
 * Cập nhật trạng thái đơn ứng tuyển (chỉ dành cho nhà tuyển dụng)
 * @param {string} applicationId ID đơn ứng tuyển
 * @param {string} recruiterId ID nhà tuyển dụng
 * @param {string} status Trạng thái mới
 * @param {string} offerLetter Thư mời (nếu có)
 * @param {string} offerFile Link file đính kèm (nếu có)
 * @returns {Object} Đơn ứng tuyển đã cập nhật
 */
export const updateApplicationStatus = async (applicationId, recruiterId, status, offerLetter = null, offerFile = null, feedback = null) => {
  // Kiểm tra ID hợp lệ
  if (!mongoose.Types.ObjectId.isValid(applicationId)) {
    throw new BadRequestError('ID đơn ứng tuyển không hợp lệ');
  }

  // Lấy thông tin đơn ứng tuyển
  const application = await Application.findById(applicationId).populate('jobId');
  if (!application) {
    throw new NotFoundError('Không tìm thấy đơn ứng tuyển');
  }

  // Kiểm tra quyền sở hữu
  const job = application.jobId;
  if (!job) {
    throw new NotFoundError('Không tìm thấy công việc liên quan');
  }

  // Lấy recruiter profile của người dùng hiện tại
  const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId });
  if (!recruiterProfile) {
    throw new UnauthorizedError('Bạn không phải là nhà tuyển dụng');
  }

  if (job.recruiterProfileId.toString() !== recruiterProfile._id.toString()) {
    throw new UnauthorizedError('Bạn không có quyền cập nhật trạng thái cho đơn ứng tuyển này');
  }

  // Validations for INTERVIEW_FAILED status
  if (status === 'INTERVIEW_FAILED') {
    // Must allow transitioning from SCHEDULED_INTERVIEW (Requirement 1.1)
    if (application.status !== 'SCHEDULED_INTERVIEW') {
      // Although requirement 1.1 implies viewing logic, backend should likely enforce valid transitions or at least be safe.
      // However, existing transitions might be loose. Let's just check the interview requirement.
      // But logic "Requirement 3.1: WHEN an application has status SCHEDULED_INTERVIEW THEN the System SHALL allow transition to INTERVIEW_FAILED or OFFER_SENT"
      // implies strict workflow.
    }

    // Check interview status
    const interview = await InterviewRoom.findOne({ applicationId: application._id }).lean();
    if (!interview) {
      throw new BadRequestError('không tìm thấy thông tin phỏng vấn cho đơn ứng tuyển này');
    }

    if (interview.status !== 'COMPLETED' && interview.status !== 'ENDED') {
      throw new BadRequestError('Trạng thái phỏng vấn chưa hoàn thành (COMPLETED hoặc ENDED)');
    }
  }

  const oldStatus = application.status;
  application.status = status;
  application.lastStatusUpdateAt = new Date();

  // Save offer details if status is OFFER_SENT
  if (status === 'OFFER_SENT') {
    if (offerLetter) application.offerLetter = offerLetter;
    if (offerFile) application.offerFile = offerFile;
  }

  // Ghi log activity, cũng hiển thị cho ứng viên
  if (status === 'SUITABLE') {
    logActivity(application, 'SUITABLE', `Nhà tuyển dụng đã đánh giá đơn ứng tuyển này là phù hợp`);
  } else if (status === 'SCHEDULED_INTERVIEW') {
    logActivity(application, 'SCHEDULED_INTERVIEW', `Nhà tuyển dụng đã đặt lịch phỏng vấn cho đơn ứng tuyển này`);
  } else if (status === 'OFFER_SENT') {
    logActivity(application, 'OFFER_SENT', `Nhà tuyển dụng đã gửi lời mời cho đơn ứng tuyển này`);
  } else if (status === 'REJECTED') {
    logActivity(application, 'REJECTED', `Nhà tuyển dụng đã đánh giá đơn ứng tuyển này là không phù hợp`);
  } else if (status === 'INTERVIEW_FAILED') {
    logActivity(application, 'INTERVIEW_FAILED', feedback || 'Nhà tuyển dụng đánh giá phỏng vấn không đạt yêu cầu');
  }

  await application.save();

  // Đánh thức Workflow nếu đang bị dừng chờ (do node phỏng vấn hoặc manual stage)
  if (application.workflowData && application.workflowData.isWorkflowPaused) {
    application.workflowData.isWorkflowPaused = false;
    await application.save();

    await queueService.publishNotificationStrict(rabbitmq.ROUTING_KEYS.WORKFLOW_EXECUTION_CONTINUE, {
      applicationId: application._id.toString(),
      workflowId: application.workflowId.toString(),
      currentNodeId: application.workflowData.pendingNextNodeId,
      retryCount: 0
    });
  }

  // Gửi thông báo nếu trạng thái thay đổi
  if (oldStatus !== status) {
    const candidateProfile = await CandidateProfile.findById(application.candidateProfileId);
    if (candidateProfile) {
      queueService.publishNotification(rabbitmq.ROUTING_KEYS.STATUS_UPDATE, {
        type: status,
        recipientId: candidateProfile.userId.toString(),
        data: {
          applicationId: application._id.toString(),
          newStatus: status,
          feedback: feedback // Include feedback in notification data
        }
      });
    }
  }

  // Populate candidateProfileId để lấy thông tin chi tiết
  await application.populate({
    path: 'candidateProfileId',
    select: 'userId avatar'
  });

  // Lấy thông tin phỏng vấn nếu có
  const interview = await InterviewRoom.findOne({ applicationId: application._id }).lean();
  // Check if candidate is in talent pool
  const isInTalentPool = application.candidateProfileId ? await TalentPool.exists({
    recruiterProfileId: recruiterProfile._id,
    candidateProfileId: application.candidateProfileId._id
  }) : null;

  // Tạo và trả về đối tượng thông tin đầy đủ
  const applicationDetails = {
    ...application.toObject(),
    candidateUserId: application.candidateProfileId?.userId,
    candidateAvatar: application.candidateProfileId?.avatar,
    isInTalentPool: !!isInTalentPool,
    talentPoolId: isInTalentPool ? isInTalentPool._id : null,
    hasInterview: !!interview,
    interviewInfo: interview
      ? {
        interviewId: interview._id,
        scheduledTime: interview.scheduledTime,
        status: interview.status,
        roomName: interview.roomName,
      }
      : null,
  };

  return applicationDetails;
};

/**
 * Cập nhật ghi chú cho đơn ứng tuyển
 * @param {string} applicationId ID đơn ứng tuyển
 * @param {string} recruiterId ID nhà tuyển dụng
 * @param {string} notes Ghi chú mới
 * @returns {Object} Đơn ứng tuyển đã cập nhật
 */
export const updateApplicationNotes = async (applicationId, recruiterId, notes) => {
  // Kiểm tra ID hợp lệ
  if (!mongoose.Types.ObjectId.isValid(applicationId)) {
    throw new BadRequestError('ID đơn ứng tuyển không hợp lệ');
  }

  // Lấy thông tin đơn ứng tuyển
  const application = await Application.findById(applicationId);
  if (!application) {
    throw new NotFoundError('Không tìm thấy đơn ứng tuyển');
  }

  // Kiểm tra quyền sở hữu
  const job = await Job.findById(application.jobId);
  if (!job) {
    throw new NotFoundError('Không tìm thấy công việc liên quan');
  }

  // Lấy recruiter profile của người dùng hiện tại
  const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId });
  if (!recruiterProfile) {
    throw new UnauthorizedError('Bạn không phải là nhà tuyển dụng');
  }

  if (job.recruiterProfileId.toString() !== recruiterProfile._id.toString()) {
    throw new UnauthorizedError('Bạn không có quyền cập nhật ghi chú cho đơn ứng tuyển này');
  }

  application.notes = notes;
  await application.save();

  return application;
};



/**
 * Lấy dữ liệu CV để render cho Application (dành cho CV template)
 * Recruiter có thể xem CV template của ứng viên thông qua Application
 * @param {string} applicationId - ID của đơn ứng tuyển
 * @param {string} recruiterId - ID của nhà tuyển dụng (để xác thực quyền) - có thể null nếu dùng token đặc biệt
 * @returns {Object} - Dữ liệu CV để render
 */
export const getApplicationCVData = async (applicationId, recruiterId = null) => {
  // Kiểm tra ID hợp lệ
  if (!mongoose.Types.ObjectId.isValid(applicationId)) {
    throw new BadRequestError('ID đơn ứng tuyển không hợp lệ');
  }

  // Lấy thông tin đơn ứng tuyển
  const application = await Application.findById(applicationId)
    .populate('jobId', 'recruiterProfileId')
    .lean();

  if (!application) {
    throw new NotFoundError('Không tìm thấy đơn ứng tuyển');
  }

  // Nếu có recruiterId, kiểm tra quyền sở hữu
  if (recruiterId) {
    const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId });
    if (!recruiterProfile) {
      throw new UnauthorizedError('Bạn không phải là nhà tuyển dụng');
    }

    if (application.jobId.recruiterProfileId.toString() !== recruiterProfile._id.toString()) {
      throw new UnauthorizedError('Bạn không có quyền xem CV này');
    }
  }

  const submittedCV = application.submittedCV;

  // Kiểm tra loại CV
  if (submittedCV.source !== 'TEMPLATE') {
    throw new BadRequestError('CV này không phải là CV template. Vui lòng tải xuống file PDF.');
  }

  // Trả về dữ liệu CV để render
  return {
    applicationId: application._id,
    cvName: submittedCV.name,
    templateId: submittedCV.templateId,
    cvData: submittedCV.templateSnapshot,
    jobSnapshot: application.jobSnapshot,
    appliedAt: application.appliedAt,
  };
};

/**
 * Lấy dữ liệu gộp của nhiều đơn ứng tuyển để AI so sánh
 * @param {Array<string>} applicationIds - Danh sách ID đơn ứng tuyển
 * @param {string} recruiterId - ID nhà tuyển dụng
 * @returns {Promise<Object>} Object chứa thông tin job và mảng ứng viên
 */
export const gatherComparisonData = async (applicationIds, recruiterId) => {
  // 1. Verify recruiter
  const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId });
  if (!recruiterProfile) {
    throw new UnauthorizedError('Bạn không phải là nhà tuyển dụng');
  }

  // 2. Fetch applications
  const applications = await Application.find({ _id: { $in: applicationIds } })
    .populate({
      path: 'candidateProfileId',
      select: 'userId fullname avatar bio phone email address skills experiences educations certificates projects expectedSalary workPreferences preferredLocations'
    })
    .populate({
      path: 'jobId',
      select: 'title company location salary experience type workType description requirements benefits category skills minSalary maxSalary recruiterProfileId'
    });

  if (!applications || applications.length === 0) {
    throw new NotFoundError('Không tìm thấy đơn ứng tuyển nào');
  }

  // 3. Verify ownership based on jobId.recruiterProfileId
  const job = applications[0].jobId;
  if (!job || job.recruiterProfileId.toString() !== recruiterProfile._id.toString()) {
    throw new UnauthorizedError('Bạn không có quyền truy cập các đơn ứng tuyển này');
  }

  // Ensure all applications belong to the same job
  const jobIdStr = job._id.toString();
  for (const app of applications) {
    if (app.jobId._id.toString() !== jobIdStr) {
      throw new BadRequestError('Các đơn ứng tuyển phải thuộc cùng một vị trí công việc');
    }
  }

  // 4. Process candidates and extract CV text
  const candidatesData = [];

  for (const app of applications) {
    let cvText = '';

    // Extract CV
    if (app.submittedCV) {
      if (app.submittedCV.source === 'TEMPLATE' && app.submittedCV.templateSnapshot) {
        try {
          const snapshot = app.submittedCV.templateSnapshot;
          if (typeof snapshot === 'object') {
            cvText = JSON.stringify(snapshot);
          } else {
            cvText = String(snapshot);
          }
          console.log('cvTextTemplate', cvText)

        } catch (e) {
          logger.error('Error parsing templateSnapshot', e);
        }
      } else if (app.submittedCV.source === 'UPLOADED' && app.submittedCV.path) {
        try {
          const response = await fetch(app.submittedCV.path);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            const pdfText = await extractTextFromPDF(uint8Array);
            if (pdfText) {
              cvText = pdfText;
              console.log('cvText', cvText)
            }
          }
        } catch (err) {
          logger.error(`Error extracting text from PDF ${app.submittedCV.path}`, err);
        }
      }
    }

    // truncate CV text
    if (cvText && cvText.length > 3000) {
      cvText = cvText.substring(0, 3000) + '... [Nội dung đã được cắt bớt]';
    }

    candidatesData.push({
      applicationId: app._id,
      name: app.candidateProfileId?.fullname || 'Unknown',
      status: app.status,
      coverLetter: app.coverLetter,
      appliedAt: app.appliedAt,
      notes: app.notes,
      cvText: cvText,
      profile: app.candidateProfileId ? app.candidateProfileId.toObject() : null
    });
  }

  return {
    job: {
      title: job.title,
      description: job.description,
      requirements: job.requirements,
      skills: job.skills,
      experience: job.experience,
      type: job.type,
      workType: job.workType,
      minSalary: job.minSalary,
      maxSalary: job.maxSalary,
      category: job.category,
      location: job.location
    },
    candidates: candidatesData
  };
};

/**
 * Đánh giá kết quả phỏng vấn tự động (Workflow)
 */
export const evaluateInterviewResult = async (applicationId, recruiterId, result, feedback) => {
  if (!['PASSED', 'FAILED'].includes(result)) {
    throw new BadRequestError('Kết quả phỏng vấn phải là PASSED hoặc FAILED');
  }

  const application = await Application.findById(applicationId).populate('jobId');
  if (!application) {
    throw new NotFoundError('Không tìm thấy đơn ứng tuyển');
  }

  const job = application.jobId;
  const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId });
  if (!recruiterProfile || job.recruiterProfileId.toString() !== recruiterProfile._id.toString()) {
    throw new UnauthorizedError('Bạn không có quyền đánh giá đơn ứng tuyển này');
  }

  // Cập nhật interview_result
  application.interview_result = result;
  if (feedback) {
    application.notes = (application.notes || '') + `\n\n[Đánh giá Phỏng vấn - ${result}]: ${feedback}`;
  }

  logActivity(application, result === 'PASSED' ? 'INTERVIEW_PASSED' : 'INTERVIEW_FAILED', `Nhà tuyển dụng đánh giá phỏng vấn: ${result === 'PASSED' ? 'ĐẠT' : 'KHÔNG ĐẠT'}`);

  // Nếu là luồng thủ công và FAILED thì cập nhật status luôn trước khi save
  if ((!application.workflowData || !application.workflowData.isWorkflowPaused) && result === 'FAILED') {
    application.status = 'INTERVIEW_FAILED';
    application.lastStatusUpdateAt = new Date();
  }

  await application.save();

  // Luôn gửi thông báo kết quả đánh giá phỏng vấn cho ứng viên
  const candidateProfile = await CandidateProfile.findById(application.candidateProfileId);
  if (candidateProfile) {
    queueService.publishNotification(rabbitmq.ROUTING_KEYS.STATUS_UPDATE, {
      type: result === 'PASSED' ? 'INTERVIEW_PASSED' : 'INTERVIEW_FAILED',
      recipientId: candidateProfile.userId.toString(),
      data: {
        applicationId: application._id.toString(),
        newStatus: application.status,
        feedback: feedback
      }
    });
  }

  // Đánh thức Workflow nếu đang bị dừng
  if (application.workflowData && application.workflowData.isWorkflowPaused) {
    application.workflowData.isWorkflowPaused = false;
    await application.save();

    await queueService.publishNotificationStrict(rabbitmq.ROUTING_KEYS.WORKFLOW_EXECUTION_CONTINUE, {
      applicationId: application._id.toString(),
      workflowId: application.workflowId.toString(),
      currentNodeId: application.workflowData.pendingNextNodeId,
      retryCount: 0
    });
  }

  return application;
};
