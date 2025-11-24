// src/services/chat.service.js
import ChatMessage from '../models/ChatMessage.js';
import Conversation from '../models/Conversation.js';
import User from '../models/User.js';
import CandidateProfile from '../models/CandidateProfile.js';
import RecruiterProfile from '../models/RecruiterProfile.js';
import Application from '../models/Application.js';
import CreditTransaction from '../models/CreditTransaction.js';
import Job from '../models/Job.js';
import { NotFoundError, BadRequestError } from '../utils/AppError.js';
import logger from '../utils/logger.js';
import mongoose from 'mongoose';

/**
 * Determine the context for a conversation between a recruiter and a candidate.
 * Prioritizes Application over Profile Unlock.
 * @param {string} recruiterId
 * @param {string} candidateId
 * @returns {Promise<Object|null>} Context object or null
 */
export const determineConversationContext = async (recruiterId, candidateId) => {
  try {
    const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId }).select('_id');
    const candidateProfile = await CandidateProfile.findOne({ userId: candidateId }).select('_id');

    if (!recruiterProfile || !candidateProfile) return null;

    // 1. Check for Applications (Prioritize most recent)
    const jobs = await Job.find({ recruiterProfileId: recruiterProfile._id }).select('_id title');
    const jobIds = jobs.map(j => j._id);

    if (jobIds.length > 0) {
      const applications = await Application.find({
        jobId: { $in: jobIds },
        candidateProfileId: candidateProfile._id
      })
        .sort({ appliedAt: -1 }) // Get most recent first
        .populate('jobId', 'title')
        .lean();

      if (applications.length > 0) {
        const latestApp = applications[0];
        return {
          type: 'APPLICATION',
          contextId: latestApp._id, // Keep latest as primary for backward compatibility
          applicationIds: applications.map(app => app._id),
          title: applications.length > 1
            ? `${latestApp.jobId.title} (+${applications.length - 1} vị trí khác)`
            : latestApp.jobId.title,
          attachedAt: new Date()
        };
      }
    }

    // 2. Check for Profile Unlock
    const unlockTransaction = await CreditTransaction.findOne({
      userId: recruiterId,
      category: 'PROFILE_UNLOCK',
      'metadata.candidateId': candidateId
    }).sort({ createdAt: -1 }).lean();

    if (unlockTransaction) {
      return {
        type: 'PROFILE_UNLOCK',
        contextId: unlockTransaction._id,
        title: 'Hồ sơ đã mở khóa',
        attachedAt: new Date()
      };
    }

    return null;
  } catch (error) {
    logger.error('Error determining conversation context:', error);
    return null;
  }
};



/**
 * Tìm một cuộc trò chuyện 1-1 duy nhất giữa hai người dùng.
 * @param {string} userId1 - ID của người dùng thứ nhất.
 * @param {string} userId2 - ID của người dùng thứ hai.
 * @returns {Promise<Object|null>} Conversation document hoặc null nếu không tìm thấy.
 */
export const findPrivateConversation = async (userId1, userId2) => {
  const p1 = new mongoose.Types.ObjectId(userId1);
  const p2 = new mongoose.Types.ObjectId(userId2);
  const [participant1, participant2] = [p1, p2].sort((a, b) => a.toString().localeCompare(b.toString()));

  return Conversation.findOne({
    participant1: participant1,
    participant2: participant2
  }).lean();
};

/**
 * Check if recruiter can message a candidate
 * @param {string} recruiterId - Recruiter user ID
 * @param {string} candidateId - Candidate user ID
 * @returns {Promise<{canMessage: boolean, reason: string}>}
 */
export const checkMessagingAccess = async (recruiterId, candidateId) => {
  // 1. Get recruiter's profile to find their profile ID
  const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId })
    .select('_id')
    .lean();

  if (!recruiterProfile) {
    return { canMessage: false, reason: 'RECRUITER_PROFILE_NOT_FOUND' };
  }

  // 2. Get candidate's profile
  const candidateProfile = await CandidateProfile.findOne({ userId: candidateId })
    .select('_id')
    .lean();

  if (!candidateProfile) {
    return { canMessage: false, reason: 'CANDIDATE_PROFILE_NOT_FOUND' };
  }

  // 3. Get all jobs posted by this recruiter
  const recruiterJobs = await Job.find({
    recruiterProfileId: recruiterProfile._id
  })
    .select('_id')
    .lean();

  const jobIds = recruiterJobs.map(job => job._id);

  // 4. Check if candidate has applied to any of recruiter's jobs
  if (jobIds.length > 0) {
    const application = await Application.findOne({
      jobId: { $in: jobIds },
      candidateProfileId: candidateProfile._id,
      status: {
        $in: ['PENDING', 'REVIEWING', 'SCHEDULED_INTERVIEW', 'INTERVIEWED', 'ACCEPTED', 'REJECTED']
      }
    }).lean();

    if (application) {
      return { canMessage: true, reason: 'HAS_APPLICATION' };
    }
  }

  // 5. Check if recruiter has unlocked the profile
  const unlockTransaction = await CreditTransaction.findOne({
    userId: recruiterId,
    category: 'PROFILE_UNLOCK',
    'metadata.candidateId': candidateId
  }).lean();

  if (unlockTransaction) {
    return { canMessage: true, reason: 'PROFILE_UNLOCKED' };
  }

  // 6. No access
  return { canMessage: false, reason: 'NO_ACCESS' };
};

/**
 * Gửi và lưu tin nhắn chat theo conversationId.
 * @param {Object} messageData - Dữ liệu tin nhắn.
 * @param {string} messageData.senderId - ID của người gửi.
 * @param {string} messageData.conversationId - ID của cuộc trò chuyện.
 * @param {string} messageData.content - Nội dung tin nhắn.
 * @param {string} messageData.type - Loại tin nhắn (text, image, file).
 * @param {Object} messageData.metadata - Metadata cho file (optional).
 * @returns {Promise<Object>} Tin nhắn đã lưu.
 */
export const sendMessage = async ({ senderId, conversationId, content, type = 'text', metadata }) => {
  // Kiểm tra conversation có tồn tại và user có quyền gửi tin nhắn không
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new NotFoundError('Cuộc trò chuyện không tồn tại.');
  }

  // Kiểm tra người gửi có phải là participant trong conversation không
  const isParticipant = conversation.participant1.toString() === senderId ||
    conversation.participant2.toString() === senderId;
  if (!isParticipant) {
    throw new BadRequestError('Bạn không có quyền gửi tin nhắn trong cuộc trò chuyện này.');
  }

  // Xác định recipientId
  const recipientId = conversation.participant1.toString() === senderId
    ? conversation.participant2
    : conversation.participant1;

  // Tạo và lưu tin nhắn
  const newMessage = await ChatMessage.create({
    conversationId,
    senderId,
    recipientId,
    content,
    type,
    metadata,
    sentAt: new Date(),
    status: 'SENT',
  });

  // Cập nhật `lastMessage` và `lastMessageAt` cho Conversation
  await Conversation.findByIdAndUpdate(conversationId, {
    lastMessage: newMessage._id,
    lastMessageAt: newMessage.sentAt,
  });

  logger.info(`Message sent from ${senderId} in conversation ${conversationId}`);
  return newMessage;
};

/**
 * Lấy lịch sử tin nhắn trong một cuộc trò chuyện.
 * @param {string} currentUserId - ID của người dùng hiện tại (để kiểm tra quyền).
 * @param {string} conversationId - ID của cuộc trò chuyện.
 * @param {object} options - Tùy chọn phân trang (page, limit).
 * @returns {Promise<object>} Lịch sử tin nhắn và thông tin phân trang.
 */
export const getConversationMessages = async (currentUserId, conversationId, options = {}) => {
  const page = parseInt(options.page, 10) || 1;
  const limit = parseInt(options.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new NotFoundError('Cuộc trò chuyện không tồn tại.');
  }

  // Kiểm tra người dùng có thuộc cuộc trò chuyện này không
  const isParticipant = [conversation.participant1.toString(), conversation.participant2.toString()].includes(currentUserId.toString());
  if (!isParticipant) {
    throw new BadRequestError('Bạn không có quyền truy cập cuộc trò chuyện này.');
  }

  // Lấy tin nhắn và tổng số tin nhắn
  const [messages, totalMessages] = await Promise.all([
    ChatMessage.find({ conversationId })
      .sort({ sentAt: -1 }) // Sắp xếp mới nhất lên đầu
      .skip(skip)
      .limit(limit)
      .lean(), // Don't populate senderId - keep it as ObjectId string for frontend comparison
    ChatMessage.countDocuments({ conversationId })
  ]);

  return {
    meta: {
      currentPage: page,
      totalPages: Math.ceil(totalMessages / limit),
      totalItems: totalMessages,
      limit,
    },
    data: messages
  };
};

/**
 * Đánh dấu một hoặc nhiều tin nhắn là đã đọc.
 * @param {string} recipientId - ID của người nhận (người đánh dấu đã đọc).
 * @param {Array<string>} messageIds - Mảng các ID tin nhắn cần đánh dấu.
 * @returns {Promise<Object>} Kết quả cập nhật.
 */
export const markMessagesAsRead = async (recipientId, messageIds) => {
  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    throw new BadRequestError('Cần cung cấp ít nhất một ID tin nhắn để đánh dấu.');
  }

  const objectMessageIds = messageIds.map(id => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestError(`ID tin nhắn không hợp lệ: ${id}`);
    }
    return new mongoose.Types.ObjectId(id);
  });

  const updateResult = await ChatMessage.updateMany(
    { _id: { $in: objectMessageIds }, recipientId: recipientId, isRead: false },
    { $set: { isRead: true, readAt: new Date(), status: 'READ' } }
  );

  logger.info(`Marked ${updateResult.modifiedCount} messages as read for user ${recipientId}`);
  return updateResult;
};

/**
 * Đánh dấu tất cả tin nhắn trong một cuộc trò chuyện là đã đọc.
 * @param {string} userId - ID của người dùng đánh dấu đã đọc.
 * @param {string} conversationId - ID của cuộc trò chuyện.
 * @returns {Promise<Object>} Kết quả cập nhật.
 */
export const markConversationAsRead = async (userId, conversationId) => {
  // Kiểm tra conversation có tồn tại và user có quyền không
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new NotFoundError('Cuộc trò chuyện không tồn tại.');
  }

  // Convert both to string for comparison to handle ObjectId vs string
  const userIdStr = userId.toString();
  const participant1Str = conversation.participant1.toString();
  const participant2Str = conversation.participant2.toString();

  const isParticipant = participant1Str === userIdStr || participant2Str === userIdStr;

  if (!isParticipant) {
    // Log for debugging
    logger.warn(`Permission denied: User ${userIdStr} tried to mark conversation ${conversationId} as read. Participants: ${participant1Str}, ${participant2Str}`);
    throw new BadRequestError('Bạn không có quyền trong cuộc trò chuyện này.');
  }

  // Đánh dấu tất cả tin nhắn chưa đọc mà user là recipient
  const updateResult = await ChatMessage.updateMany(
    {
      conversationId: conversationId,
      recipientId: userId,
      isRead: false
    },
    {
      $set: {
        isRead: true,
        readAt: new Date(),
        status: 'READ'
      }
    }
  );

  logger.info(`Marked ${updateResult.modifiedCount} messages as read in conversation ${conversationId} for user ${userId}`);
  return updateResult;
};

/**
 * Lấy danh sách các cuộc trò chuyện gần đây nhất của người dùng.
 * Sắp xếp theo thời gian của tin nhắn cuối cùng.
 * @param {string} userId - ID của người dùng.
 * @returns {Promise<Array>} Danh sách các cuộc trò chuyện gần đây.
 */
export const getLatestConversations = async (userId, { search, page = 1, limit = 10 } = {}) => {
  const objectUserId = new mongoose.Types.ObjectId(userId);
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const skip = (pageNum - 1) * limitNum;

  const pipeline = [
    // Match conversations where the user is a participant (either participant1 or participant2)
    {
      $match: {
        $or: [
          { participant1: objectUserId },
          { participant2: objectUserId }
        ],
        lastMessage: { $ne: null } // Chỉ lấy các cuộc trò chuyện có ít nhất một tin nhắn
      }
    },
    // Populate lastMessage (tin nhắn cuối cùng trong cuộc trò chuyện)
    {
      $lookup: {
        from: 'chatmessages', // Tên collection của ChatMessage model
        localField: 'lastMessage',
        foreignField: '_id',
        as: 'latestMessage'
      }
    },
    { $unwind: '$latestMessage' }, // Biến đổi mảng 1 phần tử thành object

    // Populate participant1 details
    {
      $lookup: {
        from: 'users',
        let: { uid: '$participant1' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$uid'] } } },
          { $project: { _id: 1, role: 1, email: 1 } }
        ],
        as: 'participant1Details'
      }
    },
    { $unwind: { path: '$participant1Details', preserveNullAndEmptyArrays: true } },

    {
      $lookup: {
        from: 'users',
        let: { uid: '$participant2' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$uid'] } } },
          { $project: { _id: 1, name: 1, role: 1, email: 1 } }
        ],
        as: 'participant2Details'
      }
    },
    { $unwind: { path: '$participant2Details', preserveNullAndEmptyArrays: true } },
    // 4) Xác định "đối tác trò chuyện" (không phải current user)
    {
      $addFields: {
        otherParticipantObj: {
          $cond: [
            { $eq: ['$participant1', objectUserId] },
            '$participant2Details',
            '$participant1Details'
          ]
        }
      }
    },
    {
      $addFields: {
        otherParticipantId: '$otherParticipantObj._id',
        otherParticipantRole: '$otherParticipantObj.role'
      }
    },


    // Tính toán số tin nhắn chưa đọc cho người dùng hiện tại trong mỗi cuộc trò chuyện
    {
      $lookup: {
        from: 'chatmessages',
        let: { convoId: '$_id' }, // Biến cục bộ để sử dụng trong pipeline con
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$conversationId', '$$convoId'] }, // Tin nhắn thuộc cuộc trò chuyện hiện tại
                  { $eq: ['$recipientId', objectUserId] },   // Tin nhắn được gửi đến người dùng hiện tại
                  { $eq: ['$isRead', false] }                // Tin nhắn chưa được đọc
                ]
              }
            }
          }
        ],
        as: 'unreadMessages'
      }
    },
    {
      $addFields: {
        unreadCount: { $size: '$unreadMessages' } // Đếm số lượng tin nhắn chưa đọc
      }
    },
    // == Lấy hồ sơ theo role → avatar/companyName/fullName
    // Candidate profile
    {
      $lookup: {
        from: 'candidateprofiles',   // ĐÚNG tên collection CandidateProfile
        let: { uid: '$otherParticipantId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$userId', '$$uid'] } } },
          { $project: { _id: 0, avatar: 1, fullname: 1 } }
        ],
        as: 'candProfile'
      }
    },
    // Recruiter profile
    {
      $lookup: {
        from: 'recruiterprofiles',   // ĐÚNG tên collection RecruiterProfile
        let: { uid: '$otherParticipantId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$userId', '$$uid'] } } },
          { $project: { _id: 0, company: { name: 1, logo: 1 } } }
        ],
        as: 'recProfile'
      }
    },
    {
      $addFields: {
        candProfile: { $first: '$candProfile' },
        recProfile: { $first: '$recProfile' }
      }
    },
    // Tạo avatar + displayName theo role
    {
      $addFields: {
        otherParticipantAvatar: {
          $cond: [
            { $eq: ['$otherParticipantRole', 'candidate'] },
            '$candProfile.avatar',
            {
              $cond: [
                { $eq: ['$otherParticipantRole', 'recruiter'] },
                '$recProfile.company.logo',
                null
              ]
            }
          ]
        },
        // candidate: ưu tiên fullname → name
        otherParticipantDisplayName: {
          $cond: [
            { $eq: ['$otherParticipantRole', 'candidate'] },
            {
              $let: {
                vars: {
                  name1: { $ifNull: ['$candProfile.fullname', ''] },
                },
                in: {
                  $ifNull: ['$$name1', '']
                }
              }
            },
            // recruiter: dùng company.name → fallback fullname → fallback user.name
            {
              $ifNull: [
                '$recProfile.company.name',
                { $ifNull: ['$recProfile.fullname', '$participant2Details.name'] }
              ]
            }
          ]
        }
      }
    },

    // Populate applications for context if type is APPLICATION
    {
      $lookup: {
        from: 'applications',
        let: {
          appIds: { $ifNull: ['$context.applicationIds', []] },
          ctxId: '$context.contextId'
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  { $in: ['$_id', '$$appIds'] },
                  { $eq: ['$_id', '$$ctxId'] }
                ]
              }
            }
          },
          {
            $lookup: {
              from: 'jobs',
              localField: 'jobId',
              foreignField: '_id',
              as: 'job'
            }
          },
          { $unwind: { path: '$job', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              applicationId: '$_id',
              jobId: '$jobId',
              jobTitle: '$job.title',
              status: 1,
              appliedAt: 1
            }
          },
          { $sort: { appliedAt: -1 } }
        ],
        as: 'contextApplications'
      }
    },
    {
      $addFields: {
        'context.applications': {
          $cond: {
            if: { $eq: ['$context.type', 'APPLICATION'] },
            then: '$contextApplications',
            else: []
          }
        },
        'context.status': {
          $cond: {
            if: {
              $and: [
                { $eq: ['$context.type', 'APPLICATION'] },
                { $gt: [{ $size: '$contextApplications' }, 0] }
              ]
            },
            then: { $arrayElemAt: ['$contextApplications.status', 0] },
            else: null
          }
        }
      }
    },


    // Project để định hình lại output
    {
      $project: {
        _id: 1, // conversationId
        lastMessageAt: 1,
        latestMessage: { // Định hình lại thông tin tin nhắn cuối cùng
          _id: '$latestMessage._id',
          senderId: '$latestMessage.senderId',
          recipientId: '$latestMessage.recipientId',
          content: '$latestMessage.content',
          sentAt: '$latestMessage.sentAt',
          isRead: '$latestMessage.isRead',
          status: '$latestMessage.status'
        },
        // Lấy thông tin người đối diện (người không phải là userId hiện tại)
        otherParticipant: {
          _id: '$otherParticipantObj._id',
          role: '$otherParticipantObj.role',
          email: '$otherParticipantObj.email',
          name: '$otherParticipantDisplayName',
          avatar: '$otherParticipantAvatar'
        },
        unreadCount: 1,
        context: 1 // Include context in the projection
      }
    }
  ];

  // Add search filter if provided
  if (search) {
    pipeline.push({
      $match: {
        'otherParticipant.name': { $regex: search, $options: 'i' }
      }
    });
  }

  // Add sorting
  pipeline.push({ $sort: { lastMessageAt: -1 } });

  // Add facet for pagination
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        { $limit: limitNum }
      ],
      totalCount: [
        { $count: 'count' }
      ]
    }
  });

  const result = await Conversation.aggregate(pipeline);

  const conversations = result[0].data;
  const totalItems = result[0].totalCount[0] ? result[0].totalCount[0].count : 0;
  const totalPages = Math.ceil(totalItems / limitNum);

  return {
    data: conversations,
    meta: {
      currentPage: pageNum,
      totalPages,
      totalItems,
      limit: limitNum
    }
  };
};

/**
 * Chỉ tạo một cuộc trò chuyện mới nếu nó chưa tồn tại.
 * @param {string} currentUserId - ID của người dùng hiện tại.
 * @param {string} otherUserId - ID của người dùng khác.
 * @returns {Promise<Object>} Conversation document mới được tạo.
 */
export const createConversation = async (currentUserId, otherUserId) => {
  if (currentUserId === otherUserId) {
    throw new BadRequestError('Bạn không thể tạo cuộc trò chuyện với chính mình.');
  }

  // Kiểm tra người dùng có tồn tại không
  const otherUser = await User.findById(otherUserId);
  if (!otherUser) {
    throw new NotFoundError('Người dùng bạn muốn trò chuyện không tồn tại.');
  }

  // Kiểm tra xem cuộc trò chuyện đã tồn tại chưa
  const existingConversation = await findPrivateConversation(currentUserId, otherUserId);
  if (existingConversation) {
    throw new BadRequestError('Cuộc trò chuyện đã tồn tại.');
  }

  // Sắp xếp ID để lưu vào DB một cách nhất quán
  const [p1, p2] = [new mongoose.Types.ObjectId(currentUserId), new mongoose.Types.ObjectId(otherUserId)].sort((a, b) => a.toString().localeCompare(b.toString()));

  // Determine context
  let context = null;
  // Identify roles to call determineConversationContext correctly
  // We need to know who is recruiter and who is candidate
  // This is a bit tricky without fetching user roles, but we can try to fetch profiles
  // Or we can rely on the caller to provide roles, but createConversation signature is fixed.
  // Let's try to fetch users to be sure.
  const user1 = await User.findById(currentUserId);
  const user2 = await User.findById(otherUserId);

  if (user1 && user2) {
    let recruiterId, candidateId;
    if (user1.role === 'recruiter' && user2.role === 'candidate') {
      recruiterId = currentUserId;
      candidateId = otherUserId;
    } else if (user1.role === 'candidate' && user2.role === 'recruiter') {
      recruiterId = otherUserId;
      candidateId = currentUserId;
    }

    if (recruiterId && candidateId) {
      context = await determineConversationContext(recruiterId, candidateId);
    }
  }

  const newConversation = await Conversation.create({
    participant1: p1,
    participant2: p2,
    context: context
  });

  logger.info(`Created new private conversation: ${newConversation._id} between ${currentUserId} and ${otherUserId}`);

  // Populate thông tin để trả về cho client
  const populatedConversation = await getConversationById(newConversation._id.toString(), currentUserId);
  return populatedConversation;
};

/**
 * Lấy thông tin chi tiết của một cuộc trò chuyện.
 * @param {string} conversationId - ID của cuộc trò chuyện.
 * @param {string} currentUserId - ID của người dùng hiện tại để xác định "otherParticipant".
 * @returns {Promise<Object>} Thông tin chi tiết của cuộc trò chuyện.
 */
export const getConversationById = async (conversationId, currentUserId) => {
  const conversation = await Conversation.findById(conversationId)
    .populate('participant1', 'email role')
    .populate('participant2', 'email role')
    .lean();

  if (!conversation) {
    throw new NotFoundError('Cuộc trò chuyện không tồn tại.');
  }

  // Kiểm tra quyền truy cập
  const currentUserIdStr = currentUserId.toString();
  const participant1IdStr = conversation.participant1._id.toString();
  const participant2IdStr = conversation.participant2._id.toString();

  const isParticipant = [participant1IdStr, participant2IdStr].includes(currentUserIdStr);

  if (!isParticipant) {
    console.error(`[getConversationById] Access denied. CurrentUser: ${currentUserIdStr}, Participants: [${participant1IdStr}, ${participant2IdStr}]`);
    throw new BadRequestError('Bạn không có quyền truy cập cuộc trò chuyện này.');
  }

  // Get profile data for both participants
  const getParticipantDetails = async (user) => {
    let fullName = user.email; // fallback to email
    let avatar = null;

    if (user.role === 'candidate') {
      const profile = await CandidateProfile.findOne({ userId: user._id }).select('fullname avatar').lean();
      if (profile) {
        fullName = profile.fullname || fullName;
        avatar = profile.avatar;
      }
    } else if (user.role === 'recruiter') {
      const profile = await RecruiterProfile.findOne({ userId: user._id }).select('fullname company.name company.logo').lean();
      if (profile) {
        fullName = profile.company?.name || profile.fullname || fullName;
        avatar = profile.company?.logo || null;
      }
    }

    return {
      ...user,
      name: fullName,
      avatar
    };
  };

  // Enrich both participants with profile data
  conversation.participant1 = await getParticipantDetails(conversation.participant1);
  conversation.participant2 = await getParticipantDetails(conversation.participant2);

  // Xác định người đối diện
  const otherParticipant = participant1IdStr === currentUserIdStr
    ? conversation.participant2
    : conversation.participant1;

  // Update context status if APPLICATION
  if (conversation.context && conversation.context.type === 'APPLICATION') {
    // Populate applications from applicationIds
    if (conversation.context.applicationIds && conversation.context.applicationIds.length > 0) {
      const applications = await Application.find({ _id: { $in: conversation.context.applicationIds } })
        .populate('jobId', 'title')
        .select('_id status appliedAt jobId')
        .lean();

      // Sort applications to match the order in applicationIds or just by appliedAt
      // Let's sort by appliedAt desc
      applications.sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));

      conversation.context.applications = applications.map(app => ({
        applicationId: app._id,
        jobId: app.jobId._id,
        jobTitle: app.jobId.title,
        status: app.status,
        appliedAt: app.appliedAt
      }));

      // Set primary status from the first application (most recent)
      if (applications.length > 0) {
        conversation.context.status = applications[0].status;
      }
    }
  }

  return {
    _id: conversation._id,
    participant1: conversation.participant1,
    participant2: conversation.participant2,
    participants: [conversation.participant1, conversation.participant2],
    otherParticipant: otherParticipant,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    context: conversation.context // Include context in response
  };
};
