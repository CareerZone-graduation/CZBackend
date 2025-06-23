import { z } from 'zod';
import logger from '../utils/logger.js';

/**
 * Generic validation middleware factory
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {string} source - Source of data to validate ('body', 'query', 'params')
 * @returns {Function} Express middleware function
 */
export const validate = (schema, source = 'body') => {
  return async (req, res, next) => {
    try {
      let dataToValidate;
      
      switch (source) {
        case 'body':
          dataToValidate = req.body;
          break;
        case 'query':
          dataToValidate = req.query;
          break;
        case 'params':
          dataToValidate = req.params;
          break;
        case 'file':
          dataToValidate = req.file;
          break;
        case 'files':
          dataToValidate = req.files;
          break;
        default:
          dataToValidate = req.body;
      }

      // Validate and transform the data
      const validatedData = await schema.parseAsync(dataToValidate);
      
      // Replace the original data with validated/transformed data
      switch (source) {
        case 'body':
          req.body = validatedData;
          break;
        case 'query':
          req.query = validatedData;
          break;
        case 'params':
          req.params = validatedData;
          break;
        case 'file':
          req.file = validatedData;
          break;
        case 'files':
          req.files = validatedData;
          break;
      }

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        logger.warn('Validation error:', {
          source,
          errors,
          originalData: source === 'body' ? req.body : 
                        source === 'query' ? req.query : 
                        source === 'params' ? req.params : null,
          url: req.originalUrl,
          method: req.method,
          ip: req.ip
        });

        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors
        });
      }

      // For non-Zod errors, pass to error handler
      logger.error('Unexpected validation error:', error);
      next(error);
    }
  };
};

/**
 * Convenience middleware for validating request body
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @returns {Function} Express middleware function
 */
export const validateBody = (schema) => validate(schema, 'body');

/**
 * Convenience middleware for validating query parameters
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @returns {Function} Express middleware function
 */
export const validateQuery = (schema) => validate(schema, 'query');

/**
 * Convenience middleware for validating route parameters
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @returns {Function} Express middleware function
 */
export const validateParams = (schema) => validate(schema, 'params');

/**
 * Convenience middleware for validating file uploads
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @returns {Function} Express middleware function
 */
export const validateFile = (schema) => validate(schema, 'file');

/**
 * Convenience middleware for validating multiple file uploads
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @returns {Function} Express middleware function
 */
export const validateFiles = (schema) => validate(schema, 'files');
