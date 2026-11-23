import { HTTP_STATUS, ERROR_CODES } from '@shared/constants/index.js';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    code: string = ERROR_CODES.INTERNAL_SERVER_ERROR,
    details?: unknown,
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;
    this.details = details;

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  public static badRequest(message: string, details?: unknown): AppError {
    return new AppError(message, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.BAD_REQUEST, details);
  }

  public static unauthorized(message: string = 'Authentication required', details?: unknown): AppError {
    return new AppError(message, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, details);
  }

  public static paymentRequired(
    message: string = 'Payment required. Insufficient credits or active subscription required.',
    details?: unknown
  ): AppError {
    return new AppError(message, HTTP_STATUS.PAYMENT_REQUIRED, ERROR_CODES.PAYMENT_REQUIRED, details);
  }

  public static forbidden(message: string = 'Access denied', details?: unknown): AppError {
    return new AppError(message, HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, details);
  }

  public static notFound(message: string = 'Resource not found', details?: unknown): AppError {
    return new AppError(message, HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND, details);
  }

  public static conflict(message: string, details?: unknown): AppError {
    return new AppError(message, HTTP_STATUS.CONFLICT, ERROR_CODES.CONFLICT, details);
  }

  public static unprocessable(message: string, details?: unknown): AppError {
    return new AppError(message, HTTP_STATUS.UNPROCESSABLE_ENTITY, ERROR_CODES.VALIDATION_ERROR, details);
  }

  public static tooManyRequests(message: string = 'Rate limit exceeded. Please try again later.'): AppError {
    return new AppError(message, HTTP_STATUS.TOO_MANY_REQUESTS, ERROR_CODES.TOO_MANY_REQUESTS);
  }

  public static internal(message: string = 'An unexpected internal error occurred', details?: unknown): AppError {
    return new AppError(message, HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_CODES.INTERNAL_SERVER_ERROR, details);
  }

  public static serviceUnavailable(message: string = 'Service temporarily unavailable'): AppError {
    return new AppError(message, HTTP_STATUS.SERVICE_UNAVAILABLE, ERROR_CODES.SERVICE_UNAVAILABLE);
  }
}
