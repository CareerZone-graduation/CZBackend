import axios from 'axios';
import logger from '../utils/logger.js';

const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL;
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

/**
 * Enhanced CV Analysis với Radar Chart, Career Path, Projects
 * @param {Object} params
 * @param {string} params.cvText - CV text
 * @param {string} params.jdText - Job Description
 * @param {Object} params.cvScore - Basic CV score (from cvScoring.service)
 * @returns {Promise<Object>} Enhanced analysis
 */
export const getEnhancedAnalysis = async ({ cvText, jdText, cvScore }) => {
  if (!LLM_API_KEY || !LLM_BASE_URL) {
    logger.warn('LLM not configured, skipping enhanced analysis');
    return null;
  }

  try {
    const prompt = `You are an expert career coach and technical recruiter.
Analyze this CV deeply and provide career guidance.

------------------------
JOB DESCRIPTION:
${jdText}

------------------------
CANDIDATE CV:
${cvText}

------------------------
CURRENT CV SCORE:
Overall: ${cvScore?.overall_score || 'N/A'}/100
Strengths: ${cvScore?.strengths?.join(', ') || 'N/A'}
Weaknesses: ${cvScore?.weaknesses?.join(', ') || 'N/A'}

------------------------
Provide ENHANCED ANALYSIS in JSON format (Vietnamese content):

{
  "radar_metrics": {
    "technical_skills": number (0-100),
    "experience": number (0-100),
    "education": number (0-100),
    "projects": number (0-100),
    "soft_skills": number (0-100),
    "certifications": number (0-100),
    "industry_knowledge": number (0-100),
    "leadership": number (0-100)
  },
  
  "career_paths": [
    {
      "path_name": "Tên con đường nghề nghiệp (VD: Senior Frontend Developer)",
      "timeline": "1-2 năm",
      "probability": "High | Medium | Low",
      "description": "Mô tả ngắn gọn về con đường này",
      "required_skills": [
        "Kỹ năng cần có 1",
        "Kỹ năng cần có 2"
      ],
      "recommended_actions": [
        "Hành động cụ thể 1",
        "Hành động cụ thể 2"
      ],
      "salary_range": "Mức lương dự kiến (VD: 20-30 triệu)",
      "market_demand": "High | Medium | Low"
    }
  ],
  
  "recommended_projects": [
    {
      "project_name": "Tên dự án (VD: E-commerce Platform)",
      "difficulty": "Easy | Medium | Hard",
      "duration": "1-3 tháng",
      "skills_gained": [
        "Kỹ năng học được 1",
        "Kỹ năng học được 2"
      ],
      "why_recommended": "Lý do nên làm dự án này",
      "key_features": [
        "Tính năng chính 1",
        "Tính năng chính 2"
      ],
      "tech_stack": ["React", "Node.js", "MongoDB"],
      "impact": "Tăng điểm CV lên ~15 điểm",
      "tutorial_keywords": "react ecommerce tutorial"
    }
  ],
  
  "skill_gaps": [
    {
      "skill": "Tên kỹ năng (VD: TypeScript)",
      "current_level": "None | Basic | Intermediate | Advanced",
      "required_level": "Basic | Intermediate | Advanced | Expert",
      "priority": "High | Medium | Low",
      "learning_path": [
        "Bước 1: Học cơ bản (1 tuần)",
        "Bước 2: Thực hành (2 tuần)"
      ],
      "resources": [
        {
          "type": "Course | Documentation | Tutorial | Book",
          "name": "Tên tài liệu",
          "provider": "Udemy | Coursera | Official Docs",
          "duration": "5 giờ",
          "is_free": true
        }
      ],
      "estimated_time": "4-6 tuần",
      "impact": "Tăng 10 điểm overall score"
    }
  ],
  
  "industry_insights": {
    "current_trends": [
      "Xu hướng công nghệ 1",
      "Xu hướng công nghệ 2"
    ],
    "hot_skills": [
      "Kỹ năng đang hot 1",
      "Kỹ năng đang hot 2"
    ],
    "market_outlook": "Nhận định về thị trường việc làm"
  }
}

RULES:
- Return ONLY valid JSON
- All text in VIETNAMESE except technical terms
- Be realistic and actionable
- Provide 3-5 career paths
- Provide 3-5 project recommendations
- Provide top 5 skill gaps
- Base recommendations on CV content and JD requirements`;

    const response = await axios.post(
      `${LLM_BASE_URL}/chat/completions`,
      {
        model: LLM_MODEL,
        messages: [
          {
            role: 'system',
            content: 'Bạn là chuyên gia tư vấn nghề nghiệp và phân tích CV. Luôn trả về JSON hợp lệ.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
        // ,
        // temperature: 0.5,
        // max_tokens: 16000
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
    logger.info('Enhanced analysis LLM response received', { contentLength: content.length });

    // Parse JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('No JSON found in enhanced analysis response');
      return null;
    }

    const result = JSON.parse(jsonMatch[0]);

    // Validate structure
    if (!result.radar_metrics || !result.career_paths) {
      logger.error('Invalid enhanced analysis structure');
      return null;
    }

    logger.info('Enhanced analysis generated successfully');
    return result;

  } catch (error) {
    logger.error('Error generating enhanced analysis', {
      error: error.message,
      stack: error.stack
    });
    return null; // Return null instead of throwing to not break main flow
  }
};
