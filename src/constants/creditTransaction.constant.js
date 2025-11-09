/**
 * Credit Transaction Constants
 * Định nghĩa các hằng số cho hệ thống giao dịch xu (credit)
 */

// Transaction types
export const TRANSACTION_TYPES = {
  DEPOSIT: 'DEPOSIT',
  USAGE: 'USAGE'
};

export const ALL_TRANSACTION_TYPES = Object.values(TRANSACTION_TYPES);

// Transaction categories
export const TRANSACTION_CATEGORIES = {
  // Deposit categories
  RECHARGE: 'RECHARGE',

  // Usage categories
  JOB_VIEW: 'JOB_VIEW',
  CV_UNLOCK: 'CV_UNLOCK',
  PROFILE_BOOST: 'PROFILE_BOOST',
  JOB_POST: 'JOB_POST',
  PREMIUM_FEATURE: 'PREMIUM_FEATURE',
  PROFILE_UNLOCK: 'PROFILE_UNLOCK'
};

export const ALL_TRANSACTION_CATEGORIES = Object.values(TRANSACTION_CATEGORIES);

// Deposit categories
export const DEPOSIT_CATEGORIES = [
  TRANSACTION_CATEGORIES.RECHARGE
];

// Usage categories
export const USAGE_CATEGORIES = [
  TRANSACTION_CATEGORIES.JOB_VIEW,
  TRANSACTION_CATEGORIES.CV_UNLOCK,
  TRANSACTION_CATEGORIES.PROFILE_BOOST,
  TRANSACTION_CATEGORIES.JOB_POST,
  TRANSACTION_CATEGORIES.PREMIUM_FEATURE,
  TRANSACTION_CATEGORIES.PROFILE_UNLOCK
];

// Category display names (Vietnamese)
export const CATEGORY_LABELS = {
  [TRANSACTION_CATEGORIES.RECHARGE]: 'Nạp xu',
  [TRANSACTION_CATEGORIES.JOB_VIEW]: 'Xem số lượng ứng viên',
  [TRANSACTION_CATEGORIES.CV_UNLOCK]: 'Mở khóa CV',
  [TRANSACTION_CATEGORIES.PROFILE_BOOST]: 'Đẩy hồ sơ',
  [TRANSACTION_CATEGORIES.JOB_POST]: 'Đăng tin tuyển dụng',
  [TRANSACTION_CATEGORIES.PREMIUM_FEATURE]: 'Tính năng cao cấp',
  [TRANSACTION_CATEGORIES.PROFILE_UNLOCK]: 'Mở khóa hồ sơ ứng viên'
};

// Transaction type display names (Vietnamese)
export const TRANSACTION_TYPE_LABELS = {
  [TRANSACTION_TYPES.DEPOSIT]: 'Nạp xu',
  [TRANSACTION_TYPES.USAGE]: 'Sử dụng xu'
};
