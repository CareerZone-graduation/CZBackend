import axios from 'axios';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const JSEARCH_BASE_URL = 'https://api.openwebninja.com/jsearch';

/**
 * Normalize a raw JSearch job object into a cleaner internal format
 */
const normalizeJob = (raw) => ({
    id: raw.job_id,
    title: raw.job_title || 'Không có tiêu đề',
    company: {
        name: raw.employer_name || 'Không rõ công ty',
        logo: raw.employer_logo || null,
        website: raw.employer_website || null,
    },
    location: raw.job_location || [raw.job_city, raw.job_state, raw.job_country].filter(Boolean).join(', ') || 'Không rõ địa điểm',
    isRemote: String(raw.job_is_remote).toLowerCase() === 'yes',
    type: raw.job_employment_type || null,
    description: raw.job_description || '',
    highlights: raw.job_highlights || {},
    applyUrl: raw.job_apply_link || null,
    source: raw.job_publisher || 'Unknown',
    postedAt: raw.job_posted_at_datetime_utc || raw.job_posted_at || null,
    salary: {
        min: raw.job_min_salary || null,
        max: raw.job_max_salary || null,
        currency: raw.job_salary_currency || null,
        period: raw.job_salary_period || null,
    },
    requiredSkills: raw.job_required_skills || [],
});

/**
 * Search for external jobs using OpenWebNinja JSearch API
 * @param {Object} params - Search parameters
 * @param {string} params.query - Job search query (required)
 * @param {number} params.page - Page number (1-100)
 * @param {number} params.num_pages - Number of pages to return (1-20)
 * @param {string} params.country - Country code (e.g. 'vn')
 * @param {string} params.language - Language code (e.g. 'vi')
 * @param {string} params.employment_types - Comma-separated employment types
 */
export const searchExternalJobs = async (params) => {
    const apiKey = config.OPENWEBNINJA_API_KEY;

    if (!apiKey) {
        throw new Error('OpenWebNinja API key chưa được cấu hình');
    }

    const queryParams = {
        query: params.query,
        page: params.page || 1,
        num_pages: 1, // API quy định mỗi page 10 kết quả
        country: params.country || 'vn',
        language: params.language || 'vi',
    };

    if (params.date_posted) queryParams.date_posted = params.date_posted;
    if (params.employment_types) queryParams.employment_types = params.employment_types;
    if (params.remote_jobs_only) queryParams.remote_jobs_only = 'true';

    const response = await axios.get(`${JSEARCH_BASE_URL}/search`, {
        headers: {
            'x-api-key': apiKey,
        },
        params: queryParams,
        timeout: 25000,
    });

    if (response.data.status && response.data.status !== 'success' && response.data.status !== 'OK') {
        logger.error('JSearch API error:', response.data);
        throw new Error('Lỗi khi tìm kiếm việc làm bên ngoài');
    }

    const rawJobs = response.data.data || [];
    const normalizedJobs = rawJobs.map(normalizeJob);

    return {
        data: normalizedJobs,
        meta: {
            total: normalizedJobs.length,
            page: params.page || 1,
            query: params.query,
        },
    };
};
