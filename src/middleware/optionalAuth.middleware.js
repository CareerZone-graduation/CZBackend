import passport from 'passport';

/**
 * Optional authentication middleware
 * Tries to authenticate but doesn't fail if no token provided
 * Sets req.user if authentication succeeds, otherwise continues without user
 */
export const optionalAuth = (req, res, next) => {
  // Check if Authorization header exists
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token provided, continue without authentication
    return next();
  }
  
  // Token provided, try to authenticate
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) {
      // Authentication error, log but continue
      console.warn('Optional auth error:', err.message);
      return next();
    }
    
    if (user) {
      // Authentication successful, set user
      req.user = user;
    }
    
    // Continue regardless of authentication result
    next();
  })(req, res, next);
};
