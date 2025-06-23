import { z } from 'zod';

/**
 * Chat related validation schemas
 */

/**
 * Send message request validation schema
 * @typedef {Object} SendMessageRequest
 * @property {string} recipientId - ID of the message recipient
 * @property {string} content - Message content (max 1000 chars)
 */
export const sendMessageSchema = z.object({
  recipientId: z.string()
    .min(1, 'Recipient ID is required'),
  content: z.string()
    .min(1, 'Message content cannot be empty')
    .max(1000, 'Message content cannot exceed 1000 characters')
    .trim()
});

/**
 * Mark messages as read request validation schema
 * @typedef {Object} MarkAsReadRequest
 * @property {Array<string>} messageIds - Array of message IDs to mark as read
 */
export const markAsReadSchema = z.object({
  messageIds: z.array(z.string())
    .min(1, 'At least one message ID is required')
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
