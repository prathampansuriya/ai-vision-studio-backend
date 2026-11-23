import jwt from 'jsonwebtoken';
import { CreditFeatureType, SessionMode, SessionStatus, TranscriptSpeaker, ToolExecutionStatus } from '@prisma/client';
import { PrismaService } from './prisma.service.js';
import { CreditService } from './credit.service.js';
import { MemoryService } from './memory.service.js';
import { AppError } from '../utils/appError.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.config.js';
import { RESERVATION_DEFAULTS } from '../config/credit.policy.js';
import {
  CreateSessionInput,
  ListSessionsInput,
  UpdateSessionInput,
  ContinueSessionInput,
  UpdateSessionControlsInput,
} from '../validators/session.validator.js';
import { SwitchSessionModeInput } from '../validators/preset.validator.js';

export interface SessionTokenResult {
  token: string;
  websocketUrl: string;
  expiresInSeconds: number;
}

export class SessionService {
  /**
   * Initializes a new live session:
   * 1. Validates credit entitlement
   * 2. Establishes credit reservation escrow
   * 3. Creates AISession database record with gemini-3.8-live model routing
   * 4. Pre-allocates session context in Python AI service
   * 5. Issues signed WebSocket connection ticket
   */
  public static async createSession(userId: string, input: CreateSessionInput) {
    const prisma = PrismaService.client;

    // 1. Check user credit balance
    const balance = await CreditService.getBalance(userId);
    if (balance.isExhausted || balance.availableBalance < 1) {
      throw AppError.paymentRequired(
        'Insufficient credits to start live session. Please purchase credits or upgrade your plan.'
      );
    }

    // 2. Validate plan entitlement allowances and session concurrency limits
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });
    const plan = subscription?.plan || await prisma.plan.findFirst({ where: { tier: 'FREE' } }) || {
      name: 'Starter Free',
      tier: 'FREE' as any,
      maxConcurrentSessions: 1,
      supportsToolCalling: false,
    };

    const activeSessionsCount = await prisma.aISession.count({
      where: {
        userId,
        status: { in: [SessionStatus.CREATED, SessionStatus.ACTIVE] },
      },
    });

    if (activeSessionsCount >= plan.maxConcurrentSessions) {
      throw AppError.forbidden(
        `Concurrent session limit reached (${activeSessionsCount}/${plan.maxConcurrentSessions}) for your ${plan.name} plan tier. Please end an active session or upgrade to run additional sessions simultaneously.`
      );
    }

    // 3. Reserve starter credits in escrow
    const holdAmount = Math.min(RESERVATION_DEFAULTS.SESSION_START_HOLD, balance.availableBalance);
    const reservation = await CreditService.reserveCredits(userId, {
      amount: holdAmount > 0 ? holdAmount : 1,
      feature: CreditFeatureType.MULTIMODAL_STREAM,
      ttlSeconds: 3600, // 1 hour hold
      metadata: { reason: 'Live multimodal session escrow reservation' },
    });

    // 4. Check for template configuration if templateId was provided
    let templateConfig: any = null;
    if (input.templateId) {
      const template = await prisma.sessionTemplate.findUnique({
        where: { id: input.templateId },
      });
      if (template) {
        templateConfig = template;
      }
    }

    const finalMode = input.mode || (templateConfig ? templateConfig.defaultMode : SessionMode.VISION);
    const finalSystemPrompt = input.systemPrompt || (templateConfig ? templateConfig.systemPrompt : undefined);
    const finalAiVoice = input.aiVoice || (templateConfig ? templateConfig.aiVoice : 'Puck');
    const finalInputSource = input.inputSource || (templateConfig ? (templateConfig.inputSource === 'screen' ? 'SCREEN' : templateConfig.inputSource === 'both' ? 'BOTH' : 'WEBCAM') : 'WEBCAM');
    const finalLanguage = input.language || (templateConfig?.preferredLanguage && templateConfig.preferredLanguage !== 'auto' ? templateConfig.preferredLanguage : 'auto');
    const finalFocusInstruction = input.focusInstruction || (input.userConfig?.focusInstruction as string) || templateConfig?.focusInstruction || 'TASK';
    const finalCustomFocus = input.customFocus || (input.userConfig?.customFocus as string) || templateConfig?.customFocus || undefined;
    const finalResponseStyle = input.responseStyle || (input.userConfig?.responseStyle as string) || templateConfig?.responseStyle || 'CONCISE';
    const finalPersonaTone = input.personaTone || (input.userConfig?.personaTone as string) || templateConfig?.personaTone || 'PROFESSIONAL';

    // 4. Create AISession record in database
    const session = await prisma.aISession.create({
      data: {
        userId,
        templateId: input.templateId,
        title: input.title,
        mode: finalMode,
        status: SessionStatus.CREATED,
        inputSource: finalInputSource,
        aiModel: 'gemini-3.8-live', // Sole realtime conversational multimodal model
        transcriptionModel: 'gemini-3.5-transcribe-live',
        userConfig: {
          ...(templateConfig ? {
            templateId: templateConfig.id,
            templateName: templateConfig.name,
            focusInstruction: templateConfig.focusInstruction,
            customFocus: templateConfig.customFocus,
            responseStyle: templateConfig.responseStyle,
            personaTone: templateConfig.personaTone,
            preferredLanguage: templateConfig.preferredLanguage,
            transcriptPreference: templateConfig.transcriptPreference,
            enabledTools: templateConfig.enabledTools,
          } : {}),
          ...(input.userConfig || {}),
          aiVoice: finalAiVoice,
          systemPrompt: finalSystemPrompt,
          language: finalLanguage,
          focusInstruction: finalFocusInstruction,
          customFocus: finalCustomFocus,
          responseStyle: finalResponseStyle,
          personaTone: finalPersonaTone,
        },
      },
    });

    // Associate reservation with session
    await prisma.creditReservation.update({
      where: { id: reservation.reservationId },
      data: { sessionId: session.id },
    });

    // 4. Fetch user details for personalized startup greeting
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    const userName = user?.name || user?.email?.split('@')[0] || 'there';

    // 5. Notify Python AI microservice to pre-allocate session
    try {
      const internalUrl = `${env.AI_SERVICE_URL}/api/v1/internal/sessions/allocate`;
      const res = await fetch(internalUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': env.INTERNAL_SERVICE_KEY,
        },
        body: JSON.stringify({
          session_id: session.id,
          user_id: userId,
          user_name: userName,
          plan_tier: 'PRO',
          mode: finalMode,
          system_prompt: finalSystemPrompt,
          ai_voice: finalAiVoice,
          language: finalLanguage,
          focus_instruction: finalFocusInstruction,
          custom_focus: finalCustomFocus,
          response_style: finalResponseStyle,
          persona_tone: finalPersonaTone,
        }),
      });

      if (!res.ok) {
        logger.warn(
          `AI service pre-allocation returned status ${res.status} for session ${session.id}`
        );
      }
    } catch (err) {
      logger.warn(`Could not reach AI service for session pre-allocation: ${err}`);
      // Non-blocking: Python service will auto-allocate when client connects via WebSocket
    }

    // 6. Generate signed WebSocket token
    const tokenData = this.generateSessionToken(userId, session.id, {
      userName,
      mode: finalMode,
      aiVoice: finalAiVoice,
      language: finalLanguage,
      systemPrompt: finalSystemPrompt,
      focusInstruction: finalFocusInstruction,
      customFocus: finalCustomFocus,
      responseStyle: finalResponseStyle,
      personaTone: finalPersonaTone,
    });

    return {
      session,
      userName,
      reservationId: reservation.reservationId,
      token: tokenData.token,
      websocketUrl: tokenData.websocketUrl,
      expiresInSeconds: tokenData.expiresInSeconds,
    };
  }

  /**
   * Generates a signed, short-lived HMAC-SHA256 JWT ticket for WebSocket client auth.
   */
  public static generateSessionToken(
    userId: string,
    sessionId: string,
    metadata?: {
      userName?: string;
      mode?: string;
      aiVoice?: string;
      language?: string;
      systemPrompt?: string;
      focusInstruction?: string;
      customFocus?: string;
      responseStyle?: string;
      personaTone?: string;
    }
  ): SessionTokenResult {
    const expiresInSeconds = 900; // 15 minutes
    const token = jwt.sign(
      {
        sessionId,
        userId,
        userName: metadata?.userName,
        mode: metadata?.mode,
        aiVoice: metadata?.aiVoice,
        language: metadata?.language,
        systemPrompt: metadata?.systemPrompt,
        focusInstruction: metadata?.focusInstruction,
        customFocus: metadata?.customFocus,
        responseStyle: metadata?.responseStyle,
        personaTone: metadata?.personaTone,
        permissions: ['live_stream', 'audio_input', 'video_input'],
      },
      env.INTERNAL_SERVICE_KEY,
      { expiresIn: expiresInSeconds }
    );

    const wsBaseUrl = env.AI_SERVICE_URL.replace(/^http/, 'ws');
    const websocketUrl = `${wsBaseUrl}/ws/live/${sessionId}?token=${token}`;

    return {
      token,
      websocketUrl,
      expiresInSeconds,
    };
  }

  /**
   * Retrieves session by ID with transcripts, tools, snapshots, and usage metrics
   */
  public static async getSessionById(userId: string, sessionId: string) {
    const prisma = PrismaService.client;
    const session = await prisma.aISession.findUnique({
      where: { id: sessionId },
      include: {
        transcriptSegments: {
          orderBy: { sequenceNumber: 'asc' },
          take: 100,
        },
        toolExecutions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        snapshots: {
          orderBy: { captureTimestamp: 'desc' },
          take: 20,
        },
        creditUsages: {
          orderBy: { createdAt: 'desc' },
        },
        summary: true,
      },
    });

    if (!session) {
      throw AppError.notFound('Session not found');
    }

    if (session.userId !== userId) {
      throw AppError.forbidden('Unauthorized access to session');
    }

    return {
      ...session,
      toolExecutions: session.toolExecutions.map((t) => ({
        ...t,
        callArgs: t.arguments,
        resultPayload: t.resultMetadata,
        durationMs: t.executionDurationMs,
      })),
    };
  }

  /**
   * Lists sessions with pagination, multi-attribute filtering, search, and sorting
   */
  public static async listSessions(userId: string, query: ListSessionsInput) {
    const prisma = PrismaService.client;
    const {
      page,
      limit,
      search,
      mode,
      status,
      aiModel,
      isArchived,
      isFavorite,
      dateFrom,
      dateTo,
      durationMin,
      durationMax,
      hasRecordings,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * limit;

    const where: any = { userId };

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        {
          transcriptSegments: {
            some: {
              text: { contains: search, mode: 'insensitive' },
            },
          },
        },
      ];
    }

    if (mode) where.mode = mode;
    if (status) where.status = status;
    if (aiModel) where.aiModel = aiModel;
    if (isArchived !== undefined) where.isArchived = isArchived;
    if (isFavorite !== undefined) where.isFavorite = isFavorite;

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    if (durationMin !== undefined || durationMax !== undefined) {
      where.durationSeconds = {};
      if (durationMin !== undefined) where.durationSeconds.gte = durationMin;
      if (durationMax !== undefined) where.durationSeconds.lte = durationMax;
    }

    if (hasRecordings !== undefined) {
      if (hasRecordings) {
        where.OR = [
          { hasAudioRecording: true },
          { hasVideoRecording: true },
        ];
      } else {
        where.hasAudioRecording = false;
        where.hasVideoRecording = false;
      }
    }

    const [sessions, total] = await Promise.all([
      prisma.aISession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          _count: {
            select: {
              transcriptSegments: true,
              snapshots: true,
              toolExecutions: true,
            },
          },
          summary: {
            select: {
              id: true,
              overview: true,
              keyPoints: true,
            },
          },
        },
      }),
      prisma.aISession.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      sessions,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  /**
   * Retrieves full persisted session detail including transcripts, snapshots, tools, and summary
   */
  public static async getSessionDetails(userId: string, sessionId: string) {
    const prisma = PrismaService.client;
    const session = await prisma.aISession.findUnique({
      where: { id: sessionId },
      include: {
        transcriptSegments: {
          orderBy: { sequenceNumber: 'asc' },
        },
        summary: true,
        snapshots: {
          orderBy: { captureTimestamp: 'desc' },
          select: {
            id: true,
            cloudinaryUrl: true,
            annotatedImageUrl: true,
            source: true,
            analysisStatus: true,
            description: true,
            aiAnalysis: true,
            detectedObjects: true,
            extractedText: true,
            captureTimestamp: true,
            width: true,
            height: true,
          },
        },
        toolExecutions: {
          orderBy: { startedAt: 'asc' },
        },
        creditUsages: {
          orderBy: { createdAt: 'asc' },
        },
        preset: {
          select: {
            id: true,
            name: true,
            slug: true,
            mode: true,
            responseStyle: true,
            focusInstruction: true,
          },
        },
      },
    });

    if (!session) {
      throw AppError.notFound('Session not found');
    }

    if (session.userId !== userId) {
      throw AppError.forbidden('Unauthorized access to session');
    }

    return {
      ...session,
      toolExecutions: session.toolExecutions.map((t) => ({
        ...t,
        callArgs: t.arguments,
        resultPayload: t.resultMetadata,
        durationMs: t.executionDurationMs,
      })),
    };
  }

  /**
   * Updates session title, archived status, or favorite status
   */
  public static async updateSession(userId: string, sessionId: string, input: UpdateSessionInput) {
    const prisma = PrismaService.client;
    await this.getSessionDetails(userId, sessionId);

    const updateData: any = {};
    if (input.title !== undefined) updateData.title = input.title;
    if (input.isArchived !== undefined) updateData.isArchived = input.isArchived;
    if (input.isFavorite !== undefined) updateData.isFavorite = input.isFavorite;

    const updated = await prisma.aISession.update({
      where: { id: sessionId },
      data: updateData,
    });

    return updated;
  }

  /**
   * Deletes session and associated records
   */
  public static async deleteSession(userId: string, sessionId: string) {
    const prisma = PrismaService.client;
    await this.getSessionDetails(userId, sessionId);

    await prisma.aISession.delete({
      where: { id: sessionId },
    });

    return { id: sessionId, deleted: true };
  }

  /**
   * Exports session transcripts into TXT, Markdown, or JSON formats
   */
  public static async exportTranscript(
    userId: string,
    sessionId: string,
    format: 'txt' | 'md' | 'json' = 'txt',
    speakerFilter?: TranscriptSpeaker
  ) {
    const session = await this.getSessionDetails(userId, sessionId);

    let segments = session.transcriptSegments;
    if (speakerFilter) {
      segments = segments.filter((s) => s.speakerType === speakerFilter);
    }

    if (format === 'json') {
      return {
        contentType: 'application/json',
        filename: `session_${session.id}_transcript.json`,
        content: JSON.stringify(
          {
            sessionId: session.id,
            title: session.title,
            mode: session.mode,
            createdAt: session.createdAt,
            durationSeconds: session.durationSeconds,
            summary: session.summary,
            totalSegments: segments.length,
            segments: segments.map((s) => ({
              id: s.id,
              speaker: s.speakerType,
              speakerName: s.speakerName,
              text: s.text,
              timestamp: s.createdAt,
              sequenceNumber: s.sequenceNumber,
              language: s.language,
            })),
          },
          null,
          2
        ),
      };
    }

    if (format === 'md') {
      const lines = [
        `# Session Transcript: ${session.title}`,
        ``,
        `- **Session ID**: \`${session.id}\``,
        `- **Mode**: ${session.mode}`,
        `- **Created**: ${new Date(session.createdAt).toLocaleString()}`,
        `- **Duration**: ${session.durationSeconds}s`,
        `- **Status**: ${session.status}`,
        ``,
      ];

      if (session.summary?.overview) {
        lines.push(`## Executive Summary`, ``, session.summary.overview, ``);
      }

      lines.push(`## Transcript Dialogue`, ``);

      segments.forEach((s) => {
        const time = new Date(s.createdAt).toLocaleTimeString();
        const speaker =
          s.speakerName || (s.speakerType === 'USER' ? 'Pratham' : s.speakerType === 'AI' ? 'AI' : 'System');
        lines.push(`> [${time}] **${speaker}**: ${s.text}`, ``);
      });

      return {
        contentType: 'text/markdown',
        filename: `session_${session.id}_transcript.md`,
        content: lines.join('\n'),
      };
    }

    // Default TXT
    const txtLines = [
      `================================================================================`,
      `SESSION TRANSCRIPT: ${session.title.toUpperCase()}`,
      `ID: ${session.id}`,
      `Date: ${new Date(session.createdAt).toISOString()}`,
      `Duration: ${session.durationSeconds} seconds`,
      `================================================================================\n`,
    ];

    segments.forEach((s) => {
      const time = new Date(s.createdAt).toLocaleTimeString();
      const speaker = s.speakerName || (s.speakerType === 'USER' ? 'Pratham' : s.speakerType === 'AI' ? 'AI' : 'System');
      txtLines.push(`[${time}] ${speaker}: ${s.text}`);
    });

    return {
      contentType: 'text/plain',
      filename: `session_${session.id}_transcript.txt`,
      content: txtLines.join('\n'),
    };
  }

  /**
   * Continues a past session by generating a new session with restored context and prior summary
   */
  public static async continueSession(
    userId: string,
    sessionId: string,
    input: ContinueSessionInput
  ) {
    const pastSession = await this.getSessionDetails(userId, sessionId);

    // 1. Gather context and persisted visual/conversation memories from past session
    let memoryContextText = '';
    let memoryContextEnvelope = null;
    let pinnedMemoriesToClone: any[] = [];

    if (input.includeMemories !== false) {
      try {
        memoryContextEnvelope = await MemoryService.getContextEnvelope(userId, pastSession.id);
        memoryContextText = memoryContextEnvelope.formattedPromptText;
        const prisma = PrismaService.client;
        pinnedMemoriesToClone = await prisma.sessionMemory.findMany({
          where: { sessionId: pastSession.id, isPinned: true },
        });
      } catch (err) {
        logger.warn(`Could not load memory context envelope: ${err}`);
      }
    }

    const summaryText = input.includeSummary && !memoryContextText ? pastSession.summary?.overview || '' : '';
    const recentTranscripts = input.includeRecentTranscripts
      ? pastSession.transcriptSegments
          .slice(-10)
          .map((s) => `${s.speakerType}: ${s.text}`)
          .join('\n')
      : '';

    const continuationDirectives = [
      memoryContextText || `[CONTEXT RESTORATION: CONTINUING PRIOR SESSION "${pastSession.title}"]`,
      summaryText ? `Executive Summary of Prior Session:\n${summaryText}` : '',
      recentTranscripts ? `Recent Context:\n${recentTranscripts}` : '',
      `Instruction: You are continuing this conversation. Acknowledge continuity seamlessly when relevant without repeating previous greetings.`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const userCfg = (pastSession.userConfig as Record<string, any>) || {};

    // 2. Launch a NEW session with restored context
    const newTitle = input.title?.trim() || `Continuation: ${pastSession.title}`;
    const newSessionInit = await this.createSession(userId, {
      title: newTitle,
      mode: pastSession.mode,
      language: (userCfg.language as string) || 'auto',
      aiVoice: (userCfg.aiVoice as string) || 'Puck',
      systemPrompt: continuationDirectives,
      templateId: pastSession.templateId || undefined,
      inputSource: pastSession.inputSource || 'WEBCAM',
      userConfig: {
        ...userCfg,
        continuedFromSessionId: pastSession.id,
      },
    });

    // 3. Clone pinned memories into new session to maintain live memory continuity
    const prisma = PrismaService.client;
    if (pinnedMemoriesToClone.length > 0) {
      for (const pm of pinnedMemoriesToClone) {
        await prisma.sessionMemory.create({
          data: {
            sessionId: newSessionInit.session.id,
            category: pm.category,
            title: pm.title,
            content: pm.content,
            importance: pm.importance,
            isPinned: true,
            metadata: {
              ...((pm.metadata as Record<string, any>) || {}),
              restoredFromSessionId: pastSession.id,
              restoredFromMemoryId: pm.id,
            },
          },
        });
      }
    }

    // 4. Update new session contextMetadata with explicit restored context indicators
    await prisma.aISession.update({
      where: { id: newSessionInit.session.id },
      data: {
        contextMetadata: {
          isContextRestored: true,
          restoredFromSessionId: pastSession.id,
          restoredFromSessionTitle: pastSession.title,
          restoredMemoryCount: pinnedMemoriesToClone.length,
          restoredTask: memoryContextEnvelope?.currentTask || null,
          restoredSummary: memoryContextEnvelope?.contextSummary || null,
        },
      },
    });

    return {
      continuedFromSessionId: pastSession.id,
      isContextRestored: true,
      restoredMemoryCount: pinnedMemoriesToClone.length,
      ...newSessionInit,
    };
  }

  /**
   * Gracefully ends an active live session
   */
  public static async endSession(userId: string, sessionId: string, fallbackToolExecutions?: any[]) {
    const prisma = PrismaService.client;
    const session = await prisma.aISession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw AppError.notFound('Session not found');
    }

    if (session.userId !== userId) {
      throw AppError.forbidden('Unauthorized access to session');
    }

    // Persist any fallback tool executions passed by client upon exit
    if (fallbackToolExecutions && Array.isArray(fallbackToolExecutions) && fallbackToolExecutions.length > 0) {
      for (const t of fallbackToolExecutions) {
        const callId = t.callId || t.call_id || t.id;
        const toolName = t.toolName || t.tool_name || t.name;
        if (!callId || !toolName) continue;
        const existing = await prisma.aIToolExecution.findFirst({
          where: { sessionId, callId },
        });
        if (!existing) {
          const rawStatus = (t.status || 'SUCCESS').toUpperCase();
          const mappedStatus =
            rawStatus === 'SUCCESS'
              ? ToolExecutionStatus.SUCCESS
              : rawStatus === 'FAILED'
              ? ToolExecutionStatus.FAILED
              : rawStatus === 'REJECTED'
              ? ToolExecutionStatus.REJECTED
              : ToolExecutionStatus.SUCCESS;

          await prisma.aIToolExecution.create({
            data: {
              sessionId,
              toolName,
              callId,
              arguments: t.callArgs || t.arguments || t.args || undefined,
              resultMetadata: t.resultPayload || t.resultMetadata || t.result || undefined,
              status: mappedStatus,
              executionDurationMs: t.durationMs ?? t.executionDurationMs ?? undefined,
              errorMessage: t.errorMessage || t.error_message || undefined,
              completedAt: new Date(),
            },
          });
        }
      }
    }

    // 1. Notify Python AI microservice to terminate
    try {
      const terminateUrl = `${env.AI_SERVICE_URL}/api/v1/internal/sessions/${sessionId}/terminate`;
      await fetch(terminateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': env.INTERNAL_SERVICE_KEY,
        },
        body: JSON.stringify({
          session_id: sessionId,
          reason: 'USER_ENDED_SESSION',
        }),
      });
    } catch (err) {
      logger.warn(`Could not signal termination to AI microservice: ${err}`);
    }

    // 2. Compute final duration and credit settlement fallback
    const elapsedSeconds = Math.max(
      1,
      Math.round((Date.now() - new Date(session.startedAt || session.createdAt).getTime()) / 1000)
    );
    const finalDuration = session.durationSeconds > 0 ? session.durationSeconds : elapsedSeconds;
    const calculatedCredits = Math.max(1, Math.ceil(finalDuration / 60));

    // 3. Settle pending reservation or consume credits if not yet settled
    const pendingReservation = await prisma.creditReservation.findFirst({
      where: {
        sessionId,
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });

    let settledCredits = session.creditsConsumed;
    if (pendingReservation) {
      try {
        const settled = await CreditService.settleReservation(userId, {
          reservationId: pendingReservation.id,
          actualAmount: calculatedCredits,
          reason: `Live session final settlement (${finalDuration}s)`,
          durationSeconds: finalDuration,
          unitsConsumed: finalDuration,
          modelUsed: 'gemini-3.8-live',
        });
        settledCredits = settled.settledAmount;
      } catch (err) {
        logger.warn(`Could not settle pending reservation for session ${sessionId}: ${err}`);
      }
    } else if (session.creditsConsumed <= 0) {
      try {
        const existingUsage = await prisma.creditUsage.findFirst({
          where: { sessionId },
        });
        if (!existingUsage) {
          await CreditService.consumeCredits(userId, {
            amount: calculatedCredits,
            feature: CreditFeatureType.MULTIMODAL_STREAM,
            reason: `Live session final settlement (${finalDuration}s)`,
            sessionId: session.id,
            durationSeconds: finalDuration,
            unitsConsumed: finalDuration,
            modelUsed: 'gemini-3.8-live',
          });
          settledCredits = calculatedCredits;
        } else {
          settledCredits = existingUsage.creditsDeducted;
        }
      } catch (err) {
        logger.warn(`Could not consume credits on session end: ${err}`);
      }
    }

    // 4. Update session in database with authoritative duration and credits consumed
    const updated = await prisma.aISession.update({
      where: { id: sessionId },
      data: {
        durationSeconds: finalDuration,
        creditsConsumed: settledCredits > 0 ? settledCredits : calculatedCredits,
        status: SessionStatus.ENDED,
        endedAt: new Date(),
      },
    });

    // 5. Release any remaining pending reservations
    await prisma.creditReservation.updateMany({
      where: {
        sessionId,
        status: 'PENDING',
      },
      data: {
        status: 'RELEASED',
        releasedAt: new Date(),
      },
    });

    return updated;
  }

  /**
   * Switches operational AI mode and focus instructions on an active live session:
   * 1. Updates database AISession record
   * 2. Calls Python AI service RPC to dynamically shift Gemini 3.8 Live instructions
   */
  public static async switchMode(
    userId: string,
    sessionId: string,
    input: SwitchSessionModeInput
  ) {
    const prisma = PrismaService.client;
    const session = await prisma.aISession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw AppError.notFound('Session not found');
    }

    if (session.userId !== userId) {
      throw AppError.forbidden('Unauthorized access to session');
    }

    if (session.status === SessionStatus.ENDED || session.status === SessionStatus.FAILED) {
      throw AppError.badRequest('Cannot switch mode on a closed session');
    }

    // 1. Update database record
    const updated = await prisma.aISession.update({
      where: { id: sessionId },
      data: {
        mode: input.mode,
        userConfig: {
          ...((session.userConfig as Record<string, unknown>) || {}),
          focusInstruction: input.focusInstruction,
          customFocus: input.customFocus,
          responseStyle: input.responseStyle,
          customPrompt: input.customPrompt,
        },
      },
    });

    // 2. Notify Python AI microservice to shift runtime instructions
    let aiServiceResult: unknown = null;
    try {
      const modeUrl = `${env.AI_SERVICE_URL}/api/v1/internal/sessions/${sessionId}/mode`;
      const res = await fetch(modeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': env.INTERNAL_SERVICE_KEY,
        },
        body: JSON.stringify({
          mode: input.mode,
          focus: input.focusInstruction,
          custom_focus: input.customFocus,
          response_style: input.responseStyle,
          custom_prompt: input.customPrompt,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { data?: unknown };
        aiServiceResult = data.data;
      } else {
        logger.warn(`AI service mode switch returned status ${res.status}`);
      }
    } catch (err) {
      logger.warn(`Could not signal mode switch to AI microservice: ${err}`);
    }

    return {
      session: updated,
      modeShift: aiServiceResult,
    };
  }

  /**
   * Update advanced session controls dynamically during live run.
   */
  public static async updateControls(
    userId: string,
    sessionId: string,
    input: UpdateSessionControlsInput
  ) {
    const prisma = PrismaService.client;
    const session = await prisma.aISession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw AppError.notFound('Session not found');
    }

    if (session.userId !== userId) {
      throw AppError.forbidden('Unauthorized access to session');
    }

    if (session.status === SessionStatus.ENDED || session.status === SessionStatus.FAILED) {
      throw AppError.badRequest('Cannot update controls on a closed session');
    }

    const currentConfig = (session.userConfig as Record<string, any>) || {};
    const updatedConfig = {
      ...currentConfig,
      ...input,
      updatedAt: new Date().toISOString(),
    };

    const updateData: any = {
      userConfig: updatedConfig,
    };

    if (input.isPaused !== undefined) {
      updateData.status = input.isPaused ? SessionStatus.PAUSED : SessionStatus.ACTIVE;
    }

    if (input.inputSource !== undefined) {
      updateData.inputSource = input.inputSource;
    }

    const updated = await prisma.aISession.update({
      where: { id: sessionId },
      data: updateData,
    });

    logger.info('Live session controls updated', { sessionId, userId, isPaused: input.isPaused });

    return {
      session: updated,
      controls: updatedConfig,
    };
  }

  /**
   * Reset rolling conversational context while keeping the session live.
   */
  public static async resetContext(userId: string, sessionId: string) {
    const prisma = PrismaService.client;
    const session = await prisma.aISession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw AppError.notFound('Session not found');
    }

    if (session.userId !== userId) {
      throw AppError.forbidden('Unauthorized access to session');
    }

    if (session.status === SessionStatus.ENDED || session.status === SessionStatus.FAILED) {
      throw AppError.badRequest('Cannot reset context on a closed session');
    }

    const currentMeta = (session.contextMetadata as Record<string, any>) || {};
    const updatedMeta = {
      ...currentMeta,
      contextSummary: '',
      currentTask: null,
      progress: null,
      lastResetAt: new Date().toISOString(),
    };

    const updated = await prisma.aISession.update({
      where: { id: sessionId },
      data: {
        contextMetadata: updatedMeta,
      },
    });

    logger.info('Session context reset', { sessionId, userId });

    return {
      success: true,
      sessionId,
      contextMetadata: updatedMeta,
      message: 'Conversational context window reset successfully',
    };
  }

  /**
   * Interrupt AI speech / turn playback.
   */
  public static async interrupt(userId: string, sessionId: string) {
    const prisma = PrismaService.client;
    const session = await prisma.aISession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, status: true },
    });

    if (!session) {
      throw AppError.notFound('Session not found');
    }

    if (session.userId !== userId) {
      throw AppError.forbidden('Unauthorized access to session');
    }

    return {
      success: true,
      sessionId,
      interruptedAt: new Date().toISOString(),
    };
  }
}
