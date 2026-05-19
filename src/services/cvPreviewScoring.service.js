import { CandidateProfile, Job, CV } from '../models/index.js';
import { NotFoundError, BadRequestError } from '../utils/AppError.js';
import { scoreCVWithLLM, extractCVText, extractUploadedCVText } from './cvScoring.service.js';
import {
  buildCVScoreCacheKey,
  getCachedCVScore,
  saveCVScoreCache,
  withCacheMetadata
} from './cvScoreCache.service.js';
import logger from '../utils/logger.js';

import {
  createAnalysisSession,
  pushAnalysisEvent,
  getLatestAnalysisState
} from './cvScoreStream.service.js';

/**
 * Preview CV scoring asynchronously (starts the session and returns analysisId)
 * @param {string} userId - User ID
 * @param {string} jobId - Job ID
 * @param {Object} params - { cvId or cvTemplateId }
 * @returns {Promise<Object>} { analysisId }
 */
export const previewCVScore = async (userId, jobId, { cvId, cvTemplateId, forceRefresh = false }) => {
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
  const job = await Job.findById(jobId);
  if (!job) {
    throw new NotFoundError('Tin tuyển dụng không tồn tại');
  }

  const session = createAnalysisSession({
    applicationId: `preview_${jobId}`,
    userId: userId.toString(),
  });

  // Start background process
  _runPreviewScoringAsync(session.analysisId, userId, job, candidateProfile, { cvId, cvTemplateId, forceRefresh }).catch(error => {
    logger.error('Background preview scoring error:', error);
  });

  return { analysisId: session.analysisId };
};

const _runPreviewScoringAsync = async (analysisId, userId, job, candidateProfile, { cvId, cvTemplateId, forceRefresh }) => {
  try {
    pushAnalysisEvent(analysisId, {
      type: 'progress_update',
      analysisProgress: 10,
      phaseLabel: 'Đang thu thập dữ liệu CV...',
    });

    let cvData;
    let cvText;
    let cvSource;
    let sourceCvId;
    let cvPayload;
    let cvName;

    if (cvId) {
      const selectedCV = candidateProfile.cvs?.find(cv => cv._id.toString() === cvId);
      if (!selectedCV) {
        throw new BadRequestError('CV không hợp lệ hoặc không tìm thấy');
      }

      cvData = null; 
      cvSource = 'UPLOADED';
      sourceCvId = selectedCV._id;
      cvPayload = selectedCV;
      cvName = selectedCV.name;
    } else {
      const cvTemplate = await CV.findById(cvTemplateId);
      if (!cvTemplate || cvTemplate.userId.toString() !== userId.toString()) {
        throw new BadRequestError('CV template không tồn tại hoặc không thuộc về bạn');
      }
      
      cvData = cvTemplate.cvData;
      if (!cvData) {
        throw new BadRequestError('CV template không có dữ liệu để chấm điểm');
      }
      cvSource = 'TEMPLATE';
      sourceCvId = cvTemplate._id;
      cvPayload = cvData;
      cvName = cvTemplate.title || 'CV Template';
    }

    pushAnalysisEvent(analysisId, {
      type: 'progress_update',
      analysisProgress: 30,
      phaseLabel: 'Đang trích xuất nội dung...',
    });

    const jdText = `
Job Title: ${job.title}
Company: ${job.company}
Description: ${job.description || ''}
Requirements: ${job.requirements || ''}
Skills: ${job.skills?.join(', ') || ''}
Experience: ${job.experience || ''}
Education: ${job.education || ''}
    `.trim();

    const cacheKey = buildCVScoreCacheKey({
      userId,
      job,
      cvSource,
      cvId: sourceCvId,
      cvPayload
    });

    if (!forceRefresh) {
      const cachedScore = await getCachedCVScore(cacheKey);
      if (cachedScore) {
        pushAnalysisEvent(analysisId, {
          type: 'progress_update',
          analysisProgress: 100,
          phaseLabel: 'Hoàn tất phân tích',
        });
        
        pushAnalysisEvent(analysisId, {
          type: 'score_update',
          ...cachedScore.scoringResult,
          isCached: true
        });

        pushAnalysisEvent(analysisId, {
          type: 'analysis_complete',
          status: 'completed',
        });
        return;
      }
    }

    if (cvSource === 'UPLOADED') {
      cvText = await extractUploadedCVText(cvPayload);
    } else {
      cvText = extractCVText(cvData);
      const { validateCV } = await import('./cvScoring.service.js');
      const validation = validateCV(cvData);
      if (!validation.isValid) {
        throw new BadRequestError(`File không hợp lệ: ${validation.reason}. Vui lòng upload CV thật với đầy đủ thông tin cá nhân, kinh nghiệm, kỹ năng.`);
      }
    }

    pushAnalysisEvent(analysisId, {
      type: 'progress_update',
      analysisProgress: 60,
      phaseLabel: 'AI đang phân tích độ phù hợp...',
    });
    
    const scoringResult = await scoreCVWithLLM({
      cvText,
      jdText,
      jobType: job.category || 'technical'
    });

    if (!scoringResult) {
      throw new BadRequestError('Không thể chấm điểm CV. Vui lòng thử lại sau.');
    }

    pushAnalysisEvent(analysisId, {
      type: 'progress_update',
      analysisProgress: 90,
      phaseLabel: 'Đang lưu kết quả...',
    });

    await saveCVScoreCache(cacheKey, scoringResult, {
      cvName,
      jobTitle: job.title
    });

    pushAnalysisEvent(analysisId, {
      type: 'progress_update',
      analysisProgress: 100,
      phaseLabel: 'Hoàn tất phân tích',
    });

    pushAnalysisEvent(analysisId, {
      type: 'score_update',
      ...scoringResult,
      isCached: false
    });

    pushAnalysisEvent(analysisId, {
      type: 'analysis_complete',
      status: 'completed',
    });

  } catch (error) {
    pushAnalysisEvent(analysisId, {
      type: 'analysis_error',
      status: 'error',
      message: error.message || 'Lỗi không xác định khi chấm điểm CV',
    });
  }
};
