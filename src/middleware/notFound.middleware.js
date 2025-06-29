/**
 * Not found middleware - handles 404 errors
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const notFound = (req, res, next) => {
  if (req.originalUrl === '/favicon.ico') {
    return res.status(204).end(); // No Content
  }
  const error = new Error(`Not found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};
