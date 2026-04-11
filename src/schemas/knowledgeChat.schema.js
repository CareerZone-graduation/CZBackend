import { z } from 'zod';

export const chatSchema = z.object({
  message: z.string().min(1, 'Vui lòng nhập câu hỏi').max(500, 'Câu hỏi quá dài'),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string()
  })).optional().default([]),
  stream: z.boolean().optional()
});