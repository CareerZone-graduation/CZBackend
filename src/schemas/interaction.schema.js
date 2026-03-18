import z from 'zod';

/**
 * Schema validate cho Interaction tracking API
 */

export const trackInteractionSchema = z.object({
  jobId: z
    .string({ required_error: 'jobId là bắt buộc' })
    .regex(/^[0-9a-fA-F]{24}$/, 'jobId không hợp lệ'),
  type: z.enum(['VIEW', 'SAVE', 'APPLY'], {
    required_error: 'type là bắt buộc',
    invalid_type_error: 'type phải là VIEW, SAVE hoặc APPLY',
  }),
  context: z
    .object({
      sourcePage: z.string().optional(),
      deviceType: z.string().optional(),
      durationSeconds: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export const batchTrackInteractionSchema = z.object({
  interactions: z
    .array(trackInteractionSchema)
    .min(1, 'Cần ít nhất 1 interaction')
    .max(50, 'Tối đa 50 interactions mỗi lần'),
});
