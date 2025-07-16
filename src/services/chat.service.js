// src/services/chat.service.js
import ChatMessage from '../models/ChatMessage.js';
import Conversation from '../models/Conversation.js';
import User from '../models/User.js';
import CandidateProfile from '../models/CandidateProfile.js';
import RecruiterProfile from '../models/RecruiterProfile.js';
import { NotFoundError, BadRequestError } from '../utils/AppError.js';
import logger from '../utils/logger.js';
import mongoose from 'mongoose';

/**
 * Tìm một cuộc trò chuyện 1-1 duy nhất giữa hai người dùng.
 * @param {string} userId1 - ID của người dùng thứ nhất.
 * @param {string} userId2 - ID của người dùng thứ hai.
 * @returns {Promise<Object|null>} Conversation document hoặc null nếu không tìm thấy.
 */
const findPrivateConversation = async (userId1, userId2) => {
  const p1 = new mongoose.Types.ObjectId(userId1);
  const p2 = new mongoose.Types.ObjectId(userId2);
  const [participant1, participant2] = [p1, p2].sort((a, b) => a.toString().localeCompare(b.toString()));

  return Conversation.findOne({
    participant1: participant1,
    participant2: participant2
  }).lean();
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
  const isParticipant = [conversation.participant1.toString(), conversation.participant2.toString()].includes(currentUserId);
  if (!isParticipant) {
    throw new BadRequestError('Bạn không có quyền truy cập cuộc trò chuyện này.');
  }

  // Lấy tin nhắn và tổng số tin nhắn
  const [messages, totalMessages] = await Promise.all([
    ChatMessage.find({ conversationId })
      .sort({ sentAt: -1 }) // Sắp xếp mới nhất lên đầu
      .skip(skip)
      .limit(limit)
      .populate('senderId', 'name role')
      .lean(),
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

  const isParticipant = conversation.participant1.toString() === userId || 
                       conversation.participant2.toString() === userId;
  if (!isParticipant) {
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
export const getLatestConversations = async (userId) => {
    const objectUserId = new mongoose.Types.ObjectId(userId);

    const conversations = await Conversation.aggregate([
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
                localField: 'participant1',
                foreignField: '_id',
                as: 'participant1Details'
            }
        },
        { $unwind: '$participant1Details' },
        
        // Populate participant2 details
        {
            $lookup: {
                from: 'users',
                localField: 'participant2',
                foreignField: '_id',
                as: 'participant2Details'
            }
        },
        { $unwind: '$participant2Details' },
        
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
                    $cond: {
                        if: { $eq: ['$participant1', objectUserId] },
                        then: '$participant2Details',
                        else: '$participant1Details'
                    }
                },
                unreadCount: 1
            }
        },
        // Sắp xếp các cuộc trò chuyện theo thời gian của tin nhắn cuối cùng
        { $sort: { lastMessageAt: -1 } }
    ]);

    // Bổ sung thông tin avatar/logo cho `otherParticipant` dựa trên vai trò của họ
    for (const convo of conversations) {
        if (convo.otherParticipant) {
            const otherParticipantId = convo.otherParticipant._id;
            const otherParticipantRole = convo.otherParticipant.role;
            let avatarUrl = null;

            if (otherParticipantRole === 'candidate') {
                const profile = await CandidateProfile.findOne({ userId: otherParticipantId }).select('avatar').lean();
                avatarUrl = profile ? profile.avatar : null;
            } else if (otherParticipantRole === 'recruiter') {
                const profile = await RecruiterProfile.findOne({ userId: otherParticipantId }).select('company.logo').lean();
                avatarUrl = profile && profile.company ? profile.company.logo : null;
            }
            convo.otherParticipant.avatar = avatarUrl;
        } else {
            // Trường hợp không tìm thấy `otherParticipant` (ví dụ: người dùng đã bị xóa)
            convo.otherParticipant = null; // Đặt thành null để tránh lỗi frontend
        }
    }

    return conversations;
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

  const newConversation = await Conversation.create({
    participant1: p1,
    participant2: p2,
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
    .populate('participant1', 'name role')
    .populate('participant2', 'name role')
    .lean();

  if (!conversation) {
    throw new NotFoundError('Cuộc trò chuyện không tồn tại.');
  }

  // Kiểm tra quyền truy cập
  const isParticipant = [conversation.participant1._id.toString(), conversation.participant2._id.toString()].includes(currentUserId);
  if (!isParticipant) {
    throw new BadRequestError('Bạn không có quyền truy cập cuộc trò chuyện này.');
  }

  // Xác định người đối diện
  const otherParticipant = conversation.participant1._id.toString() === currentUserId
    ? conversation.participant2
    : conversation.participant1;

  // Lấy avatar/logo cho người đối diện
  let avatarUrl = null;
  if (otherParticipant.role === 'candidate') {
    const profile = await CandidateProfile.findOne({ userId: otherParticipant._id }).select('avatar').lean();
    avatarUrl = profile ? profile.avatar : null;
  } else if (otherParticipant.role === 'recruiter') {
    const profile = await RecruiterProfile.findOne({ userId: otherParticipant._id }).select('company.logo').lean();
    avatarUrl = profile && profile.company ? profile.company.logo : null;
  }
  
  otherParticipant.avatar = avatarUrl;

  return {
    _id: conversation._id,
    participants: [conversation.participant1, conversation.participant2],
    otherParticipant: otherParticipant,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
};
