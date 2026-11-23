import { z } from 'zod';
import { DEFAULT_PAGINATION } from '@shared/constants/index.js';
import { passwordComplexitySchema } from '../utils/password.js';

export const paginationQuerySchema = z.object({
  page: z.coerce
    .number()
    .int()
    .positive('Page must be a positive integer')
    .default(DEFAULT_PAGINATION.PAGE),
  limit: z.coerce
    .number()
    .int()
    .positive('Limit must be a positive integer')
    .max(DEFAULT_PAGINATION.MAX_LIMIT, `Limit cannot exceed ${DEFAULT_PAGINATION.MAX_LIMIT}`)
    .default(DEFAULT_PAGINATION.LIMIT),
  search: z.string().trim().max(100).optional(),
  sortBy: z.string().trim().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid identifier format: must be a valid UUID'),
});

export const dateRangeQuerySchema = z.object({
  from: z.string().datetime({ message: 'Invalid start date format (ISO 8601 required)' }).optional(),
  to: z.string().datetime({ message: 'Invalid end date format (ISO 8601 required)' }).optional(),
});

export const passwordValidationSchema = passwordComplexitySchema;
