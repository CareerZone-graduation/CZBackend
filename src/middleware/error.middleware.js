import logger from "../utils/logger.js";

/**
 * Error handling middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
import AppError from "../utils/AppError.js";

const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}.`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err) => {
  const value = err.errmsg.match(/(["'])(\\?.)*?\1/)[0];
  const message = `Duplicate field value: ${value}. Please use another value!`;
  return new AppError(message, 400);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  const message = `Invalid input data. ${errors.join(". ")}`;
  return new AppError(message, 400);
};

const handleJWTError = () =>
  new AppError("Invalid token. Please log in again!", 401);
const handleJWTExpiredError = () =>
  new AppError("Your token has expired! Please log in again.", 401);

const sendErrorDev = (err, res) => {
  // Nhận diện lỗi validation đặc biệt của chúng ta
  if (
    err.message === "Validation failed" &&
    err.errors &&
    err.errors.length > 0
  ) {
    return res.status(err.statusCode).json({
      success: false,
      status: err.status,
      message: err.errors[0].message, // Lấy thông điệp của lỗi đầu tiên
      errors: err.errors, // Vẫn gửi đầy đủ mảng lỗi
      stack: err.stack, // Vẫn gửi stack trace ở môi trường dev
    });
  }

  // Các lỗi khác giữ nguyên
  res.status(err.statusCode).json({
    success: false,
    status: err.status,
    error: err, // Giữ nguyên object error đầy đủ cho dev
    message: err.message,
    stack: err.stack,
  });
};

const sendErrorProd = (err, res) => {
  // Nhận diện lỗi validation đặc biệt của chúng ta
  if (
    err.message === "Validation failed" &&
    err.errors &&
    err.errors.length > 0
  ) {
    return res.status(err.statusCode).json({
      success: false,
      status: err.status,
      message: err.errors[0].message, // Lấy thông điệp của lỗi đầu tiên
      errors: err.errors, // Vẫn gửi đầy đủ mảng lỗi cho client xử lý form
    });
  }

  // Operational, trusted error: send message to client
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
    // Programming or other unknown error: don't leak error details
  } else {
    // 1) Log error
    logger.error("ERROR 💥", err);
    // 2) Send generic message
    res.status(500).json({
      status: "error",
      message: "Something went very wrong!",
    });
  }
};

export const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  logger.error(`Error: ${err.message}`, {
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    // ip: req.ip,
    // userAgent: req.get('User-Agent'),
    // Thêm details nếu là lỗi validation
    ...(err.errors && { validationErrors: JSON.stringify(err.errors) }),
  });
  // console.error(`Error: ${err.message}`, {
  //   stack: err.stack,
  //   url: req.originalUrl,
  //   method: req.method,
  //   ip: req.ip,
  //   userAgent: req.get('User-Agent'),
  // });

  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    sendErrorDev(err, res);
  } else if (process.env.NODE_ENV === "production") {
    let error = { ...err, message: err.message }; // 1. Tạo bản sao của `err`
    console.log("Error details:", error); // Log chi tiết lỗi
    if (error.name === "CastError") error = handleCastErrorDB(error); // 2. Chuyển đổi lỗi
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === "ValidationError")
      error = handleValidationErrorDB(error);
    if (error.name === "JsonWebTokenError") error = handleJWTError();
    if (error.name === "TokenExpiredError") error = handleJWTExpiredError();

    sendErrorProd(error.isOperational ? error : err, res); // 3. Dòng code bạn hỏi
  }
};
