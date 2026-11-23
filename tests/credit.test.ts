import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { PrismaService } from '../src/services/prisma.service.js';
import { CreditService } from '../src/services/credit.service.js';
import { generateAccessToken } from '../src/utils/token.js';
import {
  CreditFeatureType,
  CreditTransactionType,
  PlanTier,
  ReservationStatus,
} from '@prisma/client';

describe('Credit Engine & Metering Infrastructure Suite', () => {
  const app = createApp();

  const testUserEmail = `credit_user_${Date.now()}@example.com`;
  let testUserId: string;
  let testAuthToken: string;

  before(async () => {
    await PrismaService.pingDatabase();

    // 1. Create a clean test user with 100 starter credits
    const user = await PrismaService.client.user.create({
      data: {
        email: testUserEmail,
        name: 'Morgan Credits',
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
            billingPeriod: CreditService.getCurrentBillingPeriod(),
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
        await PrismaService.client.creditReservation.deleteMany({
          where: { userId: testUserId },
        });
        await PrismaService.client.creditUsage.deleteMany({
          where: { userId: testUserId },
        });
        await PrismaService.client.creditLedger.deleteMany({
          where: { userId: testUserId },
        });
        await PrismaService.client.user.delete({
          where: { id: testUserId },
        });
      }
    } catch {
      // Ignore cleanup error
    }
  });

  describe('1. Transparent Credit Policy & Plan Allowance APIs', () => {
    it('returns official credit pricing schedule on /api/v1/credits/policy', async () => {
      const res = await request(app).get('/api/v1/credits/policy');

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data.features));
      assert.ok(res.body.data.features.length >= 6);

      const streamRule = res.body.data.features.find(
        (f: any) => f.feature === CreditFeatureType.MULTIMODAL_STREAM
      );
      assert.ok(streamRule);
      assert.equal(streamRule.baseCredits, 1);
      assert.ok(res.body.data.modelMultipliers);
    });

    it('returns authoritative initial balance and empty escrow', async () => {
      const res = await request(app)
        .get('/api/v1/credits/balance')
        .set('Authorization', `Bearer ${testAuthToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.totalBalance, 100);
      assert.equal(res.body.data.availableBalance, 100);
      assert.equal(res.body.data.reservedCredits, 0);
      assert.equal(res.body.data.isExhausted, false);
    });

    it('returns plan allowance and feature capability entitlements', async () => {
      const res = await request(app)
        .get('/api/v1/credits/plan-allowance')
        .set('Authorization', `Bearer ${testAuthToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.tier, PlanTier.FREE);
      assert.equal(res.body.data.monthlyCredits, 100);
      assert.equal(res.body.data.currentBalance, 100);
      assert.ok(res.body.data.billingPeriod);
      assert.ok(res.body.data.resetDate);
    });
  });

  describe('2. Credit Consumption, Running Balance & Audit Logging', () => {
    const testRefId = `req_consume_${Date.now()}`;

    it('deducts credits transactionally and records auditable ledger and usage entries', async () => {
      const res = await request(app)
        .post('/api/v1/credits/consume')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({
          amount: 5,
          feature: CreditFeatureType.MULTIMODAL_STREAM,
          durationSeconds: 300,
          reason: 'Live camera stream: 5 minutes',
          referenceId: testRefId,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.creditsDeducted, 5);
      assert.equal(res.body.data.balanceAfter, 95);
      assert.equal(res.body.data.availableBalance, 95);

      // Verify persisted running balance in CreditLedger
      const latestLedger = await PrismaService.client.creditLedger.findFirst({
        where: { userId: testUserId },
        orderBy: { createdAt: 'desc' },
      });
      assert.ok(latestLedger);
      assert.equal(latestLedger.amount, -5);
      assert.equal(latestLedger.balanceAfter, 95);
      assert.equal(latestLedger.type, CreditTransactionType.USAGE);

      // Verify persisted CreditUsage record
      const usage = await PrismaService.client.creditUsage.findFirst({
        where: { userId: testUserId },
        orderBy: { createdAt: 'desc' },
      });
      assert.ok(usage);
      assert.equal(usage.creditsDeducted, 5);
      assert.equal(usage.feature, CreditFeatureType.MULTIMODAL_STREAM);
      assert.equal(usage.durationSeconds, 300);
    });

    it('intercepts duplicate usage request with same referenceId without double deducting', async () => {
      const res = await request(app)
        .post('/api/v1/credits/consume')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({
          amount: 5,
          feature: CreditFeatureType.MULTIMODAL_STREAM,
          durationSeconds: 300,
          reason: 'Duplicate call retry',
          referenceId: testRefId,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.alreadyProcessed, true);

      // Balance must remain strictly 95
      const balance = await CreditService.getBalance(testUserId);
      assert.equal(balance.totalBalance, 95);
      assert.equal(balance.availableBalance, 95);
    });

    it('rejects credit consumption exceeding available balance with 402 Payment Required', async () => {
      const res = await request(app)
        .post('/api/v1/credits/consume')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({
          amount: 500, // Available is only 95
          feature: CreditFeatureType.MULTIMODAL_STREAM,
          reason: 'Excessive duration attempt',
        });

      assert.equal(res.status, 402);
      assert.ok(res.body.error.message.includes('Insufficient credit balance'));

      // Confirm no ledger mutation occurred
      const balance = await CreditService.getBalance(testUserId);
      assert.equal(balance.availableBalance, 95);
    });
  });

  describe('3. Usage Reservation Lifecycle (Hold, Double-Spend Prevention, Settlement & Release)', () => {
    let activeReservationId: string;

    it('creates a reservation hold and reduces available balance while preserving total balance', async () => {
      const res = await request(app)
        .post('/api/v1/credits/reserve')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({
          amount: 20,
          feature: CreditFeatureType.MULTIMODAL_STREAM,
          ttlSeconds: 600,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.amount, 20);
      assert.equal(res.body.data.status, 'PENDING');
      assert.equal(res.body.data.availableBalance, 75); // 95 - 20
      assert.equal(res.body.data.reservedCredits, 20);

      activeReservationId = res.body.data.reservationId;
      assert.ok(activeReservationId);

      // Verify getBalance reflects escrow
      const balance = await CreditService.getBalance(testUserId);
      assert.equal(balance.totalBalance, 95);
      assert.equal(balance.reservedCredits, 20);
      assert.equal(balance.availableBalance, 75);
    });

    it('prevents double spending: cannot reserve more than available balance', async () => {
      const res = await request(app)
        .post('/api/v1/credits/reserve')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({
          amount: 80, // Available is 75 (95 total - 20 held)
          feature: CreditFeatureType.MULTIMODAL_STREAM,
        });

      assert.equal(res.status, 402);
      assert.ok(res.body.error.message.includes('Insufficient available credits'));
    });

    it('settles reservation hold with actual measured activity and adjusts balance', async () => {
      const res = await request(app)
        .post('/api/v1/credits/settle')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({
          reservationId: activeReservationId,
          actualAmount: 12, // Held 20, actual used is 12
          durationSeconds: 720,
          reason: 'Session concluded: 12 min elapsed',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'SETTLED');
      assert.equal(res.body.data.heldAmount, 20);
      assert.equal(res.body.data.settledAmount, 12);
      assert.equal(res.body.data.balanceAfter, 83); // 95 - 12 = 83
      assert.equal(res.body.data.availableBalance, 83);

      // Verify reservation updated to SETTLED in DB
      const resRecord = await PrismaService.client.creditReservation.findUnique({
        where: { id: activeReservationId },
      });
      assert.ok(resRecord);
      assert.equal(resRecord.status, ReservationStatus.SETTLED);
      assert.equal(resRecord.settledAmount, 12);

      // Escrow hold should now be 0
      const balance = await CreditService.getBalance(testUserId);
      assert.equal(balance.totalBalance, 83);
      assert.equal(balance.reservedCredits, 0);
      assert.equal(balance.availableBalance, 83);
    });

    it('releases/cancels unconsumed reservation hold back to available balance', async () => {
      // 1. Create a 15-credit hold
      const reserveRes = await request(app)
        .post('/api/v1/credits/reserve')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({
          amount: 15,
          feature: CreditFeatureType.MULTIMODAL_STREAM,
        });

      assert.equal(reserveRes.status, 200);
      const resId = reserveRes.body.data.reservationId;
      assert.equal(reserveRes.body.data.availableBalance, 68); // 83 - 15

      // 2. Cancel/Release the hold
      const releaseRes = await request(app)
        .post('/api/v1/credits/release')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({
          reservationId: resId,
          reason: 'User disconnected before stream started',
        });

      assert.equal(releaseRes.status, 200);
      assert.equal(releaseRes.body.data.status, 'RELEASED');
      assert.equal(releaseRes.body.data.availableBalance, 83); // 15 restored

      const balance = await CreditService.getBalance(testUserId);
      assert.equal(balance.totalBalance, 83);
      assert.equal(balance.reservedCredits, 0);
      assert.equal(balance.availableBalance, 83);
    });
  });

  describe('4. Administrative Grants, Refunds, Adjustments & Concurrency Control', () => {
    it('grants credits idempotently using referenceId to prevent double grants', async () => {
      const grantRef = `stripe_evt_${Date.now()}`;

      // First grant
      const firstResult = await CreditService.grantCredits({
        userId: testUserId,
        amount: 50,
        type: 'GRANT',
        reason: 'Monthly allowance top-up',
        referenceId: grantRef,
      });

      assert.equal(firstResult.amount, 50);
      assert.equal(firstResult.balanceAfter, 133); // 83 + 50

      // Replay identical grant
      const replayResult = await CreditService.grantCredits({
        userId: testUserId,
        amount: 50,
        type: 'GRANT',
        reason: 'Monthly allowance top-up',
        referenceId: grantRef,
      });

      assert.equal(replayResult.alreadyProcessed, true);

      // Verify balance was not incremented twice
      const balance = await CreditService.getBalance(testUserId);
      assert.equal(balance.totalBalance, 133);
    });

    it('refunds consumed credits and accurately increments balance', async () => {
      const refundResult = await CreditService.refundCredits({
        userId: testUserId,
        amount: 10,
        reason: 'Service disruption goodwill refund',
      });

      assert.equal(refundResult.amount, 10);
      assert.equal(refundResult.balanceAfter, 143); // 133 + 10
    });

    it('adjusts balance and prevents negative balance adjustments', async () => {
      // 1. Valid adjustment (-20)
      const adjResult = await CreditService.adjustCredits({
        userId: testUserId,
        amount: -20,
        reason: 'Manual adjustment',
      });
      assert.equal(adjResult.balanceAfter, 123); // 143 - 20

      // 2. Reject negative adjustment that would violate balance floor
      await assert.rejects(
        async () => {
          await CreditService.adjustCredits({
            userId: testUserId,
            amount: -500, // Balance is 123
            reason: 'Excessive downward adjustment',
          });
        },
        (err: any) => err.statusCode === 400 && err.message.includes('negative credit balance')
      );

      const balance = await CreditService.getBalance(testUserId);
      assert.equal(balance.totalBalance, 123);
    });

    it('handles concurrent deductions sequentially without corrupting running balance', async () => {
      // Concurrently fire 5 deduction requests of 10 credits each (total 50)
      const tasks = Array.from({ length: 5 }).map((_, i) =>
        CreditService.consumeCredits(testUserId, {
          amount: 10,
          feature: CreditFeatureType.MULTIMODAL_STREAM,
          reason: `Concurrent session chunk #${i}`,
        })
      );

      const results = await Promise.all(tasks);
      assert.equal(results.length, 5);

      // Expected final balance: 123 - 50 = 73
      const balance = await CreditService.getBalance(testUserId);
      assert.equal(balance.totalBalance, 73);
      assert.equal(balance.availableBalance, 73);
    });
  });

  describe('5. Server-Side Entitlement & Plan Limitation Enforcement', () => {
    it('blocks unentitled tool calling on FREE plan tier with 403 Forbidden', async () => {
      // Test user is on FREE plan (supportsToolCalling: false)
      const res = await request(app)
        .post('/api/v1/credits/consume')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({
          amount: 1,
          feature: CreditFeatureType.TOOL_EXECUTION,
          reason: 'Execute python script',
        });

      assert.equal(res.status, 403);
      assert.ok(
        res.body.error.message.includes('Autonomous AI tool execution is not enabled on your plan')
      );
    });
  });

  describe('6. Ledger History, Usage Querying & Consumption Analytics', () => {
    it('returns paginated ledger transactions with running balance snapshots', async () => {
      const res = await request(app)
        .get('/api/v1/credits/ledger?page=1&limit=10')
        .set('Authorization', `Bearer ${testAuthToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data.items));
      assert.ok(res.body.data.items.length > 0);
      assert.ok(res.body.data.total > 0);
      assert.equal(res.body.data.page, 1);
    });

    it('returns paginated activity consumption usage records', async () => {
      const res = await request(app)
        .get('/api/v1/credits/usage?page=1&limit=10')
        .set('Authorization', `Bearer ${testAuthToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data.items));
      assert.ok(res.body.data.items.length > 0);
    });

    it('returns aggregated analytics breakdown by feature for current billing period', async () => {
      const res = await request(app)
        .get('/api/v1/credits/analytics')
        .set('Authorization', `Bearer ${testAuthToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data.featureBreakdown));
      assert.ok(res.body.data.totalCreditsConsumed > 0);
      assert.ok(Array.isArray(res.body.data.dailyTrend));
    });
  });

  describe('7. Real-time Server-Sent Events (SSE) Stream', () => {
    it('establishes SSE stream connection and streams initial balance state', async () => {
      const server = app.listen(0);
      const address = server.address() as any;
      const port = address.port;

      const abortController = new AbortController();

      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/v1/credits/stream`, {
          headers: {
            Authorization: `Bearer ${testAuthToken}`,
          },
          signal: abortController.signal,
        });

        assert.equal(response.status, 200);
        assert.ok(response.headers.get('content-type')?.includes('text/event-stream'));

        const reader = response.body?.getReader();
        assert.ok(reader);

        const decoder = new TextDecoder();
        let received = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          received += decoder.decode(value, { stream: true });
          if (received.includes('event: initial_state')) {
            assert.ok(received.includes('totalBalance'));
            break;
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          throw err;
        }
      } finally {
        abortController.abort();
        server.close();
      }
    });
  });
});
