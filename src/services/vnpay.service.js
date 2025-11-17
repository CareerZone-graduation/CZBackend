import crypto from "crypto";
import moment from "moment";
import config from "../config/index.js";
import CoinRecharge from "../models/CoinRecharge.js";
import User from "../models/User.js";
import { BadRequestError } from "../utils/AppError.js";
import logger from "../utils/logger.js";
import { recordCreditTransaction } from "./creditHistory.service.js";

import querystring from "qs";
import mongoose from "mongoose";
import { TRANSACTION_CATEGORIES, TRANSACTION_TYPES } from "../constants/creditTransaction.constant.js";

const { vnpay } = config;
const COIN_CONVERSION_RATE = 100; // 1 coin = 100 VND

// Dán hàm này đè lên hàm sortObject cũ của bạn
/**
 * Sort object by key (THEO CHUẨN CỦA VNPAY - ĐÃ SỬA LỖI 'hasOwnProperty')
 */
function sortObject(obj) {
  let sorted = {};
  let str = [];
  let key;
  for (key in obj) {
    // SỬA LỖI: Dùng cách gọi an toàn cho các đối tượng không có prototype
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      str.push(encodeURIComponent(key));
    }
  }
  str.sort();
  for (key = 0; key < str.length; key++) {
    sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, "+");
  }
  return sorted;
}

/**
 * Create VNPay payment URL
 * @param {string} userId - User ID
 * @param {number} coins - Number of coins to recharge
 * @param {string} ipAddr - Client IP address
 * @returns {Promise<object>} - Payment URL and transaction info
 */
export const createVNPayPaymentUrl = async (userId, coins, ipAddr) => {
  if (!vnpay.tmnCode || !vnpay.hashSecret) {
    throw new BadRequestError(
      "VNPAY configuration is missing. Please check environment variables."
    );
  }

  const amountVND = coins * COIN_CONVERSION_RATE;
  const orderId = new mongoose.Types.ObjectId().toString();

  await CoinRecharge.create({
    userId,
    coinAmount: coins,
    amountPaid: amountVND,
    paymentMethod: "VNPAY",
    transactionCode: orderId,
    status: "PENDING",
  });

  let vnp_Params = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: vnpay.tmnCode,
    vnp_Locale: "vn",
    vnp_CurrCode: "VND",
    vnp_TxnRef: orderId,
    vnp_OrderInfo: `Nap ${coins} xu vao tai khoan`,
    vnp_OrderType: "other",
    vnp_Amount: amountVND * 100, // Amount in cents
    vnp_ReturnUrl: vnpay.returnUrl,
    vnp_IpAddr: ipAddr,
    vnp_CreateDate: moment().format("YYYYMMDDHHmmss"),
  };

  // 1. Dùng hàm sortObject CHUẨN (đã thay thế ở trên)
  vnp_Params = sortObject(vnp_Params);

  // 2. Tạo signData từ object đã sort và encode
  const signData = querystring.stringify(vnp_Params, { encode: false }); //

  // 3. Tạo chữ ký
  const hmac = crypto.createHmac("sha512", vnpay.hashSecret);

  // SỬA LẠI: Dùng Buffer.from thay cho 'new Buffer' (đã cũ)
  const signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

  vnp_Params["vnp_SecureHash"] = signed; //

  // 4. SỬA LẠI: Thêm { encode: false } khi tạo URL cuối cùng
  const paymentUrl =
    vnpay.url + "?" + querystring.stringify(vnp_Params, { encode: false });

  return { paymentUrl };
};

export const handleVNPayReturn = async (vnpayParams) => {
  const secureHash = vnpayParams["vnp_SecureHash"];

  // Lấy các tham số gốc TRƯỚC khi delete
  const orderId = vnpayParams["vnp_TxnRef"];
  const responseCode = vnpayParams["vnp_ResponseCode"];
  const amount = vnpayParams["vnp_Amount"] / 100;

  delete vnpayParams["vnp_SecureHash"];
  delete vnpayParams["vnp_SecureHashType"];

  // 1. GỌI HÀM SORT ĐÃ SỬA
  const vnpayParamsSorted = sortObject(vnpayParams);

  const signData = querystring.stringify(vnpayParamsSorted, { encode: false });

  // 2. SỬA LỖI TÊN BIẾN:
  // Đảm bảo tên biến này khớp với file config của bạn (thường là hashSecret)
  const hmac = crypto.createHmac("sha512", vnpay.hashSecret); // Sửa từ vnpay.hash_secret
  const signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

  if (secureHash !== signed) {
    logger.warn(`VNPAY Return: Invalid signature for order ${orderId}`);
    throw new BadRequestError("Chữ ký không hợp lệ.");
  }

  const recharge = await CoinRecharge.findOne({ transactionCode: orderId });

  if (!recharge) {
    logger.error(`VNPAY Return: Order ${orderId} not found.`);
    throw new BadRequestError("Đơn hàng không tồn tại.");
  }

  if (recharge.status !== "PENDING") {
    logger.info(
      `VNPAY Return: Order ${orderId} already processed with status ${recharge.status}.`
    );
  }

  if (responseCode === "00") {
    recharge.status = "SUCCESS";
    recharge.gatewayResponse = JSON.stringify(vnpayParams);
    await recharge.save();

    await User.findByIdAndUpdate(recharge.userId, {
      $inc: { coinBalance: recharge.coinAmount },
    });

    try {
      await recordCreditTransaction({
        userId: recharge.userId,
        type: TRANSACTION_TYPES.DEPOSIT,
        category: TRANSACTION_CATEGORIES.RECHARGE,
        amount: recharge.coinAmount,
        description: `Nạp ${recharge.coinAmount} xu qua ${recharge.paymentMethod}`,
        referenceId: recharge._id,
        referenceModel: "CoinRecharge",
        metadata: {
          paymentMethod: recharge.paymentMethod,
          amountPaid: recharge.amountPaid,
          transactionCode: recharge.transactionCode,
        },
      });
      logger.info(
        `Credit transaction recorded for user ${recharge.userId}, amount: ${recharge.coinAmount}`
      );
    } catch (transactionError) {
      logger.error("Failed to record credit transaction for VNPAY payment:", {
        userId: recharge.userId,
        rechargeId: recharge._id,
        error: transactionError.message,
      });
    }
  } else {
    recharge.status = "FAILED";
    recharge.gatewayResponse = JSON.stringify(vnpayParams);
    await recharge.save();
  }
  const role = await User.findById(recharge.userId).select("role");
  return { role: role };
};
