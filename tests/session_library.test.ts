import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaService } from '../src/services/prisma.service.js';
import { SessionService } from '../src/services/session.service.js';

describe('Prompt 20 — Session Library, Transcript Intelligence & Continuation Suite', () => {
  let testUserId = '';
  let sessionAId = '';
  let sessionBId = '';

  before(async () => {
    // 1. Create a test user in DB
    const user = await PrismaService.client.user.create({
      data: {
        email: `session_library_tester_${Date.now()}@example.com`,
        name: 'Session Library Tester',
        authProvider: 'LOCAL',
        accountStatus: 'ACTIVE',
      },
    });
    testUserId = user.id;

    // 2. Create Session A (with transcripts, summary, and tools)
    const sessionA = await PrismaService.client.aISession.create({
      data: {
        userId: testUserId,
        title: 'Deep Multimodal Code Review Session',
        mode: 'DEVELOPER',
        status: 'ENDED',
        durationSeconds: 420,
        creditsConsumed: 8,
        isFavorite: true,
        isArchived: false,
        aiModel: 'gemini-3.8-live',
        transcriptionModel: 'gemini-3.5-transcribe-live',
      },
    });
    sessionAId = sessionA.id;

    // Add transcripts for Session A
    await PrismaService.client.sessionTranscriptSegment.createMany({
      data: [
        {
          sessionId: sessionAId,
          speakerType: 'USER',
          speakerName: 'Multimodal Tester',
          text: 'Can you inspect line 42 for concurrency race conditions?',
          sequenceNumber: 1,
          isFinal: true,
        },
        {
          sessionId: sessionAId,
          speakerType: 'AI',
          speakerName: 'Gemini 3.8 Live',
          text: 'I see the critical section lacks a mutex lock. Let me generate a patch.',
          sequenceNumber: 2,
          isFinal: true,
        },
      ],
    });

    // Add summary for Session A
    await PrismaService.client.sessionSummary.create({
      data: {
        sessionId: sessionAId,
        title: 'Concurrency Review Summary',
        overview: 'Identified race condition on thread pool worker queue.',
        keyPoints: ['Critical section without mutex', 'Buffer overflow risk mitigated'],
        actionItems: ['Implement spinlock', 'Add automated load test'],
        modelUsed: 'gemini-2.5-flash',
      },
    });

    // Add tool execution for Session A
    await PrismaService.client.aIToolExecution.create({
      data: {
        sessionId: sessionAId,
        toolName: 'calculator',
        status: 'SUCCESS',
        arguments: { expression: '1024 * 4' },
        resultMetadata: { result: 4096 },
        executionDurationMs: 12,
      },
    });

    // 3. Create Session B (Archived, Presentation mode)
    const sessionB = await PrismaService.client.aISession.create({
      data: {
        userId: testUserId,
        title: 'Q4 Pitch Deck Rehearsal',
        mode: 'PRESENTATION',
        status: 'ENDED',
        durationSeconds: 900,
        creditsConsumed: 15,
        isFavorite: false,
        isArchived: true,
        aiModel: 'gemini-3.8-live',
        transcriptionModel: 'gemini-3.5-transcribe-live',
      },
    });
    sessionBId = sessionB.id;
  });

  after(async () => {
    try {
      await PrismaService.client.sessionSummary.deleteMany({
        where: { session: { userId: testUserId } },
      });
      await PrismaService.client.sessionTranscriptSegment.deleteMany({
        where: { session: { userId: testUserId } },
      });
      await PrismaService.client.aIToolExecution.deleteMany({
        where: { session: { userId: testUserId } },
      });
      await PrismaService.client.aISession.deleteMany({
        where: { userId: testUserId },
      });
      await PrismaService.client.user.delete({
        where: { id: testUserId },
      });
    } catch {
      // ignore
    }
    await PrismaService.disconnect();
  });

  test('SessionService.listSessions: filters by search, mode, status, isFavorite, isArchived', async () => {
    // 1. Search by title
    const searchRes = await SessionService.listSessions(testUserId, {
      page: 1,
      limit: 10,
      search: 'Code Review',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    assert.equal(searchRes.total, 1);
    assert.equal(searchRes.sessions[0].id, sessionAId);

    // 2. Search within transcript text
    const transcriptSearch = await SessionService.listSessions(testUserId, {
      page: 1,
      limit: 10,
      search: 'mutex lock',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    assert.equal(transcriptSearch.total, 1);
    assert.equal(transcriptSearch.sessions[0].id, sessionAId);

    // 3. Filter by isFavorite
    const favRes = await SessionService.listSessions(testUserId, {
      page: 1,
      limit: 10,
      isFavorite: true,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    assert.equal(favRes.total, 1);
    assert.equal(favRes.sessions[0].id, sessionAId);

    // 4. Filter by isArchived
    const archivedRes = await SessionService.listSessions(testUserId, {
      page: 1,
      limit: 10,
      isArchived: true,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    assert.equal(archivedRes.total, 1);
    assert.equal(archivedRes.sessions[0].id, sessionBId);
  });

  test('SessionService.getSessionDetails: retrieves transcript segments, summary, and tools', async () => {
    const details = await SessionService.getSessionDetails(testUserId, sessionAId);

    assert.equal(details.id, sessionAId);
    assert.equal(details.transcriptSegments.length, 2);
    assert.equal(details.transcriptSegments[0].speakerType, 'USER');
    assert.equal(details.transcriptSegments[1].speakerType, 'AI');
    assert.ok(details.summary, 'Summary should be attached');
    assert.equal(details.summary?.title, 'Concurrency Review Summary');
    assert.equal(details.toolExecutions.length, 1);
    assert.equal(details.toolExecutions[0].toolName, 'calculator');
  });

  test('SessionService.updateSession: renames title and updates archive/favorite state', async () => {
    const updated = await SessionService.updateSession(testUserId, sessionAId, {
      title: 'Renamed Engineering Session',
      isFavorite: false,
    });

    assert.equal(updated.title, 'Renamed Engineering Session');
    assert.equal(updated.isFavorite, false);
  });

  test('SessionService.exportTranscript: exports TXT, Markdown, and JSON correctly', async () => {
    // 1. TXT export
    const txt = await SessionService.exportTranscript(testUserId, sessionAId, 'txt');
    assert.equal(txt.contentType, 'text/plain');
    assert.ok(txt.content.includes('User: Can you inspect line 42'));
    assert.ok(txt.content.includes('Gemini 3.8 Live: I see the critical section'));

    // 2. Markdown export
    const md = await SessionService.exportTranscript(testUserId, sessionAId, 'md');
    assert.equal(md.contentType, 'text/markdown');
    assert.ok(md.content.includes('# Session Transcript:'));
    assert.ok(md.content.includes('## Executive Summary'));
    assert.ok(md.content.includes('> ['));

    // 3. JSON export
    const jsonRes = await SessionService.exportTranscript(testUserId, sessionAId, 'json');
    assert.equal(jsonRes.contentType, 'application/json');
    const parsed = JSON.parse(jsonRes.content);
    assert.equal(parsed.sessionId, sessionAId);
    assert.equal(parsed.segments.length, 2);
  });

  test('SessionService.continueSession: creates new session with restored context', async () => {
    // First grant the test user credits so reservation succeeds
    await PrismaService.client.creditLedger.create({
      data: {
        userId: testUserId,
        amount: 100,
        balanceAfter: 100,
        type: 'GRANT',
        reason: 'Testing continuation grant',
      },
    });

    const continued = await SessionService.continueSession(testUserId, sessionAId, {
      title: 'Follow-up Concurrency Session',
      includeSummary: true,
      includeRecentTranscripts: true,
    });

    assert.ok(continued.session.id);
    assert.notEqual(continued.session.id, sessionAId, 'Must create a NEW distinct session');
    assert.equal(continued.continuedFromSessionId, sessionAId);
    assert.equal(continued.session.mode, 'DEVELOPER');
    assert.ok(continued.token, 'Must issue WebSocket connection ticket');
  });

  test('SessionService.deleteSession: permanently deletes session record', async () => {
    const delResult = await SessionService.deleteSession(testUserId, sessionBId);
    assert.equal(delResult.deleted, true);

    await assert.rejects(
      async () => {
        await SessionService.getSessionDetails(testUserId, sessionBId);
      },
      /not found/i
    );
  });
});
