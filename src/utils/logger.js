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
  winston.format.splat(), // Rất quan trọng để gom metadata
  // Thêm format.errors({ stack: true }) để tự động lấy stack trace từ đối tượng Error
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),

  // ĐÂY LÀ HÀM PRINTF PHIÊN BẢN CUỐI CÙNG
  winston.format.printf((info) => {
    // Tách các thuộc tính quen thuộc ra khỏi đối tượng info
    const { timestamp, level, message, stack, ...rest } = info;

    // Bắt đầu xây dựng chuỗi log
    let log = `${timestamp} ${level}: ${message}`;

    // Nếu có stack trace, thêm nó vào
    if (stack) {
      log += `\n${stack}`;
    }

    // Kiểm tra xem có metadata nào còn lại không
    // Object.keys(rest).length > 0 sẽ đúng nếu có các thuộc tính như url, method, ip...
    // if (Object.keys(rest).length > 0) {
    //   log += `\nMetadata: ${JSON.stringify(rest, null, 3)}`;
    // }
    // thụt vào trong để dễ đọc hơn
    // ghi thẳng ko cần stringify
    for (const [key, value] of Object.entries(rest)) {
      log += `\n    ${key}: ${value}`;
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