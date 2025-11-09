import { RecruiterProfile, User, CandidateProfile, ProfileUnlock, CreditTransaction } from '../models/index.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/AppError.js';
import { TRANSACTION_TYPES, TRANSACTION_CATEGORIES } from '../constants/index.js';
import logger from '../utils/logger.js';

/**
 * Get recruiter profile by user ID.
 * @param {string} userId - The ID of the user (recruiter).
 * @returns {Promise<Object>} The recruiter profile.
 */
export const getRecruiterProfile = async (userId) => {
  logger.info(`Fetching recruiter profile for userId: ${userId}`);

  const profile = await RecruiterProfile.findOne({ userId }).populate(
    'userId',
    'email avatar role'
  ).lean();

  if (!profile) {
    logger.warn(`Recruiter profile not found for userId: ${userId}`);
    throw new NotFoundError('Không tìm thấy hồ sơ nhà tuyển dụng.');
  }

  logger.info(`Successfully fetched recruiter profile for userId: ${userId}`);
  return profile;
};

/**
 * Mask email address
 * @param {string} email - Email to mask
 * @returns {string} Masked email
 */
const maskEmail = (email) => {
  if (!email) return '';
  const [username, domain] = email.split('@');
  if (!domain) return email;
  const maskedUsername = username.charAt(0) + '***' + username.charAt(username.length - 1);
  return `${maskedUsername}@${domain}`;
};

/**
 * Mask phone number
 * @param {string} phone - Phone to mask
 * @returns {string} Masked phone
 */
const maskPhone = (phone) => {
  if (!phone) return '';
  return phone.replace(/(\d{3})\d{4}(\d{3})/, '$1****$2');
};

/**
 * Get candidate profile with masking if not unlocked
 * @param {string} userId - Candidate user ID
 * @param {string} recruiterId - Recruiter user ID
 * @returns {Promise<Object>} Candidate profile
 */
export const getCandidateProfile = async (userId, recruiterId) => {
  logger.info(`Fetching candidate profile for userId: ${userId} by recruiter: ${recruiterId}`);

  // Check if user exists and is a candidate
  const user = await User.findById(userId).select('email phone role allowSearch selectedCvId').lean();
  if (!user || user.role !== 'candidate') {
    throw new NotFoundError('Không tìm thấy ứng viên.');
  }

  // Check if candidate allows search
  if (!user.allowSearch) {
    throw new ForbiddenError('Ứng viên này đã tắt tính năng cho phép nhà tuyển dụng tìm kiếm.');
  }

  // Get candidate profile
  const profile = await CandidateProfile.findOne({ userId }).lean();
  if (!profile) {
    throw new NotFoundError('Không tìm thấy hồ sơ ứng viên.');
  }

  // Check if profile is unlocked
  const unlock = await ProfileUnlock.findOne({
    recruiterId,
    candidateId: userId,
  }).lean();

  const isUnlocked = !!unlock;

  // Prepare response with masking if needed
  const response = {
    ...profile,
    email: isUnlocked ? user.email : maskEmail(user.email),
    phone: isUnlocked ? profile.phone : maskPhone(profile.phone),
    isUnlocked,
  };

  // Always only show selected CV (both locked and unlocked)
  // The difference is: locked = CV is masked, unlocked = CV is not masked
  if (profile.cvs && profile.cvs.length > 0) {
    if (user.selectedCvId) {
      // Chỉ hiển thị CV được chọn (dù locked hay unlocked)
      const selectedCv = profile.cvs.find(cv => cv._id.toString() === user.selectedCvId.toString());
      response.cvs = selectedCv ? [selectedCv] : [];
    } else {
      // Nếu không có CV được chọn, không hiển thị CV nào
      response.cvs = [];
    }
  }

  logger.info(`Successfully fetched candidate profile for userId: ${userId}, isUnlocked: ${isUnlocked}`);
  return response;
};

/**
 * Unlock candidate profile (purchase access)
 * @param {string} candidateId - Candidate user ID
 * @param {string} recruiterId - Recruiter user ID
 * @returns {Promise<Object>} Unlock result with transaction details
 */
export const unlockCandidateProfile = async (candidateId, recruiterId) => {
  logger.info(`Unlocking candidate profile candidateId: ${candidateId} by recruiter: ${recruiterId}`);

  // Check if user exists and is a candidate
  const candidateUser = await User.findById(candidateId).select('role').lean();
  if (!candidateUser || candidateUser.role !== 'candidate') {
    throw new NotFoundError('Không tìm thấy ứng viên.');
  }

  // Get candidate profile to retrieve candidate name
  const candidateProfile = await CandidateProfile.findOne({ userId: candidateId }).select('fullname').lean();
  if (!candidateProfile) {
    throw new NotFoundError('Không tìm thấy hồ sơ ứng viên.');
  }

  const candidateName = candidateProfile.fullname;

  // Check if already unlocked by looking for existing ProfileUnlock record
  const existingUnlock = await ProfileUnlock.findOne({
    recruiterId,
    candidateId
  }).lean();

  if (existingUnlock) {
    logger.info(`Profile already unlocked for candidateId: ${candidateId} by recruiter: ${recruiterId}`);
    
    // Get the transaction for this unlock
    const existingTransaction = await CreditTransaction.findOne({
      userId: recruiterId,
      category: TRANSACTION_CATEGORIES.PROFILE_UNLOCK,
      'metadata.candidateId': candidateId
    }).lean();

    return {
      alreadyUnlocked: true,
      transaction: existingTransaction,
      remainingBalance: (await User.findById(recruiterId).select('coinBalance').lean()).coinBalance,
      candidateName,
      message: 'Hồ sơ đã được mở khóa trước đó.',
    };
  }

  // Get recruiter user to check coinBalance
  const recruiterUser = await User.findById(recruiterId).select('coinBalance');
  if (!recruiterUser) {
    throw new NotFoundError('Không tìm thấy nhà tuyển dụng.');
  }

  // Check if recruiter has enough credits (50 credits per unlock)
  const UNLOCK_COST = 50;
  if (recruiterUser.coinBalance < UNLOCK_COST) {
    throw new BadRequestError('Không đủ xu để mở khóa hồ sơ. Vui lòng nạp thêm xu.');
  }

  // Deduct credits atomically
  recruiterUser.coinBalance -= UNLOCK_COST;
  await recruiterUser.save();

  const balanceAfter = recruiterUser.coinBalance;

  // Create CreditTransaction record
  const transaction = await CreditTransaction.create({
    userId: recruiterId,
    type: TRANSACTION_TYPES.USAGE,
    category: TRANSACTION_CATEGORIES.PROFILE_UNLOCK,
    amount: -UNLOCK_COST,
    balanceAfter: balanceAfter,
    description: `Mở khóa hồ sơ ứng viên: ${candidateName}`,
    metadata: {
      candidateId: candidateId,
      candidateName: candidateName
    }
  });

  // Create ProfileUnlock record to mark this profile as unlocked
  await ProfileUnlock.create({
    recruiterId,
    candidateId,
    cost: UNLOCK_COST,
    unlockedAt: new Date()
  });

  logger.info(`Successfully unlocked candidate profile candidateId: ${candidateId} by recruiter: ${recruiterId}`);
  
  return {
    unlocked: true,
    transaction: transaction,
    cost: UNLOCK_COST,
    remainingBalance: balanceAfter,
    candidateName: candidateName
  };
};
