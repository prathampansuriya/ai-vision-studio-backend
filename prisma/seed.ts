import { PrismaClient, PlanTier, SessionMode } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting AI Vision Studio database seed...');

  // 1. Seed System Subscription Plans (Idempotent upsert by PlanTier)
  console.log('📦 Seeding subscription plans...');
  const plans = [
    {
      tier: PlanTier.FREE,
      name: 'Free Starter',
      description: 'Essential multimodal AI workspace with standard camera, audio, and transcription.',
      stripeProductId: null,
      stripeMonthlyPriceId: null,
      stripeYearlyPriceId: null,
      monthlyCredits: 100,
      maxSessionDurationSeconds: 1800, // 30 mins
      maxConcurrentSessions: 1,
      supportsVision: true,
      supportsScreenShare: true,
      supportsVoice: true,
      supportsToolCalling: false,
      features: [
        'Live Camera & Screen Sharing',
        'Real-time Audio Transcription',
        'Standard Gemini Flash Model',
        '100 Monthly Credits',
      ],
      isActive: true,
      sortOrder: 1,
    },
    {
      tier: PlanTier.PRO,
      name: 'Professional',
      description: 'Advanced real-time multimodal intelligence, tool execution, and extended session length.',
      stripeProductId: process.env.STRIPE_PRO_PRODUCT_ID || null,
      stripeMonthlyPriceId: process.env.STRIPE_PRO_PRICE_ID || null,
      stripeYearlyPriceId: process.env.STRIPE_PRO_YEARLY_PRICE_ID || null,
      monthlyCredits: 1000,
      maxSessionDurationSeconds: 7200, // 2 hours
      maxConcurrentSessions: 2,
      supportsVision: true,
      supportsScreenShare: true,
      supportsVoice: true,
      supportsToolCalling: true,
      features: [
        'Everything in Free',
        'High-FPS Vision Analysis',
        'Real-time AI Tool Executions',
        'Structured Session Memories',
        'Cloudinary Snapshot Archival',
        '1,000 Monthly Credits',
      ],
      isActive: true,
      sortOrder: 2,
    },
    {
      tier: PlanTier.BUSINESS,
      name: 'Business Team',
      description: 'High-throughput multimodal AI workspace for engineering, design, and collaborative teams.',
      stripeProductId: process.env.STRIPE_BUSINESS_PRODUCT_ID || null,
      stripeMonthlyPriceId: process.env.STRIPE_BUSINESS_PRICE_ID || null,
      stripeYearlyPriceId: process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID || null,
      monthlyCredits: 5000,
      maxSessionDurationSeconds: 14400, // 4 hours
      maxConcurrentSessions: 5,
      supportsVision: true,
      supportsScreenShare: true,
      supportsVoice: true,
      supportsToolCalling: true,
      features: [
        'Everything in Pro',
        'Priority Gemini Live Processing',
        '5 Concurrent Sessions',
        'Automated Executive Meeting Summaries',
        'Team Transcript & Insight Exports',
        '5,000 Monthly Credits',
      ],
      isActive: true,
      sortOrder: 3,
    },
    {
      tier: PlanTier.ENTERPRISE,
      name: 'Enterprise Scale',
      description: 'Custom multimodal pipelines, dedicated concurrency, and tailored credit allowances.',
      stripeProductId: process.env.STRIPE_ENTERPRISE_PRODUCT_ID || null,
      stripeMonthlyPriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || null,
      stripeYearlyPriceId: process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID || null,
      monthlyCredits: 25000,
      maxSessionDurationSeconds: 28800, // 8 hours
      maxConcurrentSessions: 10,
      supportsVision: true,
      supportsScreenShare: true,
      supportsVoice: true,
      supportsToolCalling: true,
      features: [
        'Unlimited Duration Sessions',
        '10 Concurrent Multimodal Channels',
        'Dedicated RPC Pipeline',
        'Custom Tool Integrations',
        '25,000 Monthly Credits',
      ],
      isActive: true,
      sortOrder: 4,
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { tier: plan.tier },
      update: plan,
      create: plan,
    });
  }
  console.log(`✅ Seeded ${plans.length} subscription plans.`);

  // 2. Seed System Configurable Session Templates (Idempotent upsert for 8 canonical templates)
  console.log('📋 Seeding system session templates...');
  const templates = [
    {
      slug: 'vision-assistant',
      name: 'Vision Assistant',
      title: 'Vision Assistant',
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
      isActive: true,
    },
    {
      slug: 'developer-assistant',
      name: 'Developer Assistant',
      title: 'Developer Assistant',
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
      isActive: true,
    },
    {
      slug: 'learning-assistant',
      name: 'Learning Assistant',
      title: 'Learning Assistant',
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
      isActive: true,
    },
    {
      slug: 'screen-copilot',
      name: 'Screen Copilot',
      title: 'Screen Copilot',
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
      isActive: true,
    },
    {
      slug: 'presentation-assistant',
      name: 'Presentation Assistant',
      title: 'Presentation Assistant',
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
      isActive: true,
    },
    {
      slug: 'language-practice',
      name: 'Language Practice',
      title: 'Language Practice',
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
      isActive: true,
    },
    {
      slug: 'meeting-intelligence',
      name: 'Meeting Intelligence',
      title: 'Meeting Intelligence',
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
      isActive: true,
    },
    {
      slug: 'general-ai-assistant',
      name: 'General AI Assistant',
      title: 'General AI Assistant',
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
      isActive: true,
    },
  ];

  // Clean up legacy test templates if any
  const allowedSlugs = templates.map((t) => t.slug);
  await prisma.sessionTemplate.deleteMany({
    where: {
      isSystem: true,
      slug: { notIn: allowedSlugs },
    },
  });

  for (const tpl of templates) {
    await prisma.sessionTemplate.upsert({
      where: { slug: tpl.slug },
      update: tpl,
      create: tpl,
    });
  }
  console.log(`✅ Seeded ${templates.length} system session templates.`);

  // 3. Seed System Presets for all 8 Operational AI Modes
  console.log('🎛️ Seeding system session presets...');
  const presets = [
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

  for (const preset of presets) {
    await prisma.sessionPreset.upsert({
      where: { slug: preset.slug },
      update: preset,
      create: preset,
    });
  }
  console.log(`✅ Seeded ${presets.length} system session presets.`);

  console.log('🎉 Database seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
