import { z } from 'zod';

export const generateReportSchema = z.object({
  regenerate: z.boolean().optional().default(false),
  focusArea: z.string().max(250).optional(),
  model: z.string().optional(),
});

export const exportReportQuerySchema = z.object({
  format: z.enum(['markdown', 'pdf', 'txt', 'json']).default('markdown'),
});

export type GenerateReportInput = z.infer<typeof generateReportSchema>;
export type ExportReportQuery = z.infer<typeof exportReportQuerySchema>;
