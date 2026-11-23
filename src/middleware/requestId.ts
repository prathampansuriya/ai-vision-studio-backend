import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export function requestId(req: Request, res: Response, next: NextFunction): void {
  // Check if caller supplied an existing valid UUID or request ID header
  const incomingId = req.headers['x-request-id'];
  const id = typeof incomingId === 'string' && incomingId.trim().length > 0
    ? incomingId.trim()
    : crypto.randomUUID();

  req.id = id;
  res.setHeader('X-Request-Id', id);

  next();
}
