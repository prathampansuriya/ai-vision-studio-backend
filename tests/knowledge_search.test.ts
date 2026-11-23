import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { PrismaService } from '../src/services/prisma.service.js';
import { InsightService } from '../src/services/insight.service.js';
import { SearchService } from '../src/services/search.service.js';
import { SessionMode, SessionStatus } from '@prisma/client';

describe('Prompt 23 — Knowledge Library & Global Search Suite', () => {
  let user1Id: string;
  let user2Id: string;
  let user1SessionId: string;
  let user2SessionId: string;
  let user1InsightId: string;

  before(async () => {
    const prisma = PrismaService.client;

    // 1. Create User 1
    const user1 = await prisma.user.create({
      data: {
        email: `knowledge_tester_1_${Date.now()}@example.com`,
        name: 'Knowledge Tester One',
      },
    });
    user1Id = user1.id;

    // 2. Create User 2
    const user2 = await prisma.user.create({
      data: {
        email: `knowledge_tester_2_${Date.now()}@example.com`,
        name: 'Knowledge Tester Two',
      },
    });
    user2Id = user2.id;

    // 3. Create Session for User 1
    const s1 = await prisma.aISession.create({
      data: {
        userId: user1Id,
        title: 'Quantum Computing Fundamentals Session',
        mode: SessionMode.LEARNING,
        status: SessionStatus.ENDED,
        durationSeconds: 600,
        creditsConsumed: 10,
        transcriptSegments: {
          createMany: {
            data: [
              {
                speakerType: 'AI',
                speakerName: 'Gemini',
                text: 'Quantum superposition allows qubits to exist in multiple states simultaneously.',
                sequenceNumber: 1,
              },
            ],
          },
        },
        snapshots: {
          create: {
            userId: user1Id,
            cloudinaryUrl: 'https://res.cloudinary.com/test/image/upload/v1/quantum.jpg',
            cloudinaryPublicId: 'quantum_snap_1',
            userNotes: 'Bloch sphere diagram notes',
            aiAnalysis: 'Quantum state visual depiction on the Bloch sphere surface.',
          },
        },
        report: {
          create: {
            userId: user1Id,
            title: 'Quantum Computing Session Report',
            overview: 'In-depth review of quantum gates, superposition, and entanglement.',
            keyTopics: ['Quantum Gates', 'Superposition', 'Entanglement'],
            importantQuestions: [],
            keyObservations: ['User was engaged on coherence times'],
            decisions: [],
            actionItems: [],
            taskChecklist: [],
            followUpQuestions: [],
            relevantSnapshots: [],
          },
        },
        memories: {
          create: {
            category: 'OBSERVATION',
            title: 'Quantum Decoherence Observation',
            content: 'User expressed deep interest in superconducting qubit coherence times.',
          },
        },
      },
    });
    user1SessionId = s1.id;

    // 4. Create Session for User 2 (Should never leak to User 1)
    const s2 = await prisma.aISession.create({
      data: {
        userId: user2Id,
        title: 'Quantum Cryptography Top Secret',
        mode: SessionMode.DEVELOPER,
        status: SessionStatus.ENDED,
        durationSeconds: 300,
        creditsConsumed: 5,
        transcriptSegments: {
          createMany: {
            data: [
              {
                speakerType: 'USER',
                speakerName: 'Secret Agent',
                text: 'Quantum key distribution QKD protocols are classified.',
                sequenceNumber: 1,
              },
            ],
          },
        },
      },
    });
    user2SessionId = s2.id;
  });

  after(async () => {
    const prisma = PrismaService.client;
    // Cleanup users (cascades sessions, insights, searches)
    await prisma.user.deleteMany({
      where: { id: { in: [user1Id, user2Id] } },
    });
  });

  // =========================================================================
  // 1. SAVED INSIGHT CRUD & ACCESS CONTROL
  // =========================================================================
  it('should successfully create a saved insight associated with user1 session', async () => {
    const insight = await InsightService.createInsight(user1Id, {
      title: 'Qubit Coherence Key Takeaway',
      content: 'T1 and T2 coherence times determine how long a qubit retains quantum information.',
      category: 'AI_ANSWER',
      source: 'live_session',
      sessionId: user1SessionId,
      tags: ['quantum', 'qubits', 'hardware'],
      metadata: { importance: 'high' },
    });

    assert.ok(insight.id, 'Insight ID must be defined');
    assert.strictEqual(insight.userId, user1Id);
    assert.strictEqual(insight.sessionId, user1SessionId);
    assert.strictEqual(insight.category, 'AI_ANSWER');
    assert.strictEqual(insight.session?.title, 'Quantum Computing Fundamentals Session');
    user1InsightId = insight.id;
  });

  it('should prevent user1 from linking an insight to user2 session', async () => {
    await assert.rejects(
      async () => {
        await InsightService.createInsight(user1Id, {
          title: 'Illicit Insight Link',
          content: 'Attempting to attach to user2 session',
          sessionId: user2SessionId,
          category: 'GENERAL',
        });
      },
      (err: any) => {
        assert.strictEqual(err.statusCode, 404);
        return true;
      }
    );
  });

  it('should list insights with category filter, search, and pagination', async () => {
    // Add another insight
    await InsightService.createInsight(user1Id, {
      title: 'Quantum Superposition Summary',
      content: 'Hadamard gates put basis states |0> and |1> into equal superposition.',
      category: 'OBSERVATION',
      source: 'manual',
      sessionId: user1SessionId,
      tags: ['gates'],
    });

    const result = await InsightService.listInsights(user1Id, {
      page: 1,
      limit: 10,
      search: 'Superposition',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    assert.strictEqual(result.insights.length, 1);
    assert.strictEqual(result.insights[0].title, 'Quantum Superposition Summary');
    assert.strictEqual(result.pagination.total, 1);
  });

  it('should retrieve insight stats categorized accurately', async () => {
    const stats = await InsightService.getInsightStats(user1Id);
    assert.strictEqual(stats.total, 2);
    assert.strictEqual(stats.byCategory['AI_ANSWER'], 1);
    assert.strictEqual(stats.byCategory['OBSERVATION'], 1);
  });

  it('should prevent user2 from reading, updating, or deleting user1 insight', async () => {
    // Read attempt by user2
    await assert.rejects(
      async () => {
        await InsightService.getInsight(user2Id, user1InsightId);
      },
      (err: any) => {
        assert.strictEqual(err.statusCode, 404);
        return true;
      }
    );

    // Update attempt by user2
    await assert.rejects(
      async () => {
        await InsightService.updateInsight(user2Id, user1InsightId, {
          title: 'Hacked Title',
        });
      },
      (err: any) => {
        assert.strictEqual(err.statusCode, 404);
        return true;
      }
    );

    // Delete attempt by user2
    await assert.rejects(
      async () => {
        await InsightService.deleteInsight(user2Id, user1InsightId);
      },
      (err: any) => {
        assert.strictEqual(err.statusCode, 404);
        return true;
      }
    );
  });

  it('should allow user1 to update their insight', async () => {
    const updated = await InsightService.updateInsight(user1Id, user1InsightId, {
      title: 'Updated Qubit Coherence Formula',
      tags: ['quantum', 'revised'],
    });

    assert.strictEqual(updated.title, 'Updated Qubit Coherence Formula');
  });

  // =========================================================================
  // 2. AUTHENTICATED GLOBAL SEARCH & STRICT USER ISOLATION
  // =========================================================================
  it('should find user1 entities across Sessions, Transcripts, Insights, Reports, Snapshots, Memories', async () => {
    const searchRes = await SearchService.search(user1Id, {
      q: 'Quantum',
      category: 'ALL',
      limit: 20,
      offset: 0,
    });

    assert.ok(searchRes.total >= 5, `Expected at least 5 matches, got ${searchRes.total}`);

    const entityTypes = searchRes.results.map((r) => r.entityType);
    assert.ok(entityTypes.includes('SESSION'), 'Must include SESSION');
    assert.ok(entityTypes.includes('TRANSCRIPT'), 'Must include TRANSCRIPT');
    assert.ok(entityTypes.includes('INSIGHT'), 'Must include INSIGHT');
    assert.ok(entityTypes.includes('REPORT'), 'Must include REPORT');
    assert.ok(entityTypes.includes('SNAPSHOT'), 'Must include SNAPSHOT');
    assert.ok(entityTypes.includes('MEMORY'), 'Must include MEMORY');

    // Verify all results belong strictly to user1 (targetUrls must reference user1's entities)
    for (const item of searchRes.results) {
      if (item.sessionId) {
        assert.strictEqual(item.sessionId, user1SessionId);
      }
    }
  });

  it('should STRICTLY NEVER return User 2 secret content when User 1 searches', async () => {
    const searchRes = await SearchService.search(user1Id, {
      q: 'Cryptography', // User 2 has "Quantum Cryptography Top Secret"
      category: 'ALL',
      limit: 10,
      offset: 0,
    });

    assert.strictEqual(searchRes.total, 0, 'User 1 must not see User 2 confidential content');
    assert.strictEqual(searchRes.results.length, 0);

    const qkdSearch = await SearchService.search(user1Id, {
      q: 'protocols are classified',
      category: 'ALL',
      limit: 10,
      offset: 0,
    });

    assert.strictEqual(qkdSearch.total, 0);
  });

  it('should filter global search by specific category', async () => {
    const insightOnlyRes = await SearchService.search(user1Id, {
      q: 'Quantum',
      category: 'INSIGHT',
      limit: 10,
      offset: 0,
    });

    assert.ok(insightOnlyRes.results.length > 0);
    for (const r of insightOnlyRes.results) {
      assert.strictEqual(r.entityType, 'INSIGHT');
    }
  });

  it('should log to RecentSearch and allow fetching and clearing recent searches', async () => {
    const recent = await SearchService.getRecentSearches(user1Id);
    assert.ok(recent.length > 0, 'Recent searches should contain logged searches');
    assert.ok(recent.some((r) => r.query === 'Quantum'));

    // Clear one by ID
    const firstId = recent[0].id;
    await SearchService.clearRecentSearches(user1Id, firstId);

    const afterSingleClear = await SearchService.getRecentSearches(user1Id);
    assert.ok(!afterSingleClear.some((r) => r.id === firstId));

    // Clear all
    await SearchService.clearRecentSearches(user1Id);
    const afterAllClear = await SearchService.getRecentSearches(user1Id);
    assert.strictEqual(afterAllClear.length, 0);
  });

  it('should provide fast auto-suggestions for matching prefix', async () => {
    const suggestions = await SearchService.getSuggestions(user1Id, 'Quan', 5);
    assert.ok(suggestions.length > 0);
    assert.ok(suggestions.some((s) => s.includes('Quantum')));
  });

  it('should delete insight cleanly', async () => {
    const delRes = await InsightService.deleteInsight(user1Id, user1InsightId);
    assert.strictEqual(delRes.success, true);

    await assert.rejects(
      async () => {
        await InsightService.getInsight(user1Id, user1InsightId);
      },
      (err: any) => {
        assert.strictEqual(err.statusCode, 404);
        return true;
      }
    );
  });
});
