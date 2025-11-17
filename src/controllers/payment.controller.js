import asyncHandler from "express-async-handler";
import * as paymentService from "../services/payment.service.js";
import * as vnpayService from "../services/vnpay.service.js";
import { BadRequestError } from "../utils/AppError.js";
import logger from "../utils/logger.js";
import config from "./../config/index.js";

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
    const ipAddr = req.headers['x-forwarded-for'] || 
                   req.connection.remoteAddress || 
                   req.socket.remoteAddress ||
                   req.connection.socket?.remoteAddress ||
                   '127.0.0.1';
    
    logger.info(`Creating VNPay order for user ${userId}, coins: ${coins}, IP: ${ipAddr}`);
    result = await vnpayService.createVNPayPaymentUrl(userId, coins, ipAddr);
    
    res.status(200).json({
      success: true,
      message: "Đã tạo URL thanh toán VNPay",
      data: result,
    });
  } else if (paymentMethod === "ZALOPAY") {
    result = await paymentService.createZaloPayOrder(userId, coins);
    
    res.status(200).json({
      success: true,
      message: "Tạo đơn hàng thanh toán thành công.",
      data: result,
    });
  } else {
    throw new BadRequestError(
      `Phương thức thanh toán ${paymentMethod} chưa được hỗ trợ.`
    );
  }
});

/**
 * @desc    Handle ZaloPay server-to-server callback
 * @route   POST /api/payments/zalopay-callback
 * @access  Public
 */
export const handleZaloPayCallback = asyncHandler(async (req, res) => {
  const { data, mac } = req.body;
  const result = await paymentService.handleZaloPayCallback({ data, mac });
  res.status(200).json(result);
});

//  tạm thời lấy redirect Url làm callback luôn

export const handleZaloPayRedirect = asyncHandler(async (req, res) => {
  const { apptransid, status } = req.validatedQuery || req.query;
  console.log(
    "Handling ZaloPay redirect for apptransid:",
    apptransid,
    "with status:",
    status
  );
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
 * @desc    Handle VNPay IPN callback (server-to-server)
 * @route   GET /api/payment/vnpay-ipn
 * @access  Public (but verified by hash)
 */
export const handleVNPayIPN = asyncHandler(async (req, res) => {
  try {
    const vnpParams = req.query;
    logger.info('VNPay IPN received:', { txnRef: vnpParams.vnp_TxnRef });
    
    const result = await vnpayService.verifyVNPayCallback(vnpParams);

    if (result.success) {
      return res.status(200).json({ RspCode: '00', Message: 'Success' });
    } else {
      return res.status(200).json({ RspCode: '01', Message: result.message });
    }
  } catch (error) {
    logger.error('VNPay IPN error:', error);
    return res.status(200).json({ RspCode: '99', Message: 'Unknown error' });
  }
});

/**
 * @desc    Handle VNPay return URL (user redirect back)
 * @route   GET /api/payment/vnpay-return
 * @access  Public
 */
export const handleVNPayReturn = asyncHandler(async (req, res) => {
  try {
    const vnpParams = req.query;
    logger.info('VNPay return received:', { txnRef: vnpParams.vnp_TxnRef });
    
    const result = await vnpayService.handleVNPayReturn(vnpParams);

    // Redirect to frontend with result
    const frontendUrl = config.RECRUITER_FE_URL || 'http://localhost:3000';
    
    if (result.success) {
      const redirectUrl = `${frontendUrl}/payment/result?success=true&message=${encodeURIComponent(result.message)}&coins=${result.coins || 0}&amount=${result.amount || 0}`;
      return res.redirect(redirectUrl);
    } else {
      const redirectUrl = `${frontendUrl}/payment/result?success=false&message=${encodeURIComponent(result.message)}&code=${result.responseCode || ''}`;
      return res.redirect(redirectUrl);
    }
  } catch (error) {
    logger.error('VNPay return error:', error);
    const frontendUrl = config.RECRUITER_FE_URL || 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/payment/result?success=false&message=${encodeURIComponent('Có lỗi xảy ra')}`);
  }
});
