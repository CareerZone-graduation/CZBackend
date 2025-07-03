import { z } from 'zod';
import { LOCATIONS } from '../constants/index.js';

const createJobAlertSchema = z.object({
    keyword: z.string().max(100),
    location: z.object({
        city: z.enum(LOCATIONS.CITIES),
        district: z.enum(LOCATIONS.DISTRICTS),
    }),
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
