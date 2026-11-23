import Stripe from 'stripe';
import { getStripeClient, isStripeConfigured } from '../config/stripe.config.js';
import { env } from '../config/env.config.js';
import { AppError } from '../utils/appError.js';
import { logger } from '../utils/logger.js';
import { BillingInterval } from '@prisma/client';

export interface RetrievedPrice {
  id: string;
  unitAmount: number | null; // In cents/smallest currency unit
  amountDollars: number | null;
  currency: string;
  interval: string | null;
  intervalCount: number;
  active: boolean;
}

export class StripeService {
  /**
   * Retrieves price metadata and amounts directly from Stripe
   */
  public static async retrievePrice(priceId: string): Promise<RetrievedPrice | null> {
    if (!isStripeConfigured() || !priceId) {
      return null;
    }

    try {
      const stripe = getStripeClient();
      const price = await stripe.prices.retrieve(priceId);

      return {
        id: price.id,
        unitAmount: price.unit_amount,
        amountDollars: price.unit_amount !== null ? price.unit_amount / 100 : null,
        currency: price.currency,
        interval: price.recurring?.interval || null,
        intervalCount: price.recurring?.interval_count || 1,
        active: price.active,
      };
    } catch (error) {
      logger.warn(`Failed to retrieve price ${priceId} from Stripe:`, error);
      return null;
    }
  }

  /**
   * Creates or retrieves a Stripe customer for an existing user account
   */
  public static async createOrGetCustomer(user: {
    id: string;
    email: string;
    name?: string | null;
  }): Promise<string> {
    const stripe = getStripeClient();

    try {
      // 1. Check if customer already exists by email search
      const existingCustomers = await stripe.customers.list({
        email: user.email.toLowerCase().trim(),
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        const customer = existingCustomers.data[0];
        // Ensure metadata has userId
        if (!customer.metadata?.userId) {
          await stripe.customers.update(customer.id, {
            metadata: { userId: user.id },
          });
        }
        return customer.id;
      }

      // 2. Create customer if not found
      const newCustomer = await stripe.customers.create({
        email: user.email.toLowerCase().trim(),
        name: user.name || undefined,
        metadata: {
          userId: user.id,
          source: 'AI Vision Studio',
        },
      });

      logger.info(`Created new Stripe customer ${newCustomer.id} for user ${user.id}`);
      return newCustomer.id;
    } catch (error) {
      logger.error('Error in createOrGetCustomer:', error);
      throw AppError.internal('Failed to synchronize billing customer with payment provider');
    }
  }

  /**
   * Creates a hosted Stripe Checkout Session for subscription purchase
   */
  public static async createCheckoutSession(params: {
    customerId: string;
    priceId: string;
    userId: string;
    planId: string;
    billingInterval: BillingInterval;
    successUrl?: string;
    cancelUrl?: string;
  }): Promise<Stripe.Checkout.Session> {
    const stripe = getStripeClient();

    const clientUrl = env.CLIENT_URL.replace(/\/$/, '');
    const successUrl =
      params.successUrl ||
      `${clientUrl}/billing?session_id={CHECKOUT_SESSION_ID}&success=true`;
    const cancelUrl = params.cancelUrl || `${clientUrl}/billing?canceled=true`;

    try {
      const session = await stripe.checkout.sessions.create({
        customer: params.customerId,
        mode: 'subscription',
        line_items: [
          {
            price: params.priceId,
            quantity: 1,
          },
        ],
        subscription_data: {
          metadata: {
            userId: params.userId,
            planId: params.planId,
            billingInterval: params.billingInterval,
          },
        },
        metadata: {
          userId: params.userId,
          planId: params.planId,
          billingInterval: params.billingInterval,
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
      });

      return session;
    } catch (error: any) {
      logger.error('Stripe createCheckoutSession error:', error);
      throw AppError.badRequest(
        `Failed to initialize Stripe checkout session: ${error?.message || 'Unknown provider error'}`
      );
    }
  }

  /**
   * Creates a Stripe Customer Billing Portal Session
   */
  public static async createPortalSession(
    customerId: string,
    returnUrl?: string
  ): Promise<Stripe.BillingPortal.Session> {
    const stripe = getStripeClient();
    const defaultReturnUrl = `${env.CLIENT_URL.replace(/\/$/, '')}/billing`;

    try {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl || defaultReturnUrl,
      });

      return portalSession;
    } catch (error: any) {
      logger.error('Stripe createPortalSession error:', error);
      throw AppError.badRequest(
        `Failed to create customer portal session: ${error?.message || 'Unknown provider error'}`
      );
    }
  }

  /**
   * Sets subscription to cancel at period end
   */
  public static async cancelSubscriptionAtPeriodEnd(
    stripeSubscriptionId: string
  ): Promise<Stripe.Subscription> {
    const stripe = getStripeClient();

    try {
      const updated = await stripe.subscriptions.update(stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      return updated;
    } catch (error: any) {
      logger.error('Stripe cancelSubscriptionAtPeriodEnd error:', error);
      throw AppError.badRequest(
        `Failed to cancel Stripe subscription: ${error?.message || 'Unknown provider error'}`
      );
    }
  }

  /**
   * Resumes a subscription by disabling cancel_at_period_end
   */
  public static async resumeSubscription(
    stripeSubscriptionId: string
  ): Promise<Stripe.Subscription> {
    const stripe = getStripeClient();

    try {
      const updated = await stripe.subscriptions.update(stripeSubscriptionId, {
        cancel_at_period_end: false,
      });

      return updated;
    } catch (error: any) {
      logger.error('Stripe resumeSubscription error:', error);
      throw AppError.badRequest(
        `Failed to resume Stripe subscription: ${error?.message || 'Unknown provider error'}`
      );
    }
  }

  /**
   * Retrieves invoices for a given Stripe customer
   */
  public static async listInvoices(
    stripeCustomerId: string,
    limit: number = 24
  ): Promise<Stripe.Invoice[]> {
    const stripe = getStripeClient();

    try {
      const invoices = await stripe.invoices.list({
        customer: stripeCustomerId,
        limit,
      });

      return invoices.data;
    } catch (error: any) {
      logger.error('Stripe listInvoices error:', error);
      return [];
    }
  }

  /**
   * Retrieves the raw Stripe Subscription object
   */
  public static async retrieveSubscription(
    stripeSubscriptionId: string
  ): Promise<Stripe.Subscription> {
    const stripe = getStripeClient();
    return await stripe.subscriptions.retrieve(stripeSubscriptionId);
  }

  /**
   * Constructs and cryptographically verifies an incoming Stripe Webhook event
   */
  public static constructWebhookEvent(
    rawBody: Buffer | string,
    signature: string
  ): Stripe.Event {
    const stripe = getStripeClient();

    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw AppError.badRequest('STRIPE_WEBHOOK_SECRET is not configured on this server');
    }

    try {
      return stripe.webhooks.constructEvent(
        rawBody,
        signature,
        env.STRIPE_WEBHOOK_SECRET
      );
    } catch (error: any) {
      logger.error('Stripe webhook signature verification failed:', error?.message);
      throw AppError.badRequest(`Webhook signature verification failed: ${error?.message}`);
    }
  }
}
