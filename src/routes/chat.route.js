// src/routes/chat.route.js
import express from 'express';
import * as chatController from '../controllers/chat.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateParams, validateQuery, validateBody } from '../middleware/validation.middleware.js';
import { idParamSchema, paginationSchema } from '../schemas/common.schema.js';
import { markAsReadSchema, createConversationSchema, sendMessageSchema } from '../schemas/chat.schema.js';
import { z } from 'zod';

const router = express.Router();

// Tất cả các route chat đều yêu cầu xác thực
router.use(authenticate);

// Tạo cuộc trò chuyện mới với người dùng khác
router.post(
  '/conversations',
  validateBody(createConversationSchema),
  chatController.createNewConversation
);

// Lấy danh sách các cuộc trò chuyện gần đây của người dùng
router.get(
  '/conversations',
  chatController.getLatestConversations
);

// Lấy thông tin chi tiết của một cuộc trò chuyện
router.get(
  '/conversations/:conversationId',
  validateParams(z.object({ conversationId: idParamSchema.shape.id })),
  chatController.getConversationDetails
);

// Lấy lịch sử tin nhắn trong một cuộc trò chuyện cụ thể
router.get(
  '/conversations/:conversationId/messages',
  validateParams(z.object({ conversationId: idParamSchema.shape.id })),
  validateQuery(paginationSchema),
  chatController.getMessagesInConversation
);

// Đánh dấu tin nhắn là đã đọc
router.patch(
  '/messages/read',
  validateBody(markAsReadSchema),
  chatController.markMessagesAsRead
);


// Đánh dấu cuộc trò chuyện đã đọc
router.put(
  '/conversations/:conversationId/read',
  validateParams(z.object({ conversationId: idParamSchema.shape.id })),
  chatController.markConversationAsRead
);

export default router;
