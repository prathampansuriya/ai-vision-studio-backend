import { z } from 'zod';
import { SessionMode } from '@prisma/client';

export const FOCUS_INSTRUCTIONS = ['CODE', 'TEXT', 'UI', 'OBJECTS', 'CHANGES', 'TASK', 'CUSTOM'] as const;
export const RESPONSE_STYLES = ['CONCISE', 'DETAILED', 'SOCRATIC', 'EXECUTIVE', 'CASUAL'] as const;

export const createPresetSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80, 'Name must be under 80 characters'),
  description: z.string().trim().min(2, 'Description must be at least 2 characters').max(500, 'Description must be under 500 characters'),
  mode: z.nativeEnum(SessionMode).default(SessionMode.COMBINED_MULTIMODAL),
  focusInstruction: z.enum(FOCUS_INSTRUCTIONS).default('TASK'),
  customFocus: z.string().trim().max(500, 'Custom focus must be under 500 characters').optional().nullable(),
  responseStyle: z.enum(RESPONSE_STYLES).default('CONCISE'),
  language: z.string().trim().max(30).default('auto'),
  aiVoice: z.string().trim().max(50).default('Puck'),
  enabledTools: z.array(z.string()).default([
    'calculator',
    'create_note',
    'save_session_insight',
    'search_web',
    'create_session_task',
    'generate_session_summary',
    'capture_snapshot',
  ]),
  inputSource: z.enum(['camera', 'screen', 'both']).default('both'),
  customPrompt: z.string().trim().max(2000, 'Custom prompt must be under 2000 characters').optional().nullable(),
  isDefault: z.boolean().default(false),
});

export type CreatePresetInput = z.infer<typeof createPresetSchema>;

export const updatePresetSchema = createPresetSchema.partial();
export type UpdatePresetInput = z.infer<typeof updatePresetSchema>;

export const switchSessionModeSchema = z.object({
  mode: z.nativeEnum(SessionMode),
  focusInstruction: z.enum(FOCUS_INSTRUCTIONS).optional(),
  customFocus: z.string().trim().max(500).optional().nullable(),
  responseStyle: z.enum(RESPONSE_STYLES).optional(),
  customPrompt: z.string().trim().max(2000).optional().nullable(),
});

export type SwitchSessionModeInput = z.infer<typeof switchSessionModeSchema>;
