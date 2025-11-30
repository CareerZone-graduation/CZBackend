import { z } from 'zod';
import { provinceNames, locationMap } from '../constants/locations.enum.js';

const locationAlertSchema = z.object({
  province: z.enum([...provinceNames, 'ALL']),
  district: z.string().min(1, 'Quận/Huyện là bắt buộc'),
}).refine(data => {
  if (data.province === 'ALL') {
    return data.district === 'ALL';
  }
  if (data.district === 'ALL') {
    return true;
  }
  if (data.district) {
    const provinceData = locationMap.get(data.province);
    if (!provinceData || !provinceData.districts.some(d => d.name === data.district)) {
      return false;
    }
  }
  return true;
}, {
  message: "Dữ liệu địa điểm không hợp lệ. Vui lòng kiểm tra lại Tỉnh/Thành và Quận/Huyện. Nếu chọn tất cả tỉnh thì quận/huyện cũng phải là 'ALL'.",
  path: ['location'],
});

// Enhanced job alert subscription schema with new fields
const createJobAlertSchema = z.object({
    keyword: z.string()
        .min(1, 'Từ khóa không được để trống')
        .max(50, 'Từ khóa không được vượt quá 50 ký tự')
        .refine(
            (val) => val.trim().split(/\s+/).length === 1,
            'Từ khóa chỉ được phép là 1 từ duy nhất (không có khoảng trắng)'
        )
        .transform((val) => val.trim().toLowerCase()),
    location: locationAlertSchema,
    frequency: z.enum(['daily', 'weekly'], {
      errorMap: () => ({ message: 'Frequency must be either daily or weekly' })
    }).default('daily'),
    salaryRange: z.enum(['UNDER_10M', '10M_20M', '20M_30M', 'OVER_30M', 'ALL'], {
      errorMap: () => ({ message: 'Invalid salary range' })
    }),
    type: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY', 'VOLUNTEER', 'FREELANCE', 'ALL'], {
      errorMap: () => ({ message: 'Invalid job type' })
    }),
    workType: z.enum(['ON_SITE', 'REMOTE', 'HYBRID', 'ALL'], {
      errorMap: () => ({ message: 'Invalid work type' })
    }),
    experience: z.enum(['ENTRY_LEVEL', 'MID_LEVEL', 'SENIOR_LEVEL', 'EXECUTIVE', 'NO_EXPERIENCE', 'INTERN', 'FRESHER', 'ALL'], {
      errorMap: () => ({ message: 'Invalid experience level' })
    }),
    category: z.enum([
        'IT', 'SOFTWARE_DEVELOPMENT', 'DATA_SCIENCE', 'MACHINE_LEARNING', 'WEB_DEVELOPMENT',
        'SALES', 'MARKETING', 'ACCOUNTING', 'GRAPHIC_DESIGN', 'CONTENT_WRITING',
        'MEDICAL', 'TEACHING', 'ENGINEERING', 'PRODUCTION', 'LOGISTICS',
        'HOSPITALITY', 'REAL_ESTATE', 'LAW', 'FINANCE', 'HUMAN_RESOURCES',
        'CUSTOMER_SERVICE', 'ADMINISTRATION', 'MANAGEMENT', 'OTHER', 'ALL'
    ], {
      errorMap: () => ({ message: 'Invalid job category' })
    }),
    notificationMethod: z.enum(['EMAIL', 'APPLICATION', 'BOTH'], {
      errorMap: () => ({ message: 'Notification method must be EMAIL, APPLICATION, or BOTH' })
    }).default('APPLICATION'),
});

const updateJobAlertSchema = createJobAlertSchema.partial().extend({
    active: z.boolean().optional()
});


export { 
  createJobAlertSchema, 
  updateJobAlertSchema,
};
