import { Request, Response, NextFunction } from 'express';
import { BillingService } from '../services/billing.service.js';
import { sendSuccess } from '../utils/response.js';
import { AppError } from '../utils/appError.js';
import { logger } from '../utils/logger.js';

export class BillingController {
  /**
   * GET /api/v1/billing/plans
   * Returns active plans with live Stripe pricing
   */
  public static async getPlans(
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const plans = await BillingService.getPlans();
      sendSuccess(res, plans, 'Billing plans retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/billing/subscription
   * Returns authenticated user's current subscription & credit balance
   */
  public static async getSubscription(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw AppError.unauthorized('Authentication required to access subscription details');
      }

      const subscription = await BillingService.getUserSubscription(req.user.id);
      sendSuccess(res, subscription, 'User subscription retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/billing/checkout
   * Creates a hosted Stripe checkout session
   */
  public static async createCheckout(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw AppError.unauthorized('Authentication required to create a checkout session');
      }

      const result = await BillingService.createCheckoutSession(req.user.id, req.body);
      sendSuccess(res, result, 'Checkout session created successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/billing/portal
   * Creates a Stripe customer billing portal session
   */
  public static async createPortal(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw AppError.unauthorized('Authentication required to access billing portal');
      }

      const result = await BillingService.createPortalSession(
        req.user.id,
        req.body?.returnUrl
      );
      sendSuccess(res, result, 'Billing portal session created successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/billing/cancel
   * Schedules subscription cancellation at end of period
   */
  public static async cancelSubscription(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw AppError.unauthorized('Authentication required to cancel subscription');
      }

      const updatedSubscription = await BillingService.cancelSubscription(req.user.id);
      sendSuccess(
        res,
        updatedSubscription,
        'Subscription scheduled for cancellation at the end of the billing cycle'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/billing/resume
   * Resumes a subscription that was scheduled to cancel at period end
   */
  public static async resumeSubscription(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw AppError.unauthorized('Authentication required to resume subscription');
      }

      const updatedSubscription = await BillingService.resumeSubscription(req.user.id);
      sendSuccess(
        res,
        updatedSubscription,
        'Subscription resumed successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/billing/invoices
   * Returns authentic invoice history from Stripe for the authenticated user
   */
  public static async getInvoices(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw AppError.unauthorized('Authentication required to view billing invoices');
      }

      const invoices = await BillingService.getUserInvoices(req.user.id);
      sendSuccess(res, invoices, 'Invoices retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/billing/sync
   * Authoritatively synchronizes subscription state with Stripe
   */
  public static async syncSubscription(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw AppError.unauthorized('Authentication required to sync subscription');
      }

      const subscription = await BillingService.syncSubscription(req.user.id);
      sendSuccess(res, subscription, 'Subscription synchronized with Stripe');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/billing/webhook
   * Receives and verifies signed Stripe events
   */
  public static async handleWebhook(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const signature = req.headers['stripe-signature'] as string | undefined;

      if (!signature) {
        throw AppError.badRequest('Missing Stripe signature header (stripe-signature)');
      }

      const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));

      const result = await BillingService.handleWebhook(rawBody, signature);
      res.status(200).json(result);
    } catch (error: any) {
      logger.error('BillingController handleWebhook error:', error);
      next(error);
    }
  }
}
