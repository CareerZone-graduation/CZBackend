import { z } from 'zod';

/**
 * Interview related validation schemas
 */

/**
 * Interview status enum values
 */
const interviewStatusEnum = ['SCHEDULED', 'STARTED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'];

/**
 * Create interview request validation schema
 * @typedef {Object} InterviewRequest
 * @property {string} candidateId - ID of the candidate
 * @property {string} applicationId - ID of the application (optional)
 * @property {string} roomName - Name of the interview room
 * @property {string} scheduledTime - Scheduled interview time (ISO string)
 * @property {string} notes - Interview notes (optional)
 */
export const createInterviewSchema = z.object({
  userId: z.string() // Changed candidateId to userId
    .min(1, 'User ID is required'),
  applicationId: z.string().optional(),
  roomName: z.string()
    .min(1, 'Room name is required')
    .max(200, 'Room name cannot exceed 200 characters')
    .trim(),
  scheduledTime: z.string()
    .datetime('Scheduled time must be a valid datetime')
    .transform((str) => new Date(str))
    .refine((date) => date > new Date(), 'Scheduled time must be in the future'),
  notes: z.string()
    .max(500, 'Notes cannot exceed 500 characters')
    .trim()
    .optional()
});

/**
 * Reschedule interview request validation schema
 * @typedef {Object} RescheduleRequest
 * @property {string} scheduledTime - New scheduled time (ISO string)
 * @property {string} message - Reschedule message (optional)
 */
export const rescheduleInterviewSchema = z.object({
  scheduledTime: z.string()
    .datetime('Scheduled time must be a valid datetime')
    .transform((str) => new Date(str))
    .refine((date) => date > new Date(), 'Scheduled time must be in the future'),
  message: z.string()
    .max(500, 'Message cannot exceed 500 characters')
    .trim()
    .optional()
});

/**
 * Update interview status request validation schema
 * @typedef {Object} UpdateInterviewStatusRequest
 * @property {string} status - New interview status
 * @property {string} notes - Interview notes (optional)
 * @property {string} recordingUrl - Recording URL (optional)
 */
export const updateInterviewStatusSchema = z.object({
  status: z.enum(interviewStatusEnum, {
    errorMap: () => ({ message: 'Invalid interview status' })
  }),
  notes: z.string()
    .max(500, 'Notes cannot exceed 500 characters')
    .trim()
    .optional(),
  recordingUrl: z.string()
    .url('Recording URL must be valid')
    .optional()
});

/**
 * Schema for scheduling an interview from an application.
 */
export const scheduleInterviewBody = z.object({
  scheduledTime: z.string()
    .datetime({ message: 'Scheduled time must be a valid ISO 8601 datetime string.' })
    .transform((str) => new Date(str))
    .refine((date) => date > new Date(), { message: 'Scheduled time must be in the future.' }),
});

/**
 * Interview signaling request validation schema
 * @typedef {Object} SignalRequest
 * @property {string} type - Signal type (offer, answer, ice-candidate)
 * @property {Object} data - Signal data
 * @property {string} targetUserId - Target user ID
 */
export const signalRequestSchema = z.object({
  type: z.enum(['offer', 'answer', 'ice-candidate'], {
    errorMap: () => ({ message: 'Invalid signal type' })
  }),
  data: z.any(), // WebRTC data can be complex objects
  targetUserId: z.string()
    .min(1, 'Target user ID is required')
});
