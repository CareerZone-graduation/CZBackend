import { z } from 'zod';

export const updateDocumentSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  category: z.enum(['POLICY', 'BENEFITS', 'CULTURE', 'JD_TEMPLATE', 'HANDBOOK', 'FAQ', 'OTHER']).optional(),
  isActive: z.boolean().optional()
});

export const queryDocumentsSchema = z.object({
  page: z.string().optional().default('1').transform(val => parseInt(val, 10)),
  size: z.string().optional().default('10').transform(val => parseInt(val, 10)),
  category: z.string().optional(),
  status: z.string().optional()
});