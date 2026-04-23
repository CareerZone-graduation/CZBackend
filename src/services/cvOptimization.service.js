import axios from 'axios';
import logger from '../utils/logger.js';
import { CandidateProfile, Job, CV } from '../models/index.js';
import { NotFoundError } from '../utils/AppError.js';
import { extractCVText } from './cvScoring.service.js';

const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL;
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

/**
 * Generate optimized CV based on scoring suggestions
 * @param {string} userId - User ID
 * @param {string} jobId - Job ID
 * @param {Object} params - { cvId or cvTemplateId, scoringData }
 * @returns {Promise<Object>} Optimized CV data
 */
export const generateOptimizedCV = async (userId, jobId, { cvId, cvTemplateId, scoringData }) => {
  try {
    logger.info('Starting CV optimization', { userId, jobId, cvId, cvTemplateId });

    // Validate LLM config
    if (!LLM_API_KEY || !LLM_BASE_URL) {
      logger.error('LLM not configured');
      throw new Error('LLM service chưa được cấu hình');
    }

    // Get candidate profile
    const candidateProfile = await CandidateProfile.findOne({ userId }).lean();
    if (!candidateProfile) {
      throw new NotFoundError('Không tìm thấy hồ sơ ứng viên');
    }

    // Get job
    const job = await Job.findById(jobId).lean();
    if (!job) {
      throw new NotFoundError('Tin tuyển dụng không tồn tại');
    }

    // Get original CV data
    let originalCVData;
    if (cvId) {
      const selectedCV = candidateProfile.cvs?.find(cv => cv._id.toString() === cvId);
      if (!selectedCV) {
        throw new NotFoundError('CV không tìm thấy');
      }
      originalCVData = { name: selectedCV.name, path: selectedCV.path, type: 'uploaded' };
    } else if (cvTemplateId) {
      const cvTemplate = await CV.findById(cvTemplateId).lean();
      if (!cvTemplate || cvTemplate.userId.toString() !== userId.toString()) {
        throw new NotFoundError('CV template không tồn tại');
      }
      originalCVData = cvTemplate;
    } else {
      throw new Error('Phải cung cấp cvId hoặc cvTemplateId');
    }

    logger.info('CV data retrieved', { originalCVData: originalCVData.name || 'template' });

    // Build prompt for LLM
    const prompt = `You are an expert CV writer and career coach.

ORIGINAL CV DATA:
${JSON.stringify(originalCVData, null, 2)}

JOB REQUIREMENTS:
Title: ${job.title}
Company: ${job.company}
Description: ${job.description || ''}
Requirements: ${job.requirements || ''}
Skills: ${job.skills?.join(', ') || ''}

SCORING ANALYSIS:
Overall Score: ${scoringData.overall_score}/100
Suggestions: ${JSON.stringify(scoringData.suggestions)}
Improvements: ${JSON.stringify(scoringData.improvements)}
Rewrite Examples: ${JSON.stringify(scoringData.rewrite_examples)}
Suggested Keywords: ${JSON.stringify(scoringData.suggested_keywords)}
Gaps: ${JSON.stringify(scoringData.gaps)}

YOUR TASK:
Generate an OPTIMIZED CV that addresses all the weaknesses and incorporates all suggestions.
Keep the SAME STRUCTURE as the original CV but improve the content.

Return ONLY valid JSON in this format:
{
  "personalInfo": {
    "fullName": "string",
    "email": "string",
    "phone": "string",
    "address": "string (optional)",
    "linkedin": "string (optional)",
    "github": "string (optional)",
    "website": "string (optional)"
  },
  "professionalSummary": "string (2-3 câu tóm tắt chuyên môn, nhấn mạnh điểm mạnh phù hợp với JD)",
  "workExperience": [
    {
      "position": "string",
      "company": "string",
      "location": "string (optional)",
      "startDate": "MM/YYYY",
      "endDate": "MM/YYYY hoặc 'Hiện tại'",
      "isCurrentJob": boolean,
      "description": "string (mô tả chi tiết với metrics và impact)",
      "achievements": ["achievement 1", "achievement 2"]
    }
  ],
  "education": [
    {
      "degree": "string",
      "school": "string",
      "major": "string (optional)",
      "startDate": "YYYY",
      "endDate": "YYYY",
      "gpa": "string (optional)"
    }
  ],
  "skills": {
    "technical": ["skill1", "skill2"],
    "soft": ["skill1", "skill2"],
    "languages": ["language1: level", "language2: level"],
    "tools": ["tool1", "tool2"]
  },
  "projects": [
    {
      "name": "string",
      "description": "string (chi tiết về dự án, công nghệ sử dụng, vai trò)",
      "technologies": ["tech1", "tech2"],
      "link": "string (optional)"
    }
  ],
  "certifications": [
    {
      "name": "string",
      "issuer": "string",
      "date": "MM/YYYY",
      "link": "string (optional)"
    }
  ],
  "extracurricular": [
    {
      "activity": "string",
      "role": "string",
      "description": "string"
    }
  ]
}

IMPORTANT:
- ALL text must be in VIETNAMESE
- Use STRONG action verbs
- Include METRICS and NUMBERS where possible
- Incorporate ALL suggested keywords naturally
- Apply ALL rewrite examples
- Address ALL gaps mentioned in the analysis
- Keep professional tone
- Be specific and concrete`;

    const response = await axios.post(
      `${LLM_BASE_URL}/chat/completions`,
      {
        model: LLM_MODEL,
        messages: [
          {
            role: 'system',
            content: 'Bạn là chuyên gia viết CV chuyên nghiệp. Luôn trả về JSON hợp lệ với nội dung tiếng Việt chất lượng cao.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 4000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LLM_API_KEY}`
        },
        timeout: 60000
      }
    );

    const content = response.data.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in LLM response');
    }

    const optimizedCV = JSON.parse(jsonMatch[0]);

    logger.info('CV optimization completed', { userId, jobId });

    return {
      originalCV: originalCVData,
      optimizedCV,
      improvements: {
        score_increase: 100 - scoringData.overall_score,
        applied_suggestions: scoringData.suggestions?.length || 0,
        keywords_added: scoringData.suggested_keywords?.length || 0
      }
    };
  } catch (error) {
    logger.error('CV optimization error:', {
      userId,
      jobId,
      error: error.message
    });
    throw error;
  }
};
