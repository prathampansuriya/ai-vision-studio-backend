import { z } from 'zod';
import { SessionMode, SessionStatus, TranscriptSpeaker, ToolExecutionStatus } from '@prisma/client';

export const createSessionSchema = z.object({
  title: z.string().trim().min(1).max(120).default('Live Vision Session'),
  mode: z.nativeEnum(SessionMode).default(SessionMode.COMBINED_MULTIMODAL),
  templateId: z.string().uuid().optional(),
  systemPrompt: z.string().max(4000).optional(),
  aiVoice: z.string().max(50).default('Puck'),
  language: z.string().max(20).default('auto'),
  inputSource: z.string().max(100).optional(),
  focusInstruction: z.string().optional(),
  customFocus: z.string().optional(),
  responseStyle: z.string().optional(),
  personaTone: z.string().optional(),
  userConfig: z.record(z.any()).optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const listSessionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().optional(),
  mode: z.nativeEnum(SessionMode).optional(),
  status: z.nativeEnum(SessionStatus).optional(),
  aiModel: z.string().trim().optional(),
  isArchived: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
  isFavorite: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  durationMin: z.coerce.number().int().min(0).optional(),
  durationMax: z.coerce.number().int().min(0).optional(),
  hasRecordings: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
  sortBy: z.enum(['createdAt', 'durationSeconds', 'creditsConsumed', 'title']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListSessionsInput = z.infer<typeof listSessionsSchema>;

export const updateSessionSchema = z.object({
  title: z.string().trim().min(1, 'Title cannot be empty').max(120, 'Title must be under 120 characters').optional(),
  isArchived: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
});

export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;

export const continueSessionSchema = z.object({
  title: z.string().trim().max(120).optional(),
  includeSummary: z.boolean().default(true),
  includeRecentTranscripts: z.boolean().default(true),
  includeMemories: z.boolean().default(true),
});

export type ContinueSessionInput = z.infer<typeof continueSessionSchema>;

export const exportTranscriptQuerySchema = z.object({
  format: z.enum(['txt', 'md', 'json']).default('txt'),
  speaker: z.nativeEnum(TranscriptSpeaker).optional(),
});

export type ExportTranscriptQuery = z.infer<typeof exportTranscriptQuerySchema>;

export const internalUsageSchema = z.preprocess((val: any) => {
  if (val && typeof val === 'object') {
    return {
      sessionId: val.sessionId || val.session_id,
      userId: val.userId || val.user_id,
      durationSeconds: val.durationSeconds ?? val.duration_seconds ?? 0,
      audioInputSeconds: val.audioInputSeconds ?? val.audio_input_seconds ?? 0,
      audioOutputSeconds: val.audioOutputSeconds ?? val.audio_output_seconds ?? 0,
      videoFramesCount: val.videoFramesCount ?? val.video_frames_count ?? 0,
      toolCallsCount: val.toolCallsCount ?? val.tool_calls_count ?? 0,
      transcriptionWordsCount: val.transcriptionWordsCount ?? val.transcription_words_count ?? 0,
      transcriptionAudioSeconds: val.transcriptionAudioSeconds ?? val.transcription_audio_seconds ?? 0,
      transcriptSegments: val.transcriptSegments || val.transcript_segments || [],
      toolExecutions: val.toolExecutions || val.tool_executions || [],
      isFinal: val.isFinal ?? val.is_final ?? false,
      timestamp: val.timestamp,
    };
  }
  return val;
}, z.object({
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
  durationSeconds: z.number().int().min(0).default(0),
  audioInputSeconds: z.number().min(0).default(0),
  audioOutputSeconds: z.number().min(0).default(0),
  videoFramesCount: z.number().int().min(0).default(0),
  toolCallsCount: z.number().int().min(0).default(0),
  transcriptionWordsCount: z.number().int().min(0).default(0),
  transcriptionAudioSeconds: z.number().min(0).default(0),
  transcriptSegments: z.array(
    z.object({
      speaker: z.nativeEnum(TranscriptSpeaker),
      speaker_name: z.string().optional().nullable(),
      text: z.string(),
      is_final: z.boolean().default(true),
      sequence_number: z.number().int(),
      language: z.string().default('en'),
      start_time_ms: z.number().int().optional().nullable(),
      end_time_ms: z.number().int().optional().nullable(),
      metadata: z.record(z.any()).optional().nullable(),
    })
  ).default([]),
  toolExecutions: z.array(
    z.preprocess((val: any) => {
      if (val && typeof val === 'object') {
        return {
          tool_name: val.tool_name || val.toolName || 'unknown_tool',
          call_id: val.call_id || val.callId || val.id || '',
          arguments: val.arguments || val.callArgs || val.args || null,
          result: val.result || val.resultMetadata || val.resultPayload || null,
          status: val.status || 'SUCCESS',
          error_message: val.error_message || val.errorMessage || null,
          execution_duration_ms: val.execution_duration_ms ?? val.durationMs ?? val.executionDurationMs ?? null,
        };
      }
      return val;
    }, z.object({
      tool_name: z.string(),
      call_id: z.string(),
      arguments: z.any().optional().nullable(),
      result: z.any().optional().nullable(),
      status: z.string().default('SUCCESS'),
      error_message: z.string().optional().nullable(),
      execution_duration_ms: z.number().int().optional().nullable(),
    }))
  ).default([]),
  isFinal: z.boolean().default(false),
  timestamp: z.string().optional(),
}));

export type InternalUsageInput = z.infer<typeof internalUsageSchema>;

export const updateSessionControlsSchema = z.object({
  isPaused: z.boolean().optional(),
  isVisualPaused: z.boolean().optional(),
  inputSource: z.enum(['camera', 'screen', 'both', 'paused']).optional(),
  focusInstruction: z.enum(['CODE', 'UI', 'TEXT', 'OBJECTS', 'CHANGES', 'TASK', 'CUSTOM']).optional(),
  customFocus: z.string().trim().max(500).optional().nullable(),
  responseStyle: z.enum(['CONCISE', 'BALANCED', 'DETAILED', 'SOCRATIC', 'EXECUTIVE', 'CASUAL']).optional(),
  personaTone: z.enum(['PROFESSIONAL', 'FRIENDLY', 'TUTOR']).optional(),
  language: z.string().trim().max(30).optional(),
  aiVoice: z.enum(['Puck', 'Charon', 'Aoede', 'Fenrir', 'Kore']).optional(),
  volume: z.number().min(0).max(100).optional(),
  playbackSpeed: z.number().min(0.5).max(2.0).optional(),
  isAiMuted: z.boolean().optional(),
});

export type UpdateSessionControlsInput = z.infer<typeof updateSessionControlsSchema>;
