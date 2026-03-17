import * as aiService from '../services/ai.service.js';
import logger from '../utils/logger.js';

/**
 * Enhance job content with AI streaming
 * @route POST /api/ai/enhance-job
 */
export const enhanceJobContent = async (req, res) => {
  try {
    const jobData = req.body;

    if (!jobData || Object.keys(jobData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Job data is required'
      });
    }

    logger.info('Starting job enhancement streaming');

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    
    // Flush headers to establish stream before waiting for data
    if (res.flushHeaders) {
      res.flushHeaders();
    }

    // Get stream from FastAPI
    const stream = await aiService.enhanceJobContent(jobData);
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          logger.info('Stream completed');
          break;
        }

        // Decode and write chunk to response
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
        
        // Ensure chunk is sent immediately
        if (typeof res.flush === 'function') {
          res.flush();
        }
      }
    } catch (streamError) {
      logger.error('Stream error:', streamError);
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`);
    } finally {
      reader.releaseLock();
      res.end();
    }
  } catch (error) {
    logger.error('Error in enhanceJobContent controller:', error);

    // If headers not sent yet, send JSON error
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to enhance job content',
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    } else {
      // Headers already sent, send SSE error event
      res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
};


/**
 * Generate smart suggestions based on job title
 * @route POST /api/ai/smart-suggestions
 */
export const generateSmartSuggestions = async (req, res) => {
  try {
    const { jobTitle } = req.body;

    if (!jobTitle || jobTitle.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Job title is required (minimum 3 characters)'
      });
    }

    const suggestions = await aiService.generateSmartSuggestions(jobTitle);

    res.status(200).json({
      success: true,
      message: 'Smart suggestions generated successfully',
      data: suggestions
    });
  } catch (error) {
    logger.error('Error in generateSmartSuggestions controller:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate suggestions'
    });
  }
};
