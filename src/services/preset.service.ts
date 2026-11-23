import { SessionMode } from '@prisma/client';
import { PrismaService } from './prisma.service.js';
import { AppError } from '../utils/appError.js';
import { logger } from '../utils/logger.js';
import { CreatePresetInput, UpdatePresetInput } from '../validators/preset.validator.js';

export const SYSTEM_PRESETS: Array<{
  slug: string;
  name: string;
  description: string;
  mode: SessionMode;
  focusInstruction: string;
  responseStyle: string;
  language: string;
  aiVoice: string;
  enabledTools: string[];
  inputSource: string;
  isSystem: boolean;
  isDefault: boolean;
}> = [
  {
    slug: 'vision-scene-explorer',
    name: 'Vision Scene Explorer',
    description: 'Understand physical and digital objects, describe scenes, answer visual queries, and guide real-world spatial exploration.',
    mode: SessionMode.VISION,
    focusInstruction: 'OBJECTS',
    responseStyle: 'CONCISE',
    language: 'auto',
    aiVoice: 'Puck',
    enabledTools: ['capture_snapshot', 'save_session_insight', 'search_web'],
    inputSource: 'camera',
    isSystem: true,
    isDefault: true,
  },
  {
    slug: 'senior-developer-architect',
    name: 'Senior Developer & Architect',
    description: 'Inspect screen share, review source code, diagnose stack traces, explain terminal logs, and guide software engineering.',
    mode: SessionMode.DEVELOPER,
    focusInstruction: 'CODE',
    responseStyle: 'CONCISE',
    language: 'auto',
    aiVoice: 'Charon',
    enabledTools: ['calculator', 'create_note', 'save_session_insight', 'search_web', 'create_session_task', 'generate_session_summary', 'capture_snapshot'],
    inputSource: 'screen',
    isSystem: true,
    isDefault: false,
  },
  {
    slug: 'socratic-learning-tutor',
    name: 'Socratic Concept Mentor',
    description: 'Teach concepts progressively from first principles, ask guiding questions, explain diagrams, and foster deep comprehension.',
    mode: SessionMode.LEARNING,
    focusInstruction: 'TASK',
    responseStyle: 'SOCRATIC',
    language: 'auto',
    aiVoice: 'Aoede',
    enabledTools: ['calculator', 'create_note', 'save_session_insight', 'generate_session_summary'],
    inputSource: 'both',
    isSystem: true,
    isDefault: false,
  },
  {
    slug: 'executive-productivity-sprint',
    name: 'Executive Productivity Sprint',
    description: 'Accelerate workflow execution, summarize lengthy documents, track action items, and unblock sequential task dependencies.',
    mode: SessionMode.PRODUCTIVITY,
    focusInstruction: 'TASK',
    responseStyle: 'EXECUTIVE',
    language: 'auto',
    aiVoice: 'Fenrir',
    enabledTools: ['create_note', 'create_session_task', 'generate_session_summary', 'save_session_insight'],
    inputSource: 'screen',
    isSystem: true,
    isDefault: false,
  },
  {
    slug: 'presentation-rehearsal-coach',
    name: 'Slide & Rehearsal Coach',
    description: 'Review slides and pitch decks, evaluate visual hierarchy and data presentation, and rehearse spoken pitch timing.',
    mode: SessionMode.PRESENTATION,
    focusInstruction: 'UI',
    responseStyle: 'EXECUTIVE',
    language: 'auto',
    aiVoice: 'Kore',
    enabledTools: ['create_note', 'capture_snapshot', 'generate_session_summary', 'save_session_insight'],
    inputSource: 'screen',
    isSystem: true,
    isDefault: false,
  },
  {
    slug: 'multilingual-conversation-partner',
    name: 'Multilingual Conversational Partner',
    description: 'Practice speaking natural foreign languages with real-time pronunciation guidance, idioms, and translations.',
    mode: SessionMode.LANGUAGE,
    focusInstruction: 'TEXT',
    responseStyle: 'CASUAL',
    language: 'auto',
    aiVoice: 'Puck',
    enabledTools: ['create_note', 'search_web'],
    inputSource: 'camera',
    isSystem: true,
    isDefault: false,
  },
  {
    slug: 'executive-meeting-scribe',
    name: 'Executive Meeting Scribe',
    description: 'Synthesize spoken dialogue, log key decisions, track accountability commitments, and produce crisp executive minutes.',
    mode: SessionMode.MEETING,
    focusInstruction: 'TASK',
    responseStyle: 'EXECUTIVE',
    language: 'auto',
    aiVoice: 'Charon',
    enabledTools: ['create_note', 'create_session_task', 'generate_session_summary', 'save_session_insight'],
    inputSource: 'both',
    isSystem: true,
    isDefault: false,
  },
  {
    slug: 'custom-multimodal-studio',
    name: 'Custom Multimodal Studio',
    description: 'Completely user-configured session with customized prompts, response style, and granular focus directives.',
    mode: SessionMode.CUSTOM,
    focusInstruction: 'CUSTOM',
    responseStyle: 'CONCISE',
    language: 'auto',
    aiVoice: 'Puck',
    enabledTools: ['calculator', 'create_note', 'save_session_insight', 'search_web', 'create_session_task', 'generate_session_summary', 'capture_snapshot'],
    inputSource: 'both',
    isSystem: true,
    isDefault: false,
  },
];

export class PresetService {
  /**
   * Lists all available presets: system presets + user's custom presets.
   */
  public static async listPresets(userId?: string) {
    const prisma = PrismaService.client;

    // Ensure system presets are seeded
    await this.ensureSystemPresets();

    const presets = await prisma.sessionPreset.findMany({
      where: {
        OR: [
          { isSystem: true },
          ...(userId ? [{ userId }] : []),
        ],
      },
      orderBy: [
        { isSystem: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return presets;
  }

  /**
   * Retrieves a single preset by ID or slug.
   */
  public static async getPresetById(presetIdOrSlug: string, userId?: string) {
    const prisma = PrismaService.client;

    const preset = await prisma.sessionPreset.findFirst({
      where: {
        OR: [
          { id: presetIdOrSlug },
          { slug: presetIdOrSlug },
        ],
        AND: [
          {
            OR: [
              { isSystem: true },
              ...(userId ? [{ userId }] : []),
            ],
          },
        ],
      },
    });

    if (!preset) {
      throw AppError.notFound(`Preset '${presetIdOrSlug}' not found or access denied.`);
    }

    return preset;
  }

  /**
   * Creates a user-configured session preset.
   */
  public static async createPreset(userId: string, input: CreatePresetInput) {
    const prisma = PrismaService.client;

    const baseSlug = input.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`;

    // If marked as default, unmark other user defaults
    if (input.isDefault) {
      await prisma.sessionPreset.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const preset = await prisma.sessionPreset.create({
      data: {
        userId,
        name: input.name,
        slug: uniqueSlug,
        description: input.description,
        mode: input.mode,
        focusInstruction: input.focusInstruction,
        customFocus: input.customFocus,
        responseStyle: input.responseStyle,
        language: input.language,
        aiVoice: input.aiVoice,
        enabledTools: input.enabledTools,
        inputSource: input.inputSource,
        customPrompt: input.customPrompt,
        isSystem: false,
        isDefault: input.isDefault,
      },
    });

    logger.info(`Created user session preset '${preset.name}' (${preset.id}) for user ${userId}`);
    return preset;
  }

  /**
   * Updates an existing user preset (system presets are immutable).
   */
  public static async updatePreset(presetId: string, userId: string, input: UpdatePresetInput) {
    const prisma = PrismaService.client;

    const existing = await prisma.sessionPreset.findUnique({
      where: { id: presetId },
    });

    if (!existing) {
      throw AppError.notFound(`Preset '${presetId}' not found.`);
    }

    if (existing.isSystem || existing.userId !== userId) {
      throw AppError.forbidden('Cannot modify system presets or presets belonging to other users.');
    }

    if (input.isDefault) {
      await prisma.sessionPreset.updateMany({
        where: { userId, isDefault: true, id: { not: presetId } },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.sessionPreset.update({
      where: { id: presetId },
      data: {
        name: input.name ?? existing.name,
        description: input.description ?? existing.description,
        mode: input.mode ?? existing.mode,
        focusInstruction: input.focusInstruction ?? existing.focusInstruction,
        customFocus: input.customFocus !== undefined ? input.customFocus : existing.customFocus,
        responseStyle: input.responseStyle ?? existing.responseStyle,
        language: input.language ?? existing.language,
        aiVoice: input.aiVoice ?? existing.aiVoice,
        enabledTools: input.enabledTools ?? (existing.enabledTools as any),
        inputSource: input.inputSource ?? existing.inputSource,
        customPrompt: input.customPrompt !== undefined ? input.customPrompt : existing.customPrompt,
        isDefault: input.isDefault !== undefined ? input.isDefault : existing.isDefault,
      },
    });

    logger.info(`Updated user preset '${updated.name}' (${updated.id})`);
    return updated;
  }

  /**
   * Deletes a user custom preset.
   */
  public static async deletePreset(presetId: string, userId: string) {
    const prisma = PrismaService.client;

    const existing = await prisma.sessionPreset.findUnique({
      where: { id: presetId },
    });

    if (!existing) {
      throw AppError.notFound(`Preset '${presetId}' not found.`);
    }

    if (existing.isSystem || existing.userId !== userId) {
      throw AppError.forbidden('System presets cannot be deleted.');
    }

    await prisma.sessionPreset.delete({
      where: { id: presetId },
    });

    logger.info(`Deleted user preset '${existing.name}' (${presetId})`);
    return { success: true, message: `Preset '${existing.name}' deleted successfully.` };
  }

  /**
   * Ensures system presets for all 8 modes exist in the database idempotently.
   */
  public static async ensureSystemPresets() {
    const prisma = PrismaService.client;

    const count = await prisma.sessionPreset.count({
      where: { isSystem: true },
    });

    if (count >= SYSTEM_PRESETS.length) {
      return;
    }

    for (const preset of SYSTEM_PRESETS) {
      await prisma.sessionPreset.upsert({
        where: { slug: preset.slug },
        update: preset,
        create: preset,
      });
    }
  }
}
