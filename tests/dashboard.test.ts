import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { PrismaService } from '../src/services/prisma.service.js';
import { generateAccessToken } from '../src/utils/token.js';
import { PlanTier, SessionMode, SessionStatus, CreditTransactionType } from '@prisma/client';

describe('Dashboard Metrics & Aggregation Suite', () => {
  const app = createApp();

  const testUserEmail = `dash_user_${Date.now()}@example.com`;
  let testUserId: string;
  let testAuthToken: string;

  before(async () => {
    await PrismaService.pingDatabase();

    // Create a real test user in PostgreSQL
    const user = await PrismaService.client.user.create({
      data: {
        email: testUserEmail,
        name: 'Alex Rivera',
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
            billingPeriod: '2026-11',
          },
        },
      },
    });

    testUserId = user.id;

    // Create test AI Session and Snapshot
    await PrismaService.client.aISession.create({
      data: {
        userId: testUserId,
        title: 'Realtime Architecture Review',
        mode: SessionMode.COMBINED_MULTIMODAL,
        status: SessionStatus.COMPLETED,
        durationSeconds: 360,
        creditsConsumed: 5,
        snapshots: {
          create: {
            userId: testUserId,
            cloudinaryUrl: 'https://res.cloudinary.com/test/image/upload/v1/snapshot.jpg',
            cloudinaryPublicId: 'snapshots/test_1',
            description: 'Architecture diagram frame analysis',
          },
        },
        insights: {
          create: {
            userId: testUserId,
            title: 'Latency Bottleneck Identified',
            content: 'Audio buffer latency reduced to 18ms using PCM 24kHz worklet.',
            category: 'PERFORMANCE',
            source: 'gemini-2.0-flash-exp',
          },
        },
      },
    });

    // Record credit usage for session
    await PrismaService.client.creditLedger.create({
      data: {
        userId: testUserId,
        amount: -5,
        balanceAfter: 95,
        type: CreditTransactionType.USAGE,
        reason: 'Session: Realtime Architecture Review',
        billingPeriod: '2026-11',
      },
    });

    testAuthToken = generateAccessToken({
      sub: testUserId,
      email: testUserEmail,
      role: 'USER',
    });
  });

  after(async () => {
    try {
      if (testUserId) {
        await PrismaService.client.user.delete({
          where: { id: testUserId },
        });
      }
    } catch {
      // Ignore cleanup error
    }
  });

  it('rejects unauthenticated request to /api/v1/dashboard/summary with 401', async () => {
    const res = await request(app).get('/api/v1/dashboard/summary');
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  it('returns comprehensive aggregated real database metrics for authenticated user', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${testAuthToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data);

    const data = res.body.data;

    // Verify user information
    assert.equal(data.user.id, testUserId);
    assert.equal(data.user.email, testUserEmail);
    assert.equal(data.user.name, 'Alex Rivera');
    assert.equal(data.user.role, 'USER');

    // Verify real credit calculation
    assert.equal(data.credits.currentBalance, 95);
    assert.equal(data.credits.planAllowance, 100);
    assert.equal(data.credits.consumedThisPeriod, 5);
    assert.equal(data.credits.remainingCredits, 95);
    assert.equal(data.credits.usagePercentage, 5);
    assert.ok(data.credits.billingPeriod);
    assert.ok(data.credits.resetDate);

    // Verify KPIs
    assert.equal(data.kpis.totalSessions, 1);
    assert.equal(data.kpis.totalDurationSeconds, 360);
    assert.equal(data.kpis.totalDurationMinutes, 6);
    assert.equal(data.kpis.savedInsightsCount, 1);
    assert.equal(data.kpis.snapshotsCount, 1);

    // Verify 14-day activity trends
    assert.equal(data.sessionActivity.length, 14);
    const totalActivitySessions = data.sessionActivity.reduce(
      (acc: number, cur: { sessions: number }) => acc + cur.sessions,
      0
    );
    assert.equal(totalActivitySessions, 1);

    // Verify mode distribution
    assert.equal(data.modeDistribution.length, 4);
    const multimodalMode = data.modeDistribution.find(
      (m: { mode: string }) => m.mode === SessionMode.COMBINED_MULTIMODAL
    );
    assert.ok(multimodalMode);
    assert.equal(multimodalMode.count, 1);
    assert.equal(multimodalMode.percentage, 100);

    // Verify recent lists
    assert.equal(data.recentSessions.length, 1);
    assert.equal(data.recentSessions[0].title, 'Realtime Architecture Review');
    assert.equal(data.recentInsights.length, 1);
    assert.equal(data.recentInsights[0].title, 'Latency Bottleneck Identified');
    assert.equal(data.recentSnapshots.length, 1);
    assert.ok(data.recentSnapshots[0].cloudinaryUrl);

    // Verify activity feed has 2 entries (welcome bonus + session deduction)
    assert.equal(data.recentActivity.length, 2);
  });
});
