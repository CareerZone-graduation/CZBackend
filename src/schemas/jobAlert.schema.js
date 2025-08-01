import { z } from 'zod';
import { provinceNames, locationMap } from '../constants/locations.enum.js';

const locationAlertSchema = z.object({
  province: z.enum([...provinceNames, 'ALL']),
  ward: z.string().optional(),
}).refine(data => {
  // If province is 'ALL', ward should not be present.
  if (data.province === 'ALL') {
    return !data.ward;
  }
  // If ward is present, it must be valid for the selected province.
  if (data.ward) {
    const provinceData = locationMap.get(data.province);
    return provinceData && provinceData.wards.includes(data.ward);
  }
  // If only province is present (and not 'ALL'), it's valid.
  return true;
}, {
  message: "Dữ liệu địa điểm không hợp lệ. Nếu chọn 'Tất cả' tỉnh thành, không được chọn phường xã. Nếu chọn phường xã, nó phải thuộc tỉnh thành đã chọn.",
  path: ['ward'],
});

const createJobAlertSchema = z.object({
    keyword: z.string().max(100).optional(),
    location: locationAlertSchema,
    frequency: z.enum(['daily', 'weekly']).default('weekly'),
    salaryRange: z.enum(['UNDER_10M', '10M_20M', '20M_30M', 'OVER_30M', 'ALL']),
    type: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY', 'VOLUNTEER', 'FREELANCE', 'ALL']),
    workType: z.enum(['ON_SITE', 'REMOTE', 'HYBRID', 'ALL']),
    experience: z.enum(['ENTRY_LEVEL', 'MID_LEVEL', 'SENIOR_LEVEL', 'EXECUTIVE', 'NO_EXPERIENCE', 'INTERN', 'FRESHER', 'ALL']),
    category: z.enum([
        'IT', 'SOFTWARE_DEVELOPMENT', 'DATA_SCIENCE', 'MACHINE_LEARNING', 'WEB_DEVELOPMENT',
        'SALES', 'MARKETING', 'ACCOUNTING', 'GRAPHIC_DESIGN', 'CONTENT_WRITING',
        'MEDICAL', 'TEACHING', 'ENGINEERING', 'PRODUCTION', 'LOGISTICS',
        'HOSPITALITY', 'REAL_ESTATE', 'LAW', 'FINANCE', 'HUMAN_RESOURCES',
        'CUSTOMER_SERVICE', 'ADMINISTRATION', 'MANAGEMENT', 'OTHER', 'ALL'
    ]),
    notificationMethod: z.enum(['EMAIL', 'APPLICATION', 'BOTH']).default('APPLICATION'),
});

const updateJobAlertSchema = createJobAlertSchema.partial().extend({
    active: z.boolean().optional(),
});

export { createJobAlertSchema, updateJobAlertSchema };
