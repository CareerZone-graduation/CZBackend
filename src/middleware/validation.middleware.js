import { z } from 'zod';
import logger from '../utils/logger.js';
import AppError from '../utils/AppError.js';

/**
 * Generic validation middleware factory
 * @param {z.ZodSchema} schema
 * @param {'body'|'query'|'params'|'file'|'files'} source
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

      // ✅ Parse đúng 1 lần, tránh redeclare
      const parsed = await schema.parseAsync(dataToValidate);

      // ✅ Gán kết quả đã hợp lệ về đúng chỗ
      switch (source) {
        case 'body':
          req.body = parsed;
          break;
        case 'query':
          // Lưu bản chuẩn hoá để controller dùng
          req.validatedQuery = parsed;

          // (tuỳ chọn) làm sạch req.query để tránh lộ param rác
          Object.keys(req.query).forEach((k) => {
            if (!(k in parsed)) delete req.query[k];
          });
          // Nếu muốn đồng bộ kiểu đã ép, có thể:
          Object.assign(req.query, parsed);
          break;
        case 'params':
          req.params = parsed;
          break;
        case 'file':
          req.file = parsed;
          break;
        case 'files':
          req.files = parsed;
          break;
      }

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = new AppError('Validation failed', 400);
        validationError.errors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        return next(validationError);
      }

      logger.error('Unexpected validation error:', error);
      next(error);
    }
  };
};

// Convenience wrappers
export const validateBody = (schema) => validate(schema, 'body');
export const validateQuery = (schema) => validate(schema, 'query');
export const validateParams = (schema) => validate(schema, 'params');
export const validateFile = (schema) => validate(schema, 'file');
export const validateFiles = (schema) => validate(schema, 'files');
