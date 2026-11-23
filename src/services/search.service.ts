import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service.js';
import { logger } from '../utils/logger.js';
import { GlobalSearchQuery } from '../validators/search.validator.js';

export interface SearchResultItem {
  id: string;
  entityType: 'SESSION' | 'TRANSCRIPT' | 'INSIGHT' | 'REPORT' | 'SNAPSHOT' | 'MEMORY';
  title: string;
  snippet: string;
  targetUrl: string;
  sessionId?: string;
  sessionTitle?: string;
  createdAt: Date;
  metadata?: Record<string, any>;
  score?: number;
}

export interface GlobalSearchResponse {
  query: string;
  total: number;
  results: SearchResultItem[];
  categories: Record<string, number>;
  recentSearches: Array<{ id: string; query: string; createdAt: Date }>;
}

export class SearchService {
  /**
   * Helper to extract a relevant snippet around the matched search term.
   */
  private static extractSnippet(text: string | null | undefined, query: string, maxLength = 160): string {
    if (!text) return '';
    const cleanText = text.replace(/\s+/g, ' ').trim();
    const lowerText = cleanText.toLowerCase();
    const lowerQuery = query.toLowerCase();

    const matchIndex = lowerText.indexOf(lowerQuery);
    if (matchIndex === -1) {
      return cleanText.length > maxLength ? cleanText.substring(0, maxLength) + '...' : cleanText;
    }

    const start = Math.max(0, matchIndex - 40);
    const end = Math.min(cleanText.length, matchIndex + lowerQuery.length + (maxLength - 40));

    let snippet = cleanText.substring(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < cleanText.length) snippet = snippet + '...';

    return snippet;
  }

  /**
   * Execute authenticated global search across all 6 user-owned entity types.
   */
  public static async search(userId: string, query: GlobalSearchQuery): Promise<GlobalSearchResponse> {
    const q = query.q.trim();
    const category = query.category || 'ALL';
    const limit = query.limit || 20;
    const offset = query.offset || 0;

    const searchTerm = q;
    const shouldSearch = (cat: string) => category === 'ALL' || category === cat;

    // Concurrently query only the user's data
    const [
      sessionResults,
      transcriptResults,
      insightResults,
      reportResults,
      snapshotResults,
      memoryResults,
    ] = await Promise.all([
      // 1. AISessions
      shouldSearch('SESSION')
        ? PrismaService.client.aISession.findMany({
            where: {
              userId,
              ...(query.sessionId ? { id: query.sessionId } : {}),
              title: { contains: searchTerm, mode: 'insensitive' },
            },
            take: limit,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              title: true,
              mode: true,
              status: true,
              createdAt: true,
              endedAt: true,
            },
          })
        : Promise.resolve([]),

      // 2. SessionTranscriptSegments
      shouldSearch('TRANSCRIPT')
        ? PrismaService.client.sessionTranscriptSegment.findMany({
            where: {
              session: {
                userId,
                ...(query.sessionId ? { id: query.sessionId } : {}),
              },
              text: { contains: searchTerm, mode: 'insensitive' },
            },
            take: limit,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              sessionId: true,
              speakerType: true,
              speakerName: true,
              text: true,
              startTimeMs: true,
              endTimeMs: true,
              createdAt: true,
              session: {
                select: { id: true, title: true },
              },
            },
          })
        : Promise.resolve([]),

      // 3. SavedInsights
      shouldSearch('INSIGHT')
        ? PrismaService.client.savedInsight.findMany({
            where: {
              userId,
              ...(query.sessionId ? { sessionId: query.sessionId } : {}),
              OR: [
                { title: { contains: searchTerm, mode: 'insensitive' } },
                { content: { contains: searchTerm, mode: 'insensitive' } },
              ],
            },
            take: limit,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              title: true,
              content: true,
              category: true,
              source: true,
              sessionId: true,
              createdAt: true,
              session: {
                select: { id: true, title: true },
              },
            },
          })
        : Promise.resolve([]),

      // 4. SessionReports
      shouldSearch('REPORT')
        ? PrismaService.client.sessionReport.findMany({
            where: {
              userId,
              ...(query.sessionId ? { sessionId: query.sessionId } : {}),
              OR: [
                { title: { contains: searchTerm, mode: 'insensitive' } },
                { overview: { contains: searchTerm, mode: 'insensitive' } },
              ],
            },
            take: limit,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              sessionId: true,
              title: true,
              overview: true,
              createdAt: true,
              session: {
                select: { id: true, title: true },
              },
            },
          })
        : Promise.resolve([]),

      // 5. SessionSnapshots
      shouldSearch('SNAPSHOT')
        ? PrismaService.client.sessionSnapshot.findMany({
            where: {
              userId,
              ...(query.sessionId ? { sessionId: query.sessionId } : {}),
              OR: [
                { userNotes: { contains: searchTerm, mode: 'insensitive' } },
                { aiAnalysis: { contains: searchTerm, mode: 'insensitive' } },
                { extractedText: { contains: searchTerm, mode: 'insensitive' } },
              ],
            },
            take: limit,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              sessionId: true,
              cloudinaryUrl: true,
              userNotes: true,
              aiAnalysis: true,
              extractedText: true,
              createdAt: true,
              session: {
                select: { id: true, title: true },
              },
            },
          })
        : Promise.resolve([]),

      // 6. SessionMemories
      shouldSearch('MEMORY')
        ? PrismaService.client.sessionMemory.findMany({
            where: {
              session: {
                userId,
                ...(query.sessionId ? { id: query.sessionId } : {}),
              },
              OR: [
                { title: { contains: searchTerm, mode: 'insensitive' } },
                { content: { contains: searchTerm, mode: 'insensitive' } },
              ],
            },
            take: limit,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              sessionId: true,
              title: true,
              content: true,
              category: true,
              isPinned: true,
              createdAt: true,
              session: {
                select: { id: true, title: true },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    // Map all results to unified SearchResultItem
    const items: SearchResultItem[] = [];

    // Map Sessions
    for (const s of sessionResults) {
      items.push({
        id: s.id,
        entityType: 'SESSION',
        title: s.title,
        snippet: `Mode: ${s.mode} | Status: ${s.status}`,
        targetUrl: `/sessions/${s.id}`,
        sessionId: s.id,
        sessionTitle: s.title,
        createdAt: s.createdAt,
        metadata: { mode: s.mode, status: s.status },
      });
    }

    // Map Transcripts
    for (const t of transcriptResults) {
      items.push({
        id: t.id,
        entityType: 'TRANSCRIPT',
        title: `${t.speakerType === 'AI' ? 'AI Response' : 'User'}: ${t.session?.title || 'Session'}`,
        snippet: this.extractSnippet(t.text, searchTerm),
        targetUrl: `/sessions/${t.sessionId}?tab=transcript`,
        sessionId: t.sessionId,
        sessionTitle: t.session?.title,
        createdAt: t.createdAt,
        metadata: { speakerType: t.speakerType, startTimeMs: t.startTimeMs, endTimeMs: t.endTimeMs },
      });
    }

    // Map Insights
    for (const ins of insightResults) {
      items.push({
        id: ins.id,
        entityType: 'INSIGHT',
        title: ins.title,
        snippet: this.extractSnippet(ins.content, searchTerm),
        targetUrl: `/knowledge?insightId=${ins.id}`,
        sessionId: ins.sessionId || undefined,
        sessionTitle: ins.session?.title,
        createdAt: ins.createdAt,
        metadata: { category: ins.category, source: ins.source },
      });
    }

    // Map Reports
    for (const r of reportResults) {
      items.push({
        id: r.id,
        entityType: 'REPORT',
        title: `Report: ${r.title}`,
        snippet: this.extractSnippet(r.overview, searchTerm),
        targetUrl: `/sessions/${r.sessionId}?tab=report`,
        sessionId: r.sessionId,
        sessionTitle: r.session?.title,
        createdAt: r.createdAt,
      });
    }

    // Map Snapshots
    for (const snap of snapshotResults) {
      const matchSource = snap.userNotes?.toLowerCase().includes(searchTerm.toLowerCase())
        ? snap.userNotes
        : snap.aiAnalysis?.toLowerCase().includes(searchTerm.toLowerCase())
        ? snap.aiAnalysis
        : snap.extractedText;

      items.push({
        id: snap.id,
        entityType: 'SNAPSHOT',
        title: `Snapshot in ${snap.session?.title || 'Session'}`,
        snippet: this.extractSnippet(matchSource || 'Snapshot frame capture', searchTerm),
        targetUrl: `/snapshots?id=${snap.id}`,
        sessionId: snap.sessionId,
        sessionTitle: snap.session?.title,
        createdAt: snap.createdAt,
        metadata: { cloudinaryUrl: snap.cloudinaryUrl },
      });
    }

    // Map Memories
    for (const m of memoryResults) {
      items.push({
        id: m.id,
        entityType: 'MEMORY',
        title: `Memory: ${m.title}`,
        snippet: this.extractSnippet(m.content, searchTerm),
        targetUrl: `/sessions/${m.sessionId}?tab=memory`,
        sessionId: m.sessionId,
        sessionTitle: m.session?.title,
        createdAt: m.createdAt,
        metadata: { category: m.category, isPinned: m.isPinned },
      });
    }

    // Sort by createdAt descending
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Calculate category breakdown
    const categories: Record<string, number> = {
      ALL: items.length,
      SESSION: sessionResults.length,
      TRANSCRIPT: transcriptResults.length,
      INSIGHT: insightResults.length,
      REPORT: reportResults.length,
      SNAPSHOT: snapshotResults.length,
      MEMORY: memoryResults.length,
    };

    // Apply offset and limit
    const paginatedResults = items.slice(offset, offset + limit);

    // Asynchronously log to RecentSearch (keep distinct, max 20)
    try {
      await PrismaService.client.recentSearch.create({
        data: {
          userId,
          query: q,
          category,
        },
      });

      // Cleanup old searches beyond 20 for this user
      const userSearches = await PrismaService.client.recentSearch.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      if (userSearches.length > 20) {
        const toDelete = userSearches.slice(20).map((s) => s.id);
        await PrismaService.client.recentSearch.deleteMany({
          where: { id: { in: toDelete } },
        });
      }
    } catch (err) {
      logger.warn('Failed to record recent search', { err });
    }

    // Fetch up to 8 recent distinct searches
    const recentSearches = await this.getRecentSearches(userId, 8);

    return {
      query: q,
      total: items.length,
      results: paginatedResults,
      categories,
      recentSearches,
    };
  }

  /**
   * Get recent searches for the user (distinct by query string).
   */
  public static async getRecentSearches(userId: string, limit = 8) {
    const raw = await PrismaService.client.recentSearch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, query: true, createdAt: true },
    });

    const seen = new Set<string>();
    const distinct: Array<{ id: string; query: string; createdAt: Date }> = [];

    for (const item of raw) {
      const lower = item.query.toLowerCase().trim();
      if (!seen.has(lower)) {
        seen.add(lower);
        distinct.push(item);
        if (distinct.length >= limit) break;
      }
    }

    return distinct;
  }

  /**
   * Clear recent search history for the user (single item or all).
   */
  public static async clearRecentSearches(userId: string, id?: string) {
    if (id) {
      await PrismaService.client.recentSearch.deleteMany({
        where: { id, userId },
      });
    } else {
      await PrismaService.client.recentSearch.deleteMany({
        where: { userId },
      });
    }

    return { success: true };
  }

  /**
   * Fast auto-suggestions based on user's sessions, insights, and past searches.
   */
  public static async getSuggestions(userId: string, query: string, limit = 5) {
    const q = query.trim();
    if (!q) return [];

    const [recentMatches, sessionMatches, insightMatches] = await Promise.all([
      PrismaService.client.recentSearch.findMany({
        where: {
          userId,
          query: { startsWith: q, mode: 'insensitive' },
        },
        take: limit,
        select: { query: true },
        distinct: ['query'],
      }),
      PrismaService.client.aISession.findMany({
        where: {
          userId,
          title: { contains: q, mode: 'insensitive' },
        },
        take: limit,
        select: { title: true },
      }),
      PrismaService.client.savedInsight.findMany({
        where: {
          userId,
          title: { contains: q, mode: 'insensitive' },
        },
        take: limit,
        select: { title: true },
      }),
    ]);

    const suggestions = new Set<string>();
    for (const r of recentMatches) suggestions.add(r.query);
    for (const s of sessionMatches) suggestions.add(s.title);
    for (const i of insightMatches) suggestions.add(i.title);

    return Array.from(suggestions).slice(0, limit);
  }
}
