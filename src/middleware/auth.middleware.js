import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { User } from '../models/index.js';

/**
 * JWT Authentication middleware
 * Verifies JWT token and adds user info to request object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const authenticate = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header or cookies
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }
    console.log('Token:', token);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }
    try {
      // Verify token
      const decoded = jwt.verify(token, config.JWT_SECRET);
      
      // Verify token contains necessary payload
      if (!decoded.id || !decoded.role) {
          return res.status(401).json({ success: false, message: 'Token không hợp lệ.' });
      }

      // Check if user still exists and is active
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Người dùng không tồn tại.'
        });
      }

      if (!user.active) {
        return res.status(401).json({
          success: false,
          message: 'Tài khoản đã bị vô hiệu hóa.'
        });
      }

      // Attach user info and role from token to the request object
      req.user={};
      req.user._id = decoded.id;
      req.user.role = decoded.role;

      next();
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token has expired.'
        });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token.'
        });
      } else {
        throw jwtError;
      }
    }
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during authentication.'
    });
  }
};

/**
 * Optional authentication middleware
 * Adds user info to request if token is present, but doesn't require it
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const optionalAuthenticate = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header or cookies
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return next(); // No token, continue without user info
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, config.JWT_SECRET);
      
      // Get user from database
      const user = await User.findById(decoded.userId)
        .select('-password');

      if (user && user.active) {
        // Add user to request object if valid
        req.user = user;
        req.user._id= decoded.id; // Ensure _id is set for compatibility
        req.user.role = decoded.role; // Add role from token
      }
    } catch (jwtError) {
      // Invalid token, but continue without user info
      logger.warn('Invalid token in optional authentication:', jwtError.message);
    }

    next();
  } catch (error) {
    logger.error('Optional authentication error:', error);
    next(); // Continue even if there's an error
  }
};

/**
 * Authorization middleware factory
 * Checks if user has required roles
 * @param {Array<string>} allowedRoles - Array of allowed role names
 * @returns {Function} Express middleware function
 */
export const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    if (allowedRoles.length === 0) {
      return next(); // No specific roles required
    }

    const role = req.user.role;
    if (!allowedRoles.includes(role)) {
      logger.warn('Authorization failed:', {
        userId: req.user._id,
        role,
        allowedRoles,
        url: req.originalUrl,
        method: req.method
      });

      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.'
      });
    }

    next();
  };
};


export const adminOnly = authorize(['admin']);

export const recruiterOnly = authorize(['recruiter']);

export const candidateOnly = authorize(['candidate']);

export const recruiterOrAdmin = authorize(['recruiter', 'admin']);

export const candidateOrRecruiter = authorize(['candidate', 'recruiter']);

export const authenticated = authorize([]);
