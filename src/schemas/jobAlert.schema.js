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
    keyword: z.string().max(100).optional(),
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


// Schema for notification history creation
const createNotificationHistorySchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID format'),
  subscriptionId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid subscription ID format'),
  notificationType: z.enum(['DAILY', 'WEEKLY'], {
    errorMap: () => ({ message: 'Notification type must be  DAILY, or WEEKLY' })
  }),
  jobIds: z.array(
    z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid job ID format')
  ).min(1, 'At least one job ID is required'),
  deliveryMethod: z.enum(['EMAIL', 'APPLICATION', 'BOTH'], {
    errorMap: () => ({ message: 'Delivery method must be EMAIL, APPLICATION, or BOTH' })
  }),
  status: z.enum(['SENT', 'DELIVERED', 'FAILED', 'BOUNCED'], {
    errorMap: () => ({ message: 'Status must be SENT, DELIVERED, FAILED, or BOUNCED' })
  }).default('SENT')
});

// Schema for updating notification history
const updateNotificationHistorySchema = z.object({
  status: z.enum(['SENT', 'DELIVERED', 'FAILED', 'BOUNCED'], {
    errorMap: () => ({ message: 'Status must be SENT, DELIVERED, FAILED, or BOUNCED' })
  }).optional(),
  deliveredAt: z.date().optional(),
});


// Schema for querying notification history
const getNotificationHistorySchema = z.object({
  page: z.string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0, 'Page must be greater than 0')
    .default('1'),
  limit: z.string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0 && val <= 50, 'Limit must be between 1 and 50')
    .default('10'),
  notificationType: z.enum(['DAILY', 'WEEKLY']).optional(),
  status: z.enum(['SENT', 'DELIVERED', 'FAILED', 'BOUNCED']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});



export { 
  createJobAlertSchema, 
  updateJobAlertSchema,
  createNotificationHistorySchema,
  updateNotificationHistorySchema,
  getNotificationHistorySchema,
};
