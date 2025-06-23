import winston from 'winston';
import config from '../config/index.js';

const { combine, timestamp, printf, errors, colorize } = winston.format;

// 🎨 Tự định nghĩa màu ANSI (nếu muốn kiểm soát mạnh mẽ hơn)
// const yellow = (text) => `\x1b[33m${text}\x1b[0m`;

const customConsoleFormat = printf(({ level, message, timestamp, stack }) => {
  let formatted = `${timestamp} [${level}]: ${message}`;
  if (stack) formatted += `\n${stack}`;
  return formatted;
});

const logger = winston.createLogger({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true })
  ),
  defaultMeta: { service: 'careerconnect-api' },
  transports: [
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

// Chỉ log ra console nếu không ở production
if (config.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: combine(
      colorize({ all: true }), // 🎨 Tự động tô màu theo level
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      errors({ stack: true }),
      customConsoleFormat
    )
  }));
}

export default logger;
