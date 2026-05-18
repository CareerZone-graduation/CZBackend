import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const DEFAULT_APPLICATION_ID = '6a0b378a3fa97dafedbd697c';

const parseArgs = () => {
  return process.argv.slice(2).reduce((acc, arg) => {
    if (!arg.startsWith('--')) return acc;

    const [rawKey, ...rawValue] = arg.slice(2).split('=');
    acc[rawKey] = rawValue.length > 0 ? rawValue.join('=') : true;
    return acc;
  }, {});
};

const args = parseArgs();

const applicationId = args.applicationId || process.env.APPLICATION_ID || DEFAULT_APPLICATION_ID;
const llmBaseURL = args.baseURL || process.env.LLM_BASE_URL;
const llmAPIKey = args.apiKey || process.env.LLM_API_KEY;
const llmModel = 'gemini-3-flash';
const maxTokens = Number(args.maxTokens || process.env.LLM_MAX_TOKENS || 15000);
const timeoutMs = Number(args.timeoutMs || 180000);
const dbURI = process.env.DB_URI || process.env.MONGO_URI;
const writeRaw = args.writeRaw === true || args.writeRaw === 'true';

const buildJDText = (job) => `
Title: ${job.title}
Description: ${job.description || ''}
Requirements: ${job.requirements || ''}
Benefits: ${job.benefits || ''}
Skills: ${job.skills?.join(', ') || ''}
`.trim();

const resolveJobType = (job) => {
  const title = (job.title || '').toLowerCase();
  if (title.includes('marketing') || title.includes('design') || title.includes('creative')) {
    return 'marketing';
  }
  if (title.includes('business') || title.includes('manager') || title.includes('sales')) {
    return 'business';
  }
  return 'technical';
};

const buildPrompt = ({ cvText, jdText, jobType = 'technical' }) => `You are an expert ATS (Applicant Tracking System), recruiter, career advisor, and data analyst.
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

6. Build a relationship graph: JD requirements -> CV evidence mapping.

7. Provide actionable suggestions in Vietnamese with DETAILED, SPECIFIC advice for each CV section.

8. CAREER PATH ANALYSIS: Based on current CV and target job, suggest 3-5 career progression steps with:
   - Role title (Vietnamese)
   - Timeline (e.g., "6-12 tháng", "1-2 năm")
   - Key skills to develop
   - Milestones to achieve

9. PROJECT RECOMMENDATIONS: Suggest 5-8 specific projects the candidate should build to match the JD:
   - Project title (Vietnamese)
   - Description (what to build, why it matters)
   - Technologies to use
   - Skills gained
   - Estimated time
   - Difficulty level (Dễ/Trung bình/Khó)
   - Impact on CV score

10. SKILL GAP ROADMAP: For each missing skill, provide:
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
    "coverage_ratio": number
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
    "personal_info": number,
    "skills": number,
    "experience": number,
    "education": number,
    "keywords_ats": number,
    "achievements": number,
    "presentation": number
  },
  "overall_score": number,
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

const parseScoringJSON = (content) => {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in streamed LLM response');
  }

  const result = JSON.parse(jsonMatch[0]);
  if (result.breakdown) {
    const breakdownSum =
      (result.breakdown.personal_info || 0) +
      (result.breakdown.skills || 0) +
      (result.breakdown.experience || 0) +
      (result.breakdown.education || 0) +
      (result.breakdown.keywords_ats || 0) +
      (result.breakdown.achievements || 0) +
      (result.breakdown.presentation || 0);

    result.overall_score = Math.min(100, Math.max(0, breakdownSum));
  }

  return result;
};

const writeRawOutput = (content) => {
  const outputDir = path.resolve(__dirname, '../tmp');
  fs.mkdirSync(outputDir, { recursive: true });

  const rawPath = path.join(outputDir, `cv-scoring-stream-${applicationId}-${Date.now()}.txt`);
  fs.writeFileSync(rawPath, content, 'utf8');

  return rawPath;
};

const loadApplicationInput = async () => {
  const { Application } = await import('../src/models/index.js');
  const { extractCVText, extractUploadedCVText } = await import('../src/services/cvScoring.service.js');

  const application = await Application.findById(applicationId)
    .populate('jobId')
    .populate('candidateProfileId');

  if (!application) {
    throw new Error(`Application not found: ${applicationId}`);
  }

  if (!application.submittedCV) {
    throw new Error('Application has no submittedCV');
  }

  if (!application.jobId) {
    throw new Error('Application has no jobId');
  }

  let cvText = '';
  if (application.submittedCV.source === 'TEMPLATE' && application.submittedCV.templateSnapshot) {
    cvText = extractCVText(application.submittedCV.templateSnapshot);
  } else if (application.submittedCV.source === 'UPLOADED') {
    cvText = await extractUploadedCVText(application.submittedCV);
  } else {
    throw new Error(`Unsupported submittedCV source: ${application.submittedCV.source}`);
  }

  return {
    application,
    job: application.jobId,
    cvText,
    jdText: buildJDText(application.jobId),
    jobType: resolveJobType(application.jobId)
  };
};

const readStreamedCompletion = async ({ prompt }) => {
  const startedAt = Date.now();
  let firstContentAt = null;
  let chunkCount = 0;
  let content = '';
  let buffer = '';

  const response = await axios.post(
    `${llmBaseURL}/chat/completions`,
    {
      model: llmModel,
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
      max_tokens: maxTokens,
      stream: true
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${llmAPIKey}`
      },
      responseType: 'stream',
      timeout: timeoutMs
    }
  );

  const headersAt = Date.now();
  console.log('LLM stream headers received', {
    status: response.status,
    headersMs: headersAt - startedAt
  });

  const handleLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data:')) return;

    const data = trimmed.slice('data:'.length).trim();
    if (!data || data === '[DONE]') return;

    let payload;
    try {
      payload = JSON.parse(data);
    } catch (error) {
      console.warn('Skipping non-JSON stream line', { line: data.slice(0, 120), error: error.message });
      return;
    }

    const delta = payload.choices?.[0]?.delta?.content || payload.choices?.[0]?.message?.content || '';
    if (!delta) return;

    if (!firstContentAt) {
      firstContentAt = Date.now();
      console.log('LLM first content chunk received', {
        firstContentMs: firstContentAt - startedAt
      });
    }

    chunkCount += 1;
    content += delta;

    if (chunkCount % 50 === 0) {
      console.log('LLM stream progress', {
        chunkCount,
        contentLength: content.length,
        elapsedMs: Date.now() - startedAt
      });
    }
  };

  await new Promise((resolve, reject) => {
    response.data.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      lines.forEach(handleLine);
    });

    response.data.on('end', () => {
      if (buffer) {
        handleLine(buffer);
      }
      resolve();
    });

    response.data.on('error', reject);
  });

  return {
    content,
    chunkCount,
    firstContentMs: firstContentAt ? firstContentAt - startedAt : null,
    totalMs: Date.now() - startedAt
  };
};

const main = async () => {
  if (!dbURI) {
    throw new Error('Missing DB_URI or MONGO_URI');
  }

  if (!llmBaseURL || !llmAPIKey) {
    throw new Error('Missing LLM_BASE_URL or LLM_API_KEY');
  }

  console.log('Starting streaming CV scoring test', {
    applicationId,
    model: llmModel,
    maxTokens,
    timeoutMs,
    baseURL: llmBaseURL
  });

  await mongoose.connect(dbURI);

  const { application, job, cvText, jdText, jobType } = await loadApplicationInput();
  const prompt = buildPrompt({ cvText, jdText, jobType });

  console.log('Prepared scoring input', {
    applicationId: application._id.toString(),
    jobId: job._id.toString(),
    jobTitle: job.title,
    cvSource: application.submittedCV.source,
    cvLength: cvText.length,
    jdLength: jdText.length,
    promptLength: prompt.length,
    jobType
  });

  const streamed = await readStreamedCompletion({ prompt });

  let rawPath = null;
  if (writeRaw) {
    rawPath = writeRawOutput(streamed.content);
  }

  console.log('LLM stream completed', {
    chunkCount: streamed.chunkCount,
    firstContentMs: streamed.firstContentMs,
    totalMs: streamed.totalMs,
    contentLength: streamed.content.length,
    rawPath: rawPath || undefined
  });

  try {
    const parsed = parseScoringJSON(streamed.content);
    console.log('Parsed streamed scoring JSON', {
      overall_score: parsed.overall_score,
      categoryCount: parsed.category_scores?.length || 0,
      matchedKeywords: parsed.keyword_analysis?.matched?.length || 0,
      missingKeywords: parsed.keyword_analysis?.missing?.length || 0
    });
  } catch (error) {
    rawPath = rawPath || writeRawOutput(streamed.content);
    console.error('Could not parse streamed scoring JSON', {
      error: error.message,
      rawPath
    });
    process.exitCode = 1;
  }
};

main()
  .catch((error) => {
    console.error('Streaming CV scoring test failed', {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      response: error.response?.data
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });
