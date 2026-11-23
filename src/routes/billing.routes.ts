import { Router } from 'express';
import { BillingController } from '../controllers/billing.controller.js';
import { authenticate, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  createCheckoutSessionSchema,
  createPortalSessionSchema,
} from '../validators/billing.validator.js';

const router = Router();

/**
 * @route   GET /api/v1/billing/plans
 * @desc    Get active plans with live Stripe pricing
 * @access  Public
 */
router.get('/plans', BillingController.getPlans);

/**
 * @route   GET /api/v1/billing/subscription
 * @desc    Get current user's active subscription and credit balance
 * @access  Private
 */
router.get('/subscription', authenticate, requireAuth, BillingController.getSubscription);

/**
 * @route   POST /api/v1/billing/checkout
 * @desc    Create a hosted Stripe Checkout session for subscription purchase
 * @access  Private
 */
router.post(
  '/checkout',
  authenticate,
  requireAuth,
  validateBody(createCheckoutSessionSchema),
  BillingController.createCheckout
);

/**
 * @route   POST /api/v1/billing/portal
 * @desc    Create a customer billing portal session to manage subscriptions
 * @access  Private
 */
router.post(
  '/portal',
  authenticate,
  requireAuth,
  validateBody(createPortalSessionSchema),
  BillingController.createPortal
);

/**
 * @route   POST /api/v1/billing/cancel
 * @desc    Schedule subscription cancellation at current billing period end
 * @access  Private
 */
router.post(
  '/cancel',
  authenticate,
  requireAuth,
  BillingController.cancelSubscription
);

/**
 * @route   POST /api/v1/billing/resume
 * @desc    Resume a subscription scheduled for cancellation
 * @access  Private
 */
router.post(
  '/resume',
  authenticate,
  requireAuth,
  BillingController.resumeSubscription
);

/**
 * @route   GET /api/v1/billing/invoices
 * @desc    Get real invoice history from Stripe for the authenticated user
 * @access  Private
 */
router.get(
  '/invoices',
  authenticate,
  requireAuth,
  BillingController.getInvoices
);

/**
 * @route   POST /api/v1/billing/sync
 * @desc    Authoritatively sync subscription state with Stripe
 * @access  Private
 */
router.post(
  '/sync',
  authenticate,
  requireAuth,
  BillingController.syncSubscription
);

/**
 * @route   POST /api/v1/billing/webhook
 * @desc    Stripe webhook endpoint for subscription lifecycle events
 * @access  Public (Cryptographically verified by Stripe signature)
 */
router.post('/webhook', BillingController.handleWebhook);

export const billingRoutes = router;
