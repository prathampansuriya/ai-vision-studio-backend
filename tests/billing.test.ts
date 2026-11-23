import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { PrismaService } from '../src/services/prisma.service.js';
import { BillingService } from '../src/services/billing.service.js';
import { generateAccessToken } from '../src/utils/token.js';
import {
  PlanTier,
  BillingInterval,
  SubscriptionStatus,
  CreditTransactionType,
  PaymentEventStatus,
} from '@prisma/client';
import Stripe from 'stripe';

describe('Stripe Billing & Subscription Infrastructure Suite', () => {
  const app = createApp();

  const testUserEmail = `billing_user_${Date.now()}@example.com`;
  let testUserId: string;
  let testAuthToken: string;
  let proPlanId: string;
  let freePlanId: string;

  before(async () => {
    await PrismaService.pingDatabase();

    // 1. Ensure plans are in DB
    const plans = await BillingService.getPlans();
    const proPlan = plans.find((p) => p.tier === PlanTier.PRO);
    const freePlan = plans.find((p) => p.tier === PlanTier.FREE);

    assert.ok(proPlan, 'PRO plan must exist');
    assert.ok(freePlan, 'FREE plan must exist');

    proPlanId = proPlan.id;
    freePlanId = freePlan.id;

    // 2. Create test user with initial credits
    const user = await PrismaService.client.user.create({
      data: {
        email: testUserEmail,
        name: 'Jordan Billing',
        passwordHash: '$2b$12$e8YkYcK012345678901234567890123456789012345678901234',
        emailVerified: true,
        accountStatus: 'ACTIVE',
        role: 'USER',
        profile: {
          create: {
            theme: 'dark',
            preferredLanguage: 'en',
          },
        },
        creditLedgerEntries: {
          create: {
            amount: 100,
            balanceAfter: 100,
            type: CreditTransactionType.GRANT,
            reason: 'Initial Starter Allowance',
            billingPeriod: new Date().toISOString().substring(0, 7),
          },
        },
      },
    });

    testUserId = user.id;

    testAuthToken = generateAccessToken({
      sub: testUserId,
      email: testUserEmail,
      role: 'USER',
    });
  });

  after(async () => {
    try {
      if (testUserId) {
        await PrismaService.client.paymentEvent.deleteMany({
          where: {
            stripeEventId: {
              contains: testUserId,
            },
          },
        });
        await PrismaService.client.user.delete({
          where: { id: testUserId },
        });
      }
    } catch {
      // Ignore cleanup error
    }
  });

  describe('1. Pricing Page Data API (GET /api/v1/billing/plans)', () => {
    it('returns all active plans with correct structure and zero fake prices', async () => {
      const res = await request(app).get('/api/v1/billing/plans');

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length >= 4);

      const tiers = res.body.data.map((p: any) => p.tier);
      assert.ok(tiers.includes('FREE'));
      assert.ok(tiers.includes('PRO'));
      assert.ok(tiers.includes('BUSINESS'));
      assert.ok(tiers.includes('ENTERPRISE'));

      // Validate FREE plan pricing
      const free = res.body.data.find((p: any) => p.tier === 'FREE');
      assert.equal(free.pricing.monthly.amount, 0);
      assert.equal(free.pricing.yearly.amount, 0);
      assert.equal(free.monthlyCredits, 100);

      // Validate PRO plan metadata
      const pro = res.body.data.find((p: any) => p.tier === 'PRO');
      assert.equal(pro.monthlyCredits, 1000);
      assert.ok(Array.isArray(pro.features));
      assert.ok(pro.features.length > 0);
      assert.ok('pricing' in pro);
      assert.ok('monthly' in pro.pricing);
      assert.ok('yearly' in pro.pricing);
    });
  });

  describe('2. User Subscription Details (GET /api/v1/billing/subscription)', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/billing/subscription');
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'UNAUTHORIZED');
    });

    it('returns default active free subscription and credit balance for new user', async () => {
      const res = await request(app)
        .get('/api/v1/billing/subscription')
        .set('Authorization', `Bearer ${testAuthToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.creditBalance, 100);
      assert.equal(res.body.data.plan.tier, PlanTier.FREE);
      assert.equal(res.body.data.status, SubscriptionStatus.ACTIVE);
    });
  });

  describe('3. Checkout Validation & Errors (POST /api/v1/billing/checkout)', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app)
        .post('/api/v1/billing/checkout')
        .send({ planId: proPlanId, billingInterval: 'MONTHLY' });

      assert.equal(res.status, 401);
    });

    it('rejects invalid body format with 422', async () => {
      const res = await request(app)
        .post('/api/v1/billing/checkout')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({ planId: 'not-a-uuid', billingInterval: 'WEEKLY' });

      assert.equal(res.status, 422);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('rejects checkout attempt for FREE plan with 400', async () => {
      const res = await request(app)
        .post('/api/v1/billing/checkout')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({ planId: freePlanId, billingInterval: 'MONTHLY' });

      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('Free plan'));
    });

    it('rejects non-existent plan ID with 404', async () => {
      const nonExistentUuid = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .post('/api/v1/billing/checkout')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({ planId: nonExistentUuid, billingInterval: 'MONTHLY' });

      assert.equal(res.status, 404);
    });

    it('rejects duplicate active checkout for identical plan & interval with 409', async () => {
      // Create an active PRO subscription for this user in DB
      await PrismaService.client.subscription.create({
        data: {
          userId: testUserId,
          planId: proPlanId,
          billingInterval: BillingInterval.MONTHLY,
          status: SubscriptionStatus.ACTIVE,
          stripeCustomerId: `cus_test_${testUserId.substring(0, 8)}`,
          stripeSubscriptionId: `sub_test_${testUserId.substring(0, 8)}`,
        },
      });

      const res = await request(app)
        .post('/api/v1/billing/checkout')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({ planId: proPlanId, billingInterval: 'MONTHLY' });

      assert.equal(res.status, 409);
      assert.ok(res.body.error.message.includes('already have an active subscription'));

      // Clean up test subscription for subsequent tests
      await PrismaService.client.subscription.delete({
        where: { userId: testUserId },
      });
    });
  });

  describe('4. Billing Portal & Cancellation Guardrails', () => {
    it('rejects billing portal request if user has no Stripe customer ID with 400', async () => {
      const res = await request(app)
        .post('/api/v1/billing/portal')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({});

      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('No active billing customer found'));
    });

    it('rejects cancel request if user has no active paid subscription with 400', async () => {
      const res = await request(app)
        .post('/api/v1/billing/cancel')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({});

      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('No active paid subscription found'));
    });
  });

  describe('5. Webhook Signature Verification (POST /api/v1/billing/webhook)', () => {
    it('rejects requests missing stripe-signature header with 400', async () => {
      const res = await request(app)
        .post('/api/v1/billing/webhook')
        .send({ test: true });

      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('Missing Stripe signature header'));
    });
  });

  describe('6. Webhook Idempotency & Lifecycle Event Synchronization', () => {
    const testEventId = `evt_test_checkout_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const testCustomerId = `cus_test_${Date.now()}`;
    const testSubId = `sub_test_${Date.now()}`;

    it('processes checkout.session.completed, activates subscription, and allocates credits idempotently', async () => {
      const mockCheckoutSessionEvent: Stripe.Event = {
        id: testEventId,
        object: 'event',
        api_version: '2025-02-24.acacia' as any,
        created: Math.floor(Date.now() / 1000),
        type: 'checkout.session.completed',
        data: {
          object: {
            id: `cs_test_${Date.now()}`,
            object: 'checkout.session',
            customer: testCustomerId,
            subscription: testSubId,
            mode: 'subscription',
            metadata: {
              userId: testUserId,
              planId: proPlanId,
              billingInterval: 'MONTHLY',
            },
          } as any,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
      };

      // Process event through BillingService
      const result = await BillingService.processStripeEvent(mockCheckoutSessionEvent);
      assert.equal(result.received, true);
      assert.equal(result.status, 'PROCESSED');

      // Verify database record was synchronized
      const subscription = await PrismaService.client.subscription.findUnique({
        where: { userId: testUserId },
      });
      assert.ok(subscription);
      assert.equal(subscription.status, SubscriptionStatus.ACTIVE);
      assert.equal(subscription.stripeCustomerId, testCustomerId);
      assert.equal(subscription.stripeSubscriptionId, testSubId);
      assert.equal(subscription.planId, proPlanId);

      // Verify Credit grant was added (100 starter + 1000 PRO = 1100)
      const lastLedger = await PrismaService.client.creditLedger.findFirst({
        where: { userId: testUserId },
        orderBy: { createdAt: 'desc' },
      });
      assert.ok(lastLedger);
      assert.equal(lastLedger.amount, 1000);
      assert.equal(lastLedger.balanceAfter, 1100);
      assert.equal(lastLedger.referenceId, testEventId);

      // Verify PaymentEvent table recorded the event
      const storedEvent = await PrismaService.client.paymentEvent.findUnique({
        where: { stripeEventId: testEventId },
      });
      assert.ok(storedEvent);
      assert.equal(storedEvent.status, PaymentEventStatus.PROCESSED);

      // Test Webhook Idempotency: replay the same event
      const replayResult = await BillingService.processStripeEvent(mockCheckoutSessionEvent);
      assert.equal(replayResult.alreadyProcessed, true);

      // Verify credits were NOT granted a second time
      const totalGrants = await PrismaService.client.creditLedger.count({
        where: {
          userId: testUserId,
          referenceId: testEventId,
        },
      });
      assert.equal(totalGrants, 1);
    });

    it('synchronizes customer.subscription.updated status to PAST_DUE and back to ACTIVE', async () => {
      // 1. Simulate past due update
      const mockUpdatePastDue: Stripe.Event = {
        id: `evt_test_update_pastdue_${Date.now()}`,
        object: 'event',
        api_version: '2025-02-24.acacia' as any,
        created: Math.floor(Date.now() / 1000),
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: testSubId,
            customer: testCustomerId,
            status: 'past_due',
            cancel_at_period_end: false,
            items: {
              data: [{ price: { id: 'price_test_pro_monthly' } }],
            },
          } as any,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
      };

      await BillingService.processStripeEvent(mockUpdatePastDue);

      let sub = await PrismaService.client.subscription.findUnique({
        where: { userId: testUserId },
      });
      assert.ok(sub);
      assert.equal(sub.status, SubscriptionStatus.PAST_DUE);

      // 2. Simulate return to active
      const mockUpdateActive: Stripe.Event = {
        id: `evt_test_update_active_${Date.now()}`,
        object: 'event',
        api_version: '2025-02-24.acacia' as any,
        created: Math.floor(Date.now() / 1000),
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: testSubId,
            customer: testCustomerId,
            status: 'active',
            cancel_at_period_end: false,
            items: {
              data: [{ price: { id: 'price_test_pro_monthly' } }],
            },
          } as any,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
      };

      await BillingService.processStripeEvent(mockUpdateActive);

      sub = await PrismaService.client.subscription.findUnique({
        where: { userId: testUserId },
      });
      assert.ok(sub);
      assert.equal(sub.status, SubscriptionStatus.ACTIVE);
    });

    it('handles invoice.payment_failed by setting status to PAST_DUE and dispatching notification', async () => {
      const mockPaymentFailedEvent: Stripe.Event = {
        id: `evt_test_failed_${Date.now()}`,
        object: 'event',
        api_version: '2025-02-24.acacia' as any,
        created: Math.floor(Date.now() / 1000),
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: `in_test_fail_${Date.now()}`,
            subscription: testSubId,
            customer: testCustomerId,
            amount_due: 2900,
            currency: 'usd',
          } as any,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
      };

      await BillingService.processStripeEvent(mockPaymentFailedEvent);

      const sub = await PrismaService.client.subscription.findUnique({
        where: { userId: testUserId },
      });
      assert.ok(sub);
      assert.equal(sub.status, SubscriptionStatus.PAST_DUE);

      // Check notification created
      const notification = await PrismaService.client.notification.findFirst({
        where: {
          userId: testUserId,
          title: 'Subscription Payment Failed',
        },
      });
      assert.ok(notification);
    });

    it('handles renewal invoice.paid by refreshing monthly credits', async () => {
      const testInvoiceId = `in_renewal_${Date.now()}`;
      const mockInvoicePaidEvent: Stripe.Event = {
        id: `evt_test_renewal_${Date.now()}`,
        object: 'event',
        api_version: '2025-02-24.acacia' as any,
        created: Math.floor(Date.now() / 1000),
        type: 'invoice.paid',
        data: {
          object: {
            id: testInvoiceId,
            subscription: testSubId,
            customer: testCustomerId,
            billing_reason: 'subscription_cycle',
            amount_paid: 2900,
          } as any,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
      };

      await BillingService.processStripeEvent(mockInvoicePaidEvent);

      // Verify status is active again
      const sub = await PrismaService.client.subscription.findUnique({
        where: { userId: testUserId },
      });
      assert.ok(sub);
      assert.equal(sub.status, SubscriptionStatus.ACTIVE);

      // Verify renewal credits were granted (1100 + 1000 = 2100)
      const renewalLedger = await PrismaService.client.creditLedger.findFirst({
        where: {
          userId: testUserId,
          referenceId: testInvoiceId,
        },
      });
      assert.ok(renewalLedger);
      assert.equal(renewalLedger.amount, 1000);
      assert.equal(renewalLedger.balanceAfter, 2100);
      assert.ok(renewalLedger.reason.includes('Subscription renewal'));
    });

    it('handles customer.subscription.deleted by marking subscription as CANCELED', async () => {
      const mockDeletedEvent: Stripe.Event = {
        id: `evt_test_del_${Date.now()}`,
        object: 'event',
        api_version: '2025-02-24.acacia' as any,
        created: Math.floor(Date.now() / 1000),
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: testSubId,
            customer: testCustomerId,
            status: 'canceled',
          } as any,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
      };

      await BillingService.processStripeEvent(mockDeletedEvent);

      const sub = await PrismaService.client.subscription.findUnique({
        where: { userId: testUserId },
      });
      assert.ok(sub);
      assert.equal(sub.status, SubscriptionStatus.CANCELED);
    });
  });
});
