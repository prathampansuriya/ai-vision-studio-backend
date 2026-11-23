import { Request, Response, NextFunction } from 'express';
import { CreditService } from '../services/credit.service.js';
import { sendSuccess, sendPaginated } from '../utils/response.js';
import { AppError } from '../utils/appError.js';
import { CREDIT_POLICY, MODEL_MULTIPLIERS } from '../config/credit.policy.js';
import { creditEvents } from '../events/credit.events.js';
import {
  AdjustCreditsInput,
  ConsumeCreditsInput,
  GrantCreditsInput,
  LedgerQueryInput,
  RefundCreditsInput,
  ReleaseReservationInput,
  ReserveCreditsInput,
  SettleReservationInput,
  UsageQueryInput,
} from '../validators/credit.validator.js';

export class CreditController {
  /**
   * GET /api/v1/credits/balance
   * Returns authoritative balance, active reservation holds, and available credits
   */
  public static async getBalance(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw AppError.unauthorized('Authentication required to view credit balance');
      }

      const balance = await CreditService.getBalance(req.user.id);
      sendSuccess(res, balance, 'Credit balance retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/credits/plan-allowance
   * Returns current billing period allowance, consumption, and entitlement limits
   */
  public static async getPlanAllowance(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw AppError.unauthorized('Authentication required to view plan allowance');
      }

      const allowance = await CreditService.getPlanAllowance(req.user.id);
      sendSuccess(res, allowance, 'Plan credit allowance retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/credits/policy
   * Transparently returns the centralized credit pricing schedule and model multipliers
   */
  public static async getPolicy(
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      sendSuccess(
        res,
        {
          features: Object.values(CREDIT_POLICY),
          modelMultipliers: MODEL_MULTIPLIERS,
        },
        'Credit policy retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/credits/ledger
   * Paginated auditable credit transactions
   */
  public static async getLedger(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw AppError.unauthorized('Authentication required to view credit ledger');
      }

      const query = req.query as unknown as LedgerQueryInput;
      const { items, total, page, limit } = await CreditService.getLedgerHistory(
        req.user.id,
        query
      );

      sendPaginated(res, items, total, page, limit, 'Credit ledger retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/credits/usage
   * Paginated feature-level activity consumption records
   */
  public static async getUsage(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw AppError.unauthorized('Authentication required to view credit usage');
      }

      const query = req.query as unknown as UsageQueryInput;
      const { items, total, page, limit } = await CreditService.getUsageHistory(
        req.user.id,
        query
      );

      sendPaginated(res, items, total, page, limit, 'Usage history retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/credits/analytics
   * Detailed consumption breakdown for current billing period
   */
  public static async getAnalytics(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw AppError.unauthorized('Authentication required to view analytics');
      }

      const billingPeriod = req.query.billingPeriod as string | undefined;
      const analytics = await CreditService.getUsageAnalytics(req.user.id, billingPeriod);
      sendSuccess(res, analytics, 'Usage analytics retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/credits/consume
   * Transactionally deducts credits for measured AI activity
   */
  public static async consume(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw AppError.unauthorized('Authentication required to consume credits');
      }

      const input = req.body as ConsumeCreditsInput;
      const result = await CreditService.consumeCredits(req.user.id, input);
      sendSuccess(res, result, 'Credits consumed successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/credits/reserve
   * Creates a temporary reservation hold in escrow before initiating an AI job or session
   */
  public static async reserve(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw AppError.unauthorized('Authentication required to reserve credits');
      }

      const input = req.body as ReserveCreditsInput;
      const result = await CreditService.reserveCredits(req.user.id, input);
      sendSuccess(res, result, 'Credits reserved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/credits/settle
   * Settles actual activity usage against a previously held reservation
   */
  public static async settle(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw AppError.unauthorized('Authentication required to settle reservation');
      }

      const input = req.body as SettleReservationInput;
      const result = await CreditService.settleReservation(req.user.id, input);
      sendSuccess(res, result, 'Reservation settled successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/credits/release
   * Cancels/releases an unconsumed reservation hold back to available balance
   */
  public static async release(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw AppError.unauthorized('Authentication required to release reservation');
      }

      const input = req.body as ReleaseReservationInput;
      const result = await CreditService.releaseReservation(
        req.user.id,
        input.reservationId,
        input.reason
      );
      sendSuccess(res, result, 'Reservation released successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/credits/grant
   * Admin or service-to-service credit grant
   */
  public static async grant(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const input = req.body as GrantCreditsInput;
      const result = await CreditService.grantCredits(input);
      sendSuccess(res, result, 'Credits granted successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/credits/refund
   * Refunds credits back to user
   */
  public static async refund(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const input = req.body as RefundCreditsInput;
      const result = await CreditService.refundCredits(input);
      sendSuccess(res, result, 'Credits refunded successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/credits/adjust
   * Administrative balance adjustment
   */
  public static async adjust(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const input = req.body as AdjustCreditsInput;
      const result = await CreditService.adjustCredits(input);
      sendSuccess(res, result, 'Credit balance adjusted successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/credits/stream
   * Real-time Server-Sent Events (SSE) stream for live balance updates during active sessions
   */
  public static async streamEvents(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw AppError.unauthorized('Authentication required for real-time credit stream');
      }

      // Configure SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      // Send initial authoritative balance immediately
      const initialBalance = await CreditService.getBalance(userId);
      res.write(`event: initial_state\ndata: ${JSON.stringify(initialBalance)}\n\n`);

      // Register client for broadcasts
      const unregister = creditEvents.registerSseClient(userId, res);

      // Keep-alive heartbeat every 25 seconds
      const heartbeatTimer = setInterval(() => {
        try {
          res.write(': heartbeat\n\n');
        } catch {
          clearInterval(heartbeatTimer);
        }
      }, 25000);

      req.on('close', () => {
        clearInterval(heartbeatTimer);
        unregister();
      });
    } catch (error) {
      next(error);
    }
  }
}
