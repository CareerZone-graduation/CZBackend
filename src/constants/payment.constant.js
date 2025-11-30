/**
 * Payment Method Constants
 * Định nghĩa tất cả các phương thức thanh toán được hỗ trợ trong hệ thống
 */

export const PAYMENT_METHODS = {
  VNPAY: 'VNPAY',
  MOMO: 'MOMO', 
  ZALOPAY: 'ZALOPAY'
};

// Mảng chứa tất cả các phương thức thanh toán để sử dụng trong analytics
export const ALL_PAYMENT_METHODS = Object.values(PAYMENT_METHODS);

// Payment method display names cho frontend
export const PAYMENT_METHOD_LABELS = {
  [PAYMENT_METHODS.VNPAY]: 'VNPay',
  [PAYMENT_METHODS.MOMO]: 'MoMo',
  [PAYMENT_METHODS.ZALOPAY]: 'ZaloPay'
};

// Transaction status constants
export const TRANSACTION_STATUS = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS', 
  FAILED: 'FAILED'
};

export const ALL_TRANSACTION_STATUS = Object.values(TRANSACTION_STATUS);

// Transaction status display names
export const TRANSACTION_STATUS_LABELS = {
  [TRANSACTION_STATUS.PENDING]: 'Đang xử lý',
  [TRANSACTION_STATUS.SUCCESS]: 'Thành công',
  [TRANSACTION_STATUS.FAILED]: 'Thất bại'
};