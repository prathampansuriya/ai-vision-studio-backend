import { PrismaService } from './prisma.service.js';
import { PlanTier, SessionMode, SessionStatus } from '@prisma/client';

export interface DashboardSummary {
  user: {
    id: string;
    name: string | null;
    email: string;
    role: string;
    createdAt: string;
  };
  credits: {
    currentBalance: number;
    planAllowance: number;
    consumedThisPeriod: number;
    remainingCredits: number;
    usagePercentage: number;
    billingPeriod: string;
    resetDate: string;
    plan: {
      name: string;
      tier: string;
    };
  };
  kpis: {
    totalSessions: number;
    totalDurationSeconds: number;
    totalDurationMinutes: number;
    savedInsightsCount: number;
    snapshotsCount: number;
  };
  sessionActivity: Array<{
    date: string;
    label: string;
    sessions: number;
    durationMinutes: number;
    creditsUsed: number;
  }>;
  modeDistribution: Array<{
    mode: SessionMode;
    label: string;
    count: number;
    percentage: number;
  }>;
  recentSessions: Array<{
    id: string;
    title: string;
    mode: SessionMode;
    status: SessionStatus;
    durationSeconds: number;
    creditsConsumed: number;
    aiModel: string;
    createdAt: string;
  }>;
  recentInsights: Array<{
    id: string;
    title: string;
    content: string;
    category: string | null;
    source: string | null;
    tags: unknown;
    createdAt: string;
  }>;
  recentSnapshots: Array<{
    id: string;
    cloudinaryUrl: string;
    description: string | null;
    aiAnalysis: string | null;
    captureTimestamp: string;
  }>;
  recentActivity: Array<{
    id: string;
    type: 'credit_grant' | 'credit_usage' | 'session' | 'insight';
    title: string;
    description: string;
    timestamp: string;
    amount?: number;
  }>;
}

export class DashboardService {
  /**
   * Retrieves aggregated, real database metrics for the authenticated user.
   * Performs proper relational aggregation without loading the entire DB into memory.
   */
  public static async getDashboardSummary(userId: string): Promise<DashboardSummary> {
    const prisma = PrismaService.client;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthNum = now.getMonth() + 1;
    const currentBillingPeriod = `${currentYear}-${String(currentMonthNum).padStart(2, '0')}`;
    const startOfMonth = new Date(currentYear, now.getMonth(), 1);
    const endOfMonth = new Date(currentYear, now.getMonth() + 1, 0, 23, 59, 59, 999);

    // 1. Fetch User and Active Subscription / Plan
    const [user, subscription] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
      }),
      prisma.subscription.findUnique({
        where: { userId },
        include: { plan: true },
      }),
    ]);

    // 2. Fetch Latest Credit Ledger balance and period deductions
    const [latestLedger, periodDeductionsAgg] = await Promise.all([
      prisma.creditLedger.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { balanceAfter: true },
      }),
      prisma.creditLedger.aggregate({
        where: {
          userId,
          amount: { lt: 0 },
          createdAt: { gte: startOfMonth },
        },
        _sum: { amount: true },
      }),
    ]);

    const currentBalance = latestLedger?.balanceAfter ?? 100;
    const planAllowance = subscription?.plan?.monthlyCredits ?? 100;
    const planName = subscription?.plan?.name ?? 'Free Tier';
    const planTier = subscription?.plan?.tier ?? PlanTier.FREE;
    const consumedThisPeriod = Math.abs(periodDeductionsAgg._sum.amount ?? 0);
    const usagePercentage = Math.min(
      100,
      Math.max(0, Math.round((consumedThisPeriod / planAllowance) * 100))
    );

    const resetDate = subscription?.currentPeriodEnd
      ? subscription.currentPeriodEnd.toISOString()
      : endOfMonth.toISOString();

    // 3. KPI Aggregations
    const [totalSessions, totalDurationAgg, savedInsightsCount, snapshotsCount] = await Promise.all([
      prisma.aISession.count({ where: { userId } }),
      prisma.aISession.aggregate({
        where: { userId },
        _sum: { durationSeconds: true },
      }),
      prisma.savedInsight.count({ where: { userId } }),
      prisma.sessionSnapshot.count({ where: { userId } }),
    ]);

    const totalDurationSeconds = totalDurationAgg._sum.durationSeconds ?? 0;
    const totalDurationMinutes = Math.round(totalDurationSeconds / 60);

    // 4. Session Activity Trends for the last 14 days
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
    fourteenDaysAgo.setHours(0, 0, 0, 0);

    const sessionsLast14Days = await prisma.aISession.findMany({
      where: {
        userId,
        createdAt: { gte: fourteenDaysAgo },
      },
      select: {
        createdAt: true,
        durationSeconds: true,
        creditsConsumed: true,
      },
    });

    // Create a 14-day map for real trend visualization
    const activityMap: Record<
      string,
      { date: string; label: string; sessions: number; durationMinutes: number; creditsUsed: number }
    > = {};

    for (let i = 0; i < 14; i++) {
      const d = new Date(fourteenDaysAgo);
      d.setDate(d.getDate() + i);
      const isoDate = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      activityMap[isoDate] = {
        date: isoDate,
        label,
        sessions: 0,
        durationMinutes: 0,
        creditsUsed: 0,
      };
    }

    const dateKeys = Object.keys(activityMap);
    const latestDateKey = dateKeys[dateKeys.length - 1];

    sessionsLast14Days.forEach((s) => {
      const dateObj = s.createdAt instanceof Date ? s.createdAt : new Date(s.createdAt);
      const isoDate = dateObj.toISOString().split('T')[0];
      const targetKey = activityMap[isoDate] ? isoDate : latestDateKey;
      if (activityMap[targetKey]) {
        activityMap[targetKey].sessions += 1;
        activityMap[targetKey].durationMinutes += Math.round(s.durationSeconds / 60);
        activityMap[targetKey].creditsUsed += s.creditsConsumed;
      }
    });

    const sessionActivity = Object.values(activityMap);

    // 5. Mode Distribution
    const modeCounts = await prisma.aISession.groupBy({
      by: ['mode'],
      where: { userId },
      _count: { _all: true },
    });

    const modeLabels: Record<SessionMode, string> = {
      [SessionMode.COMBINED_MULTIMODAL]: 'Multimodal Studio',
      [SessionMode.LIVE_CAMERA]: 'Live Vision',
      [SessionMode.SCREEN_SHARE]: 'Screen Intelligence',
      [SessionMode.VOICE]: 'Voice Assistant',
      [SessionMode.TEXT]: 'Text Chat',
      [SessionMode.LEARNING]: 'Learning Mode',
      [SessionMode.DEVELOPER]: 'Developer Mode',
      [SessionMode.PRODUCTIVITY]: 'Productivity Mode',
      [SessionMode.LANGUAGE]: 'Language Bridge',
      [SessionMode.MEETING]: 'Meeting Intelligence',
      [SessionMode.VISION]: 'Vision Mode',
      [SessionMode.PRESENTATION]: 'Presentation Mode',
      [SessionMode.CUSTOM]: 'Custom Mode',
    };

    // Modes actually used by the user, ordered by session count descending
    const activeModes = modeCounts
      .filter((item) => item._count._all > 0)
      .sort((a, b) => b._count._all - a._count._all)
      .map((item) => item.mode);

    // Standard fallback modes to ensure a rich breakdown
    const fallbackModes = [
      SessionMode.VISION,
      SessionMode.DEVELOPER,
      SessionMode.PRODUCTIVITY,
      SessionMode.LEARNING,
      SessionMode.COMBINED_MULTIMODAL,
      SessionMode.SCREEN_SHARE,
      SessionMode.LIVE_CAMERA,
      SessionMode.VOICE,
    ];

    // Combine active user modes with defaults, preserving unique items, take top 4 to 6
    const selectedModes = Array.from(new Set([...activeModes, ...fallbackModes])).slice(
      0,
      Math.max(4, Math.min(activeModes.length, 6))
    );

    const modeDistribution = selectedModes.map((m) => {
      const match = modeCounts.find((item) => item.mode === m);
      const count = match?._count._all ?? 0;
      const percentage = totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0;
      return {
        mode: m,
        label: modeLabels[m] || m,
        count,
        percentage,
      };
    });

    // 6. Recent Sessions
    const recentSessionsRaw = await prisma.aISession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        mode: true,
        status: true,
        durationSeconds: true,
        creditsConsumed: true,
        aiModel: true,
        createdAt: true,
      },
    });

    const recentSessions = recentSessionsRaw.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
    }));

    // 7. Recent Insights
    const recentInsightsRaw = await prisma.savedInsight.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 4,
      select: {
        id: true,
        title: true,
        content: true,
        category: true,
        source: true,
        tags: true,
        createdAt: true,
      },
    });

    const recentInsights = recentInsightsRaw.map((ins) => ({
      ...ins,
      createdAt: ins.createdAt.toISOString(),
    }));

    // 8. Recent Snapshots
    const recentSnapshotsRaw = await prisma.sessionSnapshot.findMany({
      where: { userId },
      orderBy: { captureTimestamp: 'desc' },
      take: 4,
      select: {
        id: true,
        cloudinaryUrl: true,
        description: true,
        aiAnalysis: true,
        captureTimestamp: true,
      },
    });

    const recentSnapshots = recentSnapshotsRaw.map((snap) => ({
      ...snap,
      captureTimestamp: snap.captureTimestamp.toISOString(),
    }));

    // 9. Recent Activity Feed (derived from credit ledger and sessions)
    const recentLedger = await prisma.creditLedger.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });

    const recentActivity = recentLedger.map((item) => {
      const isGrant = item.amount > 0;
      return {
        id: item.id,
        type: isGrant ? ('credit_grant' as const) : ('credit_usage' as const),
        title: isGrant ? 'Credit Allocation' : 'Session Credit Usage',
        description: item.reason,
        timestamp: item.createdAt.toISOString(),
        amount: item.amount,
      };
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      },
      credits: {
        currentBalance,
        planAllowance,
        consumedThisPeriod,
        remainingCredits: currentBalance,
        usagePercentage,
        billingPeriod: currentBillingPeriod,
        resetDate,
        plan: {
          name: planName,
          tier: planTier,
        },
      },
      kpis: {
        totalSessions,
        totalDurationSeconds,
        totalDurationMinutes,
        savedInsightsCount,
        snapshotsCount,
      },
      sessionActivity,
      modeDistribution,
      recentSessions,
      recentInsights,
      recentSnapshots,
      recentActivity,
    };
  }
}
