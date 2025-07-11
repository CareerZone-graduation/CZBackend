import axios from 'axios';
import logger  from '../utils/logger.js';

const PYTHON_API_URL = 'http://localhost:8000/api/v1/chat';

/**
 * Calls the Python AI chatbot service and streams the response.
 * @param {string} query - The user's query.
 * @param {import('express').Response} res - The Express response object to stream to.
 */
export const streamChatbotResponse = async (query, res) => {
  try {
    logger.info(`Forwarding query to Python service: "${query}"`);

    const chatbotResponse = await axios({
      method: 'post',
      url: PYTHON_API_URL,
      data: { query },
      responseType: 'stream',
    });

    // Forward the stream directly to the client
    chatbotResponse.data.pipe(res);

    chatbotResponse.data.on('error', (error) => {
      logger.error('Error from Python service stream:', error);
      if (!res.headersSent) {
        res.status(500).send('Error from chatbot service');
      } else {
        res.end();
      }
    });

    chatbotResponse.data.on('end', () => {
      logger.info('Python service stream ended.');
      res.end();
    });
  } catch (error) {
    logger.error('Error connecting to Python service:', error.message);
    if (error.response) {
      logger.error('Python service response error:', error.response.status, error.response.data.toString());
    }
    if (!res.headersSent) {
      res.status(502).send('Could not connect to chatbot service');
    } else {
      res.end();
    }
  }
};
