import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { PrismaService } from '../src/services/prisma.service.js';
import { MemoryService } from '../src/services/memory.service.js';
import { SessionService } from '../src/services/session.service.js';
import { MemoryCategory, MemoryImportance, SessionMode, SessionStatus } from '@prisma/client';

describe('Prompt 22 — Visual Memory & Session Context Engine Suite', () => {
  let testUserId: string;
  let testSessionId: string;
  let secondUserId: string;
  let testMemoryId: string;

  before(async () => {
    const prisma = PrismaService.client;

    // 1. Create primary test user with credits
    const user = await prisma.user.create({
      data: {
        email: `visual_memory_tester_${Date.now()}@example.com`,
        name: 'Visual Memory Tester',
        creditLedgerEntries: {
          create: {
            amount: 500,
            balanceAfter: 500,
            type: 'GRANT',
            reason: 'WELCOME_BONUS',
          },
        },
      },
    });
    testUserId = user.id;

    // 2. Create unauthorized second user
    const otherUser = await prisma.user.create({
      data: {
        email: `other_memory_user_${Date.now()}@example.com`,
        name: 'Other Memory User',
      },
    });
    secondUserId = otherUser.id;

    // 3. Create active test session
    const session = await prisma.aISession.create({
      data: {
        userId: testUserId,
        title: 'Deep Architecture & Memory Review',
        mode: SessionMode.DEVELOPER,
        status: SessionStatus.CREATED,
        aiModel: 'gemini-3.8-live',
        transcriptionModel: 'gemini-3.5-transcribe-live',
        durationSeconds: 300,
        creditsConsumed: 5,
        transcriptSegments: {
          createMany: {
            data: [
              {
                speakerType: 'USER',
                speakerName: 'Tester',
                text: 'Can you help me debug our Redis cache eviction strategy?',
                sequenceNumber: 1,
                isFinal: true,
                language: 'en',
              },
              {
                speakerType: 'AI',
                speakerName: 'Gemini 3.8 Live',
                text: 'I can help with that. Notice we should switch from volatile-lru to allkeys-lru.',
                sequenceNumber: 2,
                isFinal: true,
                language: 'en',
              },
              {
                speakerType: 'USER',
                speakerName: 'Tester',
                text: 'Let us document that decision to use allkeys-lru.',
                sequenceNumber: 3,
                isFinal: true,
                language: 'en',
              },
            ],
          },
        },
        snapshots: {
          create: {
            userId: testUserId,
            cloudinaryUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
            cloudinaryPublicId: 'sample_mem_snap',
            source: 'SCREEN',
            description: 'Redis configuration file snippet',
            detectedObjects: ['code_editor', 'config_file'],
            aiAnalysis: 'maxmemory-policy is currently set to noeviction.',
          },
        },
      },
    });
    testSessionId = session.id;
  });

  after(async () => {
    const prisma = PrismaService.client;
    // Clean up test data
    if (testSessionId) {
      await prisma.sessionMemory.deleteMany({ where: { sessionId: testSessionId } });
      await prisma.sessionSnapshot.deleteMany({ where: { sessionId: testSessionId } });
      await prisma.sessionTranscriptSegment.deleteMany({ where: { sessionId: testSessionId } });
      await prisma.aISession.deleteMany({ where: { userId: testUserId } });
    }
    if (testUserId) {
      await prisma.creditLedger.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { id: { in: [testUserId, secondUserId] } } });
    }
    await PrismaService.disconnect();
  });

  it('1. should create a new manual memory and prevent exact duplicate redundancy', async () => {
    // Create new memory
    const result1 = await MemoryService.createMemory(testUserId, testSessionId, {
      category: MemoryCategory.KEY_FACT,
      title: 'Redis Eviction Policy Choice',
      content: 'Decided to use allkeys-lru for consistent caching.',
      importance: MemoryImportance.HIGH,
      isPinned: true,
      metadata: { source: 'decision' },
    });

    assert.strictEqual(result1.isDuplicateUpdated, false);
    assert.strictEqual(result1.memory.title, 'Redis Eviction Policy Choice');
    assert.strictEqual(result1.memory.isPinned, true);
    testMemoryId = result1.memory.id;

    // Attempt to create duplicate memory with same category & title
    const result2 = await MemoryService.createMemory(testUserId, testSessionId, {
      category: MemoryCategory.KEY_FACT,
      title: 'Redis Eviction Policy Choice',
      content: 'Updated content: confirmed allkeys-lru in staging.',
      importance: MemoryImportance.CRITICAL,
    });

    assert.strictEqual(result2.isDuplicateUpdated, true);
    assert.strictEqual(result2.memory.id, testMemoryId);
    assert.ok(result2.memory.content.includes('confirmed allkeys-lru'));
  });

  it('2. should list session memories with metrics and filtering', async () => {
    const listRes = await MemoryService.listMemories(testUserId, testSessionId, {
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    assert.strictEqual(listRes.metrics.totalCount >= 1, true);
    assert.strictEqual(listRes.metrics.pinnedCount >= 1, true);
    assert.strictEqual(listRes.memories.some((m) => m.id === testMemoryId), true);
  });

  it('3. should update memory attributes and toggle pin status', async () => {
    // Update content
    const updated = await MemoryService.updateMemory(testUserId, testSessionId, testMemoryId, {
      title: 'Redis Eviction Policy [FINAL]',
      importance: MemoryImportance.CRITICAL,
    });
    assert.strictEqual(updated.title, 'Redis Eviction Policy [FINAL]');
    assert.strictEqual(updated.importance, MemoryImportance.CRITICAL);

    // Toggle pin to false
    const unpinned = await MemoryService.togglePin(testUserId, testSessionId, testMemoryId, false);
    assert.strictEqual(unpinned.isPinned, false);

    // Re-pin
    const repinned = await MemoryService.togglePin(testUserId, testSessionId, testMemoryId, true);
    assert.strictEqual(repinned.isPinned, true);
  });

  it('4. should extract and generate grounded memories from session turns & snapshots', async () => {
    const genResult = await MemoryService.generateMemories(testUserId, testSessionId, false);

    assert.strictEqual(genResult.success, true);
    assert.ok(genResult.totalMemories >= 2);
    assert.ok(genResult.contextSummary);

    // Verify memories in database
    const allMems = await MemoryService.listMemories(testUserId, testSessionId, {});
    const obs = allMems.memories.filter((m) => m.category === MemoryCategory.OBSERVATION);
    assert.ok(obs.length >= 1);
    assert.ok(allMems.metrics.currentTask);
  });

  it('5. should construct a compact context envelope for session continuity', async () => {
    const envelope = await MemoryService.getContextEnvelope(testUserId, testSessionId);

    assert.strictEqual(envelope.sessionId, testSessionId);
    assert.ok(envelope.contextSummary);
    assert.ok(envelope.formattedPromptText.includes('RESTORED SESSION MEMORY'));
    assert.ok(envelope.formattedPromptText.includes(envelope.sessionTitle));
    assert.ok(envelope.tokenEstimate > 0);
  });

  it('6. should continue a past session and clone pinned memories into new session', async () => {
    const continued = await SessionService.continueSession(testUserId, testSessionId, {
      title: 'Continuation: Redis Eviction Sprint',
      includeSummary: true,
      includeRecentTranscripts: true,
      includeMemories: true,
    });

    assert.strictEqual(continued.isContextRestored, true);
    assert.strictEqual(continued.continuedFromSessionId, testSessionId);
    assert.ok(continued.session.id);

    // Verify pinned memories were cloned to the new session
    const prisma = PrismaService.client;
    const newSessionMems = await prisma.sessionMemory.findMany({
      where: { sessionId: continued.session.id },
    });

    assert.ok(newSessionMems.length >= 1);
    assert.strictEqual(newSessionMems[0].isPinned, true);
    assert.strictEqual(
      (newSessionMems[0].metadata as any)?.restoredFromSessionId,
      testSessionId
    );

    // Clean up continued session
    await prisma.sessionMemory.deleteMany({ where: { sessionId: continued.session.id } });
    await prisma.creditReservation.deleteMany({ where: { sessionId: continued.session.id } });
    await prisma.aISession.delete({ where: { id: continued.session.id } });
  });

  it('7. should clear only unpinned memories when requested', async () => {
    // Add an unpinned temporary memory
    const tempMem = await MemoryService.createMemory(testUserId, testSessionId, {
      category: MemoryCategory.PROGRESS,
      title: 'Temporary Milestone',
      content: 'Checked cache size in development.',
      isPinned: false,
    });

    // Clear unpinned memories
    const clearRes = await MemoryService.clearMemories(testUserId, testSessionId, true);
    assert.ok(clearRes.clearedCount >= 1);

    // Verify pinned memory is STILL preserved
    const remaining = await MemoryService.listMemories(testUserId, testSessionId, {});
    const pinnedStillExists = remaining.memories.some((m) => m.id === testMemoryId);
    assert.strictEqual(pinnedStillExists, true);

    const tempStillExists = remaining.memories.some((m) => m.id === tempMem.memory.id);
    assert.strictEqual(tempStillExists, false);
  });

  it('8. should enforce authorization and reject unauthorized access', async () => {
    await assert.rejects(
      async () => {
        await MemoryService.listMemories(secondUserId, testSessionId, {});
      },
      { message: 'Unauthorized access to session memory' }
    );
  });
});
