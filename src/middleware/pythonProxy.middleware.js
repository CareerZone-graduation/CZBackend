/**
 * Python FastAPI Proxy Middleware
 * 
 * Chuyển tiếp các request từ Node.js sang Python FastAPI service.
 * Hỗ trợ WebSocket (WebRTC Signaling), Streaming (SSE), và HTTP requests thông thường.
 * 
 * Chỉ hoạt động khi NODE_ENV = 'development' (hoặc bạn có thể tùy chỉnh).
 * Trong production, nên sử dụng Nginx làm reverse proxy.
 * 
 * @usage
 * - Client gọi: http://localhost:5000/api/python/...
 * - Node.js proxy sang: http://localhost:8000/...
 */

import { createProxyMiddleware } from 'http-proxy-middleware';
import passport from 'passport';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { candidateOnly } from './auth.middleware.js';

// Danh sách các path cần streaming (không buffer response)
const STREAMING_PATHS = [
  '/stream',
  '/sse',
  '/events',
  '/video',
  '/audio',
  '/chat/stream',
  '/ai/stream',
  '/realtime',
];

// Danh sách các path WebSocket
const WEBSOCKET_PATHS = [
  '/ws',
  '/websocket',
  '/socket',
  '/webrtc',
  '/signaling',
];

/**
 * Kiểm tra xem request có phải là streaming request không
 */
const isStreamingRequest = (req) => {
  const url = req.url || '';
  return STREAMING_PATHS.some(path => url.includes(path));
};

/**
 * Kiểm tra xem request có phải là WebSocket upgrade không
 */
const isWebSocketUpgrade = (req) => {
  return req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket';
};

/**
 * Tạo Python Proxy Middleware
 * @returns {Object} { middleware, handleUpgrade }
 */
export const createPythonProxy = () => {
  const pythonServiceUrl = config.PYTHON_SERVICE_URL|| 'http://localhost:8000';
  
  logger.info(`[Python Proxy] Initializing proxy to: ${pythonServiceUrl}`);
  
  const proxyMiddleware = createProxyMiddleware({
    target: pythonServiceUrl,
    changeOrigin: true, // Đổi host header sang target URL
    ws: true, // Bật hỗ trợ WebSocket cho WebRTC Signaling
    
    // Xóa prefix '/api/python' khi gửi sang Python
    pathRewrite: {
      '^/api/python': '',
    },
    
    // Timeout dài hơn cho streaming
    proxyTimeout: 300000, // 5 phút
    timeout: 300000,
    
    // Tắt buffering cho streaming
    selfHandleResponse: false,
    
    // Cấu hình headers
    headers: {
      'X-Forwarded-By': 'nodejs-gateway',
    },
    
    // Event handlers
    on: {
      proxyReq: (proxyReq, req, res) => {
        // Log request được proxy - CHI TIẾT HƠN
        const targetPath = req.url.replace('/api/python', '');
        logger.info(`[Python Proxy] ${req.method} ${req.originalUrl} -> ${pythonServiceUrl}${targetPath}`);
        logger.debug(`[Python Proxy] Headers:`, JSON.stringify(req.headers, null, 2));
        
        // Thêm API key nếu có
        if (config.AI_SERVICE_API_KEY) {
          proxyReq.setHeader('X-API-Key', config.AI_SERVICE_API_KEY);
        }
        
        // Forward user info nếu có (từ JWT middleware)
        if (req.user) {
          proxyReq.setHeader('X-User-Id', req.user._id?.toString() || req.user.id || '');
          proxyReq.setHeader('X-User-Role', req.user.role || '');
        }
      },
      
      proxyRes: (proxyRes, req, res) => {
        // Xử lý streaming response
        if (isStreamingRequest(req)) {
          // Tắt buffering và cache cho streaming
          proxyRes.headers['cache-control'] = 'no-cache, no-store, must-revalidate';
          proxyRes.headers['x-accel-buffering'] = 'no'; // Cho Nginx
          
          logger.debug(`[Python Proxy] Streaming response for: ${req.url}`);
        }
        
        logger.debug(`[Python Proxy] Response ${proxyRes.statusCode} for: ${req.url}`);
      },
      
      error: (err, req, res) => {
        logger.error(`[Python Proxy] Error: ${err.message}`, {
          url: req.url,
          method: req.method,
          error: err.code,
        });
        
        // Chỉ gửi response nếu chưa gửi
        if (!res.headersSent) {
          res.status(502).json({
            success: false,
            message: 'Python service unavailable',
            error: config.NODE_ENV === 'development' ? err.message : undefined,
          });
        }
      },
      
      // WebSocket upgrade handler
      proxyReqWs: (proxyReq, req, socket, options, head) => {
        logger.info(`[Python Proxy] WebSocket upgrade: ${req.url}`);
      },
      
      open: (proxySocket) => {
        logger.debug('[Python Proxy] WebSocket connection opened');
      },
      
      close: (proxyRes, proxySocket, proxyHead) => {
        logger.debug('[Python Proxy] WebSocket connection closed');
      },
    },
  });
  
  return {
    middleware: proxyMiddleware,
    
    /**
     * Handler cho WebSocket upgrade
     * Cần được gọi từ server.on('upgrade', ...)
     */
    handleUpgrade: (req, socket, head) => {
      // Chỉ xử lý upgrade cho path /api/python
      if (req.url?.startsWith('/api/python')) {
        proxyMiddleware.upgrade(req, socket, head);
        return true;
      }
      return false;
    },
  };
};

/**
 * Middleware wrapper để kiểm tra môi trường và authentication
 * @param {Object} options - Cấu hình
 * @param {boolean} options.requireAuth - Yêu cầu xác thực JWT (default: true)
 * @param {string} options.allowedRole - Role được phép truy cập ('candidate', 'recruiter', 'admin', null = tất cả)
 */
export const pythonProxyMiddleware = (options = {}) => {
  const { requireAuth = true, allowedRole = 'candidate' } = options;
  
  // Chỉ tạo proxy trong development (hoặc khi được bật rõ ràng)
  const enableProxy = config.NODE_ENV === 'development' || process.env.ENABLE_PYTHON_PROXY === 'true';
  
  if (!enableProxy) {
    logger.info('[Python Proxy] Disabled in production. Use Nginx instead.');
    return (req, res, next) => {
      res.status(503).json({
        success: false,
        message: 'Python proxy is disabled in production. Please configure Nginx.',
      });
    };
  }
  
  const { middleware } = createPythonProxy();
  
  // Nếu không yêu cầu auth, trả về middleware trực tiếp
  if (!requireAuth) {
    return middleware;
  }
  
  // Tạo middleware chain: JWT Auth -> Role Check -> Proxy
  return (req, res, next) => {
    // Bước 1: Xác thực JWT
    passport.authenticate('jwt', { session: false }, (err, user, info) => {
      if (err) {
        logger.error('[Python Proxy] JWT error:', err);
        return res.status(500).json({
          success: false,
          message: 'Authentication error',
        });
      }
      
      if (!user) {
        logger.warn('[Python Proxy] Unauthorized access attempt:', req.url);
        return res.status(401).json({
          success: false,
          message: 'Authentication required. Please login.',
        });
      }
      
      // Bước 2: Kiểm tra role (nếu có yêu cầu)
      if (allowedRole && user.role !== allowedRole) {
        logger.warn(`[Python Proxy] Access denied for role ${user.role}:`, req.url);
        return res.status(403).json({
          success: false,
          message: `Access denied. Only ${allowedRole} can access this resource.`,
        });
      }
      
      // Gắn user vào request để proxy có thể forward thông tin
      req.user = user;
      
      logger.debug(`[Python Proxy] Authenticated: ${user._id} (${user.role})`);
      
      // Bước 3: Chuyển tiếp sang Python
      middleware(req, res, next);
    })(req, res, next);
  };
};

/**
 * Export proxy instance cho việc setup WebSocket upgrade trong server.js
 */
let proxyInstance = null;

export const getPythonProxyInstance = () => {
  if (!proxyInstance) {
    proxyInstance = createPythonProxy();
  }
  return proxyInstance;
};

export default pythonProxyMiddleware;
