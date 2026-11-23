import { z } from 'zod';

export const InsightCategoryEnum = z.enum([
  'AI_ANSWER',
  'OBSERVATION',
  'SESSION_NOTE',
  'SNAPSHOT_ANALYSIS',
  'REPORT_FINDING',
  'TRANSCRIPT_SEGMENT',
  'GENERAL',
]);

export type InsightCategory = z.infer<typeof InsightCategoryEnum>;

export const createInsightSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(150, 'Title must be under 150 characters'),
  content: z.string().trim().min(1, 'Content is required').max(10000, 'Content must be under 10,000 characters'),
  category: InsightCategoryEnum.default('GENERAL'),
  source: z.string().trim().max(50).default('manual'),
  sessionId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string().trim().max(30)).max(10).optional().default([]),
  metadata: z.record(z.any()).optional().default({}),
});

export type CreateInsightInput = z.infer<typeof createInsightSchema>;

export const updateInsightSchema = z.object({
  title: z.string().trim().min(1, 'Title cannot be empty').max(150, 'Title must be under 150 characters').optional(),
  content: z.string().trim().min(1, 'Content cannot be empty').max(10000, 'Content must be under 10,000 characters').optional(),
  category: InsightCategoryEnum.optional(),
  source: z.string().trim().max(50).optional(),
  tags: z.array(z.string().trim().max(30)).max(10).optional(),
  metadata: z.record(z.any()).optional(),
});

export type UpdateInsightInput = z.infer<typeof updateInsightSchema>;

export const listInsightsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: z.string().trim().optional(),
  source: z.string().trim().optional(),
  sessionId: z.string().uuid().optional(),
  tag: z.string().trim().optional(),
  search: z.string().trim().optional(),
  sortBy: z.enum(['createdAt', 'title']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListInsightsQuery = z.infer<typeof listInsightsQuerySchema>;
