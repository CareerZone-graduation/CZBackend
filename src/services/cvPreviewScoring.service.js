import { CandidateProfile, Job, CV } from '../models/index.js';
import { NotFoundError, BadRequestError } from '../utils/AppError.js';
import { scoreCVWithLLM, extractCVText } from './cvScoring.service.js';
import logger from '../utils/logger.js';

/**
 * Preview CV scoring without creating application
 * @param {string} userId - User ID
 * @param {string} jobId - Job ID
 * @param {Object} params - { cvId or cvTemplateId }
 * @returns {Promise<Object>} Scoring result
 */
export const previewCVScore = async (userId, jobId, { cvId, cvTemplateId }) => {
  try {
    // 1. Validate input
    if (!cvId && !cvTemplateId) {
      throw new BadRequestError('Phải cung cấp cvId hoặc cvTemplateId');
    }

    if (cvId && cvTemplateId) {
      throw new BadRequestError('Chỉ được cung cấp một trong hai: cvId hoặc cvTemplateId');
    }

    // 2. Get candidate profile
    const candidateProfile = await CandidateProfile.findOne({ userId });
    if (!candidateProfile) {
      throw new NotFoundError('Không tìm thấy hồ sơ ứng viên');
    }

    // 3. Get job (allow scoring even if not ACTIVE for preview purposes)
    logger.info('Looking for job', { jobId });
    const job = await Job.findById(jobId);
    if (!job) {
      logger.error('Job not found', { jobId });
      throw new NotFoundError('Tin tuyển dụng không tồn tại');
    }
    logger.info('Job found', { jobId, title: job.title, status: job.status });

    // 4. Get CV data
    let cvData;
    let cvText;

    if (cvId) {
      // Uploaded CV - không thể validate vì chỉ có file path
      const selectedCV = candidateProfile.cvs?.find(cv => cv._id.toString() === cvId);
      if (!selectedCV) {
        throw new BadRequestError('CV không hợp lệ hoặc không tìm thấy');
      }
      // Skip validation cho uploaded CV vì không có structured data
      cvText = `CV: ${selectedCV.name}\nPath: ${selectedCV.path}`;
      cvData = null; // Mark as uploaded file
    } else {
      // Template CV
      const cvTemplate = await CV.findById(cvTemplateId);
      logger.info('CV template check', { 
        cvTemplateId, 
        found: !!cvTemplate,
        cvTemplateUserId: cvTemplate?.userId?.toString(),
        requestUserId: userId.toString()
      });
      
      if (!cvTemplate) {
        throw new BadRequestError('CV template không tồn tại');
      }
      
      if (cvTemplate.userId.toString() !== userId.toString()) {
        throw new BadRequestError('CV template không thuộc về bạn');
      }
      
      cvData = cvTemplate;
      cvText = extractCVText(cvTemplate);
    }

    // 5. Build JD text
    const jdText = `
Job Title: ${job.title}
Company: ${job.company}
Description: ${job.description || ''}
Requirements: ${job.requirements || ''}
Skills: ${job.skills?.join(', ') || ''}
Experience: ${job.experience || ''}
Education: ${job.education || ''}
    `.trim();

    // 6. Validate CV trước khi score (chỉ cho template CV)
    if (cvData) {
      const { validateCV } = await import('./cvScoring.service.js');
      const validation = validateCV(cvData);
      
      if (!validation.isValid) {
        throw new BadRequestError(`File không hợp lệ: ${validation.reason}. Vui lòng upload CV thật với đầy đủ thông tin cá nhân, kinh nghiệm, kỹ năng.`);
      }
    }

    // 7. Score CV with LLM
    logger.info('Preview CV scoring', { userId, jobId, cvId, cvTemplateId });
    
    const scoringResult = await scoreCVWithLLM({
      cvText,
      jdText,
      jobType: job.category || 'technical'
    });

    if (!scoringResult) {
      throw new BadRequestError('Không thể chấm điểm CV. Vui lòng thử lại sau.');
    }

    logger.info('Preview CV scoring completed', {
      userId,
      jobId,
      score: scoringResult.overall_score
    });

    return scoringResult;
  } catch (error) {
    logger.error('Preview CV scoring error:', {
      userId,
      jobId,
      error: error.message
    });
    throw error;
  }
};
