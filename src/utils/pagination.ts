import { ApiResponseMeta, PaginatedResult } from '../../shared/types/index.js';
import { DEFAULT_PAGINATION } from '../../shared/constants/index.js';

export function calculateSkipTake(page: number = DEFAULT_PAGINATION.PAGE, limit: number = DEFAULT_PAGINATION.LIMIT) {
  const sanitizedPage = Math.max(1, page);
  const sanitizedLimit = Math.min(DEFAULT_PAGINATION.MAX_LIMIT, Math.max(1, limit));

  return {
    skip: (sanitizedPage - 1) * sanitizedLimit,
    take: sanitizedLimit,
    page: sanitizedPage,
    limit: sanitizedLimit,
  };
}

export function createPaginationMeta(
  total: number,
  page: number,
  limit: number
): ApiResponseMeta {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    timestamp: new Date().toISOString(),
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    items,
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}
