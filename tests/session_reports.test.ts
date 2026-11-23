import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaService } from '../src/services/prisma.service.js';
import { ReportService } from '../src/services/report.service.js';

describe('Prompt 21 — Session Intelligence Reports & Action Items Suite', () => {
  let testUserId: string;
  let unauthorizedUserId: string;
  let testSessionId: string;

  before(async () => {
    // 1. Create primary test user
    const user = await PrismaService.client.user.create({
      data: {
        email: `report_tester_${Date.now()}@example.com`,
        name: 'Report Intelligence Tester',
        authProvider: 'LOCAL',
        accountStatus: 'ACTIVE',
      },
    });
    testUserId = user.id;

    // 2. Create another user to test unauthorized access
    const unauthorizedUser = await PrismaService.client.user.create({
      data: {
        email: `unauthorized_tester_${Date.now()}@example.com`,
        name: 'Unauthorized User',
        authProvider: 'LOCAL',
        accountStatus: 'ACTIVE',
      },
    });
    unauthorizedUserId = unauthorizedUser.id;

    // 3. Create completed multimodal session
    const session = await PrismaService.client.aISession.create({
      data: {
        userId: testUserId,
        title: 'Microservices Reliability & Concurrency Audit',
        mode: 'DEVELOPER',
        status: 'ENDED',
        aiModel: 'gemini-3.8-live',
        transcriptionModel: 'gemini-3.5-transcribe-live',
        durationSeconds: 540,
        creditsConsumed: 9,
      },
    });
    testSessionId = session.id;

    // 4. Create actual transcript segments
    await PrismaService.client.sessionTranscriptSegment.createMany({
      data: [
        {
          sessionId: testSessionId,
          speakerType: 'USER',
          speakerName: 'Marcus',
          text: 'Can we identify why thread worker starvation occurs under peak traffic?',
          language: 'en',
          sequenceNumber: 1,
        },
        {
          sessionId: testSessionId,
          speakerType: 'AI',
          speakerName: 'Gemini 3.8 Live',
          text: 'I observe that the worker pool queue is blocking without backpressure rejection.',
          language: 'en',
          sequenceNumber: 2,
        },
        {
          sessionId: testSessionId,
          speakerType: 'USER',
          speakerName: 'Marcus',
          text: 'Agreed. Let me implement a bounded ring buffer queue with circuit breakers before Friday.',
          language: 'en',
          sequenceNumber: 3,
        },
        {
          sessionId: testSessionId,
          speakerType: 'AI',
          speakerName: 'Gemini 3.8 Live',
          text: 'Great decision. I will prepare unit tests for the bounded queue implementation.',
          language: 'en',
          sequenceNumber: 4,
        },
      ],
    });

    // 5. Create a tool execution record
    await PrismaService.client.aIToolExecution.create({
      data: {
        sessionId: testSessionId,
        toolName: 'queue_profiler',
        status: 'SUCCESS',
        arguments: { max_depth: 500, current_depth: 500 },
        resultMetadata: { queue_full: true, dropped_packets: 12 },
        executionDurationMs: 65,
      },
    });

    // 6. Create a visual snapshot capture record
    await PrismaService.client.sessionSnapshot.create({
      data: {
        sessionId: testSessionId,
        userId: testUserId,
        cloudinaryUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        cloudinaryPublicId: 'snapshots/sample_queue_trace',
        source: 'SCREEN',
        analysisStatus: 'COMPLETED',
        description: 'Trace diagram of worker pool queue starvation',
        extractedText: 'QUEUE_MAX_CAPACITY=500 STATUS=BLOCKED',
        aiAnalysis: 'Visual trace demonstrates lock contention on ring buffer head pointer.',
      },
    });
  });

  after(async () => {
    try {
      await PrismaService.client.sessionReport.deleteMany({
        where: { sessionId: testSessionId },
      });
      await PrismaService.client.sessionSnapshot.deleteMany({
        where: { sessionId: testSessionId },
      });
      await PrismaService.client.aIToolExecution.deleteMany({
        where: { sessionId: testSessionId },
      });
      await PrismaService.client.sessionTranscriptSegment.deleteMany({
        where: { sessionId: testSessionId },
      });
      await PrismaService.client.aISession.deleteMany({
        where: { userId: testUserId },
      });
      await PrismaService.client.user.deleteMany({
        where: { id: { in: [testUserId, unauthorizedUserId] } },
      });
    } catch (e) {
      // Cleanup best effort
    }
    await PrismaService.disconnect();
  });

  test('ReportService.generateReport: compiles grounded intelligence report from real session records', async () => {
    const report = await ReportService.generateReport(testUserId, testSessionId, {
      regenerate: false,
    });

    assert.ok(report);
    assert.equal(report.sessionId, testSessionId);
    assert.equal(report.userId, testUserId);
    assert.ok(report.title.includes('Microservices Reliability'));
    assert.ok(report.overview.length > 20);
    assert.equal(report.sessionDuration, 540);
    assert.equal(report.creditsConsumed, 9);
    assert.ok(report.modelUsed.includes('gemini-2.5-flash'));

    // Verify structured decisions & observations
    const decisions = report.decisions as any[];
    assert.ok(Array.isArray(decisions));
    assert.ok(decisions.length >= 1);

    // Verify action items: strictly grounded with turn references and extracted deadlines
    const actionItems = report.actionItems as any[];
    assert.ok(Array.isArray(actionItems));
    assert.ok(actionItems.length >= 1);
    const item = actionItems[0];
    assert.ok(item.task);
    assert.ok(item.transcript_reference);
    assert.ok(item.transcript_reference.includes('Turn #'));

    // Verify checklist
    const checklist = report.taskChecklist as any[];
    assert.ok(Array.isArray(checklist));
    assert.ok(checklist.length >= 1);

    // Verify questions and answers
    const questions = report.importantQuestions as any[];
    assert.ok(Array.isArray(questions));
    assert.ok(questions.length >= 1);
    assert.ok(questions[0].question.includes('starvation'));

    // Verify tool summary
    const toolSummary = report.toolActivitySummary as any;
    assert.ok(toolSummary);
    assert.equal(toolSummary.total_calls, 1);
    assert.ok(toolSummary.tools_used.includes('queue_profiler'));

    // Verify relevant snapshots
    const snapshots = report.relevantSnapshots as any[];
    assert.ok(Array.isArray(snapshots));
    assert.equal(snapshots.length, 1);
  });

  test('ReportService.getReport: retrieves saved report and enforces authorization', async () => {
    const report = await ReportService.getReport(testUserId, testSessionId);
    assert.ok(report);
    assert.equal(report.sessionId, testSessionId);

    // Unauthorized user must be blocked
    await assert.rejects(
      async () => {
        await ReportService.getReport(unauthorizedUserId, testSessionId);
      },
      {
        message: 'You are not authorized to view reports for this session.',
      }
    );
  });

  test('ReportService.generateReport with regenerate=true updates report record', async () => {
    const regenerated = await ReportService.generateReport(testUserId, testSessionId, {
      regenerate: true,
      focusArea: 'Concurrency Bottlenecks',
    });

    assert.ok(regenerated);
    assert.equal(regenerated.sessionId, testSessionId);
    const meta = regenerated.metadata as any;
    assert.ok(meta.regeneratedAt || meta.generatedAt);
  });

  test('ReportService.exportReport: formats Markdown, Plain Text, JSON, and PDF (HTML)', async () => {
    // 1. Markdown Export
    const md = await ReportService.exportReport(testUserId, testSessionId, 'markdown');
    assert.equal(md.contentType, 'text/markdown');
    assert.ok(md.filename.endsWith('.md'));
    assert.ok(md.content.includes('# '));
    assert.ok(md.content.includes('## Executive Overview'));
    assert.ok(md.content.includes('## Action Items'));
    assert.ok(md.content.includes('| Task | Owner | Deadline | Priority | Source Citation |'));

    // 2. Plain Text Export
    const txt = await ReportService.exportReport(testUserId, testSessionId, 'txt');
    assert.equal(txt.contentType, 'text/plain');
    assert.ok(txt.filename.endsWith('.txt'));
    assert.ok(txt.content.includes('AI VISION STUDIO | SESSION INTELLIGENCE REPORT'));
    assert.ok(txt.content.includes('EXECUTIVE OVERVIEW:'));
    assert.ok(txt.content.includes('ACTION ITEMS:'));

    // 3. JSON Export
    const jsonRes = await ReportService.exportReport(testUserId, testSessionId, 'json');
    assert.equal(jsonRes.contentType, 'application/json');
    assert.ok(jsonRes.filename.endsWith('.json'));
    const parsed = JSON.parse(jsonRes.content);
    assert.equal(parsed.sessionId, testSessionId);
    assert.ok(Array.isArray(parsed.actionItems));

    // 4. PDF (Printable HTML Document) Export
    const pdfHtml = await ReportService.exportReport(testUserId, testSessionId, 'pdf');
    assert.ok(pdfHtml.contentType.includes('text/html'));
    assert.ok(pdfHtml.filename.endsWith('.html'));
    assert.ok(pdfHtml.content.includes('<!DOCTYPE html>'));
    assert.ok(pdfHtml.content.includes('@media print'));
    assert.ok(pdfHtml.content.includes('AI Vision Studio • Intelligence Report'));
  });

  test('ReportService error handling on non-existent session', async () => {
    await assert.rejects(
      async () => {
        await ReportService.generateReport(testUserId, '00000000-0000-0000-0000-000000000000');
      },
      {
        message: 'Session with ID 00000000-0000-0000-0000-000000000000 not found.',
      }
    );
  });
});
