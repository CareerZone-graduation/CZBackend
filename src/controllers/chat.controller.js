// src/controllers/chat.controller.js
import asyncHandler from 'express-async-handler';
import * as chatService from '../services/chat.service.js';
import Conversation from '../models/Conversation.js';
import {
  markAsReadSchema,
  createConversationSchema,
  createOrGetConversationSchema,
  sendMessageSchema,
} from '../schemas/chat.schema.js';
import { paginationSchema } from '../schemas/common.schema.js';
import { z } from 'zod';
import logger from '../utils/logger.js';

/**
 * @desc    Get messages in a conversation
 * @route   GET /api/chat/conversations/:conversationId/messages
 * @access  Private
 */
export const getMessagesInConversation = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const { page, limit } = req.validatedQuery || req.query;

  const result = await chatService.getConversationMessages(
    req.user._id,
    conversationId,
    { page, limit }
  );

  res.status(200).json({
    success: true,
    message: 'Lấy lịch sử tin nhắn thành công.',
    meta: result.meta,
    data: result.data,
  });
});

/**
 * @desc    Mark one or more messages as read by the current user
 * @route   PATCH /api/chat/messages/read
 * @access  Private
 */
export const markMessagesAsRead = asyncHandler(async (req, res) => {
  const { messageIds } = req.body;

  await chatService.markMessagesAsRead(req.user._id, messageIds);

  res.status(200).json({
    success: true,
    message: 'Đánh dấu tin nhắn đã đọc thành công.',
  });
});

/**
 * @desc    Get latest conversations for the current user
 * @route   GET /api/chat/conversations
 * @access  Private
 */
export const getLatestConversations = asyncHandler(async (req, res) => {
  const { search, page, limit } = req.query;

  const result = await chatService.getLatestConversations(req.user._id, {
    search,
    page,
    limit
  });

  res.status(200).json({
    success: true,
    message: 'Lấy danh sách cuộc trò chuyện thành công.',
    data: result.data,
    meta: result.meta
  });
});

/**
 * @desc    Create a new conversation with another user
 * @route   POST /api/chat/conversations
 * @access  Private
 */
export const createNewConversation = asyncHandler(async (req, res) => {
  const { otherUserId } = req.body;
  logger.info(`Creating conversation with user ${otherUserId} for user ${req.user._id}`);

  const conversation = await chatService.createConversation(req.user._id, otherUserId);

  res.status(201).json({
    success: true,
    message: 'Tạo cuộc trò chuyện thành công.',
    data: conversation,
  });
});

/**
 * @desc    Get details of a specific conversation
 * @route   GET /api/chat/conversations/:conversationId
 * @access  Private
 */
export const getConversationDetails = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;

  const conversation = await chatService.getConversationById(conversationId, req.user._id);

  res.status(200).json({
    success: true,
    message: 'Lấy thông tin cuộc trò chuyện thành công.',
    data: conversation,
  });
});


/**
 * @desc    Mark messages in a conversation as read
 * @route   PUT /api/chat/conversations/:conversationId/read
 * @access  Private
 */
export const markConversationAsRead = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;

  await chatService.markConversationAsRead(req.user._id, conversationId);

  res.status(200).json({
    success: true,
    message: 'Đánh dấu cuộc trò chuyện đã đọc thành công.',
  });
});

/**
 * @desc    Check if recruiter can message a candidate
 * @route   GET /api/chat/access-check/:candidateId
 * @access  Private (Recruiter or Candidate)
 */
export const checkMessagingAccess = asyncHandler(async (req, res) => {
  const { candidateId } = req.params;
  const currentUserId = req.user._id;
  const currentUserRole = req.user.role;

  // If current user is the candidate, they can always receive messages
  if (currentUserRole === 'candidate' && currentUserId === candidateId) {
    return res.status(200).json({
      success: true,
      data: {
        canMessage: true,
        reason: 'SELF'
      }
    });
  }

  // If current user is a recruiter, check access rules
  if (currentUserRole === 'recruiter') {
    const accessResult = await chatService.checkMessagingAccess(currentUserId, candidateId);

    return res.status(200).json({
      success: true,
      data: accessResult
    });
  }

  // For other cases, deny access
  res.status(403).json({
    success: false,
    message: 'Bạn không có quyền kiểm tra quyền truy cập này.'
  });
});

/**
 * @desc    Create or get conversation with a candidate (for recruiters)
 * @route   POST /api/chat/conversations
 * @access  Private (Recruiter only)
 */
export const createOrGetConversation = asyncHandler(async (req, res) => {
  const { candidateId, recipientId } = req.body;
  const currentUserId = req.user._id;
  const currentUserRole = req.user.role;

  // Determine target user ID (recipient)
  const targetUserId = recipientId || candidateId;

  if (!targetUserId) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng cung cấp ID người nhận.'
    });
  }

  logger.info(`User ${currentUserId} (${currentUserRole}) attempting to create/get conversation with ${targetUserId}`);

  // Specific logic for Recruiter -> Candidate
  if (currentUserRole === 'recruiter') {
    // Check messaging access
    const accessResult = await chatService.checkMessagingAccess(currentUserId, targetUserId);

    if (!accessResult.canMessage) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền nhắn tin cho ứng viên này. Vui lòng mở khóa hồ sơ hoặc đợi ứng viên ứng tuyển vào công việc của bạn.',
        reason: accessResult.reason
      });
    }
  }

  // Logic for Candidate -> Recruiter
  // Currently we allow candidates to initiate conversation if they have the Recruiter ID (e.g. from Job Detail)
  // We could add checks here if needed (e.g. must have applied)

  // Check if conversation already exists
  let conversation = await chatService.findPrivateConversation(currentUserId, targetUserId);

  // Context handling logic
  let contextToUpdate = null;

  // If jobId is provided (usually by Candidate), try to find the specific application context
  // We use determineConversationContext to get the full context including all applications
  if (req.body.jobId && currentUserRole === 'candidate') {
    // We need the recruiter's ID. We have recipientId (targetUserId).
    // determineConversationContext expects (recruiterId, candidateId)
    const newContext = await chatService.determineConversationContext(targetUserId, currentUserId);

    if (newContext) {
      contextToUpdate = newContext;
    }
  }

  if (conversation) {
    // If we found a specific context and it's different or newer, update it
    if (contextToUpdate) {
      // Use findByIdAndUpdate since conversation is a lean object
      await Conversation.findByIdAndUpdate(conversation._id, {
        $set: { context: contextToUpdate }
      });
    }

    // Return existing conversation with details
    const conversationDetails = await chatService.getConversationById(
      conversation._id.toString(),
      currentUserId
    );

    return res.status(200).json({
      success: true,
      message: 'Lấy cuộc trò chuyện thành công.',
      data: conversationDetails
    });
  }

  // Create new conversation
  // If we have a specific context, we should pass it to createConversation
  // But createConversation currently calls determineConversationContext internally.
  // We might need to update createConversation to accept an override context, OR update it after creation.

  const newConversation = await chatService.createConversation(currentUserId, targetUserId);

  if (contextToUpdate) {
    newConversation.context = contextToUpdate;
    await newConversation.save();
  }

  res.status(201).json({
    success: true,
    message: 'Tạo cuộc trò chuyện thành công.',
    data: newConversation
  });
});

/**
 * @desc    Update conversation context manually
 * @route   PUT /api/chat/conversations/:conversationId/context
 * @access  Private
 */
export const updateConversationContext = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const contextData = req.body;

  const updatedConversation = await chatService.updateConversationContext(
    conversationId,
    req.user._id,
    contextData
  );

  res.status(200).json({
    success: true,
    message: 'Cập nhật ngữ cảnh cuộc trò chuyện thành công.',
    data: updatedConversation
  });
});
