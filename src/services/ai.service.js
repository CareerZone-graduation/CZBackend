import logger from '../utils/logger.js';

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

/**
 * Enhance job posting content using FastAPI streaming
 * @param {Object} jobData - Job data to enhance
 * @returns {Promise<ReadableStream>} Stream of SSE events
 */
export const enhanceJobContent = async (jobData) => {
  try {
    if (!INTERNAL_API_KEY) {
      throw new Error('INTERNAL_API_KEY not configured');
    }

    logger.info('Calling FastAPI for job enhancement streaming');

    const response = await fetch(`${PYTHON_SERVICE_URL}/api/v1/enhance-job/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Api-Key': INTERNAL_API_KEY,
      },
      body: JSON.stringify(jobData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('FastAPI error:', errorText);
      throw new Error(`FastAPI returned ${response.status}: ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body from FastAPI');
    }

    logger.info('FastAPI streaming started successfully');
    return response.body;
  } catch (error) {
    logger.error('Error calling FastAPI for job enhancement:', error.message);
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
