import axios from 'axios';
import logger from '../utils/logger.js';

const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL;
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

/**
 * Tạo CV mới từ CV cũ và Job Description
 * @param {Object} params
 * @param {string} params.cvText - Nội dung CV hiện tại
 * @param {string} params.jdText - Job Description
 * @param {Object} params.cvScore - Kết quả chấm điểm CV (để biết điểm yếu)
 * @param {string} params.jobType - Loại công việc
 * @returns {Promise<Object>} CV mới
 */
export const generateImprovedCV = async ({ cvText, jdText, cvScore, jobType = 'technical' }) => {
  if (!LLM_API_KEY || !LLM_BASE_URL) {
    logger.warn('LLM not configured, cannot generate CV');
    return null;
  }

  try {
    const prompt = `You are an expert CV writer and career coach.
Your task is to REWRITE a candidate's CV to better match a Job Description (JD).

------------------------
JOB DESCRIPTION:
${jdText}

------------------------
CURRENT CV:
${cvText}

------------------------
CV SCORING ANALYSIS:
${cvScore ? `
- Current Score: ${cvScore.overall_score}/100
- Weaknesses: ${cvScore.weaknesses?.join(', ') || 'None'}
- Critical Gaps: ${cvScore.critical_gaps?.join(', ') || 'None'}
- Missing Keywords: ${cvScore.suggested_keywords?.join(', ') || 'None'}
` : 'No scoring data available'}

------------------------
Your tasks:

1. Rewrite the ENTIRE CV to be more impressive and match the JD better
2. Use the STAR method (Situation, Task, Action, Result) for experience bullets
3. Add specific metrics and numbers wherever possible
4. Optimize for ATS (Applicant Tracking System)
5. Keep all original information - DO NOT fabricate experience or skills
6. Write in VIETNAMESE (except technical terms)

**CV Structure (REQUIRED):**

1. THÔNG TIN CÁ NHÂN
   - Họ tên, Email, SĐT, LinkedIn/GitHub

2. MỤC TIÊU NGHỀ NGHIỆP (2-3 câu)
   - Highlight value proposition
   - Include keywords from JD

3. KINH NGHIỆM LÀM VIỆC (Reverse chronological)
   - Position - Company (Duration)
   - 3-5 bullet points using action verbs
   - FORMULA: Action Verb + Task + Result with metrics
   - Example: "Phát triển 15+ tính năng mới, tăng 30% người dùng (10K→13K)"

4. KỸ NĂNG
   - Technical Skills: (keywords from JD)
   - Soft Skills: (communication, teamwork, etc.)

5. HỌC VẤN
   - Degree, School, Duration, GPA (if >= 3.0)

6. DỰ ÁN NỔI BẬT (if applicable)
   - Project name, technologies, role, results

7. CHỨNG CHỈ (if applicable)

**Writing Principles:**
- Use STRONG action verbs: Phát triển, Tối ưu, Quản lý, Thiết kế, Triển khai
- EVERY achievement must have NUMBERS (%, quantity, time, revenue)
- Focus on RESULTS and IMPACT, not just job duties
- Use KEYWORDS from JD naturally
- Length: 1-2 pages (400-600 words)

**Job Type Optimization:**
- Job Type: ${jobType}
- Technical roles → clean, minimal, technical focus
- Marketing roles → creative, results-driven
- Business roles → structured, ROI-focused

------------------------
Return ONLY JSON in this format (CV content in VIETNAMESE):

{
  "content": "Full rewritten CV content (plain text with line breaks and bullet points)",
  "improvements": [
    "Added 5 important keywords from JD",
    "Added specific metrics to 8 achievements",
    "Rewrote career objective to match position",
    "Optimized structure for ATS"
  ],
  "score_prediction": 85,
  "key_changes": [
    "Change 1: Specific description",
    "Change 2: Specific description"
  ]
}

IMPORTANT:
- Return ONLY JSON (no markdown, no explanation)
- CV content must be in VIETNAMESE
- CV must be COMPLETE and READY TO USE
- Keep real personal information (name, email, phone)
- DO NOT fabricate experience/skills not in original CV
- Only REWRITE to make it more impressive`;

    const response = await axios.post(
      `${LLM_BASE_URL}/chat/completions`,
      {
        model: LLM_MODEL,
        messages: [
          {
            role: 'system',
            content: 'Bạn là chuyên gia viết CV chuyên nghiệp. Luôn trả về JSON hợp lệ, nội dung CV bằng TIẾNG VIỆT.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.4,
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

    // Parse JSON từ response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in LLM response');
    }

    const result = JSON.parse(jsonMatch[0]);

    logger.info('CV generation completed', {
      improvements: result.improvements?.length || 0,
      predicted_score: result.score_prediction
    });

    return result;
  } catch (error) {
    logger.error('CV generation error:', {
      message: error.message,
      status: error.response?.status
    });

    throw error;
  }
};
