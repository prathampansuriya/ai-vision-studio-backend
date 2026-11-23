import { MemoryCategory, MemoryImportance, Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service.js';
import { AppError } from '../utils/appError.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.config.js';
import {
  CreateMemoryInput,
  UpdateMemoryInput,
  ListMemoriesQuery,
} from '../validators/memory.validator.js';

export interface MemoryContextEnvelope {
  sessionId: string;
  sessionTitle: string;
  contextSummary: string;
  currentTask: string | null;
  progress: string | null;
  pinnedMemories: Array<{ id: string; category: MemoryCategory; title: string; content: string }>;
  observations: Array<{ id: string; title: string; content: string; snapshotId?: string }>;
  tokenEstimate: number;
  formattedPromptText: string;
}

export class MemoryService {
  /**
   * Verifies session exists and belongs to the authenticated user.
   */
  private static async verifySessionOwnership(userId: string, sessionId: string) {
    const prisma = PrismaService.client;
    const session = await prisma.aISession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, title: true, mode: true, contextMetadata: true },
    });

    if (!session) {
      throw AppError.notFound('Session not found');
    }
    if (session.userId !== userId) {
      throw AppError.forbidden('Unauthorized access to session memory');
    }
    return session;
  }

  /**
   * Retrieves memories for a session with optional category, importance, pinned status and text search.
   */
  public static async listMemories(userId: string, sessionId: string, query: ListMemoriesQuery) {
    const prisma = PrismaService.client;
    await this.verifySessionOwnership(userId, sessionId);

    const where: Prisma.SessionMemoryWhereInput = { sessionId };

    if (query.category) {
      where.category = query.category;
    }
    if (query.isPinned !== undefined) {
      where.isPinned = query.isPinned;
    }
    if (query.importance) {
      where.importance = query.importance;
    }
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { content: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.SessionMemoryOrderByWithRelationInput[] = [
      { isPinned: 'desc' },
      { [query.sortBy]: query.sortOrder },
    ];

    const memories = await prisma.sessionMemory.findMany({
      where,
      orderBy,
    });

    // Compute overview metrics
    const totalCount = memories.length;
    const pinnedCount = memories.filter((m) => m.isPinned).length;
    const observationCount = memories.filter((m) => m.category === MemoryCategory.OBSERVATION).length;
    const currentTaskMemory = memories.find((m) => m.category === MemoryCategory.CURRENT_TASK);
    const contextSummaryMemory = memories.find((m) => m.category === MemoryCategory.CONTEXT_SUMMARY);

    return {
      memories,
      metrics: {
        totalCount,
        pinnedCount,
        observationCount,
        currentTask: currentTaskMemory ? currentTaskMemory.content : null,
        contextSummary: contextSummaryMemory ? contextSummaryMemory.content : null,
      },
    };
  }

  /**
   * Creates a new manual or tool-generated session memory item.
   * Prevents duplicates by matching category and normalized title.
   */
  public static async createMemory(userId: string, sessionId: string, input: CreateMemoryInput) {
    const prisma = PrismaService.client;
    await this.verifySessionOwnership(userId, sessionId);

    // Duplicate prevention check
    const normalizedTitle = input.title.trim().toLowerCase();
    const existing = await prisma.sessionMemory.findFirst({
      where: {
        sessionId,
        category: input.category,
        title: { equals: input.title.trim(), mode: 'insensitive' },
      },
    });

    if (existing) {
      // If unpinned duplicate exists, update its content rather than creating redundant memory
      const updated = await prisma.sessionMemory.update({
        where: { id: existing.id },
        data: {
          content: input.content.trim(),
          importance: input.importance || existing.importance,
          isPinned: input.isPinned !== undefined ? input.isPinned : existing.isPinned,
          metadata: input.metadata || existing.metadata || {},
        },
      });
      return { memory: updated, isDuplicateUpdated: true };
    }

    const memory = await prisma.sessionMemory.create({
      data: {
        sessionId,
        category: input.category,
        title: input.title.trim(),
        content: input.content.trim(),
        importance: input.importance,
        isPinned: input.isPinned,
        metadata: input.metadata || {},
      },
    });

    return { memory, isDuplicateUpdated: false };
  }

  /**
   * Updates an existing memory item.
   */
  public static async updateMemory(
    userId: string,
    sessionId: string,
    memoryId: string,
    input: UpdateMemoryInput
  ) {
    const prisma = PrismaService.client;
    await this.verifySessionOwnership(userId, sessionId);

    const memory = await prisma.sessionMemory.findUnique({
      where: { id: memoryId },
    });

    if (!memory || memory.sessionId !== sessionId) {
      throw AppError.notFound('Memory item not found in this session');
    }

    const updateData: Prisma.SessionMemoryUpdateInput = {};
    if (input.title !== undefined) updateData.title = input.title.trim();
    if (input.content !== undefined) updateData.content = input.content.trim();
    if (input.importance !== undefined) updateData.importance = input.importance;
    if (input.isPinned !== undefined) updateData.isPinned = input.isPinned;
    if (input.category !== undefined) updateData.category = input.category;
    if (input.metadata !== undefined) updateData.metadata = input.metadata;

    const updated = await prisma.sessionMemory.update({
      where: { id: memoryId },
      data: updateData,
    });

    return updated;
  }

  /**
   * Deletes a specific memory item.
   */
  public static async deleteMemory(userId: string, sessionId: string, memoryId: string) {
    const prisma = PrismaService.client;
    await this.verifySessionOwnership(userId, sessionId);

    const memory = await prisma.sessionMemory.findUnique({
      where: { id: memoryId },
    });

    if (!memory || memory.sessionId !== sessionId) {
      throw AppError.notFound('Memory item not found in this session');
    }

    await prisma.sessionMemory.delete({
      where: { id: memoryId },
    });

    return { id: memoryId, deleted: true };
  }

  /**
   * Toggles or sets pinned status for a memory item.
   */
  public static async togglePin(
    userId: string,
    sessionId: string,
    memoryId: string,
    isPinned?: boolean
  ) {
    const prisma = PrismaService.client;
    await this.verifySessionOwnership(userId, sessionId);

    const memory = await prisma.sessionMemory.findUnique({
      where: { id: memoryId },
    });

    if (!memory || memory.sessionId !== sessionId) {
      throw AppError.notFound('Memory item not found in this session');
    }

    const nextPinned = isPinned !== undefined ? isPinned : !memory.isPinned;

    const updated = await prisma.sessionMemory.update({
      where: { id: memoryId },
      data: { isPinned: nextPinned },
    });

    return updated;
  }

  /**
   * Clears memories for a session.
   * If onlyUnpinned is true (default), preserves user pinned memories.
   */
  public static async clearMemories(userId: string, sessionId: string, onlyUnpinned = true) {
    const prisma = PrismaService.client;
    await this.verifySessionOwnership(userId, sessionId);

    const deleteWhere: Prisma.SessionMemoryWhereInput = { sessionId };
    if (onlyUnpinned) {
      deleteWhere.isPinned = false;
    }

    const { count } = await prisma.sessionMemory.deleteMany({
      where: deleteWhere,
    });

    return { clearedCount: count, onlyUnpinned };
  }

  /**
   * Generates or regenerates structured memories from actual session transcripts, snapshots,
   * and tool executions using the Python AI microservice (Gemini 2.5 Flash / grounded fallback).
   */
  public static async generateMemories(
    userId: string,
    sessionId: string,
    forceRegenerate = false
  ) {
    const prisma = PrismaService.client;
    const session = await prisma.aISession.findUnique({
      where: { id: sessionId },
      include: {
        transcriptSegments: {
          orderBy: { sequenceNumber: 'asc' },
        },
        snapshots: {
          orderBy: { captureTimestamp: 'asc' },
        },
        toolExecutions: {
          orderBy: { startedAt: 'asc' },
        },
        memories: true,
      },
    });

    if (!session) {
      throw AppError.notFound('Session not found');
    }
    if (session.userId !== userId) {
      throw AppError.forbidden('Unauthorized access to session');
    }

    // Call Python AI microservice internal extraction endpoint
    const internalUrl = `${env.AI_SERVICE_URL}/api/v1/internal/memories/extract`;
    let extractionResult: any = null;

    try {
      const payload = {
        session_id: sessionId,
        mode: session.mode,
        transcripts: session.transcriptSegments.map((t) => ({
          speaker: t.speakerType,
          speaker_name: t.speakerName,
          text: t.text,
          sequence: t.sequenceNumber,
          timestamp: t.createdAt.toISOString(),
        })),
        snapshots: session.snapshots.map((s) => ({
          id: s.id,
          source: s.source,
          description: s.description,
          ai_analysis: s.aiAnalysis,
          detected_objects: s.detectedObjects as string[],
          user_notes: s.userNotes,
          extracted_text: s.extractedText,
        })),
        tools: session.toolExecutions.map((tool) => ({
          name: tool.toolName,
          arguments: tool.arguments as Record<string, any>,
          result: tool.resultMetadata as Record<string, any>,
          status: tool.status,
        })),
        existing_memories: session.memories.map((m) => ({
          id: m.id,
          category: m.category,
          title: m.title,
          content: m.content,
          importance: m.importance,
          is_pinned: m.isPinned,
          metadata: m.metadata as Record<string, any>,
        })),
        force_regenerate: forceRegenerate,
      };

      const res = await fetch(internalUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': env.INTERNAL_SERVICE_KEY,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        extractionResult = await res.json();
      } else {
        logger.warn(`AI service memory extraction failed with status ${res.status}`);
      }
    } catch (err) {
      logger.warn(`Could not reach AI service for memory extraction: ${err}`);
    }

    // If microservice was unreachable, use safe local grounded synthesis
    if (!extractionResult || !extractionResult.memories) {
      extractionResult = this.generateLocalGroundedMemories(session);
    }

    // If forceRegenerate is true, clear unpinned memories before saving new ones
    if (forceRegenerate) {
      await prisma.sessionMemory.deleteMany({
        where: { sessionId, isPinned: false },
      });
    }

    // Insert newly extracted memories with duplicate prevention
    const existingMemories = await prisma.sessionMemory.findMany({
      where: { sessionId },
    });
    const existingTitles = new Set(existingMemories.map((m) => m.title.trim().toLowerCase()));

    const createdMemories = [];
    for (const item of extractionResult.memories) {
      const titleLower = item.title.trim().toLowerCase();
      if (existingTitles.has(titleLower)) {
        continue;
      }

      const created = await prisma.sessionMemory.create({
        data: {
          sessionId,
          category: item.category as MemoryCategory,
          title: item.title.trim(),
          content: item.content.trim(),
          importance: (item.importance as MemoryImportance) || MemoryImportance.MEDIUM,
          isPinned: Boolean(item.is_pinned),
          metadata: item.metadata || {},
        },
      });
      createdMemories.push(created);
      existingTitles.add(titleLower);
    }

    // Update session context metadata with rolling summary & current task
    const currentMeta = (session.contextMetadata as Record<string, any>) || {};
    await prisma.aISession.update({
      where: { id: sessionId },
      data: {
        contextMetadata: {
          ...currentMeta,
          contextSummary: extractionResult.context_summary,
          currentTask: extractionResult.current_task,
          progress: extractionResult.progress,
          lastMemoryGeneratedAt: new Date().toISOString(),
        },
      },
    });

    return {
      success: true,
      contextSummary: extractionResult.context_summary,
      currentTask: extractionResult.current_task,
      progress: extractionResult.progress,
      createdCount: createdMemories.length,
      totalMemories: existingMemories.length + createdMemories.length,
      modelUsed: extractionResult.model_used || 'gemini-2.5-flash',
    };
  }

  /**
   * Fallback deterministic memory generator if AI microservice is unreachable.
   */
  private static generateLocalGroundedMemories(session: any) {
    const memories = [];
    const userTurns = session.transcriptSegments.filter((t: any) => t.speakerType === 'USER');
    const latestUserTurn = userTurns[userTurns.length - 1];

    let currentTask = latestUserTurn ? latestUserTurn.text.slice(0, 200) : 'General exploration';
    memories.push({
      category: 'CURRENT_TASK',
      title: 'Current Task Objective',
      content: currentTask,
      importance: 'HIGH',
      is_pinned: true,
      metadata: { source: 'conversation' },
    });

    for (const snap of session.snapshots) {
      memories.push({
        category: 'OBSERVATION',
        title: `Visual Frame: ${snap.description || 'Snapshot'}`,
        content: snap.aiAnalysis || snap.description || 'Captured frame verified',
        importance: 'MEDIUM',
        is_pinned: false,
        metadata: { snapshot_id: snap.id, source: 'visual' },
      });
    }

    const summary = `Session in ${session.mode} mode containing ${session.transcriptSegments.length} turns and ${session.snapshots.length} snapshots.`;
    memories.push({
      category: 'CONTEXT_SUMMARY',
      title: 'Compact Context Summary',
      content: summary,
      importance: 'MEDIUM',
      is_pinned: false,
      metadata: { source: 'system' },
    });

    return {
      context_summary: summary,
      current_task: currentTask,
      progress: `Completed ${session.transcriptSegments.length} turns`,
      memories,
      model_used: 'local-deterministic-grounded',
    };
  }

  /**
   * Constructs a compact context envelope ready for system prompt injection in new sessions.
   * Avoids unbounded transcript history bloat while preserving critical recent facts.
   */
  public static async getContextEnvelope(userId: string, sessionId: string): Promise<MemoryContextEnvelope> {
    const prisma = PrismaService.client;
    const session = await this.verifySessionOwnership(userId, sessionId);

    const memories = await prisma.sessionMemory.findMany({
      where: { sessionId },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    });

    const summaryMem = memories.find((m) => m.category === MemoryCategory.CONTEXT_SUMMARY);
    const taskMem = memories.find((m) => m.category === MemoryCategory.CURRENT_TASK);
    const progressMem = memories.find((m) => m.category === MemoryCategory.PROGRESS);

    const contextMetadata = (session.contextMetadata as Record<string, any>) || {};
    const contextSummary =
      summaryMem?.content || contextMetadata.contextSummary || `Session ${session.title} context.`;
    const currentTask = taskMem?.content || contextMetadata.currentTask || null;
    const progress = progressMem?.content || contextMetadata.progress || null;

    const pinnedMemories = memories
      .filter((m) => m.isPinned)
      .map((m) => ({ id: m.id, category: m.category, title: m.title, content: m.content }));

    const observations = memories
      .filter((m) => m.category === MemoryCategory.OBSERVATION)
      .map((m) => ({
        id: m.id,
        title: m.title,
        content: m.content,
        snapshotId: (m.metadata as Record<string, any>)?.snapshot_id,
      }));

    // Build structured prompt text
    const promptLines = [
      `[RESTORED SESSION MEMORY & PERSISTED CONTEXT]`,
      `- Prior Session: "${session.title}" (ID: ${session.id})`,
    ];

    if (currentTask) {
      promptLines.push(`- Active Task / Objective: ${currentTask}`);
    }
    if (progress) {
      promptLines.push(`- Prior Progress: ${progress}`);
    }
    if (contextSummary) {
      promptLines.push(`- Context Summary: ${contextSummary}`);
    }

    if (pinnedMemories.length > 0) {
      promptLines.push(`- Pinned Decisions & User Preferences:`);
      pinnedMemories.forEach((pm) => {
        promptLines.push(`  * [${pm.category}] ${pm.title}: ${pm.content}`);
      });
    }

    if (observations.length > 0) {
      promptLines.push(`- Notable Visual & Contextual Observations:`);
      observations.slice(0, 5).forEach((obs) => {
        const snapRef = obs.snapshotId ? ` (Snapshot: ${obs.snapshotId})` : '';
        promptLines.push(`  * ${obs.title}${snapRef}: ${obs.content}`);
      });
    }

    promptLines.push(
      `Instruction: You are continuing this session. Ground your conversational turns in this persisted memory. Seamlessly acknowledge continuity without repeating redundant introductions.`
    );

    const formattedPromptText = promptLines.join('\n');
    const tokenEstimate = Math.ceil(formattedPromptText.length / 4);

    return {
      sessionId: session.id,
      sessionTitle: session.title,
      contextSummary,
      currentTask,
      progress,
      pinnedMemories,
      observations,
      tokenEstimate,
      formattedPromptText,
    };
  }
}
