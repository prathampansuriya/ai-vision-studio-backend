import { Request, Response, NextFunction } from 'express';
import { env } from '../config/index.js';
import { verifyAccessToken } from '../utils/token.js';
import { AppError } from '../utils/appError.js';
import { PrismaService } from '../services/prisma.service.js';
import { AuthUserContext, UserRole, AccountStatus } from '@shared/types/index.js';
import { ERROR_CODES } from '@shared/constants/index.js';

interface JwtUserPayload {
  sub: string;
  email: string;
  role: UserRole;
}

/**
 * Core authentication middleware infrastructure:
 * Checks for Bearer token in Authorization header or signed cookies,
 * verifies signature, and attaches user context to req.user.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let token: string | undefined;

    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.signedCookies && req.signedCookies.access_token) {
      token = req.signedCookies.access_token;
    }

    if (!token) {
      req.user = undefined;
      return next();
    }

    // Verify JWT
    const payload = verifyAccessToken<JwtUserPayload>(token);

    // Fetch user context and latest ledger entry from database
    const user = await PrismaService.client.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        accountStatus: true,
        creditLedgerEntries: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { balanceAfter: true },
        },
      },
    });

    if (!user || user.accountStatus === 'SUSPENDED') {
      req.user = undefined;
      throw AppError.unauthorized('User account is invalid or suspended');
    }

    const latestBalance = user.creditLedgerEntries[0]?.balanceAfter ?? 0;

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      accountStatus: user.accountStatus as AccountStatus,
      creditBalance: latestBalance,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Strict guard requiring authenticated user context
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    return next(AppError.unauthorized('Authentication required to access this resource'));
  }
  next();
}

/**
 * Role-based access control guard
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(AppError.unauthorized('Authentication required to access this resource'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(AppError.forbidden('You do not have permission to perform this action'));
    }

    next();
  };
}

/**
 * Inter-service authentication guard for internal RPC requests between
 * Node backend and Python AI service.
 */
export function requireInternalKey(req: Request, _res: Response, next: NextFunction): void {
  const internalKey = req.headers['x-internal-key'];

  if (!internalKey || internalKey !== env.INTERNAL_SERVICE_KEY) {
    return next(new AppError('Invalid or missing internal service key', 403, ERROR_CODES.FORBIDDEN));
  }

  next();
}
