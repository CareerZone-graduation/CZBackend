import passport from 'passport';
import { UnauthorizedError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

export const handleLocalAuth = (req, res, next) => {
  passport.authenticate('local', { session: false }, (err, user, info) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      // Use the message from passport's 'done' function.
      throw new UnauthorizedError(info.message || 'Tên đăng nhập hoặc mật khẩu không chính xác.');
    }
    logger.info(user);
    req.user = user; // Manually attach user to the request
    next(); // Proceed to the controller
  })(req, res, next);
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
