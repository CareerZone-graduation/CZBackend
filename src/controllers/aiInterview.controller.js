import * as aiInterviewService from '../services/aiInterview.service.js';

export const chat = async (req, res, next) => {
    try {
        req.noCompression = true; // Bypass compression middleware

        const { sessionId, message, isStart, topic, avatarType } = req.body;

        // Validate inputs loosely, or let standard validation handle it
        if (!sessionId) {
            return res.status(400).json({ success: false, message: 'Session ID is required' });
        }

        // Tắt bộ đệm (buffering) để stream được pass-through thời gian thực
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('X-Accel-Buffering', 'no'); // Tắt buffer cho Nginx (có thể dùng ở môi trường web)

        // Connect to the stream
        await aiInterviewService.proxyStreamChat(
            { sessionId, message, isStart, topic, avatarType },
            req.user,
            res
        );
    } catch (error) {
        next(error);
    }
};

export const tts = async (req, res, next) => {
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ success: false, message: 'Text is required' });
        }

        await aiInterviewService.proxyStreamTTS(text, req.user, res);
    } catch (error) {
        next(error);
    }
};

export const transcribe = async (req, res, next) => {
    try {
        const { audioData } = req.body;
        if (!audioData) {
            return res.status(400).json({ success: false, message: 'audioData is required' });
        }

        const result = await aiInterviewService.proxyTranscribe(audioData, req.user);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

export const endSession = async (req, res, next) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ success: false, message: 'sessionId is required' });
        }

        const result = await aiInterviewService.proxyEndSession(sessionId, req.user);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

export const getSimliToken = async (req, res, next) => {
    try {
        const { faceId } = req.body;
        if (!faceId) {
            return res.status(400).json({ success: false, message: 'faceId is required' });
        }
        const result = await aiInterviewService.proxySimliToken(faceId, req.user);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

export const getSimliIceServers = async (req, res, next) => {
    try {
        const result = await aiInterviewService.proxySimliIceServers(req.user);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

export const getAssemblyAIToken = async (req, res, next) => {
    try {
        const result = await aiInterviewService.proxyAssemblyAIToken(req.user);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};
