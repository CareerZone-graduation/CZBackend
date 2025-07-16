// src/controllers/chat.controller.js
import asyncHandler from 'express-async-handler';
import * as chatService from '../services/chat.service.js';
import {
  markAsReadSchema,
  createConversationSchema,
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
  const { page, limit } = req.query;

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
    const conversations = await chatService.getLatestConversations(req.user._id);

    res.status(200).json({
        success: true,
        message: 'Lấy danh sách cuộc trò chuyện thành công.',
        data: conversations,
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
