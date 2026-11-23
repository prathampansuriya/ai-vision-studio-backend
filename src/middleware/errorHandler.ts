import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/appError.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/index.js';
import { sendError } from '../utils/response.js';
import { HTTP_STATUS, ERROR_CODES } from '../../shared/constants/index.js';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const isProd = env.NODE_ENV === 'production';
  const reqId = req.id ? `[${req.id}]` : '';

  // 1. Handled Operational Errors
  if (err instanceof AppError) {
    logger.warn(`${reqId} Operational error: ${err.message}`, {
      code: err.code,
      statusCode: err.statusCode,
      details: err.details,
    });
    sendError(res, err.message, err.statusCode, err.code, err.details);
    return;
  }

  // 2. Zod Validation Errors
  if (err instanceof ZodError) {
    const issues = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));
    logger.warn(`${reqId} Validation error`, { issues });
    sendError(res, 'Validation failed', HTTP_STATUS.UNPROCESSABLE_ENTITY, ERROR_CODES.VALIDATION_ERROR, issues);
    return;
  }

  // 3. Prisma Database Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    logger.error(`${reqId} Database error [${err.code}]: ${err.message}`);

    // P2002: Unique constraint violation
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'field';
      sendError(res, `A record with this ${target} already exists`, HTTP_STATUS.CONFLICT, ERROR_CODES.CONFLICT);
      return;
    }

    // P2025: Record not found
    if (err.code === 'P2025') {
      sendError(res, 'Requested database record not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
      return;
    }

    // General database constraint/query failure
    sendError(
      res,
      'A database error occurred processing your request',
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
    return;
  }

  // 4. JSON Syntax Error (Malformed Request Body)
  if (err instanceof SyntaxError && 'status' in err && err.status === 400 && 'body' in err) {
    logger.warn(`${reqId} Malformed JSON body`);
    sendError(res, 'Malformed JSON in request body', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.BAD_REQUEST);
    return;
  }

  // 5. Unhandled Internal Server Errors
  logger.error(`${reqId} Unhandled internal server error:`, err);

  const errorMessage = isProd
    ? 'An unexpected internal server error occurred.'
    : err instanceof Error
    ? err.message
    : 'Unknown internal error';

  const details = isProd
    ? undefined
    : err instanceof Error
    ? { stack: err.stack }
    : undefined;

  sendError(res, errorMessage, HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_CODES.INTERNAL_SERVER_ERROR, details);
}
