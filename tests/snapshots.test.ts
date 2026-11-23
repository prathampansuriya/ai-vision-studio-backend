import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaService } from '../src/services/prisma.service.js';
import { SnapshotService } from '../src/services/snapshot.service.js';
import {
  captureSnapshotSchema,
  updateSnapshotSchema,
  askSnapshotSchema,
  compareSnapshotsSchema,
  listSnapshotsQuerySchema,
} from '../validators/snapshot.validator.js';

describe('Prompt 19 — Snapshot Studio & Frame Intelligence Suite', () => {
  let testUserId = '';
  let testSessionId = '';
  let snapshotAId = '';
  let snapshotBId = '';
  const mockBase64Image =
    'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  before(async () => {
    // 1. Create a test user in DB
    const user = await PrismaService.client.user.create({
      data: {
        email: `snapshot_tester_${Date.now()}@example.com`,
        name: 'Snapshot Studio Tester',
        authProvider: 'LOCAL',
        accountStatus: 'ACTIVE',
      },
    });
    testUserId = user.id;

    // 2. Create a test session in DB
    const session = await PrismaService.client.aISession.create({
      data: {
        userId: testUserId,
        title: 'Snapshot Studio Test Session',
        mode: 'VISION',
        status: 'ACTIVE',
      },
    });
    testSessionId = session.id;
  });

  after(async () => {
    // Clean up all snapshots, comparisons, session, and user
    try {
      await PrismaService.client.snapshotComparison.deleteMany({
        where: { userId: testUserId },
      });
      await PrismaService.client.sessionSnapshot.deleteMany({
        where: { userId: testUserId },
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

  test('SnapshotService.captureSnapshot: captures frame, stores metadata, and links to session', async () => {
    const snapshotA = await SnapshotService.captureSnapshot(testUserId, {
      sessionId: testSessionId,
      imageData: mockBase64Image,
      source: 'CAMERA',
      description: 'Camera Scene - Test Baseline Frame',
      userNotes: 'Initial observation before refactoring',
      width: 1920,
      height: 1080,
      autoAnalyze: false,
    });

    assert.ok(snapshotA.id, 'Snapshot ID must be generated');
    assert.equal(snapshotA.sessionId, testSessionId);
    assert.equal(snapshotA.userId, testUserId);
    assert.equal(snapshotA.source, 'CAMERA');
    assert.equal(snapshotA.analysisStatus, 'PENDING');
    assert.ok(snapshotA.cloudinaryUrl, 'Must return Cloudinary asset URL');
    assert.equal(snapshotA.userNotes, 'Initial observation before refactoring');
    snapshotAId = snapshotA.id;
  });

  test('SnapshotService.captureSnapshot: supports SCREEN source and visual annotations', async () => {
    const annotationsMock = [
      { type: 'rectangle', x: 50, y: 50, width: 200, height: 120, color: '#06b6d4' },
      { type: 'arrow', startX: 10, startY: 10, endX: 50, endY: 50, color: '#10b981' },
      { type: 'text', text: 'Bug Trace Here', x: 260, y: 80, color: '#f43f5e' },
    ];

    const snapshotB = await SnapshotService.captureSnapshot(testUserId, {
      sessionId: testSessionId,
      imageData: mockBase64Image,
      source: 'SCREEN',
      description: 'Screen Share - Terminal Logs & Error Trace',
      userNotes: 'Highlighted bug stack trace on line 42',
      annotations: annotationsMock,
      annotatedImageData: mockBase64Image,
      width: 1920,
      height: 1080,
      autoAnalyze: false,
    });

    assert.ok(snapshotB.id);
    assert.equal(snapshotB.source, 'SCREEN');
    assert.ok(snapshotB.annotatedImageUrl, 'Must store annotated composite image');
    assert.ok(snapshotB.annotations, 'Must persist annotation vector objects');
    snapshotBId = snapshotB.id;
  });

  test('SnapshotService.listSnapshots: filters by session, source, search, and paginates', async () => {
    // Query list
    const result = await SnapshotService.listSnapshots(testUserId, {
      sessionId: testSessionId,
      sortBy: 'captureTimestamp',
      sortOrder: 'desc',
      page: 1,
      limit: 10,
    });

    assert.equal(result.pagination.totalCount, 2);
    assert.equal(result.items.length, 2);
    assert.ok(result.items[0].session, 'Should include associated session data');

    // Filter by source: SCREEN
    const screenOnly = await SnapshotService.listSnapshots(testUserId, {
      source: 'SCREEN',
      sortBy: 'captureTimestamp',
      sortOrder: 'desc',
      page: 1,
      limit: 10,
    });
    assert.equal(screenOnly.items.length, 1);
    assert.equal(screenOnly.items[0].source, 'SCREEN');

    // Search query
    const searchMatch = await SnapshotService.listSnapshots(testUserId, {
      search: 'refactoring',
      sortBy: 'captureTimestamp',
      sortOrder: 'desc',
      page: 1,
      limit: 10,
    });
    assert.equal(searchMatch.items.length, 1);
    assert.equal(searchMatch.items[0].id, snapshotAId);
  });

  test('SnapshotService.updateSnapshot: updates notes and annotations', async () => {
    const updated = await SnapshotService.updateSnapshot(testUserId, snapshotAId, {
      description: 'Updated Baseline Frame Title',
      userNotes: 'Validated with QA team.',
    });

    assert.equal(updated.description, 'Updated Baseline Frame Title');
    assert.equal(updated.userNotes, 'Validated with QA team.');
  });

  test('SnapshotService.analyzeSnapshot: performs multimodal analysis and updates status', async () => {
    const analyzed = await SnapshotService.analyzeSnapshot(
      testUserId,
      snapshotAId,
      'Inspect visible objects and text in detail',
      'workspace'
    );

    assert.equal(analyzed.analysisStatus, 'COMPLETED');
    assert.ok(analyzed.aiAnalysis, 'AI analysis report must be populated');
    assert.ok(analyzed.detectedObjects, 'Detected objects must be populated');
  });

  test('SnapshotService.askQuestion: multimodal Q&A appends to snapshot history', async () => {
    const qaResult = await SnapshotService.askQuestion(
      testUserId,
      snapshotAId,
      'What objects or UI areas are clearly visible?'
    );

    assert.ok(qaResult.id);
    assert.equal(qaResult.question, 'What objects or UI areas are clearly visible?');
    assert.ok(qaResult.answer, 'Must return multimodal answer');

    // Verify stored in snapshot metadata
    const fetched = await SnapshotService.getSnapshotById(testUserId, snapshotAId);
    const meta = fetched.metadata as Record<string, any>;
    assert.ok(Array.isArray(meta?.qaHistory));
    assert.equal(meta.qaHistory.length, 1);
    assert.equal(meta.qaHistory[0].question, 'What objects or UI areas are clearly visible?');
  });

  test('SnapshotService.compareSnapshots: compares two snapshots and persists comparison result', async () => {
    const comparison = await SnapshotService.compareSnapshots(testUserId, {
      snapshotAId,
      snapshotBId,
      prompt: 'Identify differences between the baseline camera shot and screen log',
    });

    assert.ok(comparison.id);
    assert.equal(comparison.userId, testUserId);
    assert.equal(comparison.snapshotAId, snapshotAId);
    assert.equal(comparison.snapshotBId, snapshotBId);
    assert.ok(comparison.aiDifferences, 'AI comparison findings must be generated');

    // Verify list comparisons
    const compList = await SnapshotService.listComparisons(testUserId);
    assert.ok(compList.length >= 1);
    assert.equal(compList[0].id, comparison.id);
  });

  test('Validation: rejects comparisons with identical snapshots or unowned sessions', async () => {
    // 1. Identical snapshots
    await assert.rejects(
      async () => {
        await SnapshotService.compareSnapshots(testUserId, {
          snapshotAId,
          snapshotBId: snapshotAId,
        });
      },
      /distinct/
    );

    // 2. Unowned session
    await assert.rejects(
      async () => {
        await SnapshotService.captureSnapshot(testUserId, {
          sessionId: '00000000-0000-0000-0000-000000000000',
          imageData: mockBase64Image,
          source: 'CAMERA',
        });
      },
      /not found/
    );
  });

  test('SnapshotService.deleteSnapshot: deletes asset and record', async () => {
    const delResult = await SnapshotService.deleteSnapshot(testUserId, snapshotBId);
    assert.equal(delResult.deleted, true);

    await assert.rejects(
      async () => {
        await SnapshotService.getSnapshotById(testUserId, snapshotBId);
      },
      /not found/
    );
  });
});
