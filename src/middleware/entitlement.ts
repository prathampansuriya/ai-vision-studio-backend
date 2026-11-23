import { Request, Response, NextFunction } from 'express';
import { CreditFeatureType, AccountStatus, SubscriptionStatus, SessionStatus, PlanTier } from '@prisma/client';
import { PrismaService } from '../services/prisma.service.js';
import { CreditService } from '../services/credit.service.js';
import { AppError } from '../utils/appError.js';
import { CREDIT_POLICY } from '../config/credit.policy.js';

export interface EntitlementOptions {
  feature?: CreditFeatureType;
  minCredits?: number;
  requiresVision?: boolean;
  requiresScreen?: boolean;
  requiresVoice?: boolean;
  requiresTool?: boolean;
  requiresPlanTier?: PlanTier;
  checkSessionConcurrency?: boolean;
}

/**
 * Server-side entitlement and plan limitation enforcement guard
 */
export function requireEntitlement(options: EntitlementOptions = {}) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw AppError.unauthorized('Authentication required to access this resource');
      }

      const prisma = PrismaService.client;

      // 1. Fetch user account status and active subscription
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          subscription: {
            include: { plan: true },
          },
        },
      });

      if (!user) {
        throw AppError.notFound('User not found');
      }

      // 2. Validate active account
      if (user.accountStatus !== AccountStatus.ACTIVE) {
        throw AppError.forbidden(
          `Account is currently ${user.accountStatus.toLowerCase()}. Access denied.`
        );
      }

      // 3. Resolve active plan
      let plan = user.subscription?.plan;
      const subStatus = user.subscription?.status;

      // Check if subscription has defaulted / unpaid / canceled
      if (user.subscription && subStatus === SubscriptionStatus.UNPAID) {
        throw AppError.paymentRequired(
          'Your subscription has unpaid invoices. Please update payment method to proceed.'
        );
      }

      if (!plan || subStatus === SubscriptionStatus.CANCELED || subStatus === SubscriptionStatus.INACTIVE) {
        // Fallback to default FREE tier
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

      // 4. Plan tier requirement validation
      const TIER_RANK: Record<PlanTier, number> = {
        FREE: 0,
        PRO: 1,
        BUSINESS: 2,
        ENTERPRISE: 3,
      };

      if (options.requiresPlanTier && TIER_RANK[plan!.tier] < TIER_RANK[options.requiresPlanTier]) {
        throw AppError.forbidden(
          `This feature requires a ${options.requiresPlanTier} subscription plan or higher (Current: ${plan!.name}). Please upgrade your plan to unlock this capability.`
        );
      }

      // 5. Feature entitlement validation
      const targetFeature =
        options.feature || (req.body?.feature as CreditFeatureType | undefined);

      if (
        (options.requiresTool || targetFeature === CreditFeatureType.TOOL_EXECUTION) &&
        !plan!.supportsToolCalling
      ) {
        throw AppError.forbidden(
          `Autonomous AI tool execution is not enabled on your plan (${plan!.name}). Please upgrade to Professional or higher.`
        );
      }

      if (
        (options.requiresVision || targetFeature === CreditFeatureType.MULTIMODAL_STREAM) &&
        !plan!.supportsVision
      ) {
        throw AppError.forbidden(
          `Live vision processing is not enabled on your plan (${plan!.name}).`
        );
      }

      if (options.requiresScreen && !plan!.supportsScreenShare) {
        throw AppError.forbidden(
          `Screen share analysis is not enabled on your plan (${plan!.name}).`
        );
      }

      if (
        (options.requiresVoice || targetFeature === CreditFeatureType.AUDIO_USAGE) &&
        !plan!.supportsVoice
      ) {
        throw AppError.forbidden(
          `Real-time voice processing is not enabled on your plan (${plan!.name}).`
        );
      }

      // 5. Session Concurrency Check
      if (options.checkSessionConcurrency) {
        const activeSessionsCount = await prisma.aISession.count({
          where: {
            userId,
            status: {
              in: [SessionStatus.CREATED, SessionStatus.ACTIVE],
            },
          },
        });

        if (activeSessionsCount >= plan!.maxConcurrentSessions) {
          throw AppError.forbidden(
            `Concurrent session limit reached (${activeSessionsCount}/${plan!.maxConcurrentSessions}) for your ${plan!.name} plan tier.`
          );
        }
      }

      // 6. Balance Sufficiency Check
      const balance = await CreditService.getBalance(userId);

      const requiredCredits =
        options.minCredits ??
        (options.feature ? CREDIT_POLICY[options.feature]?.minimumCredits ?? 1 : 0);

      if (requiredCredits > 0 && balance.availableBalance < requiredCredits) {
        throw AppError.paymentRequired(
          `Insufficient credit balance. Required: ${requiredCredits}, Available: ${balance.availableBalance}. Please top up or upgrade.`
        );
      }

      // 7. Attach entitlement context to request
      req.entitlement = {
        planTier: plan!.tier,
        planName: plan!.name,
        availableBalance: balance.availableBalance,
        totalBalance: balance.totalBalance,
        reservedCredits: balance.reservedCredits,
        maxConcurrentSessions: plan!.maxConcurrentSessions,
        maxSessionDurationSeconds: plan!.maxSessionDurationSeconds,
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}
