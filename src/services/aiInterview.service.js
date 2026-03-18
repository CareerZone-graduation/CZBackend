import axios from 'axios';
import config from '../config/index.js';
import { AppError } from '../utils/AppError.js';
import logger from '../utils/logger.js';
import { Readable } from 'stream';

const PYTHON_API_URL = config.PYTHON_SERVICE_URL || 'http://localhost:8000';

/**
 * Helper function to create an axios instance with the internal secret
 */
const getInternalClient = (timeout = 15000, responseType = 'json') => {
    return axios.create({
        baseURL: PYTHON_API_URL,
        timeout,
        responseType,
        headers: {
            'Content-Type': 'application/json',
            // Internal validation for FastAPI to trust this request
            'x-internal-secret': config.INTERNAL_API_KEY || 'careerzone_internal_secret_key',
        },
    });
};

/**
 * Appends user context to payload
 */
const withUserContext = (payload, user) => {
    return {
        ...payload,
        userId: user._id.toString(),
    };
};

export const proxyStreamChat = async (payload, user, res) => {
    try {
        const url = `${PYTHON_API_URL}/api/v1/chat`;
        logger.info(`[aiInterview.service] Streaming chat from ${url}`);

        // Sử dụng Native Fetch để bypass Buffer cho Real-time Stream
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify(withUserContext(payload, user)),
            headers: {
                'x-internal-secret': config.INTERNAL_API_KEY || 'careerzone_internal_secret_key',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Python API Error: ${response.status} ${response.statusText}`);
        }

        // Bóc tách X-AI-Response header từ luồng ngay lập tức
        const aiResponseEnc = response.headers.get('x-ai-response');
        if (aiResponseEnc) {
            res.setHeader('X-AI-Response', aiResponseEnc);
            res.setHeader('Access-Control-Expose-Headers', 'X-AI-Response');
        }

        // Maintain content type for streaming audio
        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');

        // Bơm stream trực tiếp qua luồng Node stream
        Readable.fromWeb(response.body).pipe(res);

    } catch (error) {
        logger.error('[aiInterview.service] proxyStreamChat error', error.message);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

export const proxyStreamTTS = async (text, user, res) => {
    try {
        const url = `${PYTHON_API_URL}/api/v1/tts`;

        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({ text }),
            headers: {
                'x-internal-secret': config.INTERNAL_API_KEY || 'careerzone_internal_secret_key',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Python TTS API Error: ${response.status} ${response.statusText}`);
        }

        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
        Readable.fromWeb(response.body).pipe(res);
    } catch (error) {
        logger.error('[aiInterview.service] proxyStreamTTS error', error.message);
        res.status(500).json({ success: false, message: 'TTS Error' });
    }
};

export const proxyTranscribe = async (audioData, user) => {
    try {
        // Transcribe involves calling AssemblyAI and polling up to 60 times.
        // Set a very high timeout (e.g. 60 seconds)
        const client = getInternalClient(60000);
        const response = await client.post('/api/v1/transcribe', { audioData });
        return response.data;
    } catch (error) {
        logger.error('[aiInterview.service] proxyTranscribe error', error.message);
        throw new AppError(error.response?.data?.detail || 'Transcription failed', error.response?.status || 500);
    }
};

export const proxyEndSession = async (sessionId, user) => {
    try {
        const client = getInternalClient();
        const response = await client.post('/api/v1/end', { sessionId });
        return response.data;
    } catch (error) {
        logger.error('[aiInterview.service] proxyEndSession error', error.message);
        throw new AppError(error.response?.data?.detail || 'End session failed', error.response?.status || 500);
    }
};

export const proxySimliToken = async (faceId, user) => {
    try {
        const client = getInternalClient();
        const response = await client.post('/api/v1/simli/get-session-token', { faceId });
        return response.data;
    } catch (error) {
        logger.error('[aiInterview.service] proxySimliToken error', error.message);
        throw new AppError(error.response?.data?.detail || 'Failed getting Simli token', error.response?.status || 500);
    }
};

export const proxySimliIceServers = async (user) => {
    try {
        const client = getInternalClient();
        const response = await client.get('/api/v1/simli/get-ice-servers');
        return response.data;
    } catch (error) {
        logger.error('[aiInterview.service] proxySimliIceServers error', error.message);
        throw new AppError(error.response?.data?.detail || 'Failed getting Simli ICE servers', error.response?.status || 500);
    }
};

export const proxyAssemblyAIToken = async (user) => {
    try {
        const client = getInternalClient();
        // Assuming python implements this route. Since NodeJS didn't proxy this exactly earlier, if Python doesn't have it, we might need a direct call.
        // Let's proxy to Python since Python has AssemblyAI integration setup.
        const response = await client.get('/api/v1/assemblyai/token');
        return response.data;
    } catch (error) {
        logger.error('[aiInterview.service] proxyAssemblyAIToken error', error.message);
        throw new AppError(error.response?.data?.detail || 'Failed getting AssemblyAI token', error.response?.status || 500);
    }
};
