import { z } from 'zod';

/**
 * Chat related validation schemas
 */

/**
 * Send message request validation schema
 * @typedef {Object} SendMessageRequest
 * @property {string} conversationId - ID of the conversation
 * @property {string} content - Message content
 * @property {string} type - Message type (text, image, file)
 * @property {Object} metadata - Optional metadata for files
 */
export const sendMessageSchema = z.object({
  conversationId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, 'ID cuộc trò chuyện không hợp lệ'),
  content: z.string()
    .min(1, 'Nội dung tin nhắn không được để trống')
    .max(1000, 'Nội dung tin nhắn không được vượt quá 1000 ký tự')
    .trim(),
  type: z.enum(['text', 'image', 'file']).default('text'),
  metadata: z.object({
    fileName: z.string().optional(),
    fileSize: z.number().optional(),
    mimeType: z.string().optional()
  }).optional()
});

/**
 * Mark messages as read request validation schema
 * @typedef {Object} MarkAsReadRequest
 * @property {Array<string>} messageIds - Array of message IDs to mark as read
 */
export const markAsReadSchema = z.object({
  messageIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID tin nhắn không hợp lệ'))
    .min(1, 'Cần cung cấp ít nhất một ID tin nhắn để đánh dấu đã đọc')
});

/**
 * Mark message as delivered request validation schema
 * @typedef {Object} MarkAsDeliveredRequest
 * @property {string} messageId - Message ID to mark as delivered
 */
export const markAsDeliveredSchema = z.object({
  messageId: z.string()
    .min(1, 'Message ID is required')
});

/**
 * Chatbot message request validation schema
 * @typedef {Object} ChatbotMessageRequest
 * @property {string} message - Message to send to chatbot (max 500 chars)
 */
export const chatbotMessageSchema = z.object({
  message: z.string()
    .min(1, 'Message cannot be blank')
    .max(500, 'Message cannot exceed 500 characters')
    .trim()
});

/**
 * Create conversation request validation schema
 * @typedef {Object} CreateConversationRequest
 * @property {string} otherUserId - ID of the other user to start conversation with
 */
export const createConversationSchema = z.object({
  otherUserId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, 'ID người dùng không hợp lệ')
});

/**
 * Create or get conversation request validation schema (for recruiters)
 * @typedef {Object} CreateOrGetConversationRequest
 * @property {string} candidateId - ID of the candidate to start conversation with
 */
export const createOrGetConversationSchema = z.object({
  candidateId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, 'ID ứng viên không hợp lệ')
    .optional(),
  recipientId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, 'ID người nhận không hợp lệ')
    .optional(),
  jobId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, 'ID công việc không hợp lệ')
    .optional()
}).refine(data => data.candidateId || data.recipientId, {
  message: "Phải cung cấp candidateId hoặc recipientId"
});

/**
 * Update conversation context request validation schema
 */
export const updateContextSchema = z.object({
  type: z.enum(['APPLICATION', 'PROFILE_UNLOCK']),
  contextId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID ngữ cảnh không hợp lệ'),
  title: z.string().optional(),
  data: z.record(z.any()).optional()
});
