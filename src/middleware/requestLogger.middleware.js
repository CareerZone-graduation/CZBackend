import logger from '../utils/logger.js';

/**
 * Request logging middleware for monitoring and debugging
 * Logs incoming requests and outgoing responses with performance metrics
 */
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Add requestId to request object for use in other middleware/controllers
  req.requestId = requestId;
  
  // Log incoming request (excluding sensitive data)
  const requestLog = {
    requestId,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    timestamp: new Date().toISOString(),
    // Only log params and query for company jobs endpoint
    ...(req.originalUrl.includes('/companies/') && req.originalUrl.includes('/jobs') && {
      params: req.params,
      query: req.validatedQuery || req.query
    })
  };

  logger.info('Incoming request', requestLog);

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(data) {
    const executionTime = Date.now() - startTime;
    
    // Log response (excluding sensitive data)
    const responseLog = {
      requestId,
      statusCode: res.statusCode,
      executionTime: `${executionTime}ms`,
      timestamp: new Date().toISOString(),
      // Only log response metadata for company jobs endpoint
      ...(req.originalUrl.includes('/companies/') && req.originalUrl.includes('/jobs') && {
        success: data?.success,
        dataCount: Array.isArray(data?.data) ? data.data.length : undefined,
        totalItems: data?.meta?.totalItems,
        currentPage: data?.meta?.currentPage,
        totalPages: data?.meta?.totalPages
      })
    };

    // Log based on status code
    if (res.statusCode >= 500) {
      logger.error('Response sent with server error', responseLog);
    } else if (res.statusCode >= 400) {
      logger.warn('Response sent with client error', responseLog);
    } else {
      logger.info('Response sent successfully', responseLog);
    }

    // Performance warning for slow requests
    if (executionTime > 2000) {
      logger.warn('Slow request detected', {
        requestId,
        method: req.method,
        url: req.originalUrl,
        executionTime: `${executionTime}ms`,
        threshold: '2000ms'
      });
    }

    // Call original json method
    return originalJson.call(this, data);
  };

  next();
};

/**
 * Error request logging middleware
 * Logs requests that result in errors with additional context
 */
export const errorRequestLogger = (err, req, res, next) => {
  const requestId = req.requestId || `error_req_${Date.now()}`;
  
  // Log error request with full context
  logger.error('Request resulted in error', {
    requestId,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    params: req.params,
    query: req.validatedQuery || req.query,
    error: {
      message: err.message,
      statusCode: err.statusCode,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    },
    timestamp: new Date().toISOString()
  });

  next(err);
};