import { z } from 'zod';

export const SearchCategoryEnum = z.enum([
  'ALL',
  'SESSION',
  'TRANSCRIPT',
  'INSIGHT',
  'REPORT',
  'SNAPSHOT',
  'MEMORY',
]);

export type SearchCategory = z.infer<typeof SearchCategoryEnum>;

export const globalSearchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Search query is required').max(200, 'Search query too long'),
  category: SearchCategoryEnum.default('ALL'),
  sessionId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type GlobalSearchQuery = z.infer<typeof globalSearchQuerySchema>;

export const searchSuggestionsQuerySchema = z.object({
  q: z.string().trim().min(1, 'Search query is required').max(100),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

export type SearchSuggestionsQuery = z.infer<typeof searchSuggestionsQuerySchema>;
