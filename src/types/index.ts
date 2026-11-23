import { Request } from 'express';
import { AuthUserContext } from '../../shared/types/index.js';

export interface EntitlementContext {
  planTier: string;
  planName: string;
  availableBalance: number;
  totalBalance: number;
  reservedCredits: number;
  maxConcurrentSessions: number;
  maxSessionDurationSeconds: number;
}

// Extend Express Request namespace with request ID and authenticated user context
declare global {
  namespace Express {
    interface Request {
      id?: string;
      user?: AuthUserContext;
      correlationId?: string;
      rawBody?: Buffer;
      entitlement?: EntitlementContext;
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user: AuthUserContext;
  id: string;
}

export interface ValidatedRequest<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown
> extends Request {
  body: TBody;
  query: TQuery & Request['query'];
  params: TParams & Request['params'];
}
