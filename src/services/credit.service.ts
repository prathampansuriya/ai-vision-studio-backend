import {
  CreditFeatureType,
  CreditTransactionType,
  Prisma,
  ReservationStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from './prisma.service.js';
import { AppError } from '../utils/appError.js';
import { logger } from '../utils/logger.js';
import {
  CREDIT_POLICY,
  LOW_CREDIT_THRESHOLD,
  RESERVATION_DEFAULTS,
} from '../config/credit.policy.js';
import { creditEvents } from '../events/credit.events.js';
import {
  AdjustCreditsInput,
  ConsumeCreditsInput,
  GrantCreditsInput,
  LedgerQueryInput,
  RefundCreditsInput,
  ReserveCreditsInput,
  SettleReservationInput,
  UsageQueryInput,
} from '../validators/credit.validator.js';

export interface UserBalanceSnapshot {
  userId: string;
  totalBalance: number;
  reservedCredits: number;
  availableBalance: number;
  currency: string;
  isLowBalance: boolean;
  isExhausted: boolean;
  activeReservationsCount: number;
  lastUpdated: string;
}

export interface PlanAllowanceSnapshot {
  userId: string;
  tier: string;
  planName: string;
  monthlyCredits: number;
  consumedThisPeriod: number;
  remainingAllowance: number;
  currentBalance: number;
  billingPeriod: string;
  resetDate: string;
  supportsVision: boolean;
  supportsScreenShare: boolean;
  supportsVoice: boolean;
  supportsToolCalling: boolean;
  maxConcurrentSessions: number;
  maxSessionDurationSeconds: number;
}

const DEFAULT_TX_OPTIONS = {
  maxWait: 15000,
  timeout: 25000,
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
};

export class CreditService {
  /**
   * Helper: returns the canonical billing period identifier (e.g. "2026-11")
   */
  public static getCurrentBillingPeriod(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * Authoritative balance reader: computes total ledger balance, active reservations, and available balance
   */
  public static async getBalance(userId: string): Promise<UserBalanceSnapshot> {
    const prisma = PrismaService.client;
    const now = new Date();

    // 1. Expire outdated reservations first
    await prisma.creditReservation.updateMany({
      where: {
        userId,
        status: ReservationStatus.PENDING,
        expiresAt: { lt: now },
      },
      data: { status: ReservationStatus.EXPIRED },
    });

    // 2. Fetch latest ledger balance and active reservations sequentially to prevent pool saturation
    const latestLedger = await prisma.creditLedger.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { balanceAfter: true, createdAt: true },
    });

    const reservationAgg = await prisma.creditReservation.aggregate({
      where: {
        userId,
        status: ReservationStatus.PENDING,
        expiresAt: { gte: now },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const totalBalance = latestLedger?.balanceAfter ?? 0;
    const reservedCredits = reservationAgg._sum.amount ?? 0;
    const availableBalance = Math.max(0, totalBalance - reservedCredits);

    return {
      userId,
      totalBalance,
      reservedCredits,
      availableBalance,
      currency: 'credits',
      isLowBalance: availableBalance > 0 && availableBalance <= LOW_CREDIT_THRESHOLD,
      isExhausted: availableBalance <= 0,
      activeReservationsCount: reservationAgg._count._all,
      lastUpdated: latestLedger?.createdAt.toISOString() || new Date().toISOString(),
    };
  }

  /**
   * Retrieves plan entitlement allowances and usage limits for current billing period
   */
  public static async getPlanAllowance(userId: string): Promise<PlanAllowanceSnapshot> {
    const prisma = PrismaService.client;
    const billingPeriod = CreditService.getCurrentBillingPeriod();
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    const balance = await CreditService.getBalance(userId);

    const usageAgg = await prisma.creditUsage.aggregate({
      where: {
        userId,
        billingPeriod,
      },
      _sum: { creditsDeducted: true },
    });

    let plan = subscription?.plan;
    if (!plan) {
      plan = (await prisma.plan.findFirst({
        where: { tier: 'FREE' },
      })) || {
        id: 'free',
        tier: 'FREE' as any,
        name: 'Starter Free',
        monthlyCredits: 100,
        maxSessionDurationSeconds: 1800,
        maxConcurrentSessions: 1,
        supportsVision: true,
        supportsScreenShare: true,
        supportsVoice: true,
        supportsToolCalling: false,
      } as any;
    }

    const consumedThisPeriod = usageAgg._sum.creditsDeducted ?? 0;
    const remainingAllowance = Math.max(0, plan!.monthlyCredits - consumedThisPeriod);

    return {
      userId,
      tier: plan!.tier,
      planName: plan!.name,
      monthlyCredits: plan!.monthlyCredits,
      consumedThisPeriod,
      remainingAllowance,
      currentBalance: balance.availableBalance,
      billingPeriod,
      resetDate: nextMonth.toISOString(),
      supportsVision: plan!.supportsVision,
      supportsScreenShare: plan!.supportsScreenShare,
      supportsVoice: plan!.supportsVoice,
      supportsToolCalling: plan!.supportsToolCalling,
      maxConcurrentSessions: plan!.maxConcurrentSessions,
      maxSessionDurationSeconds: plan!.maxSessionDurationSeconds,
    };
  }

  /**
   * Consumes credits transactionally with row-level locks, idempotency checks, and audit logging
   */
  public static async consumeCredits(
    userId: string,
    input: ConsumeCreditsInput
  ) {
    const prisma = PrismaService.client;
    const billingPeriod = CreditService.getCurrentBillingPeriod();

    return await prisma.$transaction(
      async (tx) => {
        // 1. Acquire row-level lock on user to serialize balance mutations
        await tx.$executeRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;

        // 2. Idempotency Check: if referenceId was supplied, prevent duplicate usage
        if (input.referenceId) {
          const existingUsage = await tx.creditUsage.findFirst({
            where: {
              userId,
              metadata: {
                path: ['referenceId'],
                equals: input.referenceId,
              },
            },
          });

          if (existingUsage) {
            logger.info(
              `Duplicate usage request intercepted for referenceId ${input.referenceId}. Returning existing usage.`
            );
            return {
              usageId: existingUsage.id,
              creditsDeducted: existingUsage.creditsDeducted,
              alreadyProcessed: true,
            };
          }
        }

        // 3. Expire outdated reservations in this transaction
        const now = new Date();
        await tx.creditReservation.updateMany({
          where: {
            userId,
            status: ReservationStatus.PENDING,
            expiresAt: { lt: now },
          },
          data: { status: ReservationStatus.EXPIRED },
        });

        // 4. Authoritative Balance calculation under lock
        const lastLedger = await tx.creditLedger.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          select: { balanceAfter: true },
        });
        const currentBalance = lastLedger?.balanceAfter ?? 0;

        const reservationAgg = await tx.creditReservation.aggregate({
          where: {
            userId,
            status: ReservationStatus.PENDING,
            expiresAt: { gte: now },
          },
          _sum: { amount: true },
        });
        const reservedCredits = reservationAgg._sum.amount ?? 0;
        const availableBalance = currentBalance - reservedCredits;

        // 5. Enforce Balance sufficiency
        if (availableBalance < input.amount) {
          throw AppError.paymentRequired(
            `Insufficient credit balance. Available: ${availableBalance}, Required: ${input.amount}. Please upgrade your plan or top up.`
          );
        }

        // 6. Calculate running balance snapshot
        const newBalance = currentBalance - input.amount;

        // 7. Insert auditable CreditLedger entry
        const ledgerEntry = await tx.creditLedger.create({
          data: {
            userId,
            amount: -Math.abs(input.amount),
            balanceAfter: newBalance,
            type: CreditTransactionType.USAGE,
            reason: input.reason,
            referenceId: input.referenceId || null,
            billingPeriod,
            metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
          },
        });

        // 8. Insert auditable CreditUsage record
        const usageRecord = await tx.creditUsage.create({
          data: {
            userId,
            sessionId: input.sessionId || null,
            creditsDeducted: input.amount,
            feature: input.feature,
            modelUsed: input.modelUsed || null,
            durationSeconds: input.durationSeconds || null,
            unitsConsumed: input.unitsConsumed || null,
            billingPeriod,
            metadata: {
              ...(input.metadata || {}),
              referenceId: input.referenceId || null,
              ledgerId: ledgerEntry.id,
            },
          },
        });

        // 9. If linked to an AISession, update the session's cumulative creditsConsumed
        if (input.sessionId) {
          await tx.aISession.update({
            where: { id: input.sessionId },
            data: {
              creditsConsumed: {
                increment: input.amount,
              },
            },
          });
        }

        // 10. Broadcast real-time balance update
        const newAvailable = newBalance - reservedCredits;
        creditEvents.emitBalanceUpdated({
          userId,
          totalBalance: newBalance,
          availableBalance: newAvailable,
          reservedCredits,
          change: -input.amount,
          type: CreditTransactionType.USAGE,
          reason: input.reason,
          referenceId: input.referenceId,
          timestamp: new Date().toISOString(),
        });

        if (newAvailable <= 0) {
          creditEvents.emitExhausted(userId);
        } else if (newAvailable <= LOW_CREDIT_THRESHOLD) {
          creditEvents.emitLowBalance({
            userId,
            availableBalance: newAvailable,
            threshold: LOW_CREDIT_THRESHOLD,
            message: `Low credit warning: ${newAvailable} credits remaining.`,
            timestamp: new Date().toISOString(),
          });
        }

        return {
          usageId: usageRecord.id,
          ledgerId: ledgerEntry.id,
          creditsDeducted: input.amount,
          balanceAfter: newBalance,
          availableBalance: newAvailable,
          billingPeriod,
        };
      },
      DEFAULT_TX_OPTIONS
    );
  }

  /**
   * Grants credits to a user (Stripe purchase, welcome bonus, promo, manual admin)
   */
  public static async grantCredits(input: GrantCreditsInput) {
    const prisma = PrismaService.client;
    const billingPeriod = CreditService.getCurrentBillingPeriod();

    return await prisma.$transaction(async (tx) => {
      // 1. Row-level lock
      await tx.$executeRaw`SELECT "id" FROM "users" WHERE "id" = ${input.userId} FOR UPDATE`;

      // 2. Prevent duplicate credit grants if referenceId supplied (e.g. Stripe webhook event ID)
      if (input.referenceId) {
        const existingGrant = await tx.creditLedger.findFirst({
          where: {
            userId: input.userId,
            referenceId: input.referenceId,
          },
        });

        if (existingGrant) {
          logger.info(
            `Duplicate credit grant intercepted for referenceId ${input.referenceId}. Skipping.`
          );
          return {
            ledgerId: existingGrant.id,
            amount: existingGrant.amount,
            balanceAfter: existingGrant.balanceAfter,
            alreadyProcessed: true,
          };
        }
      }

      // 3. Compute running balance
      const lastLedger = await tx.creditLedger.findFirst({
        where: { userId: input.userId },
        orderBy: { createdAt: 'desc' },
        select: { balanceAfter: true },
      });
      const currentBalance = lastLedger?.balanceAfter ?? 0;
      const newBalance = currentBalance + Math.abs(input.amount);

      // 4. Create ledger entry
      const ledgerEntry = await tx.creditLedger.create({
        data: {
          userId: input.userId,
          amount: Math.abs(input.amount),
          balanceAfter: newBalance,
          type: (input.type as CreditTransactionType) || CreditTransactionType.GRANT,
          reason: input.reason,
          referenceId: input.referenceId || null,
          billingPeriod,
          metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });

      // 5. Get active reservations to compute accurate available balance
      const reservationAgg = await tx.creditReservation.aggregate({
        where: {
          userId: input.userId,
          status: ReservationStatus.PENDING,
          expiresAt: { gte: new Date() },
        },
        _sum: { amount: true },
      });
      const reservedCredits = reservationAgg._sum.amount ?? 0;
      const availableBalance = newBalance - reservedCredits;

      // 6. Broadcast real-time balance update
      creditEvents.emitBalanceUpdated({
        userId: input.userId,
        totalBalance: newBalance,
        availableBalance,
        reservedCredits,
        change: Math.abs(input.amount),
        type: input.type as CreditTransactionType,
        reason: input.reason,
        referenceId: input.referenceId,
        timestamp: new Date().toISOString(),
      });

      return {
        ledgerId: ledgerEntry.id,
        amount: input.amount,
        balanceAfter: newBalance,
        availableBalance,
        billingPeriod,
      };
    }, DEFAULT_TX_OPTIONS);
  }

  /**
   * Refunds previously consumed credits back to user
   */
  public static async refundCredits(input: RefundCreditsInput) {
    const prisma = PrismaService.client;
    const billingPeriod = CreditService.getCurrentBillingPeriod();

    return await prisma.$transaction(async (tx) => {
      // 1. Lock user
      await tx.$executeRaw`SELECT "id" FROM "users" WHERE "id" = ${input.userId} FOR UPDATE`;

      // 2. Check for duplicate refund if referenceId supplied
      if (input.referenceId) {
        const existingRefund = await tx.creditLedger.findFirst({
          where: {
            userId: input.userId,
            referenceId: input.referenceId,
            type: CreditTransactionType.REFUND,
          },
        });

        if (existingRefund) {
          return {
            ledgerId: existingRefund.id,
            amount: existingRefund.amount,
            balanceAfter: existingRefund.balanceAfter,
            alreadyProcessed: true,
          };
        }
      }

      // 3. Current balance
      const lastLedger = await tx.creditLedger.findFirst({
        where: { userId: input.userId },
        orderBy: { createdAt: 'desc' },
        select: { balanceAfter: true },
      });
      const currentBalance = lastLedger?.balanceAfter ?? 0;
      const newBalance = currentBalance + Math.abs(input.amount);

      // 4. Create refund ledger entry
      const ledgerEntry = await tx.creditLedger.create({
        data: {
          userId: input.userId,
          amount: Math.abs(input.amount),
          balanceAfter: newBalance,
          type: CreditTransactionType.REFUND,
          reason: input.reason,
          referenceId: input.referenceId || null,
          billingPeriod,
          metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });

      const reservationAgg = await tx.creditReservation.aggregate({
        where: {
          userId: input.userId,
          status: ReservationStatus.PENDING,
          expiresAt: { gte: new Date() },
        },
        _sum: { amount: true },
      });
      const reservedCredits = reservationAgg._sum.amount ?? 0;
      const availableBalance = newBalance - reservedCredits;

      creditEvents.emitBalanceUpdated({
        userId: input.userId,
        totalBalance: newBalance,
        availableBalance,
        reservedCredits,
        change: Math.abs(input.amount),
        type: CreditTransactionType.REFUND,
        reason: input.reason,
        referenceId: input.referenceId,
        timestamp: new Date().toISOString(),
      });

      return {
        ledgerId: ledgerEntry.id,
        amount: input.amount,
        balanceAfter: newBalance,
        availableBalance,
        billingPeriod,
      };
    }, DEFAULT_TX_OPTIONS);
  }

  /**
   * Adjusts credit balance up or down (administrative correction or system balance alignment)
   */
  public static async adjustCredits(input: AdjustCreditsInput) {
    const prisma = PrismaService.client;
    const billingPeriod = CreditService.getCurrentBillingPeriod();

    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT "id" FROM "users" WHERE "id" = ${input.userId} FOR UPDATE`;

      const lastLedger = await tx.creditLedger.findFirst({
        where: { userId: input.userId },
        orderBy: { createdAt: 'desc' },
        select: { balanceAfter: true },
      });
      const currentBalance = lastLedger?.balanceAfter ?? 0;
      const newBalance = currentBalance + input.amount;

      if (newBalance < 0) {
        throw AppError.badRequest(
          `Adjustment of ${input.amount} would cause negative credit balance (${newBalance}). Not permitted.`
        );
      }

      const ledgerEntry = await tx.creditLedger.create({
        data: {
          userId: input.userId,
          amount: input.amount,
          balanceAfter: newBalance,
          type: CreditTransactionType.ADJUSTMENT,
          reason: input.reason,
          referenceId: input.referenceId || null,
          billingPeriod,
          metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });

      const reservationAgg = await tx.creditReservation.aggregate({
        where: {
          userId: input.userId,
          status: ReservationStatus.PENDING,
          expiresAt: { gte: new Date() },
        },
        _sum: { amount: true },
      });
      const reservedCredits = reservationAgg._sum.amount ?? 0;
      const availableBalance = newBalance - reservedCredits;

      creditEvents.emitBalanceUpdated({
        userId: input.userId,
        totalBalance: newBalance,
        availableBalance,
        reservedCredits,
        change: input.amount,
        type: CreditTransactionType.ADJUSTMENT,
        reason: input.reason,
        referenceId: input.referenceId,
        timestamp: new Date().toISOString(),
      });

      return {
        ledgerId: ledgerEntry.id,
        amount: input.amount,
        balanceAfter: newBalance,
        availableBalance,
        billingPeriod,
      };
    }, DEFAULT_TX_OPTIONS);
  }

  /**
   * Creates a temporary usage reservation holding credits in escrow to prevent double spending
   */
  public static async reserveCredits(
    userId: string,
    input: ReserveCreditsInput
  ) {
    const prisma = PrismaService.client;

    return await prisma.$transaction(async (tx) => {
      // 1. Lock user row
      await tx.$executeRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;

      const now = new Date();

      // 2. Expire old pending reservations
      await tx.creditReservation.updateMany({
        where: {
          userId,
          status: ReservationStatus.PENDING,
          expiresAt: { lt: now },
        },
        data: { status: ReservationStatus.EXPIRED },
      });

      // 3. Compute available balance
      const lastLedger = await tx.creditLedger.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { balanceAfter: true },
      });
      const currentBalance = lastLedger?.balanceAfter ?? 0;

      const reservationAgg = await tx.creditReservation.aggregate({
        where: {
          userId,
          status: ReservationStatus.PENDING,
          expiresAt: { gte: now },
        },
        _sum: { amount: true },
      });
      const currentReserved = reservationAgg._sum.amount ?? 0;
      const availableBalance = currentBalance - currentReserved;

      // 4. Validate sufficiency for reservation hold
      if (availableBalance < input.amount) {
        throw AppError.paymentRequired(
          `Insufficient available credits to create reservation hold. Available: ${availableBalance}, Required: ${input.amount}.`
        );
      }

      // 5. Create reservation record
      const ttl = input.ttlSeconds || RESERVATION_DEFAULTS.DEFAULT_TTL_SECONDS;
      const expiresAt = new Date(now.getTime() + ttl * 1000);

      const reservation = await tx.creditReservation.create({
        data: {
          userId,
          sessionId: input.sessionId || null,
          amount: input.amount,
          feature: input.feature,
          status: ReservationStatus.PENDING,
          expiresAt,
          metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });

      const newAvailable = availableBalance - input.amount;
      const newReserved = currentReserved + input.amount;

      // 6. Broadcast event
      creditEvents.emitReservationEvent('reservation_created', {
        userId,
        reservationId: reservation.id,
        amount: input.amount,
        status: 'PENDING',
        feature: input.feature,
        availableBalance: newAvailable,
        timestamp: now.toISOString(),
      });

      return {
        reservationId: reservation.id,
        amount: reservation.amount,
        feature: reservation.feature,
        status: reservation.status,
        expiresAt: reservation.expiresAt.toISOString(),
        availableBalance: newAvailable,
        reservedCredits: newReserved,
      };
    }, DEFAULT_TX_OPTIONS);
  }

  /**
   * Settles a previously created reservation with actual calculated activity usage
   */
  public static async settleReservation(
    userId: string,
    input: SettleReservationInput
  ) {
    const prisma = PrismaService.client;
    const billingPeriod = CreditService.getCurrentBillingPeriod();

    return await prisma.$transaction(async (tx) => {
      // 1. Lock user row
      await tx.$executeRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;

      // 2. Fetch reservation and verify status
      const reservation = await tx.creditReservation.findUnique({
        where: { id: input.reservationId },
      });

      if (!reservation || reservation.userId !== userId) {
        throw AppError.notFound('Reservation not found or does not belong to user');
      }

      if (reservation.status !== ReservationStatus.PENDING) {
        if (reservation.status === ReservationStatus.SETTLED) {
          // Idempotent return if already settled
          return {
            reservationId: reservation.id,
            status: 'SETTLED',
            heldAmount: reservation.amount,
            settledAmount: reservation.settledAmount ?? reservation.amount,
            balanceAfter: 0,
            availableBalance: 0,
            ledgerId: null,
            usageId: null,
          };
        }
        throw AppError.badRequest(
          `Reservation cannot be settled. Current status: ${reservation.status}`
        );
      }

      const now = new Date();
      if (reservation.expiresAt < now) {
        await tx.creditReservation.update({
          where: { id: reservation.id },
          data: { status: ReservationStatus.EXPIRED },
        });
        throw AppError.badRequest('Reservation has expired and cannot be settled.');
      }

      // 3. Compute running balance
      const lastLedger = await tx.creditLedger.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { balanceAfter: true },
      });
      const currentBalance = lastLedger?.balanceAfter ?? 0;
      const newBalance = currentBalance - input.actualAmount;

      if (newBalance < 0) {
        throw AppError.paymentRequired(
          `Settlement amount (${input.actualAmount}) exceeds total credit balance (${currentBalance}).`
        );
      }

      // 4. Update reservation to SETTLED
      await tx.creditReservation.update({
        where: { id: reservation.id },
        data: {
          status: ReservationStatus.SETTLED,
          settledAmount: input.actualAmount,
          settledAt: now,
        },
      });

      // 5. If actual usage > 0, create Ledger and CreditUsage records
      let ledgerId: string | null = null;
      let usageId: string | null = null;

      if (input.actualAmount > 0) {
        const ledger = await tx.creditLedger.create({
          data: {
            userId,
            amount: -Math.abs(input.actualAmount),
            balanceAfter: newBalance,
            type: CreditTransactionType.USAGE,
            reason: input.reason || `Settlement for reservation ${reservation.id}`,
            referenceId: reservation.id,
            billingPeriod,
            metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
          },
        });
        ledgerId = ledger.id;

        const usage = await tx.creditUsage.create({
          data: {
            userId,
            sessionId: reservation.sessionId,
            creditsDeducted: input.actualAmount,
            feature: reservation.feature,
            modelUsed: input.modelUsed || null,
            durationSeconds: input.durationSeconds || null,
            unitsConsumed: input.unitsConsumed || null,
            billingPeriod,
            metadata: {
              reservationId: reservation.id,
              ...(input.metadata || {}),
            },
          },
        });
        usageId = usage.id;

        if (reservation.sessionId) {
          await tx.aISession.update({
            where: { id: reservation.sessionId },
            data: {
              creditsConsumed: {
                increment: input.actualAmount,
              },
            },
          });
        }
      }

      // 6. Calculate new available balance after releasing hold
      const reservationAgg = await tx.creditReservation.aggregate({
        where: {
          userId,
          status: ReservationStatus.PENDING,
          expiresAt: { gte: now },
        },
        _sum: { amount: true },
      });
      const reservedCredits = reservationAgg._sum.amount ?? 0;
      const availableBalance = newBalance - reservedCredits;

      // 7. Emit events
      creditEvents.emitReservationEvent('reservation_settled', {
        userId,
        reservationId: reservation.id,
        amount: input.actualAmount,
        status: 'SETTLED',
        feature: reservation.feature,
        availableBalance,
        timestamp: now.toISOString(),
      });

      creditEvents.emitBalanceUpdated({
        userId,
        totalBalance: newBalance,
        availableBalance,
        reservedCredits,
        change: -input.actualAmount,
        type: CreditTransactionType.USAGE,
        reason: input.reason || `Settlement for reservation ${reservation.id}`,
        referenceId: reservation.id,
        timestamp: now.toISOString(),
      });

      return {
        reservationId: reservation.id,
        status: 'SETTLED',
        heldAmount: reservation.amount,
        settledAmount: input.actualAmount,
        balanceAfter: newBalance,
        availableBalance,
        ledgerId,
        usageId,
      };
    }, DEFAULT_TX_OPTIONS);
  }

  /**
   * Releases an unconsumed or canceled reservation back to user's available balance
   */
  public static async releaseReservation(
    userId: string,
    reservationId: string,
    reason?: string
  ) {
    const prisma = PrismaService.client;

    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;

      const reservation = await tx.creditReservation.findUnique({
        where: { id: reservationId },
      });

      if (!reservation || reservation.userId !== userId) {
        throw AppError.notFound('Reservation not found or does not belong to user');
      }

      if (reservation.status !== ReservationStatus.PENDING) {
        throw AppError.badRequest(
          `Cannot release reservation with status: ${reservation.status}`
        );
      }

      const now = new Date();
      await tx.creditReservation.update({
        where: { id: reservationId },
        data: {
          status: ReservationStatus.RELEASED,
          releasedAt: now,
          metadata: {
            ...((reservation.metadata as Record<string, any>) || {}),
            releaseReason: reason || 'Explicitly released',
          },
        },
      });

      const lastLedger = await tx.creditLedger.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { balanceAfter: true },
      });
      const totalBalance = lastLedger?.balanceAfter ?? 0;

      const reservationAgg = await tx.creditReservation.aggregate({
        where: {
          userId,
          status: ReservationStatus.PENDING,
          expiresAt: { gte: now },
        },
        _sum: { amount: true },
      });
      const reservedCredits = reservationAgg._sum.amount ?? 0;
      const availableBalance = totalBalance - reservedCredits;

      creditEvents.emitReservationEvent('reservation_released', {
        userId,
        reservationId,
        amount: reservation.amount,
        status: 'RELEASED',
        feature: reservation.feature,
        availableBalance,
        timestamp: now.toISOString(),
      });

      return {
        reservationId,
        status: 'RELEASED',
        amountReleased: reservation.amount,
        availableBalance,
        reservedCredits,
      };
    }, DEFAULT_TX_OPTIONS);
  }

  /**
   * Paginated Credit Ledger History
   */
  public static async getLedgerHistory(userId: string, query: LedgerQueryInput) {
    const prisma = PrismaService.client;
    const { page, limit, type, billingPeriod } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.CreditLedgerWhereInput = {
      userId,
      ...(type ? { type } : {}),
      ...(billingPeriod ? { billingPeriod } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.creditLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.creditLedger.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Paginated Usage Activity History
   */
  public static async getUsageHistory(userId: string, query: UsageQueryInput) {
    const prisma = PrismaService.client;
    const { page, limit, feature, sessionId, billingPeriod } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.CreditUsageWhereInput = {
      userId,
      ...(feature ? { feature } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(billingPeriod ? { billingPeriod } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.creditUsage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.creditUsage.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Consumption Analytics Breakdown for Billing Period
   */
  public static async getUsageAnalytics(userId: string, billingPeriod?: string) {
    const prisma = PrismaService.client;
    const targetPeriod = billingPeriod || CreditService.getCurrentBillingPeriod();

    const [featureGroups, modelGroups, usages] = await Promise.all([
      prisma.creditUsage.groupBy({
        by: ['feature'],
        where: { userId, billingPeriod: targetPeriod },
        _sum: { creditsDeducted: true, unitsConsumed: true, durationSeconds: true },
        _count: { _all: true },
      }),
      prisma.creditUsage.groupBy({
        by: ['modelUsed'],
        where: { userId, billingPeriod: targetPeriod, modelUsed: { not: null } },
        _sum: { creditsDeducted: true },
        _count: { _all: true },
      }),
      prisma.creditUsage.findMany({
        where: { userId, billingPeriod: targetPeriod },
        select: { creditsDeducted: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const totalCreditsConsumed = featureGroups.reduce(
      (sum, g) => sum + (g._sum.creditsDeducted ?? 0),
      0
    );

    const featureBreakdown = Object.values(CreditFeatureType).map((feat) => {
      const match = featureGroups.find((g) => g.feature === feat);
      const credits = match?._sum.creditsDeducted ?? 0;
      const count = match?._count._all ?? 0;
      const percentage =
        totalCreditsConsumed > 0 ? Math.round((credits / totalCreditsConsumed) * 100) : 0;

      return {
        feature: feat,
        name: CREDIT_POLICY[feat]?.name || feat,
        creditsConsumed: credits,
        eventCount: count,
        percentage,
        unitsConsumed: match?._sum.unitsConsumed ?? 0,
        durationSeconds: match?._sum.durationSeconds ?? 0,
      };
    });

    // Daily breakdown for period
    const dailyMap: Record<string, number> = {};
    usages.forEach((u) => {
      const day = u.createdAt.toISOString().split('T')[0];
      dailyMap[day] = (dailyMap[day] || 0) + u.creditsDeducted;
    });

    const dailyTrend = Object.entries(dailyMap).map(([date, credits]) => ({
      date,
      credits,
    }));

    return {
      billingPeriod: targetPeriod,
      totalCreditsConsumed,
      featureBreakdown,
      modelBreakdown: modelGroups.map((m) => ({
        model: m.modelUsed || 'default',
        creditsConsumed: m._sum.creditsDeducted ?? 0,
        count: m._count._all ?? 0,
      })),
      dailyTrend,
    };
  }
}
