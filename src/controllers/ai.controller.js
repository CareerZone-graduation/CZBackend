import * as aiService from '../services/ai.service.js';
import { BadRequestError } from '../utils/AppError.js';

export const chatWithBot = (req, res) => {
  const { query } = req.body;

  if (!query) {
    throw new BadRequestError('Query is required');
  }

  // Disable response compression for this route to allow streaming
  req.noCompression = true;

  // Set headers for streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  aiService.streamChatbotResponse(query, res);
};
