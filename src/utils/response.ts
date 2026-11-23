import { Response } from 'express';
import { ApiResponse, ApiResponseMeta, PaginatedResult } from '../../shared/types/index.js';
import { HTTP_STATUS, ERROR_CODES } from '../../shared/constants/index.js';

export function sendSuccess<T>(
  res: Response,
  data: T,
  message?: string,
  statusCode: number = HTTP_STATUS.OK,
  meta?: Partial<ApiResponseMeta>
): Response {
  const reqId = res.req?.id;

  const payload: ApiResponse<T> = {
    success: true,
    message,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...(reqId ? { requestId: reqId } : {}),
      ...meta,
    },
  };
  return res.status(statusCode).json(payload);
}

export function sendPaginated<T>(
  res: Response,
  items: T[],
  total: number,
  page: number,
  limit: number,
  message?: string
): Response {
  const totalPages = Math.ceil(total / limit) || 1;
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  const paginatedResult: PaginatedResult<T> = {
    items,
    total,
    page,
    limit,
    totalPages,
    hasNextPage,
    hasPrevPage,
  };

  return sendSuccess(res, paginatedResult, message, HTTP_STATUS.OK, {
    page,
    limit,
    total,
    totalPages,
    hasNextPage,
    hasPrevPage,
  });
}

export function sendError(
  res: Response,
  message: string,
  statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
  code: string = ERROR_CODES.INTERNAL_SERVER_ERROR,
  details?: unknown
): Response {
  const reqId = res.req?.id;

  const payload: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
    meta: {
      timestamp: new Date().toISOString(),
      ...(reqId ? { requestId: reqId } : {}),
    },
  };
  return res.status(statusCode).json(payload);
}
