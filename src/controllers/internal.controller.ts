import { Request, Response, NextFunction } from 'express';
import { CreditFeatureType, SessionStatus, ToolExecutionStatus } from '@prisma/client';
import { PrismaService } from '../services/prisma.service.js';
import { CreditService } from '../services/credit.service.js';
import { SnapshotService } from '../services/snapshot.service.js';
import { AppError } from '../utils/appError.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.config.js';
import { InternalUsageInput } from '../validators/session.validator.js';
import { sendSuccess } from '../utils/response.js';
import { HTTP_STATUS } from '@shared/constants/index.js';

function mapToolStatus(status?: string): ToolExecutionStatus {
  switch (status?.toUpperCase()) {
    case 'SUCCESS':
      return ToolExecutionStatus.SUCCESS;
    case 'FAILED':
      return ToolExecutionStatus.FAILED;
    case 'RUNNING':
    case 'EXECUTING':
      return ToolExecutionStatus.EXECUTING;
    case 'APPROVED':
      return ToolExecutionStatus.APPROVED;
    case 'REQUIRES_APPROVAL':
    case 'PENDING_CONFIRMATION':
    case 'PENDING':
      return ToolExecutionStatus.PENDING;
    case 'REJECTED':
    case 'CANCELLED':
      return ToolExecutionStatus.REJECTED;
    default:
      return ToolExecutionStatus.PENDING;
  }
}

export class InternalController {
  public static async settleSessionUsage(req: Request, res: Response, next: NextFunction) {
    try {
      // 1. Service-to-Service Security Verification
      const internalKey = req.headers['x-internal-key'];
      if (!internalKey || internalKey !== env.INTERNAL_SERVICE_KEY) {
        logger.warn('Unauthorized attempt on internal usage endpoint');
        throw AppError.unauthorized('Unauthorized internal service access');
      }

      const input = req.body as InternalUsageInput;
      const prisma = PrismaService.client;

      // 1. Fetch session and user context
      const session = await prisma.aISession.findUnique({
        where: { id: input.sessionId },
        include: { user: true },
      });

      // 2. Compute billable credits according to CREDIT_POLICY
      // MULTIMODAL_STREAM: 1 credit per 60 seconds (minimum 1 second / 1 credit for an initiated live session)
      const durationSeconds = Math.max(input.durationSeconds || 0, 1);
      const streamCredits = Math.ceil(durationSeconds / 60);
      const toolCredits = (input.toolCallsCount || 0) * 1;
      const calculatedCredits = Math.max(1, streamCredits + toolCredits);

      let deductedCredits = calculatedCredits;

      if (input.isFinal) {
        // 3. Settle against active reservation or consume directly upon session finalization
        const pendingReservation = await prisma.creditReservation.findFirst({
          where: {
            sessionId: input.sessionId,
            status: 'PENDING',
          },
          orderBy: { createdAt: 'desc' },
        });

        if (pendingReservation) {
          try {
            const settled = await CreditService.settleReservation(input.userId, {
              reservationId: pendingReservation.id,
              actualAmount: calculatedCredits,
              reason: `Settled live multimodal usage (${durationSeconds}s, ${input.toolCallsCount || 0} tools)`,
              durationSeconds,
              unitsConsumed: durationSeconds,
              modelUsed: 'gemini-3.8-live',
            });
            deductedCredits = settled.settledAmount;
          } catch (settleErr) {
            logger.warn(`settleReservation error: ${settleErr}`);
          }
        } else {
          const existingUsage = await prisma.creditUsage.findFirst({
            where: { sessionId: input.sessionId },
          });
          if (!existingUsage) {
            await CreditService.consumeCredits(input.userId, {
              amount: calculatedCredits,
              feature: CreditFeatureType.MULTIMODAL_STREAM,
              reason: `Live session usage settlement (${durationSeconds}s)`,
              sessionId: input.sessionId,
              durationSeconds,
              unitsConsumed: durationSeconds,
              modelUsed: 'gemini-3.8-live',
            });
            deductedCredits = calculatedCredits;
          } else {
            deductedCredits = existingUsage.creditsDeducted;
          }
        }
      }

      // 4. Batch persist transcript segments (deduplicating by sequenceNumber)
      if (input.transcriptSegments && input.transcriptSegments.length > 0) {
        const defaultUserName = session?.user?.name || 'Pratham';
        for (const seg of input.transcriptSegments) {
          const existing = await prisma.sessionTranscriptSegment.findFirst({
            where: {
              sessionId: input.sessionId,
              sequenceNumber: seg.sequence_number,
            },
          });
          if (!existing) {
            await prisma.sessionTranscriptSegment.create({
              data: {
                sessionId: input.sessionId,
                speakerType: seg.speaker,
                speakerName:
                  seg.speaker_name ||
                  (seg.speaker === 'USER' ? defaultUserName : 'AI'),
                text: seg.text,
                isFinal: seg.is_final,
                sequenceNumber: seg.sequence_number,
                language: seg.language || 'en',
                startTimeMs: seg.start_time_ms,
                endTimeMs: seg.end_time_ms,
                metadata: seg.metadata || undefined,
              },
            });
          }
        }
      }

      // 5. Batch persist tool execution records
      if (input.toolExecutions && input.toolExecutions.length > 0) {
        for (const tool of input.toolExecutions) {
          const callId = tool.call_id || (tool as any).callId;
          const toolName = tool.tool_name || (tool as any).toolName;
          const args = tool.arguments || (tool as any).callArgs;
          const result = tool.result || (tool as any).resultMetadata || (tool as any).resultPayload;
          const duration = tool.execution_duration_ms ?? (tool as any).durationMs;
          const status = mapToolStatus(tool.status);

          if (!callId && !toolName) continue;

          const existing = callId
            ? await prisma.aIToolExecution.findFirst({
                where: {
                  sessionId: input.sessionId,
                  callId: callId,
                },
              })
            : null;

          if (!existing) {
            await prisma.aIToolExecution.create({
              data: {
                sessionId: input.sessionId,
                toolName: toolName || 'unknown_tool',
                callId: callId || undefined,
                arguments: args || undefined,
                resultMetadata: result || undefined,
                status: status,
                errorMessage: tool.error_message || (tool as any).errorMessage || undefined,
                executionDurationMs: duration || undefined,
              },
            });
          } else {
            await prisma.aIToolExecution.update({
              where: { id: existing.id },
              data: {
                status: status,
                arguments: args || undefined,
                resultMetadata: result || undefined,
                errorMessage: tool.error_message || (tool as any).errorMessage || undefined,
                executionDurationMs: duration || undefined,
                completedAt: new Date(),
              },
            });
          }
        }
      }

      // 6. Update AISession duration, status, and credits consumed
      const updatedSession = await prisma.aISession.update({
        where: { id: input.sessionId },
        data: {
          durationSeconds: durationSeconds,
          creditsConsumed: input.isFinal ? (deductedCredits > 0 ? deductedCredits : calculatedCredits) : undefined,
          status: input.isFinal ? SessionStatus.ENDED : SessionStatus.ACTIVE,
          endedAt: input.isFinal ? new Date() : undefined,
        },
      });

      // 7. Get fresh balance for client telemetry feedback
      const balance = await CreditService.getBalance(input.userId);

      return res.status(200).json({
        success: true,
        sessionId: input.sessionId,
        status: updatedSession.status,
        durationSeconds: updatedSession.durationSeconds,
        credits_deducted: deductedCredits,
        remaining_balance: balance.availableBalance,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async createSnapshot(req: Request, res: Response, next: NextFunction) {
    try {
      const internalKey = req.headers['x-internal-key'];
      if (!internalKey || internalKey !== env.INTERNAL_SERVICE_KEY) {
        logger.warn('Unauthorized attempt on internal snapshot endpoint');
        throw AppError.unauthorized('Unauthorized internal service access');
      }

      const {
        sessionId,
        userId: passedUserId,
        imageData,
        source,
        description,
        autoAnalyze,
      } = req.body;

      if (!sessionId || !imageData) {
        throw AppError.badRequest('sessionId and imageData are required');
      }

      const prisma = PrismaService.client;
      let userId = passedUserId;
      if (!userId) {
        const session = await prisma.aISession.findUnique({
          where: { id: sessionId },
          select: { userId: true },
        });
        if (!session) {
          throw AppError.notFound(`Session ${sessionId} not found`);
        }
        userId = session.userId;
      }

      const snapshot = await SnapshotService.captureSnapshot(userId, {
        sessionId,
        imageData,
        source: source === 'SCREEN' ? 'SCREEN' : 'CAMERA',
        description: description || 'AI Live Snapshot',
        autoAnalyze: autoAnalyze !== false,
      });

      sendSuccess(res, snapshot, 'Snapshot captured and persisted successfully', HTTP_STATUS.CREATED);
    } catch (error) {
      next(error);
    }
  }

  public static async recordToolExecution(req: Request, res: Response, next: NextFunction) {
    try {
      const internalKey = req.headers['x-internal-key'];
      if (!internalKey || internalKey !== env.INTERNAL_SERVICE_KEY) {
        logger.warn('Unauthorized attempt on internal tool-execution endpoint');
        throw AppError.unauthorized('Unauthorized internal service access');
      }

      const {
        sessionId,
        callId,
        toolName,
        status,
        arguments: args,
        callArgs,
        result,
        resultMetadata,
        executionDurationMs,
        durationMs,
        errorMessage,
        requiresApproval,
      } = req.body;

      if (!sessionId || !toolName) {
        throw AppError.badRequest('sessionId and toolName are required');
      }

      const prisma = PrismaService.client;
      const finalStatus = mapToolStatus(status);
      const finalArgs = args ?? callArgs ?? undefined;
      const finalResult = resultMetadata ?? result ?? undefined;
      const finalDuration = executionDurationMs ?? durationMs ?? undefined;

      if (callId) {
        const existing = await prisma.aIToolExecution.findFirst({
          where: { sessionId, callId },
        });

        if (existing) {
          const updated = await prisma.aIToolExecution.update({
            where: { id: existing.id },
            data: {
              status: finalStatus,
              arguments: finalArgs,
              resultMetadata: finalResult,
              executionDurationMs: finalDuration,
              errorMessage: errorMessage || undefined,
              completedAt: new Date(),
            },
          });
          return sendSuccess(res, updated, 'Tool execution record updated successfully', HTTP_STATUS.OK);
        }
      }

      const created = await prisma.aIToolExecution.create({
        data: {
          sessionId,
          toolName,
          callId: callId || undefined,
          status: finalStatus,
          requiresApproval: !!requiresApproval,
          arguments: finalArgs,
          resultMetadata: finalResult,
          executionDurationMs: finalDuration,
          errorMessage: errorMessage || undefined,
          completedAt: new Date(),
        },
      });

      sendSuccess(res, created, 'Tool execution recorded successfully', HTTP_STATUS.CREATED);
    } catch (error) {
      next(error);
    }
  }
}

