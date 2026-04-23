import axios from 'axios';
import logger from '../utils/logger.js';

const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL;
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

/**
 * Generate improved CV với structured data (giống format CV template)
 * @param {Object} params
 * @param {Object} params.originalCVData - CV data gốc từ templateSnapshot
 * @param {string} params.jdText - Job Description
 * @param {Object} params.cvScore - CV score analysis
 * @returns {Promise<Object>} Improved CV data với cùng structure
 */
export const generateImprovedCVStructured = async ({ originalCVData, jdText, cvScore }) => {
  if (!LLM_API_KEY || !LLM_BASE_URL) {
    logger.warn('LLM not configured, cannot generate improved CV');
    return null;
  }

  try {
    const prompt = `You are an expert CV writer and career coach.
Your task is to IMPROVE a candidate's CV data to better match a Job Description.

------------------------
JOB DESCRIPTION:
${jdText}

------------------------
CURRENT CV DATA (JSON):
${JSON.stringify(originalCVData, null, 2)}

------------------------
CV SCORING ANALYSIS:
${cvScore ? `
- Current Score: ${cvScore.overall_score}/100
- Weaknesses: ${cvScore.weaknesses?.join(', ') || 'None'}
- Missing Keywords: ${cvScore.analysis?.keyword_match?.missing?.join(', ') || 'None'}
- Gaps: ${cvScore.analysis?.gap_analysis?.join(', ') || 'None'}
` : 'No scoring data available'}

------------------------
Your tasks:

1. IMPROVE the CV data to match JD better
2. Keep the SAME JSON structure as input
3. Use STAR method for experience descriptions
4. Add specific metrics and numbers
5. Optimize keywords for ATS
6. Keep all original information - DO NOT fabricate
7. Write in VIETNAMESE (except technical terms)

**Improvement Guidelines:**

1. **professionalSummary**: 
   - Rewrite to highlight value proposition
   - Include 3-5 keywords from JD
   - 2-3 sentences, impactful

2. **workExperience**: 
   - Keep same structure: { position, company, location, startDate, endDate, isCurrentJob, description, achievements }
   - Improve descriptions with action verbs
   - Add/improve achievements array with STAR method
   - EVERY achievement must have numbers/metrics
   - Example: "Phát triển 15+ tính năng mới, tăng 30% người dùng (10K→13K)"

3. **skills**:
   - Keep structure: { name, level, category }
   - Add missing keywords from JD as new skills
   - Adjust levels if needed (Beginner/Intermediate/Advanced/Expert)
   - Categories: Technical, Soft Skills, Language

4. **education**:
   - Keep structure: { degree, institution, fieldOfStudy, location, startDate, endDate, gpa, honors, description }
   - Improve descriptions if needed

5. **projects**:
   - Keep structure: { name, description, url, startDate, endDate, technologies }
   - Improve descriptions with results/impact
   - Add metrics

6. **certificates**:
   - Keep structure: { name, issuer, issueDate, expiryDate, credentialId, url }
   - Add relevant certificates if mentioned in original CV

**Writing Principles:**
- Use STRONG action verbs: Phát triển, Tối ưu, Quản lý, Thiết kế, Triển khai
- EVERY achievement must have NUMBERS
- Focus on RESULTS and IMPACT
- Use KEYWORDS from JD naturally
- Keep personal info unchanged

------------------------
Return ONLY JSON in this EXACT format:

{
  "improvedCVData": {
    "personalInfo": {
      "fullName": "...",
      "email": "...",
      "phone": "...",
      "address": "...",
      "website": "...",
      "linkedin": "...",
      "github": "...",
      "profileImage": "..."
    },
    "professionalSummary": "Improved summary with JD keywords...",
    "workExperience": [
      {
        "id": "...",
        "position": "...",
        "company": "...",
        "location": "...",
        "startDate": "...",
        "endDate": "...",
        "isCurrentJob": false,
        "description": "Improved description...",
        "achievements": [
          "Achievement 1 with metrics",
          "Achievement 2 with metrics"
        ]
      }
    ],
    "education": [
      {
        "id": "...",
        "degree": "...",
        "institution": "...",
        "fieldOfStudy": "...",
        "location": "...",
        "startDate": "...",
        "endDate": "...",
        "gpa": "...",
        "honors": "...",
        "description": "..."
      }
    ],
    "skills": [
      {
        "id": "...",
        "name": "...",
        "level": "Advanced",
        "category": "Technical"
      }
    ],
    "projects": [
      {
        "id": "...",
        "name": "...",
        "description": "Improved with metrics...",
        "url": "...",
        "startDate": "...",
        "endDate": "...",
        "technologies": ["..."]
      }
    ],
    "certificates": [
      {
        "id": "...",
        "name": "...",
        "issuer": "...",
        "issueDate": "...",
        "expiryDate": "...",
        "credentialId": "...",
        "url": "..."
      }
    ],
    "sectionOrder": ["summary", "experience", "education", "skills", "projects", "certificates"],
    "hiddenSections": [],
    "template": "modern-blue"
  },
  "improvements": [
    "Added 5 important keywords from JD to skills",
    "Improved 8 achievements with specific metrics",
    "Rewrote professional summary to match position",
    "Added 3 missing technical skills from JD"
  ],
  "score_prediction": 85,
  "key_changes": [
    "Professional Summary: Added keywords 'React', 'Node.js', 'TypeScript'",
    "Work Experience: Added metrics to all achievements",
    "Skills: Added 'Next.js', 'Testing', 'CI/CD'"
  ]
}

CRITICAL RULES:
- Return ONLY valid JSON (no markdown, no explanation)
- Keep EXACT same structure as input
- Keep all IDs unchanged
- Keep personal info unchanged
- Content in VIETNAMESE
- DO NOT fabricate experience/skills
- Only IMPROVE existing content`;

    const response = await axios.post(
      `${LLM_BASE_URL}/chat/completions`,
      {
        model: LLM_MODEL,
        messages: [
          {
            role: 'system',
            content: 'Bạn là chuyên gia cải thiện CV. Luôn trả về JSON hợp lệ với cấu trúc chính xác.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 6000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LLM_API_KEY}`
        },
        timeout: 90000
      }
    );

    const content = response.data.choices[0].message.content;
    logger.info('LLM response received', { contentLength: content.length });

    // Parse JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('No JSON found in LLM response');
      throw new Error('LLM did not return valid JSON');
    }

    const result = JSON.parse(jsonMatch[0]);

    // Validate structure
    if (!result.improvedCVData || !result.improvements) {
      logger.error('Invalid response structure', { result });
      throw new Error('Invalid response structure from LLM');
    }

    logger.info('Successfully generated improved CV', {
      score_prediction: result.score_prediction,
      improvements_count: result.improvements.length
    });

    return result;

  } catch (error) {
    logger.error('Error generating improved CV', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};
