import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { sendError } from '../utils/response.js';
import { HTTP_STATUS, ERROR_CODES, RATE_LIMITS } from '../../shared/constants/index.js';
import { env } from '../config/index.js';

// General API rate limiter
export const apiRateLimiter = rateLimit({
  windowMs: RATE_LIMITS.DEFAULT_WINDOW_MS,
  max: env.NODE_ENV === 'test' ? 1000 : RATE_LIMITS.DEFAULT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    sendError(
      res,
      'Too many requests from this IP, please try again after 15 minutes.',
      HTTP_STATUS.TOO_MANY_REQUESTS,
      ERROR_CODES.RATE_LIMIT_EXCEEDED
    );
  },
});

// Stricter rate limiter for sensitive endpoints (e.g., auth, password resets)
export const strictRateLimiter = rateLimit({
  windowMs: RATE_LIMITS.STRICT_WINDOW_MS,
  max: env.NODE_ENV === 'test' ? 500 : RATE_LIMITS.STRICT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    sendError(
      res,
      'Too many requests to a sensitive endpoint. Please try again after 15 minutes.',
      HTTP_STATUS.TOO_MANY_REQUESTS,
      ERROR_CODES.RATE_LIMIT_EXCEEDED
    );
  },
});
