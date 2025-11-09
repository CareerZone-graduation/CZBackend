import axios from 'axios';
import { User } from '../models/User.js';
import { CandidateProfile } from '../models/CandidateProfile.js';
import ProfileUnlock from '../models/ProfileUnlock.js';
import { NotFoundError, ForbiddenError } from '../utils/AppError.js';
import { maskPdfBuffer } from '../utils/cvMasker.js';
import logger from '../utils/logger.js';

/**
 * Lấy CV (đã che hoặc gốc) dựa trên quyền truy cập của recruiter
 */
export const getMaskedCv = async (recruiterId, candidateId, cvId) => {

  // 1. Kiểm tra ứng viên có tồn tại và cho phép tìm kiếm không
  const candidateUser = await User.findById(candidateId).select('role allowSearch selectedCvId').lean();
  
  if (!candidateUser || candidateUser.role !== 'candidate') {
    throw new NotFoundError('Không tìm thấy ứng viên.');
  }

  if (!candidateUser.allowSearch) {
    throw new ForbiddenError('Ứng viên đã tắt tính năng tìm kiếm.');
  }

  // 2. Kiểm tra xem CV được yêu cầu có phải là CV được chọn không (nếu chưa unlock)
  const hasAccess = await ProfileUnlock.findOne({
    recruiterId,
    candidateId,
  });

  // Nếu chưa unlock, chỉ cho phép xem CV được chọn
  if (!hasAccess && candidateUser.selectedCvId) {
    if (cvId !== candidateUser.selectedCvId.toString()) {
      throw new ForbiddenError('Bạn chỉ có thể xem CV mà ứng viên đã chọn để tìm việc.');
    }
  }

  // 3. Tìm CV trong hồ sơ ứng viên
  const profile = await CandidateProfile.findOne({ userId: candidateId }).select('cvs');
  
  if (!profile) {
    throw new NotFoundError('Không tìm thấy hồ sơ ứng viên.');
  }

  const cv = profile.cvs.find(c => c._id.toString() === cvId);
  
  if (!cv || !cv.path) {
    throw new NotFoundError('Không tìm thấy file CV.');
  }

  // 4. Tải file CV gốc từ Cloudinary
  let originalBuffer;
  try {
    const response = await axios.get(cv.path, { 
      responseType: 'arraybuffer',
      timeout: 30000 // 30 seconds timeout
    });
    originalBuffer = Buffer.from(response.data);
    logger.info(`Successfully downloaded CV from Cloudinary: ${cv.path}`);
    logger.info(`Buffer type: ${originalBuffer.constructor.name}, length: ${originalBuffer.length}`);
    logger.info(`Is Buffer: ${Buffer.isBuffer(originalBuffer)}`);
  } catch (err) {
    logger.error(`Error downloading CV from Cloudinary: ${err.message}`);
    throw new Error('Không thể tải file CV từ Cloudinary.');
  }

  // 5. Quyết định che file hay không
  let finalBuffer = originalBuffer;
  
  if (!hasAccess) {
    logger.info(`Recruiter ${recruiterId} has not unlocked profile, masking CV...`);
    try {
      finalBuffer = await maskPdfBuffer(originalBuffer);
      logger.info('CV masked successfully');
    } catch (maskError) {
      logger.error(`Error masking CV: ${maskError.message}`);
      // Nếu lỗi khi che, vẫn trả về file đã che (originalBuffer)
      // để tránh lộ thông tin
      throw new Error('Không thể xử lý file CV.');
    }
  } else {
    logger.info(`Recruiter ${recruiterId} has unlocked profile, returning original CV`);
  }

  return {
    buffer: finalBuffer,
    fileName: cv.name || 'Candidate_CV.pdf',
    contentType: 'application/pdf',
  };
};
