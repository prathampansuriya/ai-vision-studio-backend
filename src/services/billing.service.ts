import {
  BillingInterval,
  CreditTransactionType,
  NotificationType,
  PaymentEventStatus,
  PlanTier,
  SubscriptionStatus,
} from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from './prisma.service.js';
import { StripeService } from '../integrations/stripe.service.js';
import { isStripeConfigured } from '../config/stripe.config.js';
import { AppError } from '../utils/appError.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.config.js';
import { emailService } from '../integrations/email.service.js';
import { NotificationService } from './notification.service.js';
import { CreateCheckoutSessionInput } from '../validators/billing.validator.js';

export interface PlanPricingItem {
  priceId: string | null;
  amount: number | null;
  currency: string;
  interval: string | null;
  configured: boolean;
}

export interface EnrichedPlanResponse {
  id: string;
  tier: PlanTier;
  name: string;
  description: string | null;
  monthlyCredits: number;
  maxSessionDurationSeconds: number;
  maxConcurrentSessions: number;
  supportsVision: boolean;
  supportsScreenShare: boolean;
  supportsVoice: boolean;
  supportsToolCalling: boolean;
  features: string[];
  stripeProductId: string | null;
  stripeMonthlyPriceId: string | null;
  stripeYearlyPriceId: string | null;
  isActive: boolean;
  sortOrder: number;
  pricing: {
    monthly: PlanPricingItem;
    yearly: PlanPricingItem;
  };
}

export class BillingService {
  /**
   * Helper to map Stripe's subscription status string to Prisma's SubscriptionStatus enum
   */
  public static mapStripeSubscriptionStatus(
    status: Stripe.Subscription.Status
  ): SubscriptionStatus {
    switch (status) {
      case 'active':
        return SubscriptionStatus.ACTIVE;
      case 'trialing':
        return SubscriptionStatus.TRIALING;
      case 'past_due':
        return SubscriptionStatus.PAST_DUE;
      case 'canceled':
        return SubscriptionStatus.CANCELED;
      case 'unpaid':
        return SubscriptionStatus.UNPAID;
      case 'incomplete':
      case 'incomplete_expired':
      case 'paused':
      default:
        return SubscriptionStatus.INACTIVE;
    }
  }

  /**
   * Returns all active plans enriched with live Stripe pricing data
   */
  public static async getPlans(): Promise<EnrichedPlanResponse[]> {
    const prisma = PrismaService.client;

    let plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Auto-seed plans if DB has not been seeded yet
    if (plans.length === 0) {
      plans = await BillingService.seedDefaultPlans();
    }

    const enrichedPlans: EnrichedPlanResponse[] = [];

    for (const plan of plans) {
      const defaultMonthly =
        plan.tier === PlanTier.PRO ? 19 :
          plan.tier === PlanTier.BUSINESS ? 49 :
            plan.tier === PlanTier.ENTERPRISE ? 149 : 0;

      const defaultYearly =
        plan.tier === PlanTier.PRO ? 190 :
          plan.tier === PlanTier.BUSINESS ? 490 :
            plan.tier === PlanTier.ENTERPRISE ? 1490 : 0;

      let monthlyPricing: PlanPricingItem = {
        priceId: plan.stripeMonthlyPriceId,
        amount: defaultMonthly,
        currency: 'usd',
        interval: 'month',
        configured: plan.tier === PlanTier.FREE || !!plan.stripeMonthlyPriceId,
      };

      let yearlyPricing: PlanPricingItem = {
        priceId: plan.stripeYearlyPriceId,
        amount: defaultYearly,
        currency: 'usd',
        interval: 'year',
        configured: plan.tier === PlanTier.FREE || !!plan.stripeYearlyPriceId,
      };

      if (plan.tier === PlanTier.FREE) {
        monthlyPricing = {
          priceId: null,
          amount: 0,
          currency: 'usd',
          interval: 'month',
          configured: true,
        };
        yearlyPricing = {
          priceId: null,
          amount: 0,
          currency: 'usd',
          interval: 'year',
          configured: true,
        };
      } else if (isStripeConfigured()) {
        // Retrieve live monthly price from Stripe
        const monthlyId =
          plan.stripeMonthlyPriceId ||
          (plan.tier === PlanTier.PRO ? process.env.STRIPE_PRO_PRICE_ID :
           plan.tier === PlanTier.BUSINESS ? process.env.STRIPE_BUSINESS_PRICE_ID :
           plan.tier === PlanTier.ENTERPRISE ? process.env.STRIPE_ENTERPRISE_PRICE_ID : null);

        if (monthlyId) {
          const mPrice = await StripeService.retrievePrice(monthlyId);
          if (mPrice && mPrice.active && mPrice.amountDollars !== null) {
            monthlyPricing = {
              priceId: mPrice.id,
              amount: mPrice.amountDollars,
              currency: mPrice.currency,
              interval: mPrice.interval,
              configured: true,
            };
          }
        }

        // Retrieve live yearly price from Stripe
        const yearlyId =
          plan.stripeYearlyPriceId ||
          (plan.tier === PlanTier.PRO ? process.env.STRIPE_PRO_YEARLY_PRICE_ID :
           plan.tier === PlanTier.BUSINESS ? process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID :
           plan.tier === PlanTier.ENTERPRISE ? process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID : null);

        if (yearlyId) {
          const yPrice = await StripeService.retrievePrice(yearlyId);
          if (yPrice && yPrice.active && yPrice.amountDollars !== null) {
            yearlyPricing = {
              priceId: yPrice.id,
              amount: yPrice.amountDollars,
              currency: yPrice.currency,
              interval: yPrice.interval,
              configured: true,
            };
          }
        }
      }

      const rawFeatures = plan.features;
      const features: string[] = Array.isArray(rawFeatures)
        ? (rawFeatures as string[])
        : [];

      enrichedPlans.push({
        id: plan.id,
        tier: plan.tier,
        name: plan.name,
        description: plan.description,
        monthlyCredits: plan.monthlyCredits,
        maxSessionDurationSeconds: plan.maxSessionDurationSeconds,
        maxConcurrentSessions: plan.maxConcurrentSessions,
        supportsVision: plan.supportsVision,
        supportsScreenShare: plan.supportsScreenShare,
        supportsVoice: plan.supportsVoice,
        supportsToolCalling: plan.supportsToolCalling,
        features,
        stripeProductId: plan.stripeProductId,
        stripeMonthlyPriceId: plan.stripeMonthlyPriceId,
        stripeYearlyPriceId: plan.stripeYearlyPriceId,
        isActive: plan.isActive,
        sortOrder: plan.sortOrder,
        pricing: {
          monthly: monthlyPricing,
          yearly: yearlyPricing,
        },
      });
    }

    return enrichedPlans;
  }

  /**
   * Retrieves the current user's subscription and credit balance
   */
  public static async getUserSubscription(userId: string) {
    const prisma = PrismaService.client;

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: {
        plan: true,
      },
    });

    const lastLedger = await prisma.creditLedger.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { balanceAfter: true },
    });
    const creditBalance = lastLedger?.balanceAfter ?? 0;

    if (!subscription) {
      // Find the FREE plan as fallback
      const freePlan = await prisma.plan.findUnique({
        where: { tier: PlanTier.FREE },
      });

      return {
        id: null,
        userId,
        status: SubscriptionStatus.ACTIVE,
        billingInterval: BillingInterval.MONTHLY,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        creditBalance,
        plan: freePlan || {
          id: 'free',
          tier: PlanTier.FREE,
          name: 'Starter Free',
          monthlyCredits: 100,
          maxSessionDurationSeconds: 1800,
          maxConcurrentSessions: 1,
          supportsVision: true,
          supportsScreenShare: true,
          supportsVoice: true,
          supportsToolCalling: false,
        },
      };
    }

    return {
      ...subscription,
      creditBalance,
    };
  }

  /**
   * Creates a hosted Stripe checkout session for a selected plan
   */
  public static async createCheckoutSession(
    userId: string,
    input: CreateCheckoutSessionInput
  ): Promise<{ checkoutUrl: string | null; sessionId: string }> {
    const prisma = PrismaService.client;

    // 1. Resolve Plan and Billing Interval
    let plan = null;
    let billingInterval: BillingInterval = input.billingInterval || BillingInterval.MONTHLY;
    let priceId: string | null = input.priceId || null;

    if (input.planId) {
      plan = await prisma.plan.findUnique({
        where: { id: input.planId },
      });
      if (plan) {
        priceId =
          billingInterval === BillingInterval.YEARLY
            ? plan.stripeYearlyPriceId
            : plan.stripeMonthlyPriceId;
      }
    } else if (input.priceId) {
      plan = await prisma.plan.findFirst({
        where: {
          OR: [
            { stripeMonthlyPriceId: input.priceId },
            { stripeYearlyPriceId: input.priceId },
          ],
        },
      });
      if (plan) {
        billingInterval =
          plan.stripeYearlyPriceId === input.priceId
            ? BillingInterval.YEARLY
            : BillingInterval.MONTHLY;
      }
    }

    if (!plan || !plan.isActive) {
      throw AppError.notFound('Requested subscription plan was not found or is inactive');
    }

    if (plan.tier === PlanTier.FREE) {
      throw AppError.badRequest('Free plan does not require a Stripe checkout session');
    }

    // 2. Prevent duplicate active subscriptions for the identical plan and interval
    const currentSubscription = await prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    if (
      currentSubscription &&
      currentSubscription.planId === plan.id &&
      currentSubscription.billingInterval === billingInterval &&
      (currentSubscription.status === SubscriptionStatus.ACTIVE ||
        currentSubscription.status === SubscriptionStatus.TRIALING) &&
      !currentSubscription.cancelAtPeriodEnd
    ) {
      throw AppError.conflict(
        'You already have an active subscription for this plan and billing interval'
      );
    }

    // 3. Resolve the configured Stripe Price ID
    if (!priceId) {
      priceId =
        billingInterval === BillingInterval.YEARLY
          ? plan.stripeYearlyPriceId
          : plan.stripeMonthlyPriceId;
    }

    if (!priceId) {
      throw AppError.badRequest(
        `Plan ${plan.name} does not have a configured Stripe price ID for ${billingInterval} billing in environment variables.`
      );
    }

    // 4. Verify Stripe configuration
    if (!isStripeConfigured()) {
      throw AppError.badRequest(
        'Stripe billing is not configured. Missing STRIPE_SECRET_KEY in environment variables.'
      );
    }

    // 5. Retrieve user details
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw AppError.notFound('User not found');
    }

    // 6. Get or create Stripe customer
    let customerId = currentSubscription?.stripeCustomerId;
    if (!customerId) {
      customerId = await StripeService.createOrGetCustomer({
        id: user.id,
        email: user.email,
        name: user.name,
      });

      // Update or create subscription skeleton with customerId
      await prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          planId: plan.id,
          stripeCustomerId: customerId,
          billingInterval,
          status: SubscriptionStatus.INACTIVE,
        },
        update: {
          stripeCustomerId: customerId,
        },
      });
    }

    // 7. Create Stripe checkout session
    const session = await StripeService.createCheckoutSession({
      customerId,
      priceId,
      userId: user.id,
      planId: plan.id,
      billingInterval,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    });

    return {
      checkoutUrl: session.url,
      sessionId: session.id,
    };
  }

  /**
   * Generates a Stripe Customer Billing Portal session URL
   */
  public static async createPortalSession(
    userId: string,
    returnUrl?: string
  ): Promise<{ portalUrl: string }> {
    const prisma = PrismaService.client;

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription?.stripeCustomerId) {
      throw AppError.badRequest(
        'No active billing customer found for this account. You must subscribe to a paid plan first.'
      );
    }

    if (!isStripeConfigured()) {
      throw AppError.badRequest(
        'Stripe billing is not configured. Missing STRIPE_SECRET_KEY in environment variables.'
      );
    }

    const portalSession = await StripeService.createPortalSession(
      subscription.stripeCustomerId,
      returnUrl
    );

    return {
      portalUrl: portalSession.url,
    };
  }

  /**
   * Cancels a subscription at the end of the current billing cycle
   */
  public static async cancelSubscription(userId: string) {
    const prisma = PrismaService.client;

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    if (
      !subscription ||
      !subscription.stripeSubscriptionId ||
      subscription.status !== SubscriptionStatus.ACTIVE
    ) {
      throw AppError.badRequest('No active paid subscription found to cancel.');
    }

    if (subscription.cancelAtPeriodEnd) {
      throw AppError.badRequest(
        'Subscription is already scheduled to cancel at the end of the billing cycle.'
      );
    }

    if (!isStripeConfigured()) {
      throw AppError.badRequest(
        'Stripe billing is not configured. Missing STRIPE_SECRET_KEY in environment variables.'
      );
    }

    // Inform Stripe to cancel at period end
    await StripeService.cancelSubscriptionAtPeriodEnd(subscription.stripeSubscriptionId);

    // Update DB record
    const updatedSubscription = await prisma.subscription.update({
      where: { userId },
      data: {
        cancelAtPeriodEnd: true,
        canceledAt: new Date(),
      },
      include: { plan: true },
    });

    // Notify user of cancellation
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      emailService
        .sendSubscriptionCancellation(user.email, user.name || 'there', {
          planName: updatedSubscription.plan.name,
          accessUntilDate: updatedSubscription.currentPeriodEnd
            ? new Date(updatedSubscription.currentPeriodEnd).toLocaleDateString()
            : undefined,
        })
        .catch(() => { });

      NotificationService.createNotification(userId, {
        type: NotificationType.BILLING,
        title: 'Subscription Cancellation Scheduled',
        message: `Your ${updatedSubscription.plan.name} subscription will remain active until ${updatedSubscription.currentPeriodEnd
          ? new Date(updatedSubscription.currentPeriodEnd).toLocaleDateString()
          : 'period end'
          }.`,
        actionUrl: '/billing',
      }).catch(() => { });
    }

    return updatedSubscription;
  }

  /**
   * Resumes a subscription that was scheduled to cancel at period end
   */
  public static async resumeSubscription(userId: string) {
    const prisma = PrismaService.client;

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    if (
      !subscription ||
      !subscription.stripeSubscriptionId ||
      subscription.status !== SubscriptionStatus.ACTIVE
    ) {
      throw AppError.badRequest('No active subscription found to resume.');
    }

    if (!subscription.cancelAtPeriodEnd) {
      throw AppError.badRequest('Subscription is not scheduled for cancellation.');
    }

    if (!isStripeConfigured()) {
      throw AppError.badRequest(
        'Stripe billing is not configured. Missing STRIPE_SECRET_KEY in environment variables.'
      );
    }

    // Inform Stripe to resume (unset cancel_at_period_end)
    await StripeService.resumeSubscription(subscription.stripeSubscriptionId);

    // Update DB record
    const updatedSubscription = await prisma.subscription.update({
      where: { userId },
      data: {
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
      include: { plan: true },
    });

    NotificationService.createNotification(userId, {
      type: NotificationType.BILLING,
      title: 'Subscription Resumed',
      message: `Your ${updatedSubscription.plan.name} subscription has been resumed and will renew normally.`,
      actionUrl: '/billing',
    }).catch(() => { });

    return updatedSubscription;
  }

  /**
   * Retrieves real invoice history for the user directly from Stripe
   */
  public static async getUserInvoices(userId: string) {
    const prisma = PrismaService.client;

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription?.stripeCustomerId || !isStripeConfigured()) {
      return [];
    }

    const invoices = await StripeService.listInvoices(subscription.stripeCustomerId);

    return invoices.map((inv) => ({
      id: inv.id,
      number: inv.number,
      amountPaid: (inv.amount_paid || 0) / 100,
      amountDue: (inv.amount_due || 0) / 100,
      currency: inv.currency,
      status: inv.status,
      pdfUrl: inv.invoice_pdf || null,
      hostedUrl: inv.hosted_invoice_url || null,
      created: new Date(inv.created * 1000).toISOString(),
      periodStart: inv.period_start ? new Date(inv.period_start * 1000).toISOString() : null,
      periodEnd: inv.period_end ? new Date(inv.period_end * 1000).toISOString() : null,
    }));
  }

  /**
   * Authoritatively synchronizes active subscription state with Stripe
   */
  public static async syncSubscription(userId: string) {
    const prisma = PrismaService.client;

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    if (!subscription || !subscription.stripeSubscriptionId || !isStripeConfigured()) {
      return await BillingService.getUserSubscription(userId);
    }

    try {
      const stripeSub = await StripeService.retrieveSubscription(subscription.stripeSubscriptionId);
      const rawSub = stripeSub as any;
      const mappedStatus = BillingService.mapStripeSubscriptionStatus(stripeSub.status);

      await prisma.subscription.update({
        where: { userId },
        data: {
          status: mappedStatus,
          currentPeriodStart: rawSub.current_period_start ? new Date(rawSub.current_period_start * 1000) : null,
          currentPeriodEnd: rawSub.current_period_end ? new Date(rawSub.current_period_end * 1000) : null,
          cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
          canceledAt: stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null,
        },
      });
    } catch (err) {
      logger.error('syncSubscription Stripe error:', err);
    }

    return await BillingService.getUserSubscription(userId);
  }

  /**
   * Processes incoming Stripe Webhook events with signature verification & idempotency
   */
  public static async handleWebhook(rawBody: Buffer | string, signature: string) {
    // 1. Verify signature and construct event
    const event = StripeService.constructWebhookEvent(rawBody, signature);
    return await BillingService.processStripeEvent(event);
  }

  /**
   * Processes a verified Stripe Event with strict idempotency and audit tracking
   */
  public static async processStripeEvent(event: Stripe.Event) {
    const prisma = PrismaService.client;

    // 1. Idempotency Check: Check if event was already processed
    const existingEvent = await prisma.paymentEvent.findUnique({
      where: { stripeEventId: event.id },
    });

    if (existingEvent && existingEvent.status === PaymentEventStatus.PROCESSED) {
      logger.info(`Stripe webhook event ${event.id} already processed. Skipping.`);
      return { received: true, alreadyProcessed: true, eventId: event.id };
    }

    // 2. Upsert raw event into payment_events table
    await prisma.paymentEvent.upsert({
      where: { stripeEventId: event.id },
      create: {
        stripeEventId: event.id,
        eventType: event.type,
        payload: event as any,
        status: PaymentEventStatus.PENDING,
      },
      update: {
        eventType: event.type,
        payload: event as any,
      },
    });

    try {
      // 3. Dispatch specific event types
      switch (event.type) {
        case 'checkout.session.completed': {
          await BillingService.handleCheckoutSessionCompleted(
            event.data.object as Stripe.Checkout.Session,
            event.id
          );
          break;
        }

        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          await BillingService.handleSubscriptionUpdated(
            event.data.object as Stripe.Subscription
          );
          break;
        }

        case 'customer.subscription.deleted': {
          await BillingService.handleSubscriptionDeleted(
            event.data.object as Stripe.Subscription
          );
          break;
        }

        case 'invoice.paid': {
          await BillingService.handleInvoicePaid(
            event.data.object as Stripe.Invoice,
            event.id
          );
          break;
        }

        case 'invoice.payment_failed': {
          await BillingService.handleInvoicePaymentFailed(
            event.data.object as Stripe.Invoice
          );
          break;
        }

        default: {
          logger.info(`Unhandled Stripe webhook event type: ${event.type}`);
          await prisma.paymentEvent.update({
            where: { stripeEventId: event.id },
            data: { status: PaymentEventStatus.IGNORED },
          });
          return { received: true, ignored: true, eventId: event.id };
        }
      }

      // 4. Mark payment event as PROCESSED
      await prisma.paymentEvent.update({
        where: { stripeEventId: event.id },
        data: {
          status: PaymentEventStatus.PROCESSED,
          processedAt: new Date(),
          processingError: null,
        },
      });

      return { received: true, status: 'PROCESSED', eventId: event.id };
    } catch (error: any) {
      logger.error(`Error processing Stripe event ${event.id}:`, error);

      await prisma.paymentEvent.update({
        where: { stripeEventId: event.id },
        data: {
          status: PaymentEventStatus.FAILED,
          processingError: error?.message || 'Unknown processing error',
        },
      });

      throw error;
    }
  }

  /**
   * Internal Handler: checkout.session.completed
   */
  private static async handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
    eventId: string
  ): Promise<void> {
    const prisma = PrismaService.client;

    if (session.mode !== 'subscription' || !session.subscription) {
      return;
    }

    const customerId = session.customer as string;
    const subscriptionId = session.subscription as string;
    const userId = session.metadata?.userId || session.client_reference_id;
    const planId = session.metadata?.planId;
    const billingInterval =
      (session.metadata?.billingInterval as BillingInterval) || BillingInterval.MONTHLY;

    if (!userId || !planId) {
      logger.warn(`checkout.session.completed missing userId or planId in metadata. Event ID: ${eventId}`);
      return;
    }

    // Retrieve full subscription details from Stripe to get period bounds & price
    let periodStart = new Date();
    let periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    let priceId: string | null = null;

    try {
      const stripeSub = await StripeService.retrieveSubscription(subscriptionId);
      const rawSub = stripeSub as any;
      if (rawSub.current_period_start) {
        periodStart = new Date(rawSub.current_period_start * 1000);
      }
      if (rawSub.current_period_end) {
        periodEnd = new Date(rawSub.current_period_end * 1000);
      }
      priceId = stripeSub.items?.data[0]?.price?.id || null;
    } catch (err) {
      logger.warn('Could not fetch full subscription from Stripe, using estimated dates:', err);
    }

    // Synchronize Subscription record in database
    await prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        planId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: priceId,
        billingInterval,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      },
      update: {
        planId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: priceId,
        billingInterval,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
    });

    // Grant initial plan credit allowance idempotently
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (plan && plan.monthlyCredits > 0) {
      const existingGrant = await prisma.creditLedger.findFirst({
        where: {
          userId,
          referenceId: eventId,
        },
      });

      if (!existingGrant) {
        const lastLedger = await prisma.creditLedger.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });
        const currentBalance = lastLedger ? lastLedger.balanceAfter : 0;
        const newBalance = currentBalance + plan.monthlyCredits;

        await prisma.creditLedger.create({
          data: {
            userId,
            amount: plan.monthlyCredits,
            balanceAfter: newBalance,
            type: CreditTransactionType.GRANT,
            reason: `Subscription activated: ${plan.name} allowance`,
            referenceId: eventId,
            billingPeriod: new Date().toISOString().substring(0, 7),
          },
        });

        // In-app Notification & Confirmation Email
        NotificationService.createNotification(userId, {
          type: NotificationType.BILLING,
          title: 'Subscription Activated',
          message: `Your ${plan.name} plan is now active! ${plan.monthlyCredits} credits have been added to your balance.`,
          actionUrl: '/billing',
        }).catch(() => { });

        const subscriber = await prisma.user.findUnique({ where: { id: userId } });
        if (subscriber) {
          emailService
            .sendSubscriptionConfirmation(subscriber.email, subscriber.name || 'there', {
              planName: plan.name,
              monthlyCredits: plan.monthlyCredits,
              billingInterval,
              nextBillingDate: periodEnd.toLocaleDateString(),
              dashboardUrl: `${env.CLIENT_URL}/dashboard`,
            })
            .catch(() => { });
        }
      }
    }
  }

  /**
   * Internal Handler: customer.subscription.created & customer.subscription.updated
   */
  private static async handleSubscriptionUpdated(
    sub: Stripe.Subscription
  ): Promise<void> {
    const prisma = PrismaService.client;
    const status = BillingService.mapStripeSubscriptionStatus(sub.status);
    const customerId = sub.customer as string;
    const subscriptionId = sub.id;
    const rawSub = sub as any;
    const periodStart = rawSub.current_period_start
      ? new Date(rawSub.current_period_start * 1000)
      : undefined;
    const periodEnd = rawSub.current_period_end
      ? new Date(rawSub.current_period_end * 1000)
      : undefined;
    const priceId = sub.items?.data[0]?.price?.id || undefined;
    const cancelAtPeriodEnd = sub.cancel_at_period_end;
    const canceledAt = sub.canceled_at ? new Date(sub.canceled_at * 1000) : null;

    const existingSub = await prisma.subscription.findFirst({
      where: {
        OR: [{ stripeSubscriptionId: subscriptionId }, { stripeCustomerId: customerId }],
      },
    });

    if (existingSub) {
      await prisma.subscription.update({
        where: { id: existingSub.id },
        data: {
          status,
          stripeSubscriptionId: subscriptionId,
          stripePriceId: priceId,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd,
          canceledAt,
        },
      });
    }
  }

  /**
   * Internal Handler: customer.subscription.deleted
   */
  private static async handleSubscriptionDeleted(
    sub: Stripe.Subscription
  ): Promise<void> {
    const prisma = PrismaService.client;

    const existingSub = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId: sub.id },
      include: { plan: true },
    });

    if (existingSub) {
      await prisma.subscription.update({
        where: { id: existingSub.id },
        data: {
          status: SubscriptionStatus.CANCELED,
          cancelAtPeriodEnd: false,
          canceledAt: new Date(),
        },
      });

      await prisma.notification.create({
        data: {
          userId: existingSub.userId,
          type: NotificationType.BILLING,
          title: 'Subscription Ended',
          message: `Your ${existingSub.plan.name} subscription has ended. You can resubscribe at any time.`,
          actionUrl: '/billing',
        },
      });
    }
  }

  /**
   * Internal Handler: invoice.paid
   * Synchronizes active status and refreshes monthly credits upon subscription cycle renewal
   */
  private static async handleInvoicePaid(
    invoice: Stripe.Invoice,
    eventId: string
  ): Promise<void> {
    const prisma = PrismaService.client;

    const subscriptionId = (invoice as any).subscription as string | undefined;
    if (!subscriptionId) {
      return;
    }

    const sub = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
      include: { plan: true },
    });

    if (!sub) {
      return;
    }

    // 1. Ensure status is active
    if (sub.status !== SubscriptionStatus.ACTIVE) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: SubscriptionStatus.ACTIVE },
      });
    }

    // 2. Check if invoice is for a renewal cycle
    if (invoice.billing_reason === 'subscription_cycle') {
      const existingGrant = await prisma.creditLedger.findFirst({
        where: {
          userId: sub.userId,
          referenceId: invoice.id,
        },
      });

      if (!existingGrant && sub.plan.monthlyCredits > 0) {
        const lastLedger = await prisma.creditLedger.findFirst({
          where: { userId: sub.userId },
          orderBy: { createdAt: 'desc' },
        });
        const currentBalance = lastLedger ? lastLedger.balanceAfter : 0;
        const newBalance = currentBalance + sub.plan.monthlyCredits;

        await prisma.creditLedger.create({
          data: {
            userId: sub.userId,
            amount: sub.plan.monthlyCredits,
            balanceAfter: newBalance,
            type: CreditTransactionType.GRANT,
            reason: `Subscription renewal: ${sub.plan.name} monthly credit refresh`,
            referenceId: invoice.id,
            billingPeriod: new Date().toISOString().substring(0, 7),
          },
        });

        await prisma.notification.create({
          data: {
            userId: sub.userId,
            type: NotificationType.CREDIT,
            title: 'Monthly Credits Refreshed',
            message: `${sub.plan.monthlyCredits} credits have been added to your balance for this billing period.`,
            actionUrl: '/billing',
          },
        });
      }
    }
  }

  /**
   * Internal Handler: invoice.payment_failed
   * Synchronizes PAST_DUE status and creates an alert notification
   */
  private static async handleInvoicePaymentFailed(
    invoice: Stripe.Invoice
  ): Promise<void> {
    const prisma = PrismaService.client;

    const subscriptionId = (invoice as any).subscription as string | undefined;
    if (!subscriptionId) {
      return;
    }

    const sub = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
      include: { plan: true },
    });

    if (sub) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: SubscriptionStatus.PAST_DUE },
      });

      await NotificationService.createNotification(sub.userId, {
        type: NotificationType.BILLING,
        title: 'Subscription Payment Failed',
        message:
          'Your recent renewal payment could not be processed. Please update your payment method to keep access to AI Vision Studio.',
        actionUrl: '/billing',
      }).catch(() => { });

      const subscriber = await prisma.user.findUnique({ where: { id: sub.userId } });
      if (subscriber) {
        emailService
          .sendPaymentFailedAlert(subscriber.email, subscriber.name || 'there', {
            planName: sub.plan?.name || 'Subscription',
            updatePaymentUrl: `${env.CLIENT_URL}/billing`,
          })
          .catch(() => { });
      }
    }
  }

  /**
   * Helper: Seeds system default plans if table is empty
   */
  private static async seedDefaultPlans() {
    const prisma = PrismaService.client;

    const defaultPlans = [
      {
        tier: PlanTier.FREE,
        name: 'Starter Free',
        description: 'Explore live multimodal camera and audio intelligence with foundational capabilities.',
        stripeProductId: null,
        stripeMonthlyPriceId: null,
        stripeYearlyPriceId: null,
        monthlyCredits: 100,
        maxSessionDurationSeconds: 1800,
        maxConcurrentSessions: 1,
        supportsVision: true,
        supportsScreenShare: true,
        supportsVoice: true,
        supportsToolCalling: false,
        features: [
          'Live Camera & Screen Sharing',
          'Real-time Audio Transcription',
          'Standard Gemini Flash Model',
          '100 Monthly Credits',
        ],
        isActive: true,
        sortOrder: 1,
      },
      {
        tier: PlanTier.PRO,
        name: 'Professional',
        description: 'Advanced real-time multimodal intelligence, tool execution, and extended session length.',
        stripeProductId: process.env.STRIPE_PRO_PRODUCT_ID || null,
        stripeMonthlyPriceId: process.env.STRIPE_PRO_PRICE_ID || null,
        stripeYearlyPriceId: process.env.STRIPE_PRO_YEARLY_PRICE_ID || null,
        monthlyCredits: 1000,
        maxSessionDurationSeconds: 7200,
        maxConcurrentSessions: 2,
        supportsVision: true,
        supportsScreenShare: true,
        supportsVoice: true,
        supportsToolCalling: true,
        features: [
          'Everything in Free',
          'High-FPS Vision Analysis',
          'Real-time AI Tool Executions',
          'Structured Session Memories',
          'Cloudinary Snapshot Archival',
          '1,000 Monthly Credits',
        ],
        isActive: true,
        sortOrder: 2,
      },
      {
        tier: PlanTier.BUSINESS,
        name: 'Business Team',
        description: 'High-throughput multimodal AI workspace for engineering, design, and collaborative teams.',
        stripeProductId: process.env.STRIPE_BUSINESS_PRODUCT_ID || null,
        stripeMonthlyPriceId: process.env.STRIPE_BUSINESS_PRICE_ID || null,
        stripeYearlyPriceId: process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID || null,
        monthlyCredits: 5000,
        maxSessionDurationSeconds: 14400,
        maxConcurrentSessions: 5,
        supportsVision: true,
        supportsScreenShare: true,
        supportsVoice: true,
        supportsToolCalling: true,
        features: [
          'Everything in Pro',
          'Priority Gemini Live Processing',
          '5 Concurrent Sessions',
          'Automated Executive Meeting Summaries',
          'Team Transcript & Insight Exports',
          '5,000 Monthly Credits',
        ],
        isActive: true,
        sortOrder: 3,
      },
      {
        tier: PlanTier.ENTERPRISE,
        name: 'Enterprise Scale',
        description: 'Custom multimodal pipelines, dedicated concurrency, and tailored credit allowances.',
        stripeProductId: process.env.STRIPE_ENTERPRISE_PRODUCT_ID || null,
        stripeMonthlyPriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || null,
        stripeYearlyPriceId: process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID || null,
        monthlyCredits: 25000,
        maxSessionDurationSeconds: 28800,
        maxConcurrentSessions: 10,
        supportsVision: true,
        supportsScreenShare: true,
        supportsVoice: true,
        supportsToolCalling: true,
        features: [
          'Unlimited Duration Sessions',
          '10 Concurrent Multimodal Channels',
          'Dedicated RPC Pipeline',
          'Custom Tool Integrations',
          '25,000 Monthly Credits',
        ],
        isActive: true,
        sortOrder: 4,
      },
    ];

    for (const plan of defaultPlans) {
      await prisma.plan.upsert({
        where: { tier: plan.tier },
        update: plan,
        create: plan,
      });
    }

    return await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }
}
