import axios from 'axios';
import logger from '../utils/logger.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Enhance job posting content using OpenAI or OpenRouter
 * @param {Object} jobData - Job data to enhance
 * @returns {Promise<Object>} Enhanced job data
 */
export const enhanceJobContent = async (jobData) => {
  try {
    // Determine which API to use
    const useOpenRouter = OPENROUTER_API_KEY && OPENROUTER_API_KEY !== 'your-openrouter-api-key-here';
    const useOpenAI = OPENAI_API_KEY && OPENAI_API_KEY !== 'your-openai-api-key-here';

    if (!useOpenRouter && !useOpenAI) {
      throw new Error('No AI API key configured. Please set OPENAI_API_KEY or OPENROUTER_API_KEY in .env file');
    }

    const apiUrl = useOpenRouter ? OPENROUTER_API_URL : OPENAI_API_URL;
    const apiKey = useOpenRouter ? OPENROUTER_API_KEY : OPENAI_API_KEY;
    const model = useOpenRouter ? 'openai/gpt-3.5-turbo' : 'gpt-3.5-turbo';

    logger.info(`Using ${useOpenRouter ? 'OpenRouter' : 'OpenAI'} API for job enhancement`);

    const prompt = `Bạn là chuyên gia tuyển dụng chuyên nghiệp. Nhiệm vụ của bạn là VIẾT LẠI và MỞ RỘNG nội dung tin tuyển dụng từ các ghi chú ngắn gọn hoặc nội dung sơ khai thành văn bản chuyên nghiệp, chi tiết theo phong cách của các trang tuyển dụng hàng đầu như LinkedIn, Indeed, TopCV.

⚠️ QUAN TRỌNG: Input có thể là:
- Ghi chú tắt (VD: "1 năm kn", "có bằng ĐH", "biết React")
- Câu văn ngắn gọn
- Danh sách đơn giản
➡️ Bạn phải VIẾT LẠI thành văn bản đầy đủ, chuyên nghiệp, chi tiết

YÊU CẦU CHI TIẾT:

1. TIÊU ĐỀ (title):
   - Viết lại thành tiêu đề hấp dẫn, chuyên nghiệp
   - Thêm cấp bậc nếu phù hợp (Junior/Senior/Lead)
   - Giữ ngắn gọn, súc tích
   - VD: "dev react" → "Lập Trình Viên React (Junior/Middle)"

2. MÔ TẢ CÔNG VIỆC (description):
   - Viết lại từ ghi chú thành đoạn văn đầy đủ
   - Mở đầu bằng giới thiệu ngắn về vị trí
   - Liệt kê 5-8 trách nhiệm chính, mỗi mục một dòng với bullet points (-)
   - Mô tả cụ thể, chi tiết công việc hàng ngày
   - Làm rõ mục tiêu và kết quả mong đợi
   - Tối thiểu 150-200 từ
   - VD: "code web" → "- Phát triển và bảo trì các ứng dụng web sử dụng công nghệ hiện đại\n- Tham gia vào quá trình phân tích yêu cầu và thiết kế hệ thống..."

3. YÊU CẦU CÔNG VIỆC (requirements):
   - Viết lại từ ghi chú tắt thành câu văn đầy đủ
   - Chia thành "Yêu cầu bắt buộc" và "Yêu cầu ưu tiên" (nếu phù hợp)
   - Liệt kê 6-10 yêu cầu cụ thể với bullet points (-)
   - Bao gồm: kỹ năng kỹ thuật, kỹ năng mềm, kinh nghiệm, bằng cấp
   - Mô tả chi tiết từng yêu cầu
   - Tối thiểu 120-150 từ
   - VD: 
     * "1 năm kn" → "- Có ít nhất 1 năm kinh nghiệm làm việc trong lĩnh vực tương tự"
     * "có bằng ĐH" → "- Tốt nghiệp Đại học chuyên ngành Công nghệ thông tin, Khoa học máy tính hoặc các ngành liên quan"
     * "biết React" → "- Thành thạo ReactJS và các thư viện liên quan (Redux, React Router, Hooks)"

4. QUYỀN LỢI (benefits):
   - Viết lại từ ghi chú thành câu văn hấp dẫn
   - Chia thành các nhóm: Lương thưởng, Phúc lợi, Phát triển, Môi trường
   - Liệt kê 8-12 quyền lợi cụ thể với bullet points (-)
   - Mô tả chi tiết, hấp dẫn
   - Tối thiểu 120-150 từ
   - VD: "lương cao" → "- Mức lương cạnh tranh, xứng đáng với năng lực và kinh nghiệm"

PHONG CÁCH:
- Chuyên nghiệp, thân thiện, thu hút
- Sử dụng ngôn ngữ tích cực, rõ ràng
- Viết câu văn đầy đủ, không để dạng ghi chú
- Cụ thể, có số liệu nếu có thể
- Dùng tiếng Việt chuẩn, dễ hiểu

LƯU Ý QUAN TRỌNG:
- VIẾT LẠI và MỞ RỘNG từ ghi chú ngắn thành văn bản đầy đủ
- Giữ nguyên ý nghĩa gốc, chỉ làm rõ và chuyên nghiệp hóa
- KHÔNG bịa thông tin không có trong input
- KHÔNG thêm tên công ty, địa chỉ, mức lương cụ thể nếu input không có
- Trả về ĐÚNG định dạng JSON
- KHÔNG thêm markdown, code blocks, hoặc giải thích

Input: ${JSON.stringify(jobData)}

Trả về JSON với cấu trúc:
{
  "title": "...",
  "description": "...",
  "requirements": "...",
  "benefits": "..."
}`;

    const requestBody = {
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a professional recruitment expert with 10+ years of experience. You specialize in REWRITING short notes and brief content into detailed, professional, comprehensive job descriptions that follow best practices from top job platforms like LinkedIn, Indeed, and Glassdoor. You excel at expanding abbreviated notes (like "1 năm kn", "có bằng ĐH") into full, professional sentences. You must return ONLY a valid JSON object without any markdown formatting, code blocks, or explanations.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.8,
      max_tokens: 3000
    };

    // Add JSON mode for OpenAI (not supported by all OpenRouter models)
    if (!useOpenRouter) {
      requestBody.response_format = { type: 'json_object' };
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };

    // Add OpenRouter specific headers
    if (useOpenRouter) {
      headers['HTTP-Referer'] = process.env.BACKEND_URL || 'http://localhost:5000';
      headers['X-Title'] = 'CareerZone Job Enhancement';
    }

    const response = await axios.post(apiUrl, requestBody, { headers });

    let content = response.data.choices[0].message.content.trim();
    logger.info('Raw AI response:', content.substring(0, 200) + '...');
    
    // Remove markdown code blocks if present
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    // Try to extract JSON if there's text before/after
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      content = jsonMatch[0];
    }

    let enhancedData;
    try {
      enhancedData = JSON.parse(content);
    } catch (parseError) {
      logger.error('Failed to parse AI response:', content.substring(0, 500));
      logger.error('Parse error:', parseError.message);
      throw new Error('AI returned invalid JSON format');
    }
    
    // Validate that we have at least some of the expected fields
    if (!enhancedData.title && !enhancedData.description && !enhancedData.requirements && !enhancedData.benefits) {
      logger.error('AI response missing expected fields:', enhancedData);
      throw new Error('AI response is missing expected fields');
    }
    
    // Ensure all fields are strings, not objects
    const cleanedData = {
      title: typeof enhancedData.title === 'string' ? enhancedData.title : '',
      description: typeof enhancedData.description === 'string' ? enhancedData.description : '',
      requirements: typeof enhancedData.requirements === 'string' ? enhancedData.requirements : '',
      benefits: typeof enhancedData.benefits === 'string' ? enhancedData.benefits : '',
    };
    
    logger.info('Job content enhanced successfully');
    return cleanedData;
  } catch (error) {
    logger.error('Error enhancing job content:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      throw new Error('Invalid API key');
    }
    
    if (error.response?.status === 429) {
      throw new Error('API rate limit exceeded. Please try again later.');
    }
    
    if (error.message.includes('invalid JSON') || error.message.includes('missing expected fields')) {
      throw error;
    }
    
    throw new Error(error.message || 'Failed to enhance job content');
  }
};


/**
 * Generate smart suggestions based on job title
 * @param {string} jobTitle - Job title to generate suggestions for
 * @returns {Promise<Object>} Suggestions for description, requirements, benefits
 */
export const generateSmartSuggestions = async (jobTitle) => {
  try {
    // Determine which API to use
    const useOpenRouter = OPENROUTER_API_KEY && OPENROUTER_API_KEY !== 'your-openrouter-api-key-here';
    const useOpenAI = OPENAI_API_KEY && OPENAI_API_KEY !== 'your-openai-api-key-here';

    if (!useOpenRouter && !useOpenAI) {
      throw new Error('No AI API key configured');
    }

    const apiUrl = useOpenRouter ? OPENROUTER_API_URL : OPENAI_API_URL;
    const apiKey = useOpenRouter ? OPENROUTER_API_KEY : OPENAI_API_KEY;
    const model = useOpenRouter ? 'openai/gpt-3.5-turbo' : 'gpt-3.5-turbo';

    logger.info(`Generating smart suggestions for: ${jobTitle}`);

    // Detect language from job title
    const hasVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(jobTitle);
    const language = hasVietnamese ? 'Vietnamese' : 'English';
    
    logger.info(`Detected language: ${language}`);

    const prompt = `You are a professional recruitment expert. Based on the job title, create appropriate job content.

Job Title: "${jobTitle}"

IMPORTANT: The job title is in ${language}. You MUST respond in the SAME language (${language}).

Create DETAILED, PROFESSIONAL content for:

1. JOB DESCRIPTION (description):
   - Brief introduction about the position
   - 6-8 specific main responsibilities for this industry
   - Working hours (Mon-Fri or suitable for the industry)
   - Use bullet points (-)
   - Minimum 150 words

2. JOB REQUIREMENTS (requirements):
   - Divide into "Required" and "Preferred"
   - 6-10 specific requirements suitable for the industry
   - Include: skills, experience, qualifications, personality
   - Use bullet points (-)
   - Minimum 120 words

3. BENEFITS (benefits):
   - 13th month salary, bonuses (suitable for industry)
   - Full insurance
   - Industry-specific benefits (if any)
   - 8-12 specific benefits
   - Use bullet points (-)
   - Minimum 120 words

CRITICAL REQUIREMENTS:
- Content MUST be in ${language}
- Content must FIT the specific industry
- Use industry terminology
- Practical and applicable
- Return EXACT JSON format
- NO markdown, code blocks

Return JSON:
{
  "description": "...",
  "requirements": "...",
  "benefits": "..."
}`;

    const requestBody = {
      model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert recruiter across all industries (IT, hospitality, retail, healthcare, education, etc.). Generate detailed, industry-specific job content. Return ONLY valid JSON without markdown.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.8,
      max_tokens: 2500
    };

    // Add JSON mode for OpenAI (not supported by all OpenRouter models)
    if (!useOpenRouter) {
      requestBody.response_format = { type: 'json_object' };
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };

    if (useOpenRouter) {
      headers['HTTP-Referer'] = process.env.BACKEND_URL || 'http://localhost:5000';
      headers['X-Title'] = 'CareerZone Smart Suggestions';
    }

    const response = await axios.post(apiUrl, requestBody, { headers });

    let content = response.data.choices[0].message.content.trim();
    
    // Remove markdown code blocks if present
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    // Try to extract JSON if there's text before/after
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      content = jsonMatch[0];
    }

    let suggestions;
    try {
      suggestions = JSON.parse(content);
    } catch (parseError) {
      logger.error('Failed to parse AI suggestions:', content.substring(0, 500));
      logger.error('Parse error:', parseError.message);
      throw new Error('AI returned invalid JSON format');
    }
    
    logger.info('Smart suggestions generated successfully');
    return suggestions;
  } catch (error) {
    logger.error('Error generating smart suggestions:', error.response?.data || error.message);
    throw new Error(error.message || 'Failed to generate suggestions');
  }
};
