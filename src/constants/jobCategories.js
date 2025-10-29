/**
 * Job Categories Constants
 * Centralized definition to avoid duplication across models and schemas
 */

export const JOB_CATEGORY_VALUES = [
  'IT',
  'SOFTWARE_DEVELOPMENT',
  'DATA_SCIENCE',
  'MACHINE_LEARNING',
  'WEB_DEVELOPMENT',
  'SALES',
  'MARKETING',
  'ACCOUNTING',
  'GRAPHIC_DESIGN',
  'CONTENT_WRITING',
  'MEDICAL',
  'TEACHING',
  'ENGINEERING',
  'PRODUCTION',
  'LOGISTICS',
  'HOSPITALITY',
  'REAL_ESTATE',
  'LAW',
  'FINANCE',
  'HUMAN_RESOURCES',
  'CUSTOMER_SERVICE',
  'ADMINISTRATION',
  'MANAGEMENT',
  'OTHER'
];

/**
 * Category labels in Vietnamese
 * Maps category values to their Vietnamese labels
 */
export const CATEGORY_LABELS = {
  'IT': 'Công nghệ thông tin',
  'SOFTWARE_DEVELOPMENT': 'Phát triển phần mềm',
  'DATA_SCIENCE': 'Khoa học dữ liệu',
  'MACHINE_LEARNING': 'Học máy / AI',
  'WEB_DEVELOPMENT': 'Phát triển Web',
  'SALES': 'Kinh doanh',
  'MARKETING': 'Marketing',
  'ACCOUNTING': 'Kế toán',
  'GRAPHIC_DESIGN': 'Thiết kế đồ họa',
  'CONTENT_WRITING': 'Viết nội dung',
  'MEDICAL': 'Y tế',
  'TEACHING': 'Giáo dục',
  'ENGINEERING': 'Kỹ thuật',
  'PRODUCTION': 'Sản xuất',
  'LOGISTICS': 'Vận tải / Logistics',
  'HOSPITALITY': 'Khách sạn / Nhà hàng',
  'REAL_ESTATE': 'Bất động sản',
  'LAW': 'Luật',
  'FINANCE': 'Tài chính',
  'HUMAN_RESOURCES': 'Nhân sự',
  'CUSTOMER_SERVICE': 'Dịch vụ khách hàng',
  'ADMINISTRATION': 'Hành chính',
  'MANAGEMENT': 'Quản lý',
  'OTHER': 'Khác'
};

/**
 * Recommendation scoring constants
 */
export const RECOMMENDATION_SCORING = {
  CATEGORY_MATCH: 20,
  SKILL_MATCH: 40,
  LOCATION_MATCH: 50,
  SALARY_MATCH: 30,
  PREFERENCES_MATCH: 40
};
