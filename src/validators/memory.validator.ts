import { z } from 'zod';
import { MemoryCategory, MemoryImportance } from '@prisma/client';

export const createMemorySchema = z.object({
  category: z.nativeEnum(MemoryCategory),
  title: z.string().trim().min(1, 'Title is required').max(150, 'Title must be under 150 characters'),
  content: z.string().trim().min(1, 'Content is required').max(4000, 'Content must be under 4000 characters'),
  importance: z.nativeEnum(MemoryImportance).default(MemoryImportance.MEDIUM),
  isPinned: z.boolean().default(false),
  metadata: z.record(z.any()).optional(),
});

export type CreateMemoryInput = z.infer<typeof createMemorySchema>;

export const updateMemorySchema = z.object({
  title: z.string().trim().min(1, 'Title cannot be empty').max(150, 'Title must be under 150 characters').optional(),
  content: z.string().trim().min(1, 'Content cannot be empty').max(4000, 'Content must be under 4000 characters').optional(),
  importance: z.nativeEnum(MemoryImportance).optional(),
  isPinned: z.boolean().optional(),
  category: z.nativeEnum(MemoryCategory).optional(),
  metadata: z.record(z.any()).optional(),
});

export type UpdateMemoryInput = z.infer<typeof updateMemorySchema>;

export const listMemoriesQuerySchema = z.object({
  category: z.nativeEnum(MemoryCategory).optional(),
  isPinned: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
  importance: z.nativeEnum(MemoryImportance).optional(),
  search: z.string().trim().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'importance']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListMemoriesQuery = z.infer<typeof listMemoriesQuerySchema>;

export const generateMemoriesSchema = z.object({
  forceRegenerate: z.boolean().default(false),
  categories: z.array(z.nativeEnum(MemoryCategory)).optional(),
});

export type GenerateMemoriesInput = z.infer<typeof generateMemoriesSchema>;

export const clearMemoriesSchema = z.object({
  onlyUnpinned: z.boolean().default(true),
});

export type ClearMemoriesInput = z.infer<typeof clearMemoriesSchema>;
