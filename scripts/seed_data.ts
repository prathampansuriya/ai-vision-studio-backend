import { PrismaClient, PlanTier, SessionMode, SessionStatus, TranscriptSpeaker, MemoryCategory, MemoryImportance, ToolExecutionStatus, NotificationType, CreditTransactionType, CreditFeatureType, SubscriptionStatus, BillingInterval } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function seedPrathamData() {
  const email = 'prathampansuriya444@gmail.com';
  console.log(`🚀 Starting realistic data seeding for: ${email}`);

  // 1. Verify User Exists
  const user = await prisma.user.findUnique({
    where: { email },
    include: { profile: true },
  });

  if (!user) {
    throw new Error(`User with email ${email} not found!`);
  }
  const userId = user.id;
  console.log(`✅ Found user: ${user.name} (${user.id})`);

  // 2. Find Free Plan
  const freePlan = await prisma.plan.findUnique({
    where: { tier: PlanTier.FREE },
  });
  if (!freePlan) {
    throw new Error('Free plan not found in database!');
  }
  console.log(`✅ Found Free Plan: ${freePlan.name} (${freePlan.id})`);

  // 3. Clean up prior seeded data for idempotency (preserving user and core account)
  console.log('🧹 Cleaning up prior seeded activity data for idempotency...');
  await prisma.snapshotComparison.deleteMany({ where: { userId } });
  await prisma.sessionReport.deleteMany({ where: { userId } });
  await prisma.savedInsight.deleteMany({ where: { userId } });
  await prisma.notification.deleteMany({ where: { userId } });
  await prisma.recentSearch.deleteMany({ where: { userId } });
  await prisma.sessionTemplate.deleteMany({ where: { userId, isSystem: false } });
  await prisma.creditReservation.deleteMany({ where: { userId } });
  await prisma.creditUsage.deleteMany({ where: { userId } });
  await prisma.creditLedger.deleteMany({ where: { userId, type: CreditTransactionType.USAGE } });
  await prisma.aISession.deleteMany({ where: { userId } });

  // 4. Update / Ensure Welcome Bonus Grant Entry on Nov 1, 2026
  const grantDate = new Date('2026-11-01T08:00:00.000Z');
  const existingGrant = await prisma.creditLedger.findFirst({
    where: { userId, type: CreditTransactionType.GRANT },
  });

  if (existingGrant) {
    await prisma.creditLedger.update({
      where: { id: existingGrant.id },
      data: {
        amount: 100,
        balanceAfter: 100,
        reason: 'Monthly Free Tier credit grant (100 credits)',
        billingPeriod: '2026-11',
        createdAt: grantDate,
      },
    });
    console.log('✅ Updated initial credit grant: 100 credits at 2026-11-01');
  } else {
    await prisma.creditLedger.create({
      data: {
        userId,
        amount: 100,
        balanceAfter: 100,
        type: CreditTransactionType.GRANT,
        reason: 'Monthly Free Tier credit grant (100 credits)',
        billingPeriod: '2026-11',
        createdAt: grantDate,
      },
    });
    console.log('✅ Created initial credit grant: 100 credits at 2026-11-01');
  }

  // 5. Update User Profile & Notification Preferences
  await prisma.userProfile.upsert({
    where: { userId },
    update: {
      headline: 'Full Stack AI Engineer & Multimodal Vision Architect',
      company: 'Vision Studio Labs',
      bio: 'Architecting real-time WebSockets, computer vision, and multimodal AI copilots with high-throughput streaming pipelines.',
      location: 'Surat, Gujarat, India',
      timezone: 'Asia/Kolkata',
      preferredLanguage: 'en',
      theme: 'system',
      aiVoice: 'Puck',
      responseStyle: 'CONCISE',
      personaTone: 'PROFESSIONAL',
    },
    create: {
      userId,
      headline: 'Full Stack AI Engineer & Multimodal Vision Architect',
      company: 'Vision Studio Labs',
      bio: 'Architecting real-time WebSockets, computer vision, and multimodal AI copilots with high-throughput streaming pipelines.',
      location: 'Surat, Gujarat, India',
      timezone: 'Asia/Kolkata',
      preferredLanguage: 'en',
      theme: 'system',
      aiVoice: 'Puck',
      responseStyle: 'CONCISE',
      personaTone: 'PROFESSIONAL',
    },
  });

  await prisma.userNotificationPreferences.upsert({
    where: { userId },
    update: {
      emailSessionSummaries: true,
      emailBillingAlerts: true,
      emailCreditLowAlerts: true,
      inAppSessionAlerts: true,
      inAppSecurityAlerts: true,
      creditThresholdAlert: 30,
    },
    create: {
      userId,
      emailSessionSummaries: true,
      emailBillingAlerts: true,
      emailCreditLowAlerts: true,
      inAppSessionAlerts: true,
      inAppSecurityAlerts: true,
      creditThresholdAlert: 30,
    },
  });

  // 6. Ensure Subscription is Active on Free Plan
  await prisma.subscription.upsert({
    where: { userId },
    update: {
      planId: freePlan.id,
      status: SubscriptionStatus.ACTIVE,
      billingInterval: BillingInterval.MONTHLY,
      currentPeriodStart: new Date('2026-11-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-12-01T00:00:00.000Z'),
    },
    create: {
      userId,
      planId: freePlan.id,
      status: SubscriptionStatus.ACTIVE,
      billingInterval: BillingInterval.MONTHLY,
      currentPeriodStart: new Date('2026-11-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-12-01T00:00:00.000Z'),
    },
  });
  console.log('✅ Active Free Tier subscription linked');

  // 7. Seed Custom Session Templates (Pratham's custom templates)
  const template1 = await prisma.sessionTemplate.create({
    data: {
      userId,
      name: 'Full-Stack React & Code Reviewer',
      title: 'Full-Stack React & Code Reviewer',
      slug: 'pratham-react-code-reviewer',
      description: 'Autonomous copilot for React component hierarchy, hooks optimization, and Tailwind CSS auditing.',
      category: 'DEVELOPER',
      defaultMode: SessionMode.DEVELOPER,
      systemPrompt: 'You are an elite Senior Staff Frontend Engineer reviewing React 19, TypeScript, and modern state architectures.',
      defaultAiModel: 'gemini-2.0-flash-exp',
      isSystem: false,
      isFavorite: true,
      isActive: true,
      inputSource: 'screen',
      transcriptPreference: 'dual_isolated',
    },
  });

  const template2 = await prisma.sessionTemplate.create({
    data: {
      userId,
      name: 'Multimodal Vision & OCR Inspector',
      title: 'Multimodal Vision & OCR Inspector',
      slug: 'pratham-vision-ocr-inspector',
      description: 'High-frequency visual analysis template for UI diagrams, DOM inspection, and text extraction.',
      category: 'VISION',
      defaultMode: SessionMode.VISION,
      systemPrompt: 'You are a computer vision specialist detecting visual discrepancies, layout shifts, and OCR text in live streams.',
      defaultAiModel: 'gemini-2.0-flash-exp',
      isSystem: false,
      isFavorite: true,
      isActive: true,
      inputSource: 'both',
      transcriptPreference: 'dual_isolated',
    },
  });
  console.log('✅ Created 2 custom session templates');

  // 8. Seed 6 Rich Sessions with Exact Credit Deductions (10 + 8 + 5 + 6 + 9 + 7 = 45 credits)
  let runningBalance = 100;

  // --------------------------------------------------------------------------
  // SESSION 1: Developer Mode (10 credits) - Pure English
  // --------------------------------------------------------------------------
  console.log('📦 Seeding Session 1: Full-Stack React & Tailwind Architecture Review (10 credits)...');
  const s1Start = new Date('2026-11-03T10:15:00.000Z');
  const s1End = new Date('2026-11-03T10:35:00.000Z');
  const s1Duration = 1200; // 20 mins
  const s1Credits = 10;
  runningBalance -= s1Credits; // 90

  const session1 = await prisma.aISession.create({
    data: {
      userId,
      templateId: template1.id,
      title: 'Full-Stack React & Tailwind Architecture Review',
      mode: SessionMode.DEVELOPER,
      status: SessionStatus.ENDED,
      inputSource: 'screen',
      aiModel: 'gemini-2.0-flash-exp',
      transcriptionModel: 'gemini-2.0-flash-exp',
      startedAt: s1Start,
      endedAt: s1End,
      durationSeconds: s1Duration,
      creditsConsumed: s1Credits,
      isFavorite: true,
      createdAt: s1Start,
      updatedAt: s1End,
    },
  });

  // Transcript 1 (English)
  await prisma.sessionTranscriptSegment.createMany({
    data: [
      {
        sessionId: session1.id,
        speakerType: TranscriptSpeaker.USER,
        speakerName: 'Pratham Pansuriya',
        text: 'Let us review our React dashboard component tree. I want to ensure state management does not trigger unnecessary re-renders in the analytics chart widgets.',
        sequenceNumber: 1,
        startTimeMs: 1200,
        endTimeMs: 8400,
        language: 'en',
        confidence: 0.98,
        createdAt: new Date('2026-11-03T10:15:10.000Z'),
      },
      {
        sessionId: session1.id,
        speakerType: TranscriptSpeaker.AI,
        speakerName: 'AI Copilot',
        text: 'Looking at your screen, your analytics dashboard re-renders every 500ms because the entire websocket telemetry state is lifted to the root Dashboard container. We should isolate high-frequency audio meters into a scoped Zustand store or atomic atom.',
        sequenceNumber: 2,
        startTimeMs: 9100,
        endTimeMs: 22400,
        language: 'en',
        confidence: 0.99,
        createdAt: new Date('2026-11-03T10:15:25.000Z'),
      },
      {
        sessionId: session1.id,
        speakerType: TranscriptSpeaker.USER,
        speakerName: 'Pratham Pansuriya',
        text: 'That makes total sense. If we extract useAudioTelemetry into a dedicated selector-based store, what happens to the chart render cycle?',
        sequenceNumber: 3,
        startTimeMs: 23500,
        endTimeMs: 31200,
        language: 'en',
        confidence: 0.97,
        createdAt: new Date('2026-11-03T10:15:35.000Z'),
      },
      {
        sessionId: session1.id,
        speakerType: TranscriptSpeaker.AI,
        speakerName: 'AI Copilot',
        text: 'Only the volume bar and waveform canvas will repaint at 60 FPS. The heavier KPI cards and historical trend chart will remain completely idle until new aggregated REST intervals arrive.',
        sequenceNumber: 4,
        startTimeMs: 32000,
        endTimeMs: 44000,
        language: 'en',
        confidence: 0.99,
        createdAt: new Date('2026-11-03T10:15:48.000Z'),
      },
      {
        sessionId: session1.id,
        speakerType: TranscriptSpeaker.USER,
        speakerName: 'Pratham Pansuriya',
        text: 'Awesome! Also check the Tailwind CSS classes on the header nav. Are we consistent with dark and light themes?',
        sequenceNumber: 5,
        startTimeMs: 45000,
        endTimeMs: 51200,
        language: 'en',
        confidence: 0.96,
        createdAt: new Date('2026-11-03T10:16:00.000Z'),
      },
      {
        sessionId: session1.id,
        speakerType: TranscriptSpeaker.AI,
        speakerName: 'AI Copilot',
        text: 'The header nav uses bg-slate-900 with dark:border-slate-800, which looks sharp. However, on light mode the search input icon had text-slate-300 instead of text-slate-500. Adjusting that will achieve full WCAG AAA contrast ratio.',
        sequenceNumber: 6,
        startTimeMs: 52000,
        endTimeMs: 65000,
        language: 'en',
        confidence: 0.98,
        createdAt: new Date('2026-11-03T10:16:15.000Z'),
      },
    ],
  });

  // Summary 1
  await prisma.sessionSummary.create({
    data: {
      sessionId: session1.id,
      title: 'Full-Stack React & Tailwind Architecture Review Summary',
      overview: 'Comprehensive review of dashboard component hierarchy, Zustand selector optimization for high-frequency WebRTC audio telemetry, and Tailwind contrast compliance.',
      keyPoints: [
        'Separated high-frequency audio telemetry state from static dashboard metrics',
        'Zustand selector subscription eliminated 92% of redundant React reconciliations',
        'Fixed WCAG AAA contrast for search icon in light mode theme',
      ],
      actionItems: [
        'Refactor useAudioTelemetry hook to subscribe directly via Zustand store',
        'Wrap historical trend chart with React.memo and shallow comparison',
        'Run Lighthouse accessibility audit to confirm contrast compliance',
      ],
      decisions: [
        'Use Zustand for real-time streaming state instead of React Context',
        'Maintain zero external UI component libraries; rely on Tailwind utility classes',
      ],
      topicsCovered: ['React 19', 'State Management', 'Zustand', 'Tailwind CSS', 'WebSockets'],
      modelUsed: 'gemini-2.0-flash-exp',
      createdAt: s1End,
      updatedAt: s1End,
    },
  });

  // Snapshots 1
  const snap1_1 = await prisma.sessionSnapshot.create({
    data: {
      sessionId: session1.id,
      userId,
      cloudinaryUrl: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=1200&auto=format&fit=crop&q=80',
      cloudinaryPublicId: 'snapshots/react_component_tree_audit',
      captureTimestamp: new Date('2026-11-03T10:18:00.000Z'),
      source: 'SCREEN',
      analysisStatus: 'COMPLETED',
      description: 'React component render profiler showing dashboard hierarchy re-render bottlenecks.',
      aiAnalysis: 'Flame chart inspection highlights frequent re-renders in DashboardSummary caused by unmemoized audio telemetry prop updates.',
      userNotes: 'Need to isolate useAudioTelemetry into dedicated Zustand store.',
      detectedObjects: [
        { label: 'Code Editor', confidence: 0.99, box_2d: [100, 100, 900, 900] },
        { label: 'Profiler Flamegraph', confidence: 0.95, box_2d: [400, 200, 800, 850] },
      ],
      width: 1920,
      height: 1080,
      sizeBytes: 245000,
      createdAt: new Date('2026-11-03T10:18:00.000Z'),
    },
  });

  const snap1_2 = await prisma.sessionSnapshot.create({
    data: {
      sessionId: session1.id,
      userId,
      cloudinaryUrl: 'https://images.unsplash.com/photo-1581291518655-9523c932694b?w=1200&auto=format&fit=crop&q=80',
      cloudinaryPublicId: 'snapshots/tailwind_theme_contrast_check',
      captureTimestamp: new Date('2026-11-03T10:25:00.000Z'),
      source: 'SCREEN',
      analysisStatus: 'COMPLETED',
      description: 'Header navigation theme inspector in light and dark mode.',
      aiAnalysis: 'Contrast analyzer detected 2.8:1 ratio on search icon in light mode. Updating to text-slate-500 raises contrast to 4.7:1.',
      userNotes: 'Confirmed AAA compliance across all palette tokens.',
      width: 1920,
      height: 1080,
      sizeBytes: 198000,
      createdAt: new Date('2026-11-03T10:25:00.000Z'),
    },
  });

  // Report 1
  await prisma.sessionReport.create({
    data: {
      sessionId: session1.id,
      userId,
      title: 'Full-Stack React & Tailwind Architecture Review Report',
      overview: 'Deep-dive architectural review session focusing on frontend render performance, state isolation, and UI styling standards.',
      keyTopics: ['React State Optimization', 'Zustand Architecture', 'Render Performance', 'Tailwind Contrast'],
      importantQuestions: [
        {
          question: 'How to eliminate 60 FPS repaints on the main dashboard container?',
          answer: 'Extract high-frequency WebRTC audio telemetry into an atomic Zustand store with selective subscriptions.',
          asker: 'Pratham Pansuriya',
          answeredBy: 'AI Copilot',
        },
      ],
      keyObservations: [
        'Root dashboard container was re-rendering 2 times per second unnecessarily',
        'Light mode theme had one low contrast icon in the navigation bar',
      ],
      decisions: [
        'Zustand store selected for all real-time stream state',
        'Adopt strict React.memo policy for charts and analytical tables',
      ],
      actionItems: [
        { task: 'Extract useAudioTelemetry hook', description: 'Create isolated Zustand store', owner: 'Pratham', priority: 'HIGH' },
        { task: 'Fix search icon contrast', description: 'Change text-slate-300 to text-slate-500', owner: 'Pratham', priority: 'MEDIUM' },
      ],
      taskChecklist: [
        { id: 't1', text: 'Audit profiler flamegraph', completed: true, owner: 'Pratham' },
        { id: 't2', text: 'Verify Zustand slice separation', completed: true, owner: 'Pratham' },
        { id: 't3', text: 'Test light/dark mode contrast', completed: true, owner: 'Pratham' },
      ],
      followUpQuestions: [
        'Should we migrate historical trend charts to WebGL for 10k+ datapoints?',
      ],
      relevantSnapshots: [
        { snapshotId: snap1_1.id, label: 'Profiler Flamegraph', reason: 'Evidence of telemetry re-render bottlenecks' },
        { snapshotId: snap1_2.id, label: 'Theme Contrast Audit', reason: 'Light mode contrast verification' },
      ],
      toolActivitySummary: {
        totalCount: 3,
        successCount: 3,
        failedCount: 0,
        tools: ['analyze_code', 'inspect_dom', 'summarize_keypoints'],
      },
      sessionDuration: s1Duration,
      creditsConsumed: s1Credits,
      modelUsed: 'gemini-2.0-flash-exp',
      createdAt: s1End,
      updatedAt: s1End,
    },
  });

  // Memories 1
  await prisma.sessionMemory.createMany({
    data: [
      {
        sessionId: session1.id,
        category: MemoryCategory.KEY_FACT,
        title: 'Zustand for Streaming Audio State',
        content: 'Isolating WebRTC audio telemetry in Zustand avoids root dashboard re-renders and saves 90% CPU overhead.',
        importance: MemoryImportance.HIGH,
        isPinned: true,
        createdAt: s1End,
      },
      {
        sessionId: session1.id,
        category: MemoryCategory.CURRENT_TASK,
        title: 'Waveform Canvas Memoization',
        content: 'Wrap historical trend charts in React.memo with custom comparison props.',
        importance: MemoryImportance.MEDIUM,
        isPinned: false,
        createdAt: s1End,
      },
    ],
  });

  // Tool executions 1
  await prisma.aIToolExecution.createMany({
    data: [
      {
        sessionId: session1.id,
        toolName: 'analyze_code',
        callId: 'call_s1_01',
        arguments: { file: 'Dashboard.tsx', checkReRenders: true },
        status: ToolExecutionStatus.SUCCESS,
        startedAt: new Date('2026-11-03T10:17:00.000Z'),
        completedAt: new Date('2026-11-03T10:17:02.000Z'),
        executionDurationMs: 1450,
      },
      {
        sessionId: session1.id,
        toolName: 'inspect_dom',
        callId: 'call_s1_02',
        arguments: { selector: '.nav-search-input', checkContrast: true },
        status: ToolExecutionStatus.SUCCESS,
        startedAt: new Date('2026-11-03T10:24:30.000Z'),
        completedAt: new Date('2026-11-03T10:24:31.000Z'),
        executionDurationMs: 980,
      },
    ],
  });

  // Credit Usage & Ledger 1
  const usage1 = await prisma.creditUsage.create({
    data: {
      userId,
      sessionId: session1.id,
      creditsDeducted: s1Credits,
      feature: CreditFeatureType.MULTIMODAL_STREAM,
      modelUsed: 'gemini-2.0-flash-exp',
      durationSeconds: s1Duration,
      billingPeriod: '2026-11',
      createdAt: s1End,
    },
  });

  await prisma.creditLedger.create({
    data: {
      userId,
      amount: -s1Credits,
      balanceAfter: runningBalance,
      type: CreditTransactionType.USAGE,
      reason: 'Multimodal session: Full-Stack React & Tailwind Architecture Review',
      referenceId: usage1.id,
      billingPeriod: '2026-11',
      createdAt: s1End,
    },
  });

  // --------------------------------------------------------------------------
  // SESSION 2: Vision Mode (8 credits) - Pure English
  // --------------------------------------------------------------------------
  console.log('📦 Seeding Session 2: Multimodal Live Vision UI & OCR Debugging (8 credits)...');
  const s2Start = new Date('2026-11-07T14:20:00.000Z');
  const s2End = new Date('2026-11-07T14:36:00.000Z');
  const s2Duration = 960; // 16 mins
  const s2Credits = 8;
  runningBalance -= s2Credits; // 82

  const session2 = await prisma.aISession.create({
    data: {
      userId,
      templateId: template2.id,
      title: 'Multimodal Live Vision UI & OCR Debugging',
      mode: SessionMode.VISION,
      status: SessionStatus.ENDED,
      inputSource: 'both',
      aiModel: 'gemini-2.0-flash-exp',
      transcriptionModel: 'gemini-2.0-flash-exp',
      startedAt: s2Start,
      endedAt: s2End,
      durationSeconds: s2Duration,
      creditsConsumed: s2Credits,
      isFavorite: false,
      createdAt: s2Start,
      updatedAt: s2End,
    },
  });

  await prisma.sessionTranscriptSegment.createMany({
    data: [
      {
        sessionId: session2.id,
        speakerType: TranscriptSpeaker.USER,
        speakerName: 'Pratham Pansuriya',
        text: 'I am holding up a printed system architecture sheet to the camera. Can you extract the text labels and verify the data flow arrow directions?',
        sequenceNumber: 1,
        startTimeMs: 1500,
        endTimeMs: 9200,
        language: 'en',
        confidence: 0.98,
        createdAt: new Date('2026-11-07T14:20:10.000Z'),
      },
      {
        sessionId: session2.id,
        speakerType: TranscriptSpeaker.AI,
        speakerName: 'AI Copilot',
        text: 'I see the diagram clearly. The top block says "API Gateway (Express.js)", which forks into "PostgreSQL Core DB" on the left and "Redis Pub/Sub" on the right. There is an inverted arrow between Redis and AI Service worker.',
        sequenceNumber: 2,
        startTimeMs: 10000,
        endTimeMs: 24500,
        language: 'en',
        confidence: 0.99,
        createdAt: new Date('2026-11-07T14:20:25.000Z'),
      },
      {
        sessionId: session2.id,
        speakerType: TranscriptSpeaker.USER,
        speakerName: 'Pratham Pansuriya',
        text: 'Good catch on the inverted arrow. The AI Service actually publishes events back into Redis, so bidirectional flow is intended. Let me take a high-res snapshot for comparison.',
        sequenceNumber: 3,
        startTimeMs: 25500,
        endTimeMs: 34000,
        language: 'en',
        confidence: 0.97,
        createdAt: new Date('2026-11-07T14:20:38.000Z'),
      },
      {
        sessionId: session2.id,
        speakerType: TranscriptSpeaker.AI,
        speakerName: 'AI Copilot',
        text: 'High-res snapshot captured and stored in your snapshot studio. Bounding boxes detected for all 6 diagram nodes with 99.4% confidence score.',
        sequenceNumber: 4,
        startTimeMs: 35000,
        endTimeMs: 46000,
        language: 'en',
        confidence: 0.99,
        createdAt: new Date('2026-11-07T14:20:50.000Z'),
      },
    ],
  });

  await prisma.sessionSummary.create({
    data: {
      sessionId: session2.id,
      title: 'Multimodal Live Vision UI & OCR Debugging Summary',
      overview: 'Live camera OCR text extraction and diagram verification identifying bidirectional communication between Redis and AI microservices.',
      keyPoints: [
        'Extracted all 6 architectural diagram block labels with 99.4% OCR precision',
        'Detected inverted arrow between Redis and AI Service worker',
        'Captured 720p vision snapshot with normalized bounding boxes',
      ],
      actionItems: [
        'Update architecture documentation to show bidirectional Redis arrow',
        'Store snapshot in knowledge base as verified diagram baseline',
      ],
      decisions: [
        'Use 1 FPS vision sampling to balance network bandwidth with visual responsiveness',
      ],
      topicsCovered: ['OCR', 'Computer Vision', 'System Diagrams', 'Bounding Boxes'],
      modelUsed: 'gemini-2.0-flash-exp',
      createdAt: s2End,
      updatedAt: s2End,
    },
  });

  const snap2_1 = await prisma.sessionSnapshot.create({
    data: {
      sessionId: session2.id,
      userId,
      cloudinaryUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&auto=format&fit=crop&q=80',
      cloudinaryPublicId: 'snapshots/vision_architecture_diagram_ocr',
      captureTimestamp: new Date('2026-11-07T14:25:00.000Z'),
      source: 'CAMERA',
      analysisStatus: 'COMPLETED',
      description: 'Handheld system architecture blueprint captured via live camera stream.',
      aiAnalysis: 'Detected 6 diagram modules: Client, API Gateway, Redis Queue, AI Service, PostgreSQL, and Cloudinary. Bounding box coordinates normalized to 1000x1000 grid.',
      userNotes: 'Verified diagram alignment with backend architecture.',
      detectedObjects: [
        { label: 'Architecture Blueprint', confidence: 0.99, box_2d: [150, 120, 850, 880] },
        { label: 'Diagram Node', confidence: 0.96, box_2d: [200, 200, 350, 400] },
      ],
      width: 1280,
      height: 720,
      sizeBytes: 182000,
      createdAt: new Date('2026-11-07T14:25:00.000Z'),
    },
  });

  await prisma.sessionReport.create({
    data: {
      sessionId: session2.id,
      userId,
      title: 'Multimodal Live Vision UI & OCR Debugging Report',
      overview: 'Evaluation of real-time camera OCR and object detection accuracy on physical hardware diagrams.',
      keyTopics: ['Live OCR', 'Computer Vision', 'Bounding Boxes', 'Architecture Blueprint'],
      importantQuestions: [
        {
          question: 'Are all diagram node labels readable under standard indoor lighting?',
          answer: 'Yes, the vision pipeline extracted all text strings without transcription errors.',
          asker: 'Pratham Pansuriya',
          answeredBy: 'AI Copilot',
        },
      ],
      keyObservations: [
        'Camera stream maintains 30 FPS locally, sending 1 frame/sec to vision endpoint',
        'Bounding box precision achieved 99.4% on printed block diagrams',
      ],
      decisions: [
        'Set default snapshot downsampling resolution to 720p',
      ],
      actionItems: [
        { task: 'Export snapshot bounding boxes to JSON', description: 'Integrate with diagram editor', owner: 'Pratham', priority: 'LOW' },
      ],
      taskChecklist: [
        { id: 't4', text: 'Align diagram within camera frame', completed: true, owner: 'Pratham' },
        { id: 't5', text: 'Verify OCR text extraction', completed: true, owner: 'Pratham' },
      ],
      followUpQuestions: [
        'Can we detect hand gestures to trigger snapshot capture automatically?',
      ],
      relevantSnapshots: [
        { snapshotId: snap2_1.id, label: 'Camera Diagram Blueprint', reason: 'Verified OCR block layout' },
      ],
      toolActivitySummary: {
        totalCount: 2,
        successCount: 2,
        failedCount: 0,
        tools: ['capture_screen_diff', 'inspect_dom'],
      },
      sessionDuration: s2Duration,
      creditsConsumed: s2Credits,
      modelUsed: 'gemini-2.0-flash-exp',
      createdAt: s2End,
      updatedAt: s2End,
    },
  });

  await prisma.sessionMemory.createMany({
    data: [
      {
        sessionId: session2.id,
        category: MemoryCategory.OBSERVATION,
        title: '720p Vision Sampling Efficiency',
        content: '720p resolution provides 100% OCR readability while saving 45% bandwidth compared to 1080p.',
        importance: MemoryImportance.MEDIUM,
        isPinned: false,
        createdAt: s2End,
      },
    ],
  });

  const usage2 = await prisma.creditUsage.create({
    data: {
      userId,
      sessionId: session2.id,
      creditsDeducted: s2Credits,
      feature: CreditFeatureType.MULTIMODAL_STREAM,
      modelUsed: 'gemini-2.0-flash-exp',
      durationSeconds: s2Duration,
      billingPeriod: '2026-11',
      createdAt: s2End,
    },
  });

  await prisma.creditLedger.create({
    data: {
      userId,
      amount: -s2Credits,
      balanceAfter: runningBalance,
      type: CreditTransactionType.USAGE,
      reason: 'Multimodal session: Multimodal Live Vision UI & OCR Debugging',
      referenceId: usage2.id,
      billingPeriod: '2026-11',
      createdAt: s2End,
    },
  });

  // --------------------------------------------------------------------------
  // SESSION 3: Productivity Mode (5 credits) - Authentic Gujarati Script + Tech terms
  // --------------------------------------------------------------------------
  console.log('📦 Seeding Session 3: Database Index Tuning & Query Latency Optimization (5 credits)...');
  const s3Start = new Date('2026-11-11T16:00:00.000Z');
  const s3End = new Date('2026-11-11T16:10:00.000Z');
  const s3Duration = 600; // 10 mins
  const s3Credits = 5;
  runningBalance -= s3Credits; // 77

  const session3 = await prisma.aISession.create({
    data: {
      userId,
      title: 'Database Index Tuning & Query Latency Optimization',
      mode: SessionMode.PRODUCTIVITY,
      status: SessionStatus.ENDED,
      inputSource: 'screen',
      aiModel: 'gemini-2.0-flash-exp',
      transcriptionModel: 'gemini-2.0-flash-exp',
      startedAt: s3Start,
      endedAt: s3End,
      durationSeconds: s3Duration,
      creditsConsumed: s3Credits,
      isFavorite: true,
      createdAt: s3Start,
      updatedAt: s3End,
    },
  });

  // Authentic Gujarati Script Transcript
  await prisma.sessionTranscriptSegment.createMany({
    data: [
      {
        sessionId: session3.id,
        speakerType: TranscriptSpeaker.USER,
        speakerName: 'Pratham Pansuriya',
        text: 'Prisma માં જ્યારે આ ક્વેરી execute કરીએ છીએ ત્યારે PostgreSQL connection pool exhausted થઈ જાય છે. શું તમે મારી સ્ક્રીન પરનું EXPLAIN ANALYZE આઉટપુટ જોઈ શકો છો?',
        sequenceNumber: 1,
        startTimeMs: 1200,
        endTimeMs: 8500,
        language: 'gu',
        confidence: 0.98,
        createdAt: new Date('2026-11-11T16:00:10.000Z'),
      },
      {
        sessionId: session3.id,
        speakerType: TranscriptSpeaker.AI,
        speakerName: 'AI Copilot',
        text: 'સ્ક્રીન પર જોતાં જણાય છે કે તમારી credit_ledger ટેબલ પર Sequential Scan થઈ રહ્યું છે. userId અને createdAt પર composite index ખૂટે છે, જેના કારણે આખી ટેબલ સ્કેન થાય છે.',
        sequenceNumber: 2,
        startTimeMs: 9100,
        endTimeMs: 21500,
        language: 'gu',
        confidence: 0.99,
        createdAt: new Date('2026-11-11T16:00:25.000Z'),
      },
      {
        sessionId: session3.id,
        speakerType: TranscriptSpeaker.USER,
        speakerName: 'Pratham Pansuriya',
        text: 'તો હું schema.prisma માં @@index([userId, createdAt]) ઉમેરી દઉં. આ ઇન્ડેક્સ બન્યા પછી query execution time માં કેટલો ઘટાડો થશે?',
        sequenceNumber: 3,
        startTimeMs: 22500,
        endTimeMs: 31000,
        language: 'gu',
        confidence: 0.97,
        createdAt: new Date('2026-11-11T16:00:38.000Z'),
      },
      {
        sessionId: session3.id,
        speakerType: TranscriptSpeaker.AI,
        speakerName: 'AI Copilot',
        text: 'ઇન્ડેક્સ બન્યા પછી સીધો B-tree lookup થશે. ક્વેરી લેટન્સી 380ms થી ઘટીને માત્ર ~12ms થઈ જશે, અને કનેક્શન પુલ સેચ્યુરેશન સંપૂર્ણપણે ઉકેલાઈ જશે.',
        sequenceNumber: 4,
        startTimeMs: 32000,
        endTimeMs: 44000,
        language: 'gu',
        confidence: 0.99,
        createdAt: new Date('2026-11-11T16:00:50.000Z'),
      },
      {
        sessionId: session3.id,
        speakerType: TranscriptSpeaker.USER,
        speakerName: 'Pratham Pansuriya',
        text: 'ખૂબ સરસ! અને pg.Pool ની અંદર max connection limit કેટલી રાખવી યોગ્ય રહેશે?',
        sequenceNumber: 5,
        startTimeMs: 45000,
        endTimeMs: 51000,
        language: 'gu',
        confidence: 0.98,
        createdAt: new Date('2026-11-11T16:01:00.000Z'),
      },
      {
        sessionId: session3.id,
        speakerType: TranscriptSpeaker.AI,
        speakerName: 'AI Copilot',
        text: 'તમારે max: 20 connections સેટ કરવા જોઈએ અને idleTimeoutMillis: 30000 રાખવું જોઈએ. આ સેટિંગ પ્રોડક્શન લોડમાં ઉત્તમ throughput આપશે.',
        sequenceNumber: 6,
        startTimeMs: 52000,
        endTimeMs: 64000,
        language: 'gu',
        confidence: 0.99,
        createdAt: new Date('2026-11-11T16:01:15.000Z'),
      },
    ],
  });

  await prisma.sessionSummary.create({
    data: {
      sessionId: session3.id,
      title: 'Database Index Tuning & Query Latency Optimization Summary',
      overview: 'Performance profiling of PostgreSQL database operations resolving connection pool exhaustion through composite indexing and connection pool re-sizing.',
      keyPoints: [
        'Identified Sequential Scan bottleneck on credit_ledger table',
        'Recommended @@index([userId, createdAt]) to enable direct B-tree index scan',
        'Projected query latency drop from 380ms down to ~12ms',
        'Tuned pg.Pool configuration with max: 20 and idleTimeoutMillis: 30000',
      ],
      actionItems: [
        'Deploy migration adding composite index on credit_ledger(userId, createdAt)',
        'Update backend database pool config with max 20 connections',
      ],
      decisions: [
        'Use CREATE INDEX CONCURRENTLY to avoid table locking in production',
      ],
      topicsCovered: ['PostgreSQL', 'Prisma ORM', 'Database Indexes', 'Query Optimization', 'Connection Pooling'],
      modelUsed: 'gemini-2.0-flash-exp',
      createdAt: s3End,
      updatedAt: s3End,
    },
  });

  const snap3_1 = await prisma.sessionSnapshot.create({
    data: {
      sessionId: session3.id,
      userId,
      cloudinaryUrl: 'https://images.unsplash.com/photo-1542744094-24638eff58bb?w=1200&auto=format&fit=crop&q=80',
      cloudinaryPublicId: 'snapshots/postgres_explain_analyze_plan',
      captureTimestamp: new Date('2026-11-11T16:04:00.000Z'),
      source: 'SCREEN',
      analysisStatus: 'COMPLETED',
      description: 'PostgreSQL EXPLAIN ANALYZE execution plan showing Sequential Scan bottleneck.',
      aiAnalysis: 'Execution cost 4520.10 units with Seq Scan filter on userId. B-tree index lookup will reduce cost to 8.45 units.',
      userNotes: 'Added composite index on userId and createdAt.',
      width: 1920,
      height: 1080,
      sizeBytes: 215000,
      createdAt: new Date('2026-11-11T16:04:00.000Z'),
    },
  });

  await prisma.sessionReport.create({
    data: {
      sessionId: session3.id,
      userId,
      title: 'Database Index Tuning & Query Latency Optimization Report',
      overview: 'Analysis and resolution of database query contention and connection pool exhaustion on high-throughput ledger tables.',
      keyTopics: ['PostgreSQL Optimization', 'Composite B-Tree Indexes', 'EXPLAIN ANALYZE', 'Connection Pool'],
      importantQuestions: [
        {
          question: 'Why was the connection pool exhausting during burst operations?',
          answer: 'Unindexed sequential scans held connection locks for 380ms per query, saturating the pool capacity.',
          asker: 'Pratham Pansuriya',
          answeredBy: 'AI Copilot',
        },
      ],
      keyObservations: [
        'Query latency drops by 96.8% with composite B-tree index',
        'Database CPU utilization will decrease by 70% during peak usage',
      ],
      decisions: [
        'Apply composite indexing to all user-scoped audit tables',
      ],
      actionItems: [
        { task: 'Apply schema migration', description: 'Add composite indexes', owner: 'Pratham', priority: 'HIGH' },
      ],
      taskChecklist: [
        { id: 't6', text: 'Capture EXPLAIN ANALYZE baseline', completed: true, owner: 'Pratham' },
        { id: 't7', text: 'Generate Prisma index migration', completed: true, owner: 'Pratham' },
      ],
      followUpQuestions: [
        'Should we enable table partitioning by year for the credit ledger when rows exceed 1 million?',
      ],
      relevantSnapshots: [
        { snapshotId: snap3_1.id, label: 'EXPLAIN Plan', reason: 'Sequential scan evidence' },
      ],
      toolActivitySummary: {
        totalCount: 2,
        successCount: 2,
        failedCount: 0,
        tools: ['analyze_code', 'search_documentation'],
      },
      sessionDuration: s3Duration,
      creditsConsumed: s3Credits,
      modelUsed: 'gemini-2.0-flash-exp',
      createdAt: s3End,
      updatedAt: s3End,
    },
  });

  await prisma.sessionMemory.createMany({
    data: [
      {
        sessionId: session3.id,
        category: MemoryCategory.KEY_FACT,
        title: 'Composite Index for Ledger Queries',
        content: 'B-tree index on (userId, createdAt) drops ledger query latency from 380ms to 12ms.',
        importance: MemoryImportance.HIGH,
        isPinned: true,
        createdAt: s3End,
      },
    ],
  });

  const usage3 = await prisma.creditUsage.create({
    data: {
      userId,
      sessionId: session3.id,
      creditsDeducted: s3Credits,
      feature: CreditFeatureType.MULTIMODAL_STREAM,
      modelUsed: 'gemini-2.0-flash-exp',
      durationSeconds: s3Duration,
      billingPeriod: '2026-11',
      createdAt: s3End,
    },
  });

  await prisma.creditLedger.create({
    data: {
      userId,
      amount: -s3Credits,
      balanceAfter: runningBalance,
      type: CreditTransactionType.USAGE,
      reason: 'Multimodal session: Database Index Tuning & Query Latency Optimization',
      referenceId: usage3.id,
      billingPeriod: '2026-11',
      createdAt: s3End,
    },
  });

  // --------------------------------------------------------------------------
  // SESSION 4: Learning Mode (6 credits) - Authentic Hindi Script + Tech terms
  // --------------------------------------------------------------------------
  console.log('📦 Seeding Session 4: Algorithms & Distributed System Design Tutoring (6 credits)...');
  const s4Start = new Date('2026-11-14T11:00:00.000Z');
  const s4End = new Date('2026-11-14T11:12:00.000Z');
  const s4Duration = 720; // 12 mins
  const s4Credits = 6;
  runningBalance -= s4Credits; // 71

  const session4 = await prisma.aISession.create({
    data: {
      userId,
      title: 'Algorithms & Distributed System Design Tutoring',
      mode: SessionMode.LEARNING,
      status: SessionStatus.ENDED,
      inputSource: 'screen',
      aiModel: 'gemini-2.0-flash-exp',
      transcriptionModel: 'gemini-2.0-flash-exp',
      startedAt: s4Start,
      endedAt: s4End,
      durationSeconds: s4Duration,
      creditsConsumed: s4Credits,
      isFavorite: false,
      createdAt: s4Start,
      updatedAt: s4End,
    },
  });

  // Authentic Devanagari Hindi Script Transcript
  await prisma.sessionTranscriptSegment.createMany({
    data: [
      {
        sessionId: session4.id,
        speakerType: TranscriptSpeaker.USER,
        speakerName: 'Pratham Pansuriya',
        text: 'High-throughput API के लिए Redis token bucket algorithm से distributed rate limiter implement करना है। सबसे बेहतरीन तरीका क्या होगा?',
        sequenceNumber: 1,
        startTimeMs: 1200,
        endTimeMs: 8900,
        language: 'hi',
        confidence: 0.98,
        createdAt: new Date('2026-11-14T11:00:10.000Z'),
      },
      {
        sessionId: session4.id,
        speakerType: TranscriptSpeaker.AI,
        speakerName: 'AI Copilot',
        text: 'Token bucket के लिए Redis में Lua script सबसे भरोसेमंद दृष्टिकोण है। Lua script सिंगल एटॉमिक ऑपरेशन में टोकન કैलક્યુલેટ કરકે ડિડક્ટ કરતી હૈ, જિસસે distributed lock overhead બિલકુલ સમાપ્ત હો જાતા હૈ.',
        sequenceNumber: 2,
        startTimeMs: 9500,
        endTimeMs: 23800,
        language: 'hi',
        confidence: 0.99,
        createdAt: new Date('2026-11-14T11:00:25.000Z'),
      },
      {
        sessionId: session4.id,
        speakerType: TranscriptSpeaker.USER,
        speakerName: 'Pratham Pansuriya',
        text: 'अगर Redis cluster में मल्टीपल नोड्स हों तो यूजर रिक्वेस्ट्स डिस्ट्रीब्यूट होने पर race conditions कैसे रोकेंगे?',
        sequenceNumber: 3,
        startTimeMs: 24500,
        endTimeMs: 32000,
        language: 'hi',
        confidence: 0.97,
        createdAt: new Date('2026-11-14T11:00:38.000Z'),
      },
      {
        sessionId: session4.id,
        speakerType: TranscriptSpeaker.AI,
        speakerName: 'AI Copilot',
        text: 'Redis hash tags का उपयोग करें, जैसे `{rate_limit:user_id}`। હેશ ટેગ્સ યહ સુનિશ્ચિત કરતે હૈં કિ કિસી વિશિષ્ટ યૂઝર કી સભી કીઝ એક હી Redis cluster સ્લોટ ઔર નોડ પર સ્ટોર હોં, જિસસે cross-slot errors નહીં આતે.',
        sequenceNumber: 4,
        startTimeMs: 33000,
        endTimeMs: 46000,
        language: 'hi',
        confidence: 0.99,
        createdAt: new Date('2026-11-14T11:00:50.000Z'),
      },
    ],
  });

  await prisma.sessionSummary.create({
    data: {
      sessionId: session4.id,
      title: 'Algorithms & Distributed System Design Tutoring Summary',
      overview: 'System design tutoring session exploring atomic distributed rate limiting with Redis Lua scripts and cluster hash tag partitioning.',
      keyPoints: [
        'Atomic token bucket calculation using single-invocation Redis Lua scripts',
        'Redis cluster key routing using hash tag syntax `{rate_limit:user_id}`',
        'Zero distributed locks required, achieving sub-millisecond check latency',
      ],
      actionItems: [
        'Draft reusable Redis Lua rate limiting script',
        'Benchmark with k6 at 10,000 requests per second',
      ],
      decisions: [
        'Adopt Redis Lua token bucket for API gateway rate limiting',
      ],
      topicsCovered: ['Distributed Systems', 'Redis', 'Rate Limiting', 'Lua Scripts', 'Token Bucket'],
      modelUsed: 'gemini-2.0-flash-exp',
      createdAt: s4End,
      updatedAt: s4End,
    },
  });

  const snap4_1 = await prisma.sessionSnapshot.create({
    data: {
      sessionId: session4.id,
      userId,
      cloudinaryUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1200&auto=format&fit=crop&q=80',
      cloudinaryPublicId: 'snapshots/redis_rate_limiter_architecture',
      captureTimestamp: new Date('2026-11-14T11:06:00.000Z'),
      source: 'SCREEN',
      analysisStatus: 'COMPLETED',
      description: 'Distributed token bucket rate limiter architecture diagram.',
      aiAnalysis: 'Illustrates incoming API gateway requests, Redis cluster hash slots, and atomic token replenishment algorithm.',
      userNotes: 'Used Redis hash tags to pin user keys to identical cluster node.',
      width: 1920,
      height: 1080,
      sizeBytes: 204000,
      createdAt: new Date('2026-11-14T11:06:00.000Z'),
    },
  });

  await prisma.sessionReport.create({
    data: {
      sessionId: session4.id,
      userId,
      title: 'Algorithms & Distributed System Design Tutoring Report',
      overview: 'In-depth tutorial and design architecture for enterprise-grade distributed rate limiting under high concurrency.',
      keyTopics: ['System Design', 'Redis Architecture', 'Token Bucket Algorithm', 'Hash Slots'],
      importantQuestions: [
        {
          question: 'How to avoid cross-slot Redis cluster errors when executing multi-key Lua scripts?',
          answer: 'Use Redis curly brace hash tags {userId} so all related keys resolve to the same slot.',
          asker: 'Pratham Pansuriya',
          answeredBy: 'AI Copilot',
        },
      ],
      keyObservations: [
        'Lua scripts guarantee linearizability without network round-trips for distributed locks',
      ],
      decisions: [
        'Standardize on token bucket over sliding window logs due to constant memory footprint',
      ],
      actionItems: [
        { task: 'Implement Lua rate limiter', description: 'Write script and integration tests', owner: 'Pratham', priority: 'MEDIUM' },
      ],
      taskChecklist: [
        { id: 't8', text: 'Review Lua script syntax', completed: true, owner: 'Pratham' },
        { id: 't9', text: 'Verify Redis cluster hash tag routing', completed: true, owner: 'Pratham' },
      ],
      followUpQuestions: [
        'How should rate limit headers (X-RateLimit-Remaining) be formatted across microservices?',
      ],
      relevantSnapshots: [
        { snapshotId: snap4_1.id, label: 'Rate Limiter Diagram', reason: 'Architecture reference' },
      ],
      toolActivitySummary: {
        totalCount: 2,
        successCount: 2,
        failedCount: 0,
        tools: ['analyze_code', 'summarize_keypoints'],
      },
      sessionDuration: s4Duration,
      creditsConsumed: s4Credits,
      modelUsed: 'gemini-2.0-flash-exp',
      createdAt: s4End,
      updatedAt: s4End,
    },
  });

  await prisma.sessionMemory.createMany({
    data: [
      {
        sessionId: session4.id,
        category: MemoryCategory.KEY_FACT,
        title: 'Redis Cluster Hash Tags',
        content: 'Using {user_id} in Redis keys ensures all tokens for a user reside on the exact same cluster node.',
        importance: MemoryImportance.HIGH,
        isPinned: false,
        createdAt: s4End,
      },
    ],
  });

  const usage4 = await prisma.creditUsage.create({
    data: {
      userId,
      sessionId: session4.id,
      creditsDeducted: s4Credits,
      feature: CreditFeatureType.MULTIMODAL_STREAM,
      modelUsed: 'gemini-2.0-flash-exp',
      durationSeconds: s4Duration,
      billingPeriod: '2026-11',
      createdAt: s4End,
    },
  });

  await prisma.creditLedger.create({
    data: {
      userId,
      amount: -s4Credits,
      balanceAfter: runningBalance,
      type: CreditTransactionType.USAGE,
      reason: 'Multimodal session: Algorithms & Distributed System Design Tutoring',
      referenceId: usage4.id,
      billingPeriod: '2026-11',
      createdAt: s4End,
    },
  });

  // --------------------------------------------------------------------------
  // SESSION 5: Meeting Mode (9 credits) - Pure English
  // --------------------------------------------------------------------------
  console.log('📦 Seeding Session 5: Cloud Infrastructure, Docker & CI/CD Pipeline Sync (9 credits)...');
  const s5Start = new Date('2026-11-18T09:30:00.000Z');
  const s5End = new Date('2026-11-18T09:48:00.000Z');
  const s5Duration = 1080; // 18 mins
  const s5Credits = 9;
  runningBalance -= s5Credits; // 62

  const session5 = await prisma.aISession.create({
    data: {
      userId,
      title: 'Cloud Infrastructure, Docker & CI/CD Pipeline Sync',
      mode: SessionMode.MEETING,
      status: SessionStatus.ENDED,
      inputSource: 'screen',
      aiModel: 'gemini-2.0-flash-exp',
      transcriptionModel: 'gemini-2.0-flash-exp',
      startedAt: s5Start,
      endedAt: s5End,
      durationSeconds: s5Duration,
      creditsConsumed: s5Credits,
      isFavorite: true,
      createdAt: s5Start,
      updatedAt: s5End,
    },
  });

  await prisma.sessionTranscriptSegment.createMany({
    data: [
      {
        sessionId: session5.id,
        speakerType: TranscriptSpeaker.USER,
        speakerName: 'Pratham Pansuriya',
        text: 'Welcome everyone. In today infrastructure sync, we are tackling our Docker container image sizes and GitHub Actions build times.',
        sequenceNumber: 1,
        startTimeMs: 1000,
        endTimeMs: 8200,
        language: 'en',
        confidence: 0.98,
        createdAt: new Date('2026-11-18T09:30:10.000Z'),
      },
      {
        sessionId: session5.id,
        speakerType: TranscriptSpeaker.AI,
        speakerName: 'AI Copilot',
        text: 'Reviewing your current Dockerfile on screen: your backend container currently pulls full node:20 Debian image, clocking in at 1.15 GB. Converting to multi-stage build with node:20-alpine will drop the final production image to approximately 184 MB.',
        sequenceNumber: 2,
        startTimeMs: 8900,
        endTimeMs: 24000,
        language: 'en',
        confidence: 0.99,
        createdAt: new Date('2026-11-18T09:30:25.000Z'),
      },
      {
        sessionId: session5.id,
        speakerType: TranscriptSpeaker.USER,
        speakerName: 'Pratham Pansuriya',
        text: 'That is an 84% reduction in container size! What about pnpm caching in GitHub Actions to speed up our CI pull request checks?',
        sequenceNumber: 3,
        startTimeMs: 24800,
        endTimeMs: 33000,
        language: 'en',
        confidence: 0.98,
        createdAt: new Date('2026-11-18T09:30:38.000Z'),
      },
      {
        sessionId: session5.id,
        speakerType: TranscriptSpeaker.AI,
        speakerName: 'AI Copilot',
        text: 'Using actions/cache for the pnpm store key hash on pnpm-lock.yaml reduces install step from 3 minutes 40 seconds to just 18 seconds on warm cache hits.',
        sequenceNumber: 4,
        startTimeMs: 33800,
        endTimeMs: 46000,
        language: 'en',
        confidence: 0.99,
        createdAt: new Date('2026-11-18T09:30:52.000Z'),
      },
    ],
  });

  await prisma.sessionSummary.create({
    data: {
      sessionId: session5.id,
      title: 'Cloud Infrastructure, Docker & CI/CD Pipeline Sync Summary',
      overview: 'DevOps architecture meeting streamlining container builds and automated CI pipelines for rapid deployment.',
      keyPoints: [
        'Multi-stage Dockerfile with Node 20 Alpine reduces image from 1.15GB to 184MB',
        'GitHub Actions pnpm store caching reduces install phase by 91%',
        'Configured health check endpoint /api/v1/health with 5-second interval',
      ],
      actionItems: [
        'Commit multi-stage Dockerfile for backend service',
        'Update .github/workflows/ci.yml with pnpm cache configuration',
      ],
      decisions: [
        'Standardize all production container images on Alpine Linux base',
      ],
      topicsCovered: ['DevOps', 'Docker', 'CI/CD', 'GitHub Actions', 'Alpine Linux', 'Container Optimization'],
      modelUsed: 'gemini-2.0-flash-exp',
      createdAt: s5End,
      updatedAt: s5End,
    },
  });

  const snap5_1 = await prisma.sessionSnapshot.create({
    data: {
      sessionId: session5.id,
      userId,
      cloudinaryUrl: 'https://images.unsplash.com/photo-1618401471353-b98aedd04e11?w=1200&auto=format&fit=crop&q=80',
      cloudinaryPublicId: 'snapshots/docker_multistage_build_stats',
      captureTimestamp: new Date('2026-11-18T09:36:00.000Z'),
      source: 'SCREEN',
      analysisStatus: 'COMPLETED',
      description: 'Docker image size breakdown before and after multi-stage optimization.',
      aiAnalysis: 'Shows production image shrinkage from 1.15 GB to 184.2 MB. Node dev dependencies safely omitted from runner stage.',
      userNotes: 'Alpine multi-stage Docker build verified and tested.',
      width: 1920,
      height: 1080,
      sizeBytes: 230000,
      createdAt: new Date('2026-11-18T09:36:00.000Z'),
    },
  });

  await prisma.sessionReport.create({
    data: {
      sessionId: session5.id,
      userId,
      title: 'Cloud Infrastructure, Docker & CI/CD Pipeline Sync Report',
      overview: 'Infrastructure sprint review detailing container optimization, deployment velocity, and security posture improvements.',
      keyTopics: ['Containerization', 'Docker Alpine', 'GitHub Actions Caching', 'Deployment Velocity'],
      importantQuestions: [
        {
          question: 'What is the deployment time difference after CI caching?',
          answer: 'Total PR check duration dropped from 6m 12s to 1m 45s.',
          asker: 'Pratham Pansuriya',
          answeredBy: 'AI Copilot',
        },
      ],
      keyObservations: [
        'Multi-stage build completely isolates source TypeScript code from production image',
      ],
      decisions: [
        'Enforce Docker non-root user execution in all production containers',
      ],
      actionItems: [
        { task: 'Deploy Dockerfile updates', description: 'Merge CI optimizations', owner: 'Pratham', priority: 'HIGH' },
      ],
      taskChecklist: [
        { id: 't10', text: 'Build test Alpine container locally', completed: true, owner: 'Pratham' },
        { id: 't11', text: 'Validate GitHub Actions cache hit', completed: true, owner: 'Pratham' },
      ],
      followUpQuestions: [
        'Can we integrate Trivy container vulnerability scanning into the CI pipeline?',
      ],
      relevantSnapshots: [
        { snapshotId: snap5_1.id, label: 'Docker Multi-stage Stats', reason: 'Image size verification' },
      ],
      toolActivitySummary: {
        totalCount: 2,
        successCount: 2,
        failedCount: 0,
        tools: ['search_documentation', 'summarize_keypoints'],
      },
      sessionDuration: s5Duration,
      creditsConsumed: s5Credits,
      modelUsed: 'gemini-2.0-flash-exp',
      createdAt: s5End,
      updatedAt: s5End,
    },
  });

  await prisma.sessionMemory.createMany({
    data: [
      {
        sessionId: session5.id,
        category: MemoryCategory.PROGRESS,
        title: 'Backend Docker Image Size: 184MB',
        content: 'Migrated from full node:20 to node:20-alpine multi-stage build, slashing image size by 84%.',
        importance: MemoryImportance.HIGH,
        isPinned: true,
        createdAt: s5End,
      },
    ],
  });

  const usage5 = await prisma.creditUsage.create({
    data: {
      userId,
      sessionId: session5.id,
      creditsDeducted: s5Credits,
      feature: CreditFeatureType.MULTIMODAL_STREAM,
      modelUsed: 'gemini-2.0-flash-exp',
      durationSeconds: s5Duration,
      billingPeriod: '2026-11',
      createdAt: s5End,
    },
  });

  await prisma.creditLedger.create({
    data: {
      userId,
      amount: -s5Credits,
      balanceAfter: runningBalance,
      type: CreditTransactionType.USAGE,
      reason: 'Multimodal session: Cloud Infrastructure, Docker & CI/CD Pipeline Sync',
      referenceId: usage5.id,
      billingPeriod: '2026-11',
      createdAt: s5End,
    },
  });

  // --------------------------------------------------------------------------
  // SESSION 6: Language Mode (7 credits) - Authentic Trilingual (Gujarati + Hindi + English)
  // --------------------------------------------------------------------------
  console.log('📦 Seeding Session 6: Multilingual Conversational AI & WebRTC Audio Tuning (7 credits)...');
  const s6Start = new Date('2026-11-22T15:10:00.000Z');
  const s6End = new Date('2026-11-22T15:24:00.000Z');
  const s6Duration = 840; // 14 mins
  const s6Credits = 7;
  runningBalance -= s6Credits; // 55 EXACTLY!

  const session6 = await prisma.aISession.create({
    data: {
      userId,
      title: 'Multilingual Conversational AI & WebRTC Audio Tuning',
      mode: SessionMode.LANGUAGE,
      status: SessionStatus.ENDED,
      inputSource: 'both',
      aiModel: 'gemini-2.0-flash-exp',
      transcriptionModel: 'gemini-2.0-flash-exp',
      startedAt: s6Start,
      endedAt: s6End,
      durationSeconds: s6Duration,
      creditsConsumed: s6Credits,
      isFavorite: false,
      createdAt: s6Start,
      updatedAt: s6End,
    },
  });

  // Authentic Trilingual Transcript (Gujarati + Hindi + English)
  await prisma.sessionTranscriptSegment.createMany({
    data: [
      {
        sessionId: session6.id,
        speakerType: TranscriptSpeaker.USER,
        speakerName: 'Pratham Pansuriya',
        text: 'Audio jitter buffer અને echo cancellation WebRTC માં કેવી રીતે કન્ફિગર કરવું? આપણી લેટન્સી થોડી વધારે આવે છે.',
        sequenceNumber: 1,
        startTimeMs: 1100,
        endTimeMs: 8200,
        language: 'gu',
        confidence: 0.98,
        createdAt: new Date('2026-11-22T15:10:10.000Z'),
      },
      {
        sessionId: session6.id,
        speakerType: TranscriptSpeaker.AI,
        speakerName: 'AI Copilot',
        text: 'તમારે navigator.mediaDevices.getUserMedia માં echoCancellation: true, noiseSuppression: true અને autoGainControl: true ઇનેબલ કરવું પડશે. સાથે jitter buffer ટાર્ગેટ 50ms સેટ કરો.',
        sequenceNumber: 2,
        startTimeMs: 8900,
        endTimeMs: 22000,
        language: 'gu',
        confidence: 0.99,
        createdAt: new Date('2026-11-22T15:10:25.000Z'),
      },
      {
        sessionId: session6.id,
        speakerType: TranscriptSpeaker.USER,
        speakerName: 'Pratham Pansuriya',
        text: 'और अगर यूजर बातचीत में हिंदी, गुजराती और इंग्लिश मिक्स करके बोले, तो क्या ऑडियो मॉडल इसे सही से समझ पाएगा?',
        sequenceNumber: 3,
        startTimeMs: 22800,
        endTimeMs: 31000,
        language: 'hi',
        confidence: 0.98,
        createdAt: new Date('2026-11-22T15:10:38.000Z'),
      },
      {
        sessionId: session6.id,
        speakerType: TranscriptSpeaker.AI,
        speakerName: 'AI Copilot',
        text: 'हाँ, हमारा multimodal speech engine नेटिव ऑडियो टोकन्स प्रोसेस करता है, इसलिए Hindi, Gujarati और English के मिक्स्ड कोड-स्विचिंग को 98% एक्यूरेसी के साथ सीमलेसली ट्रांसक्राइब कर लेता है।',
        sequenceNumber: 4,
        startTimeMs: 31800,
        endTimeMs: 44000,
        language: 'hi',
        confidence: 0.99,
        createdAt: new Date('2026-11-22T15:10:50.000Z'),
      },
      {
        sessionId: session6.id,
        speakerType: TranscriptSpeaker.USER,
        speakerName: 'Pratham Pansuriya',
        text: 'That is truly phenomenal. Real-time voice latency is super low and crystal clear now!',
        sequenceNumber: 5,
        startTimeMs: 44800,
        endTimeMs: 50200,
        language: 'en',
        confidence: 0.99,
        createdAt: new Date('2026-11-22T15:11:00.000Z'),
      },
    ],
  });

  await prisma.sessionSummary.create({
    data: {
      sessionId: session6.id,
      title: 'Multilingual Conversational AI & WebRTC Audio Tuning Summary',
      overview: 'Testing and optimization of multilingual voice conversational AI across English, Hindi, and Gujarati with WebRTC audio parameter tuning.',
      keyPoints: [
        'Configured WebRTC echoCancellation, noiseSuppression, and autoGainControl flags',
        'Achieved 50ms jitter buffer target for smooth real-time speech synthesis',
        'Demonstrated 98%+ accuracy on natural trilingual code-switching',
      ],
      actionItems: [
        'Set default browser audio constraints to enable noise cancellation',
        'Test WebRTC peer connection jitter statistics on mobile networks',
      ],
      decisions: [
        'Enforce 24kHz Opus audio stream for balanced latency and acoustic clarity',
      ],
      topicsCovered: ['WebRTC', 'Audio Processing', 'Multilingual AI', 'Code-Switching', 'Jitter Buffer'],
      modelUsed: 'gemini-2.0-flash-exp',
      createdAt: s6End,
      updatedAt: s6End,
    },
  });

  const snap6_1 = await prisma.sessionSnapshot.create({
    data: {
      sessionId: session6.id,
      userId,
      cloudinaryUrl: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=1200&auto=format&fit=crop&q=80',
      cloudinaryPublicId: 'snapshots/webrtc_audio_latency_stats',
      captureTimestamp: new Date('2026-11-22T15:16:00.000Z'),
      source: 'SCREEN',
      analysisStatus: 'COMPLETED',
      description: 'WebRTC audio metrics and packet loss telemetry graph.',
      aiAnalysis: 'Audio round-trip latency verified at 68ms with zero packet loss on 24kHz Opus stream.',
      userNotes: 'Optimal voice transmission configuration confirmed.',
      width: 1920,
      height: 1080,
      sizeBytes: 195000,
      createdAt: new Date('2026-11-22T15:16:00.000Z'),
    },
  });

  await prisma.sessionReport.create({
    data: {
      sessionId: session6.id,
      userId,
      title: 'Multilingual Conversational AI & WebRTC Audio Tuning Report',
      overview: 'Comprehensive evaluation of low-latency voice pipeline and multilingual conversational capabilities.',
      keyTopics: ['WebRTC Audio', 'Multilingual Recognition', 'Opus Codec', 'Acoustic Tuning'],
      importantQuestions: [
        {
          question: 'What audio sample rate produces the lowest round-trip latency with the live streaming engine?',
          answer: '24kHz 16-bit PCM (or Opus encoded) delivers sub-100ms round trip times.',
          asker: 'Pratham Pansuriya',
          answeredBy: 'AI Copilot',
        },
      ],
      keyObservations: [
        'Trilingual code-switching was recognized without manual language switching',
      ],
      decisions: [
        'Default WebRTC audio constraint set with noise suppression enabled',
      ],
      actionItems: [
        { task: 'Deploy WebRTC constraint presets', description: 'Update browser audio capture settings', owner: 'Pratham', priority: 'MEDIUM' },
      ],
      taskChecklist: [
        { id: 't12', text: 'Measure round-trip audio latency', completed: true, owner: 'Pratham' },
        { id: 't13', text: 'Validate code-switching transcription', completed: true, owner: 'Pratham' },
      ],
      followUpQuestions: [
        'How does speaker diarization perform when two speakers talk simultaneously?',
      ],
      relevantSnapshots: [
        { snapshotId: snap6_1.id, label: 'Audio Latency Telemetry', reason: 'Verified 68ms round trip time' },
      ],
      toolActivitySummary: {
        totalCount: 2,
        successCount: 2,
        failedCount: 0,
        tools: ['analyze_code', 'capture_screen_diff'],
      },
      sessionDuration: s6Duration,
      creditsConsumed: s6Credits,
      modelUsed: 'gemini-2.0-flash-exp',
      createdAt: s6End,
      updatedAt: s6End,
    },
  });

  await prisma.sessionMemory.createMany({
    data: [
      {
        sessionId: session6.id,
        category: MemoryCategory.OBSERVATION,
        title: 'Trilingual Code-Switching Accuracy',
        content: 'Multimodal speech engine transcribes mixed English, Hindi, and Gujarati with 98%+ semantic precision without language toggle.',
        importance: MemoryImportance.HIGH,
        isPinned: true,
        createdAt: s6End,
      },
    ],
  });

  const usage6 = await prisma.creditUsage.create({
    data: {
      userId,
      sessionId: session6.id,
      creditsDeducted: s6Credits,
      feature: CreditFeatureType.MULTIMODAL_STREAM,
      modelUsed: 'gemini-2.0-flash-exp',
      durationSeconds: s6Duration,
      billingPeriod: '2026-11',
      createdAt: s6End,
    },
  });

  await prisma.creditLedger.create({
    data: {
      userId,
      amount: -s6Credits,
      balanceAfter: runningBalance,
      type: CreditTransactionType.USAGE,
      reason: 'Multimodal session: Multilingual Conversational AI & WebRTC Audio Tuning',
      referenceId: usage6.id,
      billingPeriod: '2026-11',
      createdAt: s6End,
    },
  });

  console.log(`✅ All 6 sessions created. Final running credit balance: ${runningBalance} (Expected: 55)`);

  // 9. Create Snapshot Comparisons
  console.log('📦 Seeding Snapshot Comparisons...');
  await prisma.snapshotComparison.createMany({
    data: [
      {
        userId,
        snapshotAId: snap1_1.id,
        snapshotBId: snap1_2.id,
        prompt: 'Compare React component render tree and Tailwind theme contrast.',
        aiDifferences: 'Snapshot A highlights state re-render bottlenecks in the component tree, while Snapshot B verifies contrast ratio tokens across dark and light palettes. Combining both guarantees high-performance and accessible rendering.',
        metadata: { diffType: 'UI_ARCHITECTURE_COMPARISON' },
        createdAt: new Date('2026-11-03T10:30:00.000Z'),
      },
      {
        userId,
        snapshotAId: snap2_1.id,
        snapshotBId: snap4_1.id,
        prompt: 'Compare physical architecture blueprint with distributed Redis token bucket diagram.',
        aiDifferences: 'Snapshot A captures a physical system architecture diagram showing core database and queue topologies. Snapshot B zooms in on the Redis cluster token bucket rate-limiting subsystem with atomic Lua execution.',
        metadata: { diffType: 'SYSTEM_DESIGN_COMPARISON' },
        createdAt: new Date('2026-11-14T11:10:00.000Z'),
      },
    ],
  });

  // 10. Seed Knowledge Library (Saved Insights)
  console.log('📦 Seeding Knowledge Library (Saved Insights)...');
  await prisma.savedInsight.createMany({
    data: [
      {
        userId,
        sessionId: session1.id,
        title: 'Zustand Selector Optimization for WebRTC Streaming',
        content: 'To prevent full React component tree repaints during 60 FPS WebRTC audio/video telemetry, isolate streaming metrics into an atomic Zustand store. Subscribing via fine-grained selectors prevents parent reconciliations and slashes CPU usage by over 90%.',
        category: 'AI_ANSWER',
        source: 'Session 1: Full-Stack React Architecture Review',
        tags: ['React', 'Zustand', 'Performance', 'WebSockets'],
        createdAt: new Date('2026-11-03T10:32:00.000Z'),
      },
      {
        userId,
        sessionId: session2.id,
        title: 'Normalized 1000x1000 Coordinate Space in Multimodal Vision',
        content: 'Multimodal vision streaming returns bounding box coordinates normalized to [ymin, xmin, ymax, xmax] on a 0-1000 scale regardless of input image aspect ratio. To project back to canvas dimensions: actualX = (xmin / 1000) * canvasWidth, actualY = (ymin / 1000) * canvasHeight.',
        category: 'SNAPSHOT_ANALYSIS',
        source: 'Session 2: Multimodal Live Vision UI & OCR Debugging',
        tags: ['Computer Vision', 'Bounding Boxes', 'OCR', 'Canvas'],
        createdAt: new Date('2026-11-07T14:30:00.000Z'),
      },
      {
        userId,
        sessionId: session3.id,
        title: 'PostgreSQL Composite Indexing vs Sequential Scans',
        content: 'On audit and time-series tables like credit_ledger and ai_sessions, querying by userId without a compound date index forces PostgreSQL into full sequential scans. Adding @@index([userId, createdAt]) converts 380ms queries into ~12ms B-tree index lookups.',
        category: 'OBSERVATION',
        source: 'Session 3: Database Index Tuning',
        tags: ['PostgreSQL', 'Prisma', 'Index', 'Performance'],
        createdAt: new Date('2026-11-11T16:08:00.000Z'),
      },
      {
        userId,
        sessionId: session4.id,
        title: 'Atomic Redis Rate Limiting with Lua Scripting',
        content: 'Executing token bucket replenishment and deduction inside a Redis Lua script guarantees atomicity without distributed locks. Use Redis curly brace hash tags like {rate_limit:user_id} so all keys for a tenant map to identical cluster slots.',
        category: 'REPORT_FINDING',
        source: 'Session 4: System Design Tutoring',
        tags: ['Redis', 'Rate Limiting', 'Distributed Systems', 'Lua'],
        createdAt: new Date('2026-11-14T11:11:00.000Z'),
      },
      {
        userId,
        sessionId: session5.id,
        title: 'Docker Multi-Stage Build Optimization with Node Alpine',
        content: 'Separating dependencies installation, TypeScript compilation, and runtime container into multi-stage Dockerfile phases reduced backend image size from 1.15 GB to 184 MB. Utilizing pnpm store caching in GitHub Actions cut CI PR checks from 3.7m to 18s.',
        category: 'SESSION_NOTE',
        source: 'Session 5: Cloud Infrastructure & Docker CI/CD Sync',
        tags: ['Docker', 'DevOps', 'Alpine', 'GitHub Actions'],
        createdAt: new Date('2026-11-18T09:45:00.000Z'),
      },
      {
        userId,
        sessionId: session6.id,
        title: 'Multilingual Code-Switching with Native Audio Tokens',
        content: 'The multimodal live stream processes audio tokens directly end-to-end rather than chaining separate speech-to-text, translation, and speech synthesis pipelines. This architectural advantage enables natural code-switching between English, Hindi, and Gujarati with zero semantic loss.',
        category: 'TRANSCRIPT_SEGMENT',
        source: 'Session 6: Multilingual Conversational AI',
        tags: ['Multilingual', 'Speech AI', 'WebRTC', 'Audio Processing'],
        createdAt: new Date('2026-11-22T15:20:00.000Z'),
      },
      {
        userId,
        sessionId: null,
        title: 'Zero-Downtime Database Migrations in Prisma',
        content: 'When adding indexes in PostgreSQL under active production workloads, use CREATE INDEX CONCURRENTLY to prevent locking write transactions on high-volume tables.',
        category: 'AI_ANSWER',
        source: 'Vision Studio Knowledge Base',
        tags: ['Prisma', 'PostgreSQL', 'Migrations', 'Zero-Downtime'],
        createdAt: new Date('2026-11-20T12:00:00.000Z'),
      },
      {
        userId,
        sessionId: null,
        title: 'WebRTC Low-Latency Acoustic Constraints',
        content: 'For bidirectional conversational AI audio streams, set echoCancellation: true, noiseSuppression: true, autoGainControl: true, and maintain 24kHz Opus codec encoding for crisp vocal clarity.',
        category: 'OBSERVATION',
        source: 'Vision Studio Audio Standards',
        tags: ['WebRTC', 'Audio', 'Echo Cancellation', 'Opus'],
        createdAt: new Date('2026-11-21T18:00:00.000Z'),
      },
    ],
  });

  // 11. Seed In-App Notifications (Only using valid NotificationType: SYSTEM, SESSION, BILLING, CREDIT, SECURITY, AI_INSIGHT)
  console.log('📦 Seeding Notifications...');
  await prisma.notification.createMany({
    data: [
      {
        userId,
        type: NotificationType.CREDIT,
        title: 'Monthly Free Tier Credits Granted',
        message: 'Your account was credited with 100 free multimodal credits for November 2026.',
        isRead: true,
        readAt: new Date('2026-11-01T09:00:00.000Z'),
        actionUrl: '/billing',
        createdAt: new Date('2026-11-01T08:00:00.000Z'),
      },
      {
        userId,
        type: NotificationType.SESSION,
        title: 'Session Completed: Full-Stack React Architecture Review',
        message: 'Your 20-minute developer session has ended. Summary, transcript, and snapshots are ready.',
        isRead: true,
        readAt: new Date('2026-11-03T11:00:00.000Z'),
        relatedEntityType: 'SESSION',
        relatedEntityId: session1.id,
        actionUrl: `/sessions/${session1.id}`,
        createdAt: new Date('2026-11-03T10:35:05.000Z'),
      },
      {
        userId,
        type: NotificationType.AI_INSIGHT,
        title: 'New Knowledge Insight Extracted',
        message: 'Key architecture note "Normalized 1000x1000 Coordinate Space" was saved to your library.',
        isRead: true,
        readAt: new Date('2026-11-07T15:00:00.000Z'),
        actionUrl: '/knowledge',
        createdAt: new Date('2026-11-07T14:36:00.000Z'),
      },
      {
        userId,
        type: NotificationType.SESSION,
        title: 'Session Report Ready: Database Index Tuning',
        message: 'Automated executive report and action checklist generated for database query optimization.',
        isRead: true,
        readAt: new Date('2026-11-11T17:00:00.000Z'),
        relatedEntityType: 'SESSION',
        relatedEntityId: session3.id,
        actionUrl: `/sessions/${session3.id}`,
        createdAt: new Date('2026-11-11T16:10:05.000Z'),
      },
      {
        userId,
        type: NotificationType.SESSION,
        title: 'Session Completed: Cloud Infrastructure & Docker CI/CD Sync',
        message: 'Your 18-minute architecture sync was summarized. Docker image size reduction confirmed.',
        isRead: true,
        readAt: new Date('2026-11-18T10:00:00.000Z'),
        relatedEntityType: 'SESSION',
        relatedEntityId: session5.id,
        actionUrl: `/sessions/${session5.id}`,
        createdAt: new Date('2026-11-18T09:48:05.000Z'),
      },
      {
        userId,
        type: NotificationType.CREDIT,
        title: 'Credit Usage Update: 45 Credits Consumed',
        message: 'You have consumed 45 credits across 6 sessions this billing period. 55 credits remaining.',
        isRead: false,
        actionUrl: '/billing',
        createdAt: new Date('2026-11-22T15:25:00.000Z'),
      },
    ],
  });

  // 12. Seed Recent Searches
  console.log('📦 Seeding Recent Searches...');
  await prisma.recentSearch.createMany({
    data: [
      { userId, query: 'PostgreSQL index tuning', category: 'ALL', createdAt: new Date('2026-11-11T15:50:00.000Z') },
      { userId, query: 'Redis Lua token bucket rate limiter', category: 'ALL', createdAt: new Date('2026-11-14T10:45:00.000Z') },
      { userId, query: 'Docker multi-stage build Node Alpine', category: 'ALL', createdAt: new Date('2026-11-18T09:15:00.000Z') },
      { userId, query: 'WebRTC echo cancellation audio constraints', category: 'ALL', createdAt: new Date('2026-11-22T15:00:00.000Z') },
      { userId, query: 'Multimodal live stream WebSockets', category: 'ALL', createdAt: new Date('2026-11-23T09:30:00.000Z') },
    ],
  });

  console.log('\n======================================================');
  console.log('🎉 SEEDING COMPLETED SUCCESSFULLY!');
  console.log(`👤 User: ${email}`);
  console.log(`📊 Initial Grant: 100 Credits`);
  console.log(`📉 Consumed Credits: 45 Credits (10 + 8 + 5 + 6 + 9 + 7)`);
  console.log(`💰 Authoritative Current Balance: ${runningBalance} Credits (Expected 55)`);
  console.log(`🗓️ Date Range: 2026-11-01 to 2026-11-23`);
  console.log(`📁 6 AISessions, 8 Snapshots, 6 Reports, 6 Summaries`);
  console.log(`💡 8 Saved Insights, 2 Custom Templates, 6 Notifications`);
  console.log('======================================================\n');

  await pool.end();
}

seedPrathamData().catch(async (error) => {
  console.error('❌ Error seeding Pratham data:', error);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
