import crypto from 'crypto';
import moment from 'moment';
import config from '../config/index.js';
import CoinRecharge from '../models/CoinRecharge.js';
import User from '../models/User.js';
import { BadRequestError } from '../utils/AppError.js';
import logger from '../utils/logger.js';
import { recordCreditTransaction } from './creditHistory.service.js';
import { TRANSACTION_TYPES, TRANSACTION_CATEGORIES } from '../constants/index.js';
import querystring from 'qs';

const { vnpay } = config;
const COIN_CONVERSION_RATE = 100; // 1 coin = 100 VND

/**
 * Sort object by key
 */
function sortObject(obj) {
  const sorted = {};
  const keys = Object.keys(obj).sort();
  keys.forEach((key) => {
    sorted[key] = obj[key];
  });
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
  try {
    const amountVND = coins * COIN_CONVERSION_RATE;
    const createDate = moment().format('YYYYMMDDHHmmss');
    const orderId = moment().format('DDHHmmss'); // Unique order ID
    const txnRef = `VNPAY_${orderId}_${userId}`; // Transaction reference

    // Create pending recharge record
    const newRecharge = await CoinRecharge.create({
      userId,
      coinAmount: coins,
      amountPaid: amountVND,
      paymentMethod: 'VNPAY',
      transactionCode: txnRef,
      status: 'PENDING',
    });

    logger.info(`Created pending VNPay recharge: ${txnRef}`);

    // Get user info
    const user = await User.findById(userId).select('email fullname');

    // Build VNPay params
    let vnp_Params = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: vnpay.tmnCode,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: txnRef,
      vnp_OrderInfo: `Nap ${coins} xu CareerZone`,
      vnp_OrderType: 'other',
      vnp_Amount: amountVND * 100,
      vnp_ReturnUrl: vnpay.returnUrl,
      vnp_IpAddr: ipAddr === '::1' ? '127.0.0.1' : ipAddr, // Force IPv4 localhost
      vnp_CreateDate: createDate,
    };

    // Add optional params (sanitized for VNPay)
    if (user?.email) {
      vnp_Params.vnp_Bill_Email = user.email.trim();
    }
    if (user?.fullname) {
      const sanitizedName = user.fullname
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .trim();
      // vnp_Params.vnp_Bill_FirstName = sanitizedName; // Bạn đã comment dòng này, vẫn giữ nguyên
    }

    // Sort params
    vnp_Params = sortObject(vnp_Params);

    // === SỬA LỖI TẠI ĐÂY ===

    // 1. Tạo signData thủ công từ các giá trị thô (giống như hàm verify)
    const signData = Object.keys(vnp_Params)
      .map(key => `${key}=${vnp_Params[key]}`)
      .join('&');

    // 2. Tạo chữ ký
    const hmac = crypto.createHmac("sha512", vnpay.hashSecret);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");

    // 3. Thêm chữ ký vào params
    vnp_Params.vnp_SecureHash = signed;

    // 4. Tạo URL thanh toán bằng cách mã hóa TOÀN BỘ params (bao gồm cả chữ ký)
    // querystring.stringify mặc định (encode: true) sẽ mã hóa đúng chuẩn URL
    const paymentUrl = `${vnpay.url}?${querystring.stringify(vnp_Params, { encode: true })}`;

    // === KẾT THÚC SỬA LỖI ===

    // Debug logging
    logger.info('VNPay payment URL details:', {
      signDataRaw: signData, // Log chuỗi gốc để hash
      signature: signed,
      paramsCount: Object.keys(vnp_Params).length, // Sẽ nhiều hơn 1 (do có vnp_SecureHash)
      urlPreview: paymentUrl.substring(0, 150) + '...'
    });

    logger.info(`VNPay payment URL created for user ${userId}, coins: ${coins}`);

    return {
      paymentUrl,
      transactionCode: txnRef,
      orderId,
      rechargeId: newRecharge._id,
    };
  } catch (error) {
    logger.error('Error creating VNPay payment URL:', error);
    throw new BadRequestError('Không thể tạo URL thanh toán VNPay');
  }
};

/**
 * Verify VNPay IPN callback
 * @param {object} vnpParams - VNPay callback params
 * @returns {Promise<object>} - Verification result
 */
export const verifyVNPayCallback = async (vnpParams) => {
  try {
    const secureHash = vnpParams.vnp_SecureHash;
    delete vnpParams.vnp_SecureHash;
    delete vnpParams.vnp_SecureHashType;

    // Sort and verify hash
    const sortedParams = sortObject(vnpParams);
    const signData = Object.keys(sortedParams)
      .map(key => `${key}=${sortedParams[key]}`)
      .join('&');
    const hmac = crypto.createHmac('sha512', vnpay.hashSecret);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    if (secureHash !== signed) {
      logger.error('VNPay hash verification failed');
      return { success: false, message: 'Invalid signature' };
    }

    const txnRef = vnpParams.vnp_TxnRef;
    const responseCode = vnpParams.vnp_ResponseCode;
    const amount = vnpParams.vnp_Amount / 100; // Convert back to VND
    const bankCode = vnpParams.vnp_BankCode;
    const transactionNo = vnpParams.vnp_TransactionNo;

    logger.info(`VNPay IPN received - TxnRef: ${txnRef}, Code: ${responseCode}`);

    // Find recharge record
    const recharge = await CoinRecharge.findOne({ transactionCode: txnRef });
    if (!recharge) {
      logger.error(`Recharge not found for txnRef: ${txnRef}`);
      return { success: false, message: 'Transaction not found' };
    }

    // Check if already processed
    if (recharge.status === 'SUCCESS') {
      logger.info(`Transaction ${txnRef} already processed`);
      return { success: true, message: 'Already processed' };
    }

    // Check response code
    if (responseCode === '00') {
      // Payment success
      await CoinRecharge.findByIdAndUpdate(recharge._id, {
        status: 'SUCCESS',
        paymentDate: new Date(),
        metadata: JSON.stringify({ ...vnpParams, bankCode, transactionNo }),
      });

      // Update user balance
      const user = await User.findById(recharge.userId);
      if (!user) {
        logger.error(`User not found: ${recharge.userId}`);
        return { success: false, message: 'User not found' };
      }

      user.coins = (user.coins || 0) + recharge.coinAmount;
      await user.save();

      // Record credit transaction
      await recordCreditTransaction(
        recharge.userId,
        recharge.coinAmount,
        TRANSACTION_TYPES.CREDIT,
        TRANSACTION_CATEGORIES.RECHARGE,
        `Nạp ${recharge.coinAmount} xu qua VNPay`,
        { rechargeId: recharge._id, transactionNo }
      );

      logger.info(`VNPay payment success: ${txnRef}, User: ${user.email}, Coins: ${recharge.coinAmount}`);

      return {
        success: true,
        message: 'Payment successful',
        coins: recharge.coinAmount,
        newBalance: user.coins,
      };
    } else {
      // Payment failed
      await CoinRecharge.findByIdAndUpdate(recharge._id, {
        status: 'FAILED',
        metadata: JSON.stringify(vnpParams),
      });

      logger.warn(`VNPay payment failed: ${txnRef}, Code: ${responseCode}`);

      return {
        success: false,
        message: `Payment failed with code: ${responseCode}`,
      };
    }
  } catch (error) {
    logger.error('Error verifying VNPay callback:', error);
    throw error;
  }
};

/**
 * Handle VNPay return (user redirect back)
 * @param {object} vnpParams - VNPay return params
 * @returns {object} - Payment result for frontend display
 */
export const handleVNPayReturn = async (vnpParams) => {
  try {
    const secureHash = vnpParams.vnp_SecureHash;
    delete vnpParams.vnp_SecureHash;
    delete vnpParams.vnp_SecureHashType;

    // Verify hash
    const sortedParams = sortObject(vnpParams);
    const signData = Object.keys(sortedParams)
      .map(key => `${key}=${sortedParams[key]}`)
      .join('&');
    const hmac = crypto.createHmac('sha512', vnpay.hashSecret);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    if (secureHash !== signed) {
      return {
        success: false,
        message: 'Chữ ký không hợp lệ',
      };
    }

    const responseCode = vnpParams.vnp_ResponseCode;
    const txnRef = vnpParams.vnp_TxnRef;
    const amount = vnpParams.vnp_Amount / 100;

    if (responseCode === '00') {
      const recharge = await CoinRecharge.findOne({ transactionCode: txnRef });
      return {
        success: true,
        message: 'Thanh toán thành công',
        coins: recharge?.coinAmount,
        amount,
        transactionCode: txnRef,
      };
    } else {
      const errorMessages = {
        '07': 'Trừ tiền thành công. Giao dịch bị nghi ngờ (liên hệ ngân hàng)',
        '09': 'Thẻ/Tài khoản chưa đăng ký dịch vụ InternetBanking',
        '10': 'Thẻ/Tài khoản không hợp lệ',
        '11': 'Thẻ/Tài khoản đã hết hạn',
        '12': 'Thẻ/Tài khoản bị khóa',
        '13': 'Sai mật khẩu xác thực giao dịch',
        '24': 'Khách hàng hủy giao dịch',
        '51': 'Tài khoản không đủ số dư',
        '65': 'Tài khoản vượt quá hạn mức giao dịch trong ngày',
        '75': 'Ngân hàng thanh toán đang bảo trì',
        '79': 'Nhập sai mật khẩu quá số lần quy định',
        '99': 'Lỗi không xác định',
      };

      return {
        success: false,
        message: errorMessages[responseCode] || `Thanh toán thất bại (Mã lỗi: ${responseCode})`,
        responseCode,
      };
    }
  } catch (error) {
    logger.error('Error handling VNPay return:', error);
    return {
      success: false,
      message: 'Có lỗi xảy ra khi xử lý kết quả thanh toán',
    };
  }
};
