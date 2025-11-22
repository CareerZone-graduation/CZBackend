// src/routes/chat.route.js
import express from 'express';
import passport from 'passport';
import * as chatController from '../controllers/chat.controller.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as commonSchema from '../schemas/common.schema.js';
import * as chatSchema from '../schemas/chat.schema.js';
import { z } from 'zod';

const router = express.Router();

// Tất cả các route chat đều yêu cầu xác thực
router.use(passport.authenticate('jwt', { session: false }));

// Check messaging access (recruiter or candidate)
router.get(
  '/access-check/:candidateId',
  validationMiddleware.validateParams(z.object({
    candidateId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID ứng viên không hợp lệ')
  })),
  chatController.checkMessagingAccess
);

// Create or get conversation with candidate (recruiter only)
router.post(
  '/conversations',
  validationMiddleware.validateBody(chatSchema.createOrGetConversationSchema),
  chatController.createOrGetConversation
);

// Tạo cuộc trò chuyện mới với người dùng khác (general - for backward compatibility)
router.post(
  '/conversations/general',
  validationMiddleware.validateBody(chatSchema.createConversationSchema),
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
  validationMiddleware.validateParams(z.object({ conversationId: commonSchema.idParamSchema.shape.id })),
  chatController.getConversationDetails
);

// Lấy lịch sử tin nhắn trong một cuộc trò chuyện cụ thể
router.get(
  '/conversations/:conversationId/messages',
  validationMiddleware.validateParams(z.object({ conversationId: commonSchema.idParamSchema.shape.id })),
  validationMiddleware.validateQuery(commonSchema.paginationSchema),
  chatController.getMessagesInConversation
);

// Đánh dấu tin nhắn là đã đọc
router.patch(
  '/messages/read',
  validationMiddleware.validateBody(chatSchema.markAsReadSchema),
  chatController.markMessagesAsRead
);


// Đánh dấu cuộc trò chuyện đã đọc
router.put(
  '/conversations/:conversationId/read',
  validationMiddleware.validateParams(z.object({ conversationId: commonSchema.idParamSchema.shape.id })),
  chatController.markConversationAsRead
);

// Cập nhật ngữ cảnh cuộc trò chuyện
router.put(
  '/conversations/:conversationId/context',
  validationMiddleware.validateParams(z.object({ conversationId: commonSchema.idParamSchema.shape.id })),
  validationMiddleware.validateBody(chatSchema.updateContextSchema),
  chatController.updateConversationContext
);

export default router;
