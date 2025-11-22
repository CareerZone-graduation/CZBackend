import asyncHandler from "express-async-handler";
import * as paymentService from "../services/payment.service.js";
import config from "../config/index.js";
import logger from "../utils/logger.js";

import { PAYMENT_METHODS } from "../constants/index.js";

import * as vnpayService from "../services/vnpay.service.js";
import { BadRequestError } from "../utils/AppError.js";

function getClientIp(req) {
  let ip = req.headers['x-forwarded-for'];

  if (ip) {
    // Nếu có nhiều IP, lấy IP đầu tiên (chuẩn VNPAY)
    ip = ip.split(",")[0].trim();
  } else {
    ip = req.socket.remoteAddress;
  }

  // Nếu IP dạng ::ffff:192.168.1.1 → convert về IPv4
  if (ip && ip.includes("::ffff:")) {
    ip = ip.replace("::ffff:", "");
  }

  return ip || "127.0.0.1";
}

/**
 * @desc    Create a new payment order (support ZaloPay and VNPay)
 * @route   POST /api/payments/create-order
 * @access  Private
 */
export const createPaymentOrder = asyncHandler(async (req, res) => {
  const { coins, paymentMethod = 'ZALOPAY' } = req.body;
  const userId = req.user._id;

  let result;

  if (paymentMethod === "VNPAY") {
    // Get client IP address
    const ipAddr = getClientIp(req);
    result = await vnpayService.createVNPayPaymentUrl(userId, coins, ipAddr);
  } else if (paymentMethod === "ZALOPAY") {
    result = await paymentService.createZaloPayOrder(userId, coins);
  } else if (paymentMethod === "MOMO") {
    result = await paymentService.createMomoOrder(userId, coins);
  } else {
    throw new BadRequestError(
      `Phương thức thanh toán ${paymentMethod} chưa được hỗ trợ.`
    );
  }
  res.status(200).json({
    success: true,
    message: "Tạo đơn hàng thanh toán thành công.",
    data: result,
  });
});

export const handleMomoRedirect = asyncHandler(async (req, res) => {
  logger.info("Received MoMo:", req.query);
  try {
    const { resultCode } = req.query;
    const resp = await paymentService.handleMomoCallback(req.query);
    const role = resp.role.role;
    console.log("User role for redirect:", role);
    if (resultCode === "0") {
      if (role === "candidate") {
        res.header("Location", config.CANDIDATE_FE_URL + `/payment/success`);
        res.status(302).end();
      } else {
        if (role === "recruiter") {
          res.header("Location", config.RECRUITER_FE_URL + `/payment/success`);
          res.status(302).end();
        }
      }
    } else {
      if (role === "candidate") {
        res.header("Location", config.CANDIDATE_FE_URL + `/payment/failure`);
        res.status(302).end();
      } else if (role === "recruiter") {
        res.header("Location", config.RECRUITER_FE_URL + `/payment/failure`);
        res.status(302).end();
      }
    }
  } catch (error) {
    logger.error("MoMo Redirect Error:", error);
  }
});

export const handleZaloPayRedirect = asyncHandler(async (req, res) => {
  const { apptransid, status } = req.validatedQuery || req.query;
  const resp = await paymentService.handleZaloPayCallback(apptransid, status);
  const role = resp.role.role;
  console.log("User role for redirect:", role);
  if (status === "1") {
    // Thanh toán thành công
    if (role === "candidate") {
      console.log("Redirecting candidate to success page");
      res.header("Location", config.CANDIDATE_FE_URL + `/payment/success`);
      res.status(302).end();
    } else {
      if (role === "recruiter") {
        res.header("Location", config.RECRUITER_FE_URL + `/payment/success`);
        res.status(302).end();
      }
    }
  } else {
    // Thanh toán thất bại
    if (role === "candidate") {
      res.header("Location", config.CANDIDATE_FE_URL + `/payment/failure`);
      res.status(302).end();
    } else if (role === "recruiter") {
      res.header("Location", config.RECRUITER_FE_URL + `/payment/failure`);
      res.status(302).end();
    }
  }
});



/**
 * @desc    Handle VNPay return URL (user redirect back)
 * @route   GET /api/payment/vnpay-redirect
 * @access  Public
 */
export const handleVNPayReturn = asyncHandler(async (req, res) => {
  try {
    const vnpParams = req.query;
    const result = await vnpayService.handleVNPayReturn(vnpParams);
    const role = result.role.role;
    if (vnpParams.vnp_ResponseCode === "00") {
      if (role === "candidate") {
        res.header("Location", config.CANDIDATE_FE_URL + `/payment/success`);
        res.status(302).end();
      } else if (role === "recruiter") {
        res.header("Location", config.RECRUITER_FE_URL + `/payment/success`);
        res.status(302).end();
      }
    } else {
      if (role === "candidate") {
        res.header("Location", config.CANDIDATE_FE_URL + `/payment/failure`);
        res.status(302).end();
      } else if (role === "recruiter") {
        res.header("Location", config.RECRUITER_FE_URL + `/payment/failure`);
        res.status(302).end();
      }
    }
  } catch (error) {
    logger.error('VNPay return error:', error);
  }
});
