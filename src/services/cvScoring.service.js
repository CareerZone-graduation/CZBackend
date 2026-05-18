import axios from 'axios';
import mammoth from 'mammoth';
import { BadRequestError } from '../utils/AppError.js';
import { extractTextFromPDF } from '../utils/pdfTextExtractor.js';
import logger from '../utils/logger.js';

const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL;
const LLM_MODEL = process.env.LLM_MODEL;

/**
 * Chấm điểm CV dựa trên Job Description
 * @param {Object} params
 * @param {string} params.cvText - Nội dung CV (text)
 * @param {string} params.jdText - Job Description
 * @param {string} params.jobType - Loại công việc (technical/marketing/business)
 * @returns {Promise<Object>} Kết quả chấm điểm
 */
export const scoreCVWithLLM = async ({ cvText, jdText, jobType = 'technical' }) => {

  logger.info('Starting CV scoring with LLM', {
    cvLength: cvText?.length || 0,
    jdLength: jdText?.length || 0,
    jobType,
    hasCV: Boolean(cvText?.trim()),
    hasJD: Boolean(jdText?.trim())
  });

  try {
    const prompt = `You are an expert ATS (Applicant Tracking System), recruiter, career advisor, and data analyst.
Your task is to deeply compare a candidate's CV with a Job Description (JD) and return structured data for visualization and career guidance.
You MUST return ONLY valid JSON (ALL TEXT IN VIETNAMESE except technical terms).

------------------------
JOB DESCRIPTION:
Job Type: ${jobType}

${jdText}

------------------------
CANDIDATE CV:
${cvText}

------------------------
Your tasks:

1. Evaluate how well the CV matches the JD (0-100 score).

2. Break down the match into categories for visualization (EXACTLY these 7 categories in Vietnamese):
   - Kỹ năng chuyên môn (Technical/Professional Skills)
   - Kỹ năng mềm (Soft Skills)
   - Dự án & Kinh nghiệm liên quan (Related Projects & Experience)
   - Khả năng ngôn ngữ (Language Proficiency)
   - Tin học văn phòng (Computer/Office Skills)
   - Hoạt động ngoại khóa (Extracurricular Activities)
   - Trình độ học vấn (Education Level)

3. For each category, give score (0-100) and explanation in Vietnamese.

4. Extract keywords from JD and check if they appear in CV.

5. Identify gaps (critical, moderate, minor) in Vietnamese.

6. Build a relationship graph: JD requirements → CV evidence mapping.

7. Provide actionable suggestions in Vietnamese with DETAILED, SPECIFIC advice for each CV section.

8. **CAREER PATH ANALYSIS**: Based on current CV and target job, suggest 3-5 career progression steps with:
   - Role title (Vietnamese)
   - Timeline (e.g., "6-12 tháng", "1-2 năm")
   - Key skills to develop
   - Milestones to achieve

9. **PROJECT RECOMMENDATIONS**: Suggest 5-8 specific projects the candidate should build to match the JD:
   - Project title (Vietnamese)
   - Description (what to build, why it matters)
   - Technologies to use
   - Skills gained
   - Estimated time
   - Difficulty level (Dễ/Trung bình/Khó)
   - Impact on CV score

10. **SKILL GAP ROADMAP**: For each missing skill, provide:
    - Skill name
    - Current level vs Required level
    - Learning resources (courses, books, tutorials)
    - Practice projects
    - Time to proficiency

------------------------
Return ONLY JSON in this format:

{
  "overall_score": number,
  "category_scores": [
    {
      "name": "Kỹ năng chuyên môn",
      "score": number,
      "explanation": "Giải thích bằng tiếng Việt"
    },
    {
      "name": "Kỹ năng mềm",
      "score": number,
      "explanation": "Giải thích bằng tiếng Việt"
    },
    {
      "name": "Dự án & Kinh nghiệm liên quan",
      "score": number,
      "explanation": "Giải thích bằng tiếng Việt"
    },
    {
      "name": "Khả năng ngôn ngữ",
      "score": number,
      "explanation": "Giải thích bằng tiếng Việt"
    },
    {
      "name": "Tin học văn phòng",
      "score": number,
      "explanation": "Giải thích bằng tiếng Việt"
    },
    {
      "name": "Hoạt động ngoại khóa",
      "score": number,
      "explanation": "Giải thích bằng tiếng Việt"
    },
    {
      "name": "Trình độ học vấn",
      "score": number,
      "explanation": "Giải thích bằng tiếng Việt"
    }
  ],
  "keyword_analysis": {
    "matched": ["keyword1", "keyword2"],
    "missing": ["keyword3", "keyword4"],
    "coverage_ratio": number (MUST be: matched_count / (matched_count + missing_count), range 0.0-1.0)
  },
  "gaps": {
    "critical": ["Thiếu sót nghiêm trọng 1"],
    "moderate": ["Điểm yếu 1"],
    "minor": ["Cần cải thiện 1"]
  },
  "visualization": {
    "radar_chart": {
      "labels": ["Kỹ năng chuyên môn", "Kỹ năng mềm", "Dự án & Kinh nghiệm liên quan", "Khả năng ngôn ngữ", "Tin học văn phòng", "Hoạt động ngoại khóa", "Trình độ học vấn"],
      "values": [number, number, number, number, number, number, number]
    },
    "bar_chart": {
      "matched_count": number,
      "missing_count": number
    }
  },
  "graph": [
    {
      "jd_requirement": "Yêu cầu từ JD",
      "cv_evidence": "Bằng chứng từ CV",
      "match_level": "high | medium | low"
    }
  ],
  "career_paths": [
    {
      "role": "Tên vị trí tiếp theo",
      "timeline": "6-12 tháng",
      "skills_to_develop": ["Kỹ năng 1", "Kỹ năng 2"],
      "milestones": ["Mốc quan trọng 1", "Mốc quan trọng 2"],
      "description": "Mô tả chi tiết về bước phát triển này"
    }
  ],
  "recommended_projects": [
    {
      "title": "Tên dự án",
      "description": "Mô tả chi tiết dự án và lý do nên làm",
      "technologies": ["Tech 1", "Tech 2"],
      "skills_gained": ["Kỹ năng học được 1", "Kỹ năng học được 2"],
      "estimated_time": "2-4 tuần",
      "difficulty": "Trung bình",
      "impact": "Tăng 10-15 điểm trong mục Technical Skills"
    }
  ],
  "skill_gaps": [
    {
      "skill": "Tên kỹ năng",
      "current_level": "Beginner/Intermediate/Advanced/None",
      "required_level": "Intermediate/Advanced/Expert",
      "learning_resources": ["Resource 1", "Resource 2"],
      "practice_projects": ["Project idea 1", "Project idea 2"],
      "time_to_proficiency": "1-2 tháng"
    }
  ],
  "suggestions": ["Gợi ý hành động 1", "Gợi ý hành động 2"],
  "breakdown": {
    "personal_info": number (0-5, đánh giá thông tin cá nhân: họ tên, email, SĐT, địa chỉ),
    "skills": number (0-20),
    "experience": number (0-20),
    "education": number (0-10),
    "keywords_ats": number (0-15),
    "achievements": number (0-15),
    "presentation": number (0-15)
  },
  "overall_score": number (MUST equal sum of breakdown: personal_info + skills + experience + education + keywords_ats + achievements + presentation, range 0-100),
  "summary": "Tóm tắt ngắn gọn bằng tiếng Việt",
  "strengths": ["Điểm mạnh 1", "Điểm mạnh 2"],
  "weaknesses": ["Điểm yếu 1", "Điểm yếu 2"],
  "critical_gaps": ["Thiếu sót nghiêm trọng 1"],
  "improvements": {
    "content": ["Cải thiện nội dung 1"],
    "formatting": ["Cải thiện trình bày 1"]
  },
  "suggested_keywords": ["keyword1", "keyword2"],
  "rewrite_examples": [
    {
      "original": "Câu gốc",
      "improved": "Câu cải thiện"
    }
  ]
}

IMPORTANT:
- Return ONLY JSON
- No markdown code blocks
- No explanation outside JSON
- ALL descriptive text must be in VIETNAMESE
- Technical terms (React, Node.js, etc.) can be in English
- Be strict and realistic like a real ATS system
- Provide SPECIFIC, ACTIONABLE project ideas that directly address skill gaps
- Career paths should be realistic and achievable`;

    const response = await axios.post(
      `${LLM_BASE_URL}/chat/completions`,
      {
        model: "gemini-3-flash",
        messages: [
          {
            role: 'system',
            content: 'Bạn là chuyên gia ATS và data analyst. Luôn trả về JSON hợp lệ với data có thể visualization, TẤT CẢ nội dung bằng TIẾNG VIỆT.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 15000
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

    // Validate và fix overall_score = tổng breakdown
    if (result.breakdown) {
      const breakdownSum = 
        (result.breakdown.personal_info || 0) +
        (result.breakdown.skills || 0) +
        (result.breakdown.experience || 0) +
        (result.breakdown.education || 0) +
        (result.breakdown.keywords_ats || 0) +
        (result.breakdown.achievements || 0) +
        (result.breakdown.presentation || 0);
      
      // Force overall_score = breakdown sum
      result.overall_score = Math.min(100, Math.max(0, breakdownSum));
      
      logger.info('CV scoring completed', {
        overall_score: result.overall_score,
        breakdown: result.breakdown,
        breakdown_sum: breakdownSum
      });
    }

    return result;
  } catch (error) {
    logger.error('CV scoring error:', {
      message: error.message,
      code: error.code,
      status: error.response?.status
    });

    // Return null nếu lỗi, không block ứng tuyển
    return null;
  }
};

/**
 * Validate xem file có phải CV thật không
 * @param {Object} cv - CV object từ database
 * @returns {Object} { isValid: boolean, reason: string }
 */
const normalizeCVPayload = (cv) => {
  if (!cv) return null;

  if (cv.cvData && typeof cv.cvData === 'object') {
    return cv.cvData;
  }

  if (cv.templateSnapshot && typeof cv.templateSnapshot === 'object') {
    return cv.templateSnapshot;
  }

  return cv;
};

const normalizeList = (value) => (Array.isArray(value) ? value : []);

const normalizeSkillLabel = (skill) => {
  if (typeof skill === 'string') return skill.trim();
  if (!skill || typeof skill !== 'object') return '';

  const name = (skill.name || skill.skill || skill.title || '').toString().trim();
  const level = (skill.level || skill.proficiency || '').toString().trim();

  if (!name) return '';
  return level ? `${name} (${level})` : name;
};

export const validateCV = (cv) => {
  const cvData = normalizeCVPayload(cv);
  if (!cvData) {
    return { isValid: false, reason: 'Không có dữ liệu CV' };
  }

  const missingFields = [];

  // 1. Check thông tin cá nhân (BẮT BUỘC)
  if (!cvData.personalInfo || !cvData.personalInfo.fullName) {
    missingFields.push('Thông tin cá nhân (họ tên)');
  }

  // 2. Check mục tiêu nghề nghiệp (BẮT BUỘC)
  if (!cvData.objective && !cvData.summary && !cvData.professionalSummary) {
    missingFields.push('Mục tiêu nghề nghiệp');
  }

  // 3. Check kinh nghiệm HOẶC dự án (BẮT BUỘC - ít nhất 1 trong 2)
  const hasExperience = normalizeList(cvData.experience).length > 0;
  const hasWorkExperience = normalizeList(cvData.workExperience).length > 0;
  const hasProjects = normalizeList(cvData.projects).length > 0;
  
  if (!hasExperience && !hasWorkExperience && !hasProjects) {
    missingFields.push('Kinh nghiệm làm việc hoặc Dự án');
  }

  // 4. Check kỹ năng (BẮT BUỘC)
  const normalizedSkills = normalizeList(cvData.skills)
    .map(normalizeSkillLabel)
    .filter(Boolean);
  const hasSkills = normalizedSkills.length > 0 || 
                    normalizeList(cvData.skillsTechnical).length > 0 ||
                    normalizeList(cvData.skillsSoft).length > 0;
  
  if (!hasSkills) {
    missingFields.push('Kỹ năng');
  }

  // Nếu thiếu bất kỳ field nào
  if (missingFields.length > 0) {
    return { 
      isValid: false, 
      reason: `CV thiếu các thông tin bắt buộc: ${missingFields.join(', ')}. Vui lòng bổ sung đầy đủ thông tin.` 
    };
  }

  // Check độ dài text - CV thật thường có ít nhất 200 ký tự
  const cvText = extractCVText(cvData);
  if (cvText.length < 200) {
    return { 
      isValid: false, 
      reason: 'CV quá ngắn, không đủ thông tin chi tiết để đánh giá. Vui lòng bổ sung thêm nội dung.' 
    };
  }

  return { isValid: true, reason: '' };
};

/**
 * Extract text từ CV (giả sử CV đã được parse)
 * @param {Object} cv - CV object từ database
 * @returns {string} CV text
 */
export const extractCVText = (cv) => {
  const cvData = normalizeCVPayload(cv);
  if (!cvData) return '';

  const sections = [];

  // Personal info (BẮT BUỘC)
  if (cvData.personalInfo) {
    sections.push(`Name: ${cvData.personalInfo.fullName || ''}`);
    sections.push(`Email: ${cvData.personalInfo.email || ''}`);
    sections.push(`Phone: ${cvData.personalInfo.phone || ''}`);
  }

  // Objective (BẮT BUỘC)
  if (cvData.objective) {
    sections.push(`\nObjective:\n${cvData.objective}`);
  } else if (cvData.summary) {
    sections.push(`\nObjective/Summary:\n${cvData.summary}`);
  } else if (cvData.professionalSummary) {
    sections.push(`\nObjective/Summary:\n${cvData.professionalSummary}`);
  }

  // Work experience (CV model mới)
  if (normalizeList(cvData.workExperience).length > 0) {
    sections.push('\nExperience:');
    cvData.workExperience.forEach((exp) => {
      const title = exp.position || exp.title || '';
      const company = exp.company || '';
      sections.push(`- ${title} at ${company} (${exp.startDate || ''} - ${exp.endDate || (exp.isCurrentJob ? 'Present' : '') || 'Present'})`);
      if (exp.description) sections.push(`  ${exp.description}`);
      normalizeList(exp.achievements).forEach((achievement) => {
        sections.push(`  - ${achievement}`);
      });
    });
  }

  // Experience (BẮT BUỘC - structure cũ)
  if (normalizeList(cvData.experience).length > 0) {
    sections.push('\nExperience:');
    cvData.experience.forEach((exp) => {
      const title = exp.title || exp.position || '';
      const company = exp.company || '';
      sections.push(`- ${title} at ${company} (${exp.startDate || ''} - ${exp.endDate || 'Present'})`);
      if (exp.description) sections.push(`  ${exp.description}`);
    });
  }

  // Projects (BẮT BUỘC - nếu không có experience)
  if (normalizeList(cvData.projects).length > 0) {
    sections.push('\nProjects:');
    cvData.projects.forEach((proj) => {
      sections.push(`- ${proj.name}: ${proj.description || ''}`);
      const technologies = Array.isArray(proj.technologies) ? proj.technologies.join(', ') : proj.technologies;
      if (technologies) sections.push(`  Technologies: ${technologies}`);
    });
  }

  // Education (TÙY CHỌN - chỉ thêm nếu có)
  if (normalizeList(cvData.education).length > 0) {
    sections.push('\nEducation:');
    cvData.education.forEach((edu) => {
      const school = edu.school || edu.institution || edu.university || '';
      sections.push(`- ${edu.degree || ''} at ${school} (${edu.startDate || ''} - ${edu.endDate || 'Present'})`);
    });
  }

  // Skills (TÙY CHỌN - chỉ thêm nếu có)
  const parsedSkills = normalizeList(cvData.skills)
    .map(normalizeSkillLabel)
    .filter(Boolean);
  if (parsedSkills.length > 0) {
    sections.push(`\nSkills: ${parsedSkills.join(', ')}`);
  }

  if (normalizeList(cvData.skillsTechnical).length > 0) {
    sections.push(`\nTechnical Skills: ${cvData.skillsTechnical.join(', ')}`);
  }

  if (normalizeList(cvData.skillsSoft).length > 0) {
    sections.push(`\nSoft Skills: ${cvData.skillsSoft.join(', ')}`);
  }

  // Certifications (TÙY CHỌN - chỉ thêm nếu có)
  if (normalizeList(cvData.certifications).length > 0) {
    sections.push('\nCertifications:');
    cvData.certifications.forEach((cert) => {
      const certName = typeof cert === 'string' ? cert : cert.name;
      const issuer = typeof cert === 'string' ? '' : cert.issuer || cert.organization || '';
      sections.push(`- ${certName || ''} (${issuer})`);
    });
  }

  if (normalizeList(cvData.certificates).length > 0) {
    sections.push('\nCertifications:');
    cvData.certificates.forEach((cert) => {
      sections.push(`- ${cert.name} (${cert.issuer || ''})`);
    });
  }

  return sections.join('\n');
};

const getFileExtension = (value = '') => {
  const cleanValue = value.split('?')[0].split('#')[0];
  const dotIndex = cleanValue.lastIndexOf('.');
  return dotIndex >= 0 ? cleanValue.slice(dotIndex).toLowerCase() : '';
};

export const extractUploadedCVText = async (uploadedCV) => {
  if (!uploadedCV?.path) {
    throw new BadRequestError('CV tải lên không có đường dẫn file để chấm điểm');
  }

  const response = await fetch(uploadedCV.path);
  if (!response.ok) {
    throw new BadRequestError('Không thể tải nội dung CV đã upload để chấm điểm');
  }

  const contentType = response.headers?.get?.('content-type') || '';
  const fileExtension = getFileExtension(uploadedCV.name || uploadedCV.path);
  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  let cvText = '';
  if (contentType.includes('pdf') || fileExtension === '.pdf') {
    cvText = await extractTextFromPDF(uint8Array);
  } else if (contentType.includes('wordprocessingml') || fileExtension === '.docx') {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
    cvText = result.value || '';
  } else if (contentType.startsWith('text/')) {
    cvText = Buffer.from(arrayBuffer).toString('utf8');
  } else {
    throw new BadRequestError('Chấm điểm CV upload hiện chỉ hỗ trợ file PDF hoặc DOCX');
  }

  if (!cvText.trim()) {
    throw new BadRequestError('Không trích xuất được nội dung từ CV đã upload');
  }

  return cvText.trim();
};
