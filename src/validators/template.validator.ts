import { z } from 'zod';
import { SessionMode } from '@prisma/client';

export const TEMPLATE_CATEGORIES = [
  'VISION',
  'DEVELOPER',
  'LEARNING',
  'COPILOT',
  'PRESENTATION',
  'LANGUAGE',
  'MEETING',
  'GENERAL',
] as const;

export const TEMPLATE_FOCUS = [
  'CODE',
  'TEXT',
  'UI',
  'OBJECTS',
  'CHANGES',
  'TASK',
  'CUSTOM',
] as const;

export const TEMPLATE_RESPONSE_STYLES = [
  'CONCISE',
  'BALANCED',
  'DETAILED',
  'SOCRATIC',
  'EXECUTIVE',
  'CASUAL',
] as const;

export const TEMPLATE_PERSONA_TONES = [
  'PROFESSIONAL',
  'FRIENDLY',
  'TUTOR',
  'CASUAL',
  'EXECUTIVE',
] as const;

export const TEMPLATE_INPUT_SOURCES = ['camera', 'screen', 'both'] as const;

export const TEMPLATE_TRANSCRIPT_PREFERENCES = [
  'dual_isolated',
  'user_only',
  'ai_only',
] as const;

export const SUPPORTED_TOOLS = [
  'calculator',
  'create_note',
  'save_session_insight',
  'search_web',
  'create_session_task',
  'generate_session_summary',
  'capture_snapshot',
] as const;

export const createTemplateSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name must be under 100 characters'),
  description: z.string().trim().min(2, 'Description must be at least 2 characters').max(1000, 'Description must be under 1000 characters'),
  category: z.enum(TEMPLATE_CATEGORIES).default('GENERAL'),
  defaultMode: z.nativeEnum(SessionMode).default(SessionMode.VISION),
  systemPrompt: z.string().trim().min(5, 'System instruction must be at least 5 characters').max(5000, 'System instruction must be under 5000 characters'),
  defaultAiModel: z.string().trim().max(100).default('gemini-3.8-live'),
  preferredLanguage: z.string().trim().max(50).default('auto'),
  responseStyle: z.enum(TEMPLATE_RESPONSE_STYLES).default('CONCISE'),
  personaTone: z.enum(TEMPLATE_PERSONA_TONES).default('PROFESSIONAL'),
  aiVoice: z.string().trim().max(50).default('Puck'),
  focusInstruction: z.enum(TEMPLATE_FOCUS).default('TASK'),
  customFocus: z.string().trim().max(1000).optional().nullable(),
  inputSource: z.enum(TEMPLATE_INPUT_SOURCES).default('camera'),
  transcriptPreference: z.enum(TEMPLATE_TRANSCRIPT_PREFERENCES).default('dual_isolated'),
  enabledTools: z.array(z.string()).default([
    'capture_snapshot',
    'save_session_insight',
    'search_web',
  ]),
  isFavorite: z.boolean().default(false),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = createTemplateSchema.partial();
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const listTemplatesQuerySchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
  favoritesOnly: z.union([z.boolean(), z.string().transform((val) => val === 'true')]).optional(),
  systemOnly: z.union([z.boolean(), z.string().transform((val) => val === 'true')]).optional(),
  customOnly: z.union([z.boolean(), z.string().transform((val) => val === 'true')]).optional(),
  page: z.union([z.number(), z.string().transform((val) => parseInt(val, 10))]).optional().default(1),
  limit: z.union([z.number(), z.string().transform((val) => parseInt(val, 10))]).optional().default(50),
});

export type ListTemplatesQuery = z.infer<typeof listTemplatesQuerySchema>;
