import asyncHandler from "express-async-handler";
import * as paymentService from "../services/payment.service.js";
import { BadRequestError } from "../utils/AppError.js";
import config from "./../config/index.js";

/**
 * @desc    Create a new payment order
 * @route   POST /api/payments/create-order
 * @access  Private
 */
export const createPaymentOrder = asyncHandler(async (req, res) => {
  const { coins, paymentMethod } = req.body;
  const userId = req.user._id;

  let result;
  if (paymentMethod === "ZALOPAY") {
    result = await paymentService.createZaloPayOrder(userId, coins);
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
  const { apptransid, status } = req.query;
  console.log("ZaloPay redirect data:", req.query);
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
