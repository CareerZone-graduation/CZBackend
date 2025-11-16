import { z } from 'zod';

/**
 * Interview related validation schemas for WebRTC-based online interviews
 */

/**
 * MongoDB ObjectId regex pattern
 */
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

/**
 * Interview status enum values
 * Must match the enum values in InterviewRoom model
 */
const interviewStatusEnum = ['SCHEDULED', 'STARTED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'];

// ==========================================================
// === SCHEDULE INTERVIEW SCHEMAS (Requirements: 1.1)
// ==========================================================

/**
 * Schedule interview request body validation schema
 * Used when recruiter schedules a new interview with a candidate
 */
export const scheduleInterviewBody = z.object({
  jobId: z.string()
    .regex(objectIdRegex, 'Job ID must be a valid MongoDB ObjectId'),
  applicationId: z.string()
    .regex(objectIdRegex, 'Application ID must be a valid MongoDB ObjectId'),
  candidateId: z.string()
    .regex(objectIdRegex, 'Candidate ID must be a valid MongoDB ObjectId'),
  scheduledAt: z.string()
    .datetime('Scheduled time must be a valid ISO 8601 datetime string')
    .refine((dateStr) => {
      const date = new Date(dateStr);
      return date > new Date();
    }, 'Scheduled time must be in the future'),
  duration: z.number()
    .min(15, 'Duration must be at least 15 minutes')
    .max(180, 'Duration cannot exceed 180 minutes')
    .default(60)
});

// ==========================================================
// === UPDATE INTERVIEW STATUS SCHEMAS (Requirements: 7.3)
// ==========================================================

/**
 * Interview ID param validation schema
 */
export const interviewIdParam = z.object({
  id: z.string()
    .regex(objectIdRegex, 'Interview ID must be a valid MongoDB ObjectId')
});

/**
 * Update interview status request body validation schema
 * Used to change interview status (SCHEDULED, STARTED, COMPLETED, CANCELLED, RESCHEDULED)
 */
export const updateInterviewStatusBody = z.object({
  status: z.enum(interviewStatusEnum, {
    errorMap: () => ({ message: 'Status must be one of: SCHEDULED, STARTED, COMPLETED, CANCELLED, RESCHEDULED' })
  })
});

// ==========================================================
// === END INTERVIEW SCHEMAS (Requirements: 7.3)
// ==========================================================

/**
 * Feedback object schema for interview completion
 */
const feedbackSchema = z.object({
  rating: z.number()
    .min(1, 'Rating must be at least 1')
    .max(5, 'Rating cannot exceed 5')
    .optional(),
  notes: z.string()
    .max(2000, 'Notes cannot exceed 2000 characters')
    .optional(),
  technicalIssues: z.boolean()
    .optional(),
  issueDescription: z.string()
    .max(1000, 'Issue description cannot exceed 1000 characters')
    .optional()
}).refine(
  (data) => {
    // If technicalIssues is true, issueDescription should be provided
    if (data.technicalIssues && !data.issueDescription) {
      return false;
    }
    return true;
  },
  {
    message: 'Issue description is required when technical issues are reported',
    path: ['issueDescription']
  }
);

/**
 * End interview request body validation schema
 * Used when recruiter ends the interview and provides feedback
 */
export const endInterviewBody = z.object({
  feedback: feedbackSchema.optional()
});

// ==========================================================
// === RESCHEDULE INTERVIEW SCHEMAS (Requirements: 1.5)
// ==========================================================

/**
 * Reschedule interview request body validation schema
 * Used when recruiter reschedules an existing interview
 * Accepts both scheduledAt (new) and scheduledTime (legacy) for backward compatibility
 */
export const rescheduleInterviewBody = z.object({
  scheduledAt: z.string()
    .datetime('Scheduled time must be a valid ISO 8601 datetime string')
    .refine((dateStr) => {
      const date = new Date(dateStr);
      return date > new Date();
    }, 'Scheduled time must be in the future')
    .optional(),
  scheduledTime: z.string()
    .datetime('Scheduled time must be a valid ISO 8601 datetime string')
    .refine((dateStr) => {
      const date = new Date(dateStr);
      return date > new Date();
    }, 'Scheduled time must be in the future')
    .optional(),
  reason: z.string()
    .max(500, 'Reason cannot exceed 500 characters')
    .optional()
}).refine(
  (data) => data.scheduledAt || data.scheduledTime,
  {
    message: 'Either scheduledAt or scheduledTime is required',
    path: ['scheduledAt']
  }
).transform((data) => {
  // Normalize to scheduledAt for consistency
  if (data.scheduledTime && !data.scheduledAt) {
    data.scheduledAt = data.scheduledTime;
  }
  delete data.scheduledTime;
  return data;
});

// ==========================================================
// === JOIN INTERVIEW SCHEMAS (Requirements: 2.1)
// ==========================================================

/**
 * Join interview request validation schema
 * Used when a participant attempts to join an interview room
 * Note: Time window validation is handled in the service layer
 */
export const joinInterviewBody = z.object({
  deviceInfo: z.object({
    browser: z.string().optional(),
    os: z.string().optional(),
    device: z.string().optional(),
    userAgent: z.string().optional()
  }).optional()
});

// ==========================================================
// === RECORDING OPERATION SCHEMAS (Requirements: 5.1, 5.4)
// ==========================================================

/**
 * Save recording metadata request body validation schema
 * Used when recruiter uploads interview recording
 */
export const saveRecordingBody = z.object({
  url: z.string()
    .url('Recording URL must be a valid URL'),
  duration: z.number()
    .min(0, 'Duration must be a positive number'),
  size: z.number()
    .min(0, 'Size must be a positive number'),
  cloudinaryPublicId: z.string()
    .min(1, 'Cloudinary public ID is required')
    .optional()
});

/**
 * Start recording request body validation schema
 */
export const startRecordingBody = z.object({
  recordingEnabled: z.boolean()
    .refine((val) => val === true, 'Recording must be enabled')
});

// ==========================================================
// === CANCEL INTERVIEW SCHEMAS
// ==========================================================

/**
 * Cancel interview request body validation schema
 * Used when recruiter or candidate cancels a scheduled interview
 */
export const cancelInterviewBody = z.object({
  reason: z.string()
    .max(500, 'Reason cannot exceed 500 characters')
    .optional()
});

// ==========================================================
// === QUERY SCHEMAS
// ==========================================================

/**
 * Get interviews list query parameters validation schema
 * Used for filtering and pagination of interview lists
 */
export const getInterviewsQuery = z.object({
  page: z.string()
    .regex(/^\d+$/, 'Page must be a number')
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 1),
  limit: z.string()
    .regex(/^\d+$/, 'Limit must be a number')
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 10)
    .refine((val) => val <= 100, 'Limit cannot exceed 100'),
  status: z.enum(interviewStatusEnum)
    .optional(),
  jobId: z.string()
    .regex(objectIdRegex, 'Job ID must be a valid MongoDB ObjectId')
    .optional(),
  candidateId: z.string()
    .regex(objectIdRegex, 'Candidate ID must be a valid MongoDB ObjectId')
    .optional(),
  fromDate: z.string()
    .datetime('From date must be a valid ISO 8601 datetime string')
    .optional(),
  toDate: z.string()
    .datetime('To date must be a valid ISO 8601 datetime string')
    .optional(),
  sort: z.enum(['scheduledAt', '-scheduledAt', 'createdAt', '-createdAt'])
    .optional()
    .default('-scheduledAt')
}).optional();

// ==========================================================
// === CHAT MESSAGE SCHEMAS (Requirements: 4.3)
// ==========================================================

/**
 * Save chat message request body validation schema
 * Used when participants send messages during interview
 */
export const saveChatMessageBody = z.object({
  message: z.string()
    .min(1, 'Message cannot be empty')
    .max(1000, 'Message cannot exceed 1000 characters')
    .trim()
});

// ==========================================================
// === LEGACY SCHEMAS (Backward Compatibility)
// ==========================================================

/**
 * @deprecated Use getInterviewsQuery instead
 * Kept for backward compatibility with old frontend code
 */
export const interviewQuerySchema = z.object({
  page: z.string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0, 'Page must be greater than 0')
    .optional()
    .default('1'),
  limit: z.string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0 && val <= 100, 'Limit must be between 1 and 100')
    .optional()
    .default('10'),
  status: z.enum(['SCHEDULED', 'STARTED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'])
    .optional()
});
