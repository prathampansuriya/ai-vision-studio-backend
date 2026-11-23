import { SessionMode } from '@prisma/client';
import { PrismaService } from './prisma.service.js';
import { AppError } from '../utils/appError.js';
import { logger } from '../utils/logger.js';
import {
  CreateTemplateInput,
  UpdateTemplateInput,
  ListTemplatesQuery,
} from '../validators/template.validator.js';

export interface SystemTemplateDefinition {
  slug: string;
  name: string;
  description: string;
  category: string;
  defaultMode: SessionMode;
  systemPrompt: string;
  defaultAiModel: string;
  preferredLanguage: string;
  responseStyle: string;
  personaTone: string;
  aiVoice: string;
  focusInstruction: string;
  customFocus: string | null;
  inputSource: string;
  transcriptPreference: string;
  enabledTools: string[];
  isSystem: boolean;
  isFavorite: boolean;
}

export const SYSTEM_TEMPLATES: SystemTemplateDefinition[] = [
  {
    slug: 'vision-assistant',
    name: 'Vision Assistant',
    description: 'Multimodal computer vision assistant for identifying real-world objects, spatial exploration, scene narration, and visual Q&A.',
    category: 'VISION',
    defaultMode: SessionMode.VISION,
    systemPrompt: 'You are Vision Assistant, an expert spatial vision AI. Focus on identifying physical and digital objects, describing scene dynamics, interpreting visible text, and answering user queries regarding what is visible in real-time.',
    defaultAiModel: 'gemini-3.8-live',
    preferredLanguage: 'auto',
    responseStyle: 'CONCISE',
    personaTone: 'PROFESSIONAL',
    aiVoice: 'Puck',
    focusInstruction: 'OBJECTS',
    customFocus: 'Prioritize identifying foreground objects, spatial boundaries, and visual labels.',
    inputSource: 'camera',
    transcriptPreference: 'dual_isolated',
    enabledTools: ['capture_snapshot', 'save_session_insight', 'search_web'],
    isSystem: true,
    isFavorite: false,
  },
  {
    slug: 'developer-assistant',
    name: 'Developer Assistant',
    description: 'Code debugging, stack trace analysis, terminal troubleshooting, architecture review, and screen-directed live software engineering.',
    category: 'DEVELOPER',
    defaultMode: SessionMode.DEVELOPER,
    systemPrompt: 'You are Developer Assistant, a principal software engineer and debugging copilot. Analyze screen shares displaying code, IDEs, terminal logs, and browser devtools. Pinpoint bugs, suggest refactoring, explain exceptions, and structure technical solutions.',
    defaultAiModel: 'gemini-3.8-live',
    preferredLanguage: 'auto',
    responseStyle: 'DETAILED',
    personaTone: 'PROFESSIONAL',
    aiVoice: 'Charon',
    focusInstruction: 'CODE',
    customFocus: 'Focus strictly on syntax, compilation errors, stack traces, and terminal standard output.',
    inputSource: 'screen',
    transcriptPreference: 'dual_isolated',
    enabledTools: [
      'calculator',
      'create_note',
      'save_session_insight',
      'search_web',
      'create_session_task',
      'generate_session_summary',
      'capture_snapshot',
    ],
    isSystem: true,
    isFavorite: true,
  },
  {
    slug: 'learning-assistant',
    name: 'Learning Assistant',
    description: 'Socratic conceptual mentor that guides understanding from first principles with progressive questioning, examples, and diagram interpretation.',
    category: 'LEARNING',
    defaultMode: SessionMode.LEARNING,
    systemPrompt: 'You are Learning Assistant, a patient educational tutor. Break complex topics into intuitive first-principle concepts. Ask guiding questions to test understanding, provide concrete analogies, and review diagrams or equations displayed on screen.',
    defaultAiModel: 'gemini-3.8-live',
    preferredLanguage: 'auto',
    responseStyle: 'SOCRATIC',
    personaTone: 'TUTOR',
    aiVoice: 'Aoede',
    focusInstruction: 'TASK',
    customFocus: 'Highlight core definitions, diagram elements, and mathematical reasoning.',
    inputSource: 'both',
    transcriptPreference: 'dual_isolated',
    enabledTools: [
      'calculator',
      'create_note',
      'save_session_insight',
      'generate_session_summary',
    ],
    isSystem: true,
    isFavorite: false,
  },
  {
    slug: 'screen-copilot',
    name: 'Screen Copilot',
    description: 'Real-time visual companion for digital interfaces, web browsing, data spreadsheets, and complex software workflows.',
    category: 'COPILOT',
    defaultMode: SessionMode.DEVELOPER,
    systemPrompt: 'You are Screen Copilot, a high-speed desktop companion. Guide users through UI navigation, software menus, workflow steps, and data tables displayed on their monitor. Keep verbal feedback swift, accurate, and task-oriented.',
    defaultAiModel: 'gemini-3.8-live',
    preferredLanguage: 'auto',
    responseStyle: 'CONCISE',
    personaTone: 'FRIENDLY',
    aiVoice: 'Fenrir',
    focusInstruction: 'UI',
    customFocus: 'Track active buttons, modals, form inputs, and visual state transitions.',
    inputSource: 'screen',
    transcriptPreference: 'dual_isolated',
    enabledTools: [
      'create_note',
      'create_session_task',
      'capture_snapshot',
      'save_session_insight',
    ],
    isSystem: true,
    isFavorite: false,
  },
  {
    slug: 'presentation-assistant',
    name: 'Presentation Assistant',
    description: 'Executive slide analyzer and rehearsal coach for pitch decks, visual hierarchy, timing, and executive communication.',
    category: 'PRESENTATION',
    defaultMode: SessionMode.PRESENTATION,
    systemPrompt: 'You are Presentation Assistant, an executive communications coach. Critique slide aesthetics, data legibility, bullet clarity, and narrative pacing. Provide actionable feedback to optimize presentation delivery and audience impact.',
    defaultAiModel: 'gemini-3.8-live',
    preferredLanguage: 'auto',
    responseStyle: 'EXECUTIVE',
    personaTone: 'PROFESSIONAL',
    aiVoice: 'Kore',
    focusInstruction: 'UI',
    customFocus: 'Evaluate typography contrast, slide density, and executive key takeaways.',
    inputSource: 'screen',
    transcriptPreference: 'dual_isolated',
    enabledTools: [
      'create_note',
      'capture_snapshot',
      'generate_session_summary',
      'save_session_insight',
    ],
    isSystem: true,
    isFavorite: false,
  },
  {
    slug: 'language-practice',
    name: 'Language Practice',
    description: 'Immersive foreign language speaking partner with instantaneous pronunciation coaching, vocabulary hints, and conversational practice.',
    category: 'LANGUAGE',
    defaultMode: SessionMode.LANGUAGE,
    systemPrompt: 'You are Language Practice, a warm multilingual conversation partner. Engage in fluent conversational practice, gently point out grammatical enhancements, explain colloquial phrases, and adapt speed to the user\'s proficiency level.',
    defaultAiModel: 'gemini-3.8-live',
    preferredLanguage: 'auto',
    responseStyle: 'CASUAL',
    personaTone: 'FRIENDLY',
    aiVoice: 'Puck',
    focusInstruction: 'TEXT',
    customFocus: 'Observe visible text, subtitles, and user articulation cues.',
    inputSource: 'camera',
    transcriptPreference: 'dual_isolated',
    enabledTools: ['create_note', 'save_session_insight', 'search_web'],
    isSystem: true,
    isFavorite: false,
  },
  {
    slug: 'meeting-intelligence',
    name: 'Meeting Intelligence',
    description: 'Executive meeting copilot that captures key points, detects decisions, tracks deliverables, and structures actionable summaries.',
    category: 'MEETING',
    defaultMode: SessionMode.MEETING,
    systemPrompt: 'You are Meeting Intelligence, an executive minute-taker and synthesis engine. Monitor live meeting dialogue, extract concrete decisions and action items, associate deadlines when explicitly stated, and produce structured meeting takeaways.',
    defaultAiModel: 'gemini-3.8-live',
    preferredLanguage: 'auto',
    responseStyle: 'EXECUTIVE',
    personaTone: 'PROFESSIONAL',
    aiVoice: 'Charon',
    focusInstruction: 'TASK',
    customFocus: 'Listen for consensus, task assignments, blockers, and agreed next steps.',
    inputSource: 'both',
    transcriptPreference: 'dual_isolated',
    enabledTools: [
      'create_note',
      'create_session_task',
      'generate_session_summary',
      'save_session_insight',
    ],
    isSystem: true,
    isFavorite: true,
  },
  {
    slug: 'general-ai-assistant',
    name: 'General AI Assistant',
    description: 'Versatile multimodal general assistant capable of simultaneous camera, screen, tool execution, and contextual conversation.',
    category: 'GENERAL',
    defaultMode: SessionMode.VISION,
    systemPrompt: 'You are General AI Assistant, a versatile multimodal collaborator. Answer broad questions, assist across diverse tasks, leverage web search and calculation tools, and adapt fluidly to the user\'s visual context.',
    defaultAiModel: 'gemini-3.8-live',
    preferredLanguage: 'auto',
    responseStyle: 'BALANCED',
    personaTone: 'FRIENDLY',
    aiVoice: 'Puck',
    focusInstruction: 'TASK',
    customFocus: 'Balance visual awareness, audio comprehension, and tool execution.',
    inputSource: 'both',
    transcriptPreference: 'dual_isolated',
    enabledTools: [
      'calculator',
      'create_note',
      'save_session_insight',
      'search_web',
      'create_session_task',
      'generate_session_summary',
      'capture_snapshot',
    ],
    isSystem: true,
    isFavorite: false,
  },
];

export class TemplateService {
  /**
   * Idempotently seeds the 8 canonical built-in templates into PostgreSQL.
   */
  public static async seedSystemTemplates(): Promise<void> {
    const prisma = PrismaService.client;
    try {
      for (const t of SYSTEM_TEMPLATES) {
        await prisma.sessionTemplate.upsert({
          where: { slug: t.slug },
          update: {
            name: t.name,
            title: t.name,
            description: t.description,
            category: t.category,
            defaultMode: t.defaultMode,
            systemPrompt: t.systemPrompt,
            defaultAiModel: t.defaultAiModel,
            preferredLanguage: t.preferredLanguage,
            responseStyle: t.responseStyle,
            personaTone: t.personaTone,
            aiVoice: t.aiVoice,
            focusInstruction: t.focusInstruction,
            customFocus: t.customFocus,
            inputSource: t.inputSource,
            transcriptPreference: t.transcriptPreference,
            enabledTools: t.enabledTools,
            isSystem: true,
            isActive: true,
          },
          create: {
            slug: t.slug,
            name: t.name,
            title: t.name,
            description: t.description,
            category: t.category,
            defaultMode: t.defaultMode,
            systemPrompt: t.systemPrompt,
            defaultAiModel: t.defaultAiModel,
            preferredLanguage: t.preferredLanguage,
            responseStyle: t.responseStyle,
            personaTone: t.personaTone,
            aiVoice: t.aiVoice,
            focusInstruction: t.focusInstruction,
            customFocus: t.customFocus,
            inputSource: t.inputSource,
            transcriptPreference: t.transcriptPreference,
            enabledTools: t.enabledTools,
            isSystem: true,
            isFavorite: t.isFavorite,
            isActive: true,
          },
        });
      }
      logger.info(`Successfully seeded ${SYSTEM_TEMPLATES.length} system session templates.`);
    } catch (error) {
      logger.error('Failed to seed system templates:', error);
      throw error;
    }
  }

  /**
   * Retrieves templates accessible to the user (all system templates + user custom templates),
   * with category filtering, search, and favorites filter.
   */
  public static async listTemplates(userId: string, query: ListTemplatesQuery) {
    const prisma = PrismaService.client;

    // Ensure system templates are present if database was empty
    const systemCount = await prisma.sessionTemplate.count({ where: { isSystem: true } });
    if (systemCount < SYSTEM_TEMPLATES.length) {
      await this.seedSystemTemplates();
    }

    const where: any = {
      isActive: true,
    };

    if (query.systemOnly) {
      where.isSystem = true;
    } else if (query.customOnly) {
      where.isSystem = false;
      where.userId = userId;
    } else {
      where.OR = [
        { isSystem: true },
        { userId },
      ];
    }

    if (query.favoritesOnly) {
      where.isFavorite = true;
    }

    if (query.category && query.category !== 'ALL') {
      where.category = query.category;
    }

    if (query.search && query.search.trim()) {
      const search = query.search.trim();
      where.AND = [
        {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { systemPrompt: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const [templates, totalCount] = await Promise.all([
      prisma.sessionTemplate.findMany({
        where,
        orderBy: [
          { isFavorite: 'desc' },
          { isSystem: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      prisma.sessionTemplate.count({ where }),
    ]);

    return {
      templates,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    };
  }

  /**
   * Retrieves a single template by ID, verifying access.
   */
  public static async getTemplateById(userId: string, templateId: string) {
    const prisma = PrismaService.client;

    const template = await prisma.sessionTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template || (!template.isSystem && template.userId !== userId)) {
      throw AppError.notFound(`Template '${templateId}' not found or access denied.`);
    }

    return template;
  }

  /**
   * Creates a custom user template.
   */
  public static async createTemplate(userId: string, input: CreateTemplateInput) {
    const prisma = PrismaService.client;

    // Validate plan feature entitlement
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });
    const plan = subscription?.plan || await prisma.plan.findFirst({ where: { tier: 'FREE' } });

    if (input.enabledTools && input.enabledTools.length > 0 && !plan?.supportsToolCalling) {
      throw AppError.forbidden(
        `Autonomous AI tool execution in templates requires a Professional plan or higher. Please upgrade your subscription to enable tools.`
      );
    }

    // Limit custom templates for Free tier to 3
    if (!subscription || plan?.tier === 'FREE') {
      const userCustomCount = await prisma.sessionTemplate.count({
        where: { userId, isSystem: false },
      });
      if (userCustomCount >= 3) {
        throw AppError.forbidden(
          `Free plan is limited to 3 custom session templates (Current: ${userCustomCount}/3). Please upgrade to Professional for unlimited custom templates.`
        );
      }
    }

    const baseSlug = input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

    const template = await prisma.sessionTemplate.create({
      data: {
        userId,
        name: input.name,
        title: input.name,
        slug: uniqueSlug,
        description: input.description,
        category: input.category,
        defaultMode: input.defaultMode,
        systemPrompt: input.systemPrompt,
        defaultAiModel: input.defaultAiModel || 'gemini-3.8-live',
        preferredLanguage: input.preferredLanguage || 'auto',
        responseStyle: input.responseStyle || 'CONCISE',
        personaTone: input.personaTone || 'PROFESSIONAL',
        aiVoice: input.aiVoice || 'Puck',
        focusInstruction: input.focusInstruction || 'TASK',
        customFocus: input.customFocus,
        inputSource: input.inputSource || 'camera',
        transcriptPreference: input.transcriptPreference || 'dual_isolated',
        enabledTools: input.enabledTools,
        isSystem: false,
        isFavorite: input.isFavorite || false,
        isActive: true,
      },
    });

    logger.info(`Created user session template '${template.name}' (${template.id}) for user ${userId}`);
    return template;
  }

  /**
   * Updates an existing user template. System templates cannot be edited directly.
   */
  public static async updateTemplate(userId: string, templateId: string, input: UpdateTemplateInput) {
    const prisma = PrismaService.client;

    const existing = await prisma.sessionTemplate.findUnique({
      where: { id: templateId },
    });

    if (!existing) {
      throw AppError.notFound(`Template '${templateId}' not found.`);
    }

    if (existing.isSystem) {
      throw AppError.badRequest('System built-in templates cannot be modified directly. Please duplicate this template to make custom modifications.');
    }

    if (existing.userId !== userId) {
      throw AppError.forbidden('You do not have permission to modify this template.');
    }

    const updated = await prisma.sessionTemplate.update({
      where: { id: templateId },
      data: {
        name: input.name ?? existing.name,
        title: input.name ?? existing.title,
        description: input.description ?? existing.description,
        category: input.category ?? existing.category,
        defaultMode: input.defaultMode ?? existing.defaultMode,
        systemPrompt: input.systemPrompt ?? existing.systemPrompt,
        defaultAiModel: input.defaultAiModel ?? existing.defaultAiModel,
        preferredLanguage: input.preferredLanguage ?? existing.preferredLanguage,
        responseStyle: input.responseStyle ?? existing.responseStyle,
        personaTone: input.personaTone ?? existing.personaTone,
        aiVoice: input.aiVoice ?? existing.aiVoice,
        focusInstruction: input.focusInstruction ?? existing.focusInstruction,
        customFocus: input.customFocus !== undefined ? input.customFocus : existing.customFocus,
        inputSource: input.inputSource ?? existing.inputSource,
        transcriptPreference: input.transcriptPreference ?? existing.transcriptPreference,
        enabledTools: input.enabledTools !== undefined ? (input.enabledTools as any) : (existing.enabledTools as any),
        isFavorite: input.isFavorite !== undefined ? input.isFavorite : existing.isFavorite,
      },
    });

    logger.info(`Updated user session template '${updated.name}' (${updated.id})`);
    return updated;
  }

  /**
   * Duplicates any template (system or user-owned) to create a new editable user custom template.
   */
  public static async duplicateTemplate(userId: string, templateId: string) {
    const prisma = PrismaService.client;

    const source = await prisma.sessionTemplate.findUnique({
      where: { id: templateId },
    });

    if (!source || (!source.isSystem && source.userId !== userId)) {
      throw AppError.notFound(`Source template '${templateId}' not found or access denied.`);
    }

    const newName = `${source.name} (Copy)`;
    const baseSlug = newName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

    const duplicated = await prisma.sessionTemplate.create({
      data: {
        userId,
        name: newName,
        title: newName,
        slug: uniqueSlug,
        description: source.description,
        category: source.category,
        defaultMode: source.defaultMode,
        systemPrompt: source.systemPrompt,
        defaultAiModel: source.defaultAiModel,
        preferredLanguage: source.preferredLanguage,
        responseStyle: source.responseStyle,
        personaTone: source.personaTone,
        aiVoice: source.aiVoice,
        focusInstruction: source.focusInstruction,
        customFocus: source.customFocus,
        inputSource: source.inputSource,
        transcriptPreference: source.transcriptPreference,
        enabledTools: source.enabledTools as any,
        isSystem: false,
        isFavorite: false,
        isActive: true,
      },
    });

    logger.info(`Duplicated template '${source.name}' to '${duplicated.name}' (${duplicated.id}) for user ${userId}`);
    return duplicated;
  }

  /**
   * Deletes a user custom template. System templates cannot be deleted.
   */
  public static async deleteTemplate(userId: string, templateId: string) {
    const prisma = PrismaService.client;

    const existing = await prisma.sessionTemplate.findUnique({
      where: { id: templateId },
    });

    if (!existing) {
      throw AppError.notFound(`Template '${templateId}' not found.`);
    }

    if (existing.isSystem) {
      throw AppError.badRequest('System built-in templates cannot be deleted.');
    }

    if (existing.userId !== userId) {
      throw AppError.forbidden('You do not have permission to delete this template.');
    }

    await prisma.sessionTemplate.delete({
      where: { id: templateId },
    });

    logger.info(`Deleted user session template '${existing.name}' (${templateId})`);
    return { success: true, message: `Template '${existing.name}' deleted successfully.` };
  }

  /**
   * Toggles the favorite status of a template.
   */
  public static async toggleFavorite(userId: string, templateId: string) {
    const prisma = PrismaService.client;

    const existing = await prisma.sessionTemplate.findUnique({
      where: { id: templateId },
    });

    if (!existing || (!existing.isSystem && existing.userId !== userId)) {
      throw AppError.notFound(`Template '${templateId}' not found or access denied.`);
    }

    const updated = await prisma.sessionTemplate.update({
      where: { id: templateId },
      data: {
        isFavorite: !existing.isFavorite,
      },
    });

    logger.info(`Toggled favorite on template '${updated.name}' to ${updated.isFavorite}`);
    return updated;
  }
}
