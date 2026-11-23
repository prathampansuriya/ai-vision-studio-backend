import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service.js';
import { AppError } from '../utils/appError.js';
import { logger } from '../utils/logger.js';
import {
  CreateInsightInput,
  UpdateInsightInput,
  ListInsightsQuery,
} from '../validators/insight.validator.js';

export interface InsightStats {
  total: number;
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
}

export class InsightService {
  /**
   * Create a new saved insight owned by the user.
   * If sessionId is provided, verifies that the session belongs to the user.
   */
  public static async createInsight(userId: string, input: CreateInsightInput) {
    if (input.sessionId) {
      const session = await PrismaService.client.aISession.findFirst({
        where: { id: input.sessionId, userId },
        select: { id: true, title: true },
      });
      if (!session) {
        throw new AppError('Associated session not found or does not belong to you', 404);
      }
    }

    const insight = await PrismaService.client.savedInsight.create({
      data: {
        userId,
        sessionId: input.sessionId || null,
        title: input.title.trim(),
        content: input.content.trim(),
        category: input.category || 'GENERAL',
        source: input.source || 'manual',
        tags: (input.tags || []) as unknown as Prisma.InputJsonValue,
        metadata: (input.metadata || {}) as unknown as Prisma.InputJsonValue,
      },
      include: {
        session: {
          select: {
            id: true,
            title: true,
            mode: true,
            createdAt: true,
          },
        },
      },
    });

    logger.info('Saved insight created', { userId, insightId: insight.id, category: insight.category });
    return insight;
  }

  /**
   * List saved insights for the user with multi-faceted filtering, searching, and pagination.
   */
  public static async listInsights(userId: string, query: ListInsightsQuery) {
    const {
      page = 1,
      limit = 20,
      category,
      source,
      sessionId,
      tag,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.SavedInsightWhereInput = {
      userId,
    };

    if (category && category !== 'ALL') {
      where.category = category;
    }

    if (source) {
      where.source = source;
    }

    if (sessionId) {
      where.sessionId = sessionId;
    }

    if (search && search.trim().length > 0) {
      const searchTerm = search.trim();
      where.OR = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { content: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    // Tag filtering if provided
    if (tag) {
      where.tags = {
        array_contains: tag,
      } as any;
    }

    const [total, insights] = await Promise.all([
      PrismaService.client.savedInsight.count({ where }),
      PrismaService.client.savedInsight.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          session: {
            select: {
              id: true,
              title: true,
              mode: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      insights,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  }

  /**
   * Get a single saved insight by ID, ensuring ownership.
   */
  public static async getInsight(userId: string, id: string) {
    const insight = await PrismaService.client.savedInsight.findFirst({
      where: { id, userId },
      include: {
        session: {
          select: {
            id: true,
            title: true,
            mode: true,
            createdAt: true,
          },
        },
      },
    });

    if (!insight) {
      throw new AppError('Saved insight not found or access denied', 404);
    }

    return insight;
  }

  /**
   * Update an existing saved insight, ensuring ownership.
   */
  public static async updateInsight(userId: string, id: string, input: UpdateInsightInput) {
    const existing = await PrismaService.client.savedInsight.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!existing) {
      throw new AppError('Saved insight not found or access denied', 404);
    }

    const updateData: Prisma.SavedInsightUpdateInput = {};
    if (input.title !== undefined) updateData.title = input.title.trim();
    if (input.content !== undefined) updateData.content = input.content.trim();
    if (input.category !== undefined) updateData.category = input.category;
    if (input.source !== undefined) updateData.source = input.source;
    if (input.tags !== undefined) updateData.tags = input.tags as unknown as Prisma.InputJsonValue;
    if (input.metadata !== undefined) updateData.metadata = input.metadata as unknown as Prisma.InputJsonValue;

    const updated = await PrismaService.client.savedInsight.update({
      where: { id },
      data: updateData,
      include: {
        session: {
          select: {
            id: true,
            title: true,
            mode: true,
            createdAt: true,
          },
        },
      },
    });

    logger.info('Saved insight updated', { userId, insightId: id });
    return updated;
  }

  /**
   * Delete a saved insight, ensuring ownership.
   */
  public static async deleteInsight(userId: string, id: string) {
    const existing = await PrismaService.client.savedInsight.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!existing) {
      throw new AppError('Saved insight not found or access denied', 404);
    }

    await PrismaService.client.savedInsight.delete({
      where: { id },
    });

    logger.info('Saved insight deleted', { userId, insightId: id });
    return { success: true, id };
  }

  /**
   * Get user insight statistics and category breakdowns.
   */
  public static async getInsightStats(userId: string): Promise<InsightStats> {
    const allUserInsights = await PrismaService.client.savedInsight.findMany({
      where: { userId },
      select: { category: true, source: true },
    });

    const total = allUserInsights.length;
    const byCategory: Record<string, number> = {};
    const bySource: Record<string, number> = {};

    for (const item of allUserInsights) {
      const cat = item.category || 'GENERAL';
      byCategory[cat] = (byCategory[cat] || 0) + 1;

      const src = item.source || 'manual';
      bySource[src] = (bySource[src] || 0) + 1;
    }

    return {
      total,
      byCategory,
      bySource,
    };
  }
}
