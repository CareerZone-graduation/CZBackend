import { z } from 'zod';

/**
 * Recruiter related validation schemas
 */

/**
 * Unlock candidate profile request validation schema
 * @typedef {Object} UnlockProfileRequest
 * @property {string} candidateId - ID of the candidate to unlock
 */
export const unlockProfileSchema = z.object({
  candidateId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, 'ID ứng viên không hợp lệ')
});
