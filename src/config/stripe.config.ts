import Stripe from 'stripe';
import { env } from './env.config.js';
import { AppError } from '../utils/appError.js';
import { PlanTier } from '@prisma/client';

export interface StripePlanEnvConfig {
  productId?: string;
  monthlyPriceId?: string;
  yearlyPriceId?: string;
}

export const stripeConfig = {
  secretKey: env.STRIPE_SECRET_KEY,
  webhookSecret: env.STRIPE_WEBHOOK_SECRET,
  plans: {
    [PlanTier.FREE]: {
      productId: undefined,
      monthlyPriceId: undefined,
      yearlyPriceId: undefined,
    },
    [PlanTier.PRO]: {
      productId: env.STRIPE_PRO_PRODUCT_ID,
      monthlyPriceId: env.STRIPE_PRO_PRICE_ID,
      yearlyPriceId: env.STRIPE_PRO_YEARLY_PRICE_ID,
    },
    [PlanTier.BUSINESS]: {
      productId: env.STRIPE_BUSINESS_PRODUCT_ID,
      monthlyPriceId: env.STRIPE_BUSINESS_PRICE_ID,
      yearlyPriceId: env.STRIPE_BUSINESS_YEARLY_PRICE_ID,
    },
    [PlanTier.ENTERPRISE]: {
      productId: env.STRIPE_ENTERPRISE_PRODUCT_ID,
      monthlyPriceId: env.STRIPE_ENTERPRISE_PRICE_ID,
      yearlyPriceId: env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID,
    },
  } as Record<PlanTier, StripePlanEnvConfig>,
};

let stripeInstance: Stripe | null = null;

/**
 * Returns true if the Stripe secret key is present in environment variables
 */
export function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_SECRET_KEY.trim().length > 0);
}

/**
 * Returns true if the Stripe webhook signing secret is present
 */
export function isStripeWebhookConfigured(): boolean {
  return Boolean(env.STRIPE_WEBHOOK_SECRET && env.STRIPE_WEBHOOK_SECRET.trim().length > 0);
}

/**
 * Returns the singleton Stripe client instance or throws AppError if unconfigured
 */
export function getStripeClient(): Stripe {
  if (!isStripeConfigured()) {
    throw AppError.badRequest(
      'Stripe billing is not configured on this server. Missing STRIPE_SECRET_KEY in environment variables.'
    );
  }

  if (!stripeInstance) {
    stripeInstance = new Stripe(env.STRIPE_SECRET_KEY, {
      typescript: true,
    });
  }

  return stripeInstance;
}

/**
 * Allows overriding the Stripe client instance for testing or mocking
 */
export function setStripeClient(mockClient: Stripe | null): void {
  stripeInstance = mockClient;
}
