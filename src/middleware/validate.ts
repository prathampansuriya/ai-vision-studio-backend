import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { AppError } from '../utils/appError.js';

export interface RequestValidationSchemas {
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
}

/**
 * Validates request body, query params, and route parameters against Zod schemas
 */
export function validateRequest(schemas: RequestValidationSchemas) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.query) {
        req.query = await schemas.query.parseAsync(req.query);
      }
      if (schemas.params) {
        req.params = await schemas.params.parseAsync(req.params);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        }));
        next(AppError.unprocessable('Validation failed', issues));
        return;
      }
      next(error);
    }
  };
}

export function validateBody(schema: z.ZodTypeAny) {
  return validateRequest({ body: schema });
}

export function validateQuery(schema: z.ZodTypeAny) {
  return validateRequest({ query: schema });
}

export function validateParams(schema: z.ZodTypeAny) {
  return validateRequest({ params: schema });
}

/**
 * Validates WebSocket handshake query parameters and headers
 */
export function validateWebSocketHandshake<T>(
  data: unknown,
  schema: z.ZodTypeAny
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errorMessages = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    return { success: false, error: `Invalid handshake parameters: ${errorMessages}` };
  }
  return { success: true, data: result.data as T };
}
