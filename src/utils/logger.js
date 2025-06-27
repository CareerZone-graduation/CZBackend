// logger.js
import winston from 'winston';

// Định nghĩa các cấp độ log theo chuẩn NPM
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6
};

// Chọn cấp độ log dựa trên môi trường
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  return env === 'development' ? 'debug' : 'warn';
};

// Định nghĩa màu sắc cho từng cấp độ log (để hiển thị đẹp hơn trên console)
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};
winston.addColors(colors);

// Định dạng của log
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.splat(),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),

  // HÀM PRINTF PHIÊN BẢN CẬP NHẬT
  winston.format.printf((info) => {
    // Tách các thuộc tính quen thuộc và cả Symbol(splat)
    const { timestamp, level, message, stack, ...rest } = info;
    const splat = info[Symbol.for('splat')];

    // Bắt đầu xây dựng chuỗi log
    let log = `${timestamp} ${level}: ${message}`;

    // Nếu có stack trace, thêm nó vào
    if (stack) {
      log += `\n${stack}`;
    }

    // Ghi các thuộc tính metadata có key-value rõ ràng (từ object)
    if (Object.keys(rest).length > 0) {
        for (const [key, value] of Object.entries(rest)) {
            // Chuyển đối tượng thành chuỗi JSON để dễ đọc
            const valStr = typeof value === 'object' && value !== null ? JSON.stringify(value, null, 2) : value;
            log += `\n      ${key}: ${valStr}`;
        }
    }
    
    // Ghi các giá trị từ splat (khi truyền biến lẻ)
    if (splat) {
        log += ` ${splat.map(item => {
            return typeof item === 'object' ? JSON.stringify(item) : item;
        }).join(' ')}`;
    }

    return log;
  })
);

// Nơi đến của log (có thể là console, file, ...)
const transports = [
  // Hiển thị log ra console
  new winston.transports.Console(),
  // Ghi tất cả log có cấp độ 'error' trở xuống vào file `error.log`
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
  }),
  // Ghi tất cả log vào file `all.log`
  new winston.transports.File({ filename: 'logs/all.log' }),
];

// Tạo logger instance
const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
});

export default logger;