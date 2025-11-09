import { RecruiterProfile, User, CandidateProfile, ProfileUnlock } from '../models/index.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/AppError.js';
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
 * @param {string} userId - Candidate user ID
 * @param {string} recruiterId - Recruiter user ID
 * @returns {Promise<Object>} Unlock result
 */
export const unlockCandidateProfile = async (userId, recruiterId) => {
  logger.info(`Unlocking candidate profile userId: ${userId} by recruiter: ${recruiterId}`);

  // Check if user exists and is a candidate
  const user = await User.findById(userId).select('role').lean();
  if (!user || user.role !== 'candidate') {
    throw new NotFoundError('Không tìm thấy ứng viên.');
  }

  // Check if already unlocked
  const existingUnlock = await ProfileUnlock.findOne({
    recruiterId,
    candidateId: userId,
  });

  if (existingUnlock) {
    logger.info(`Profile already unlocked for userId: ${userId} by recruiter: ${recruiterId}`);
    return {
      alreadyUnlocked: true,
      message: 'Hồ sơ đã được mở khóa trước đó.',
    };
  }

  // Get recruiter user to check coinBalance
  const recruiterUser = await User.findById(recruiterId).select('coinBalance');
  if (!recruiterUser) {
    throw new NotFoundError('Không tìm thấy nhà tuyển dụng.');
  }

  // Check if recruiter has enough coins (50 coins per unlock)
  const UNLOCK_COST = 50;
  if (recruiterUser.coinBalance < UNLOCK_COST) {
    throw new BadRequestError('Không đủ xu để mở khóa hồ sơ. Vui lòng nạp thêm xu.');
  }

  // Deduct coins
  recruiterUser.coinBalance -= UNLOCK_COST;
  await recruiterUser.save();

  // Create unlock record
  const unlock = await ProfileUnlock.create({
    recruiterId,
    candidateId: userId,
    cost: UNLOCK_COST,
    unlockedAt: new Date(),
  });

  logger.info(`Successfully unlocked candidate profile userId: ${userId} by recruiter: ${recruiterId}`);
  
  return {
    unlocked: true,
    cost: UNLOCK_COST,
    remainingCoins: recruiterUser.coinBalance,
    unlockedAt: unlock.unlockedAt,
  };
};
