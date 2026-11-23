import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { PrismaService } from '../src/services/prisma.service.js';
import { CreditService } from '../src/services/credit.service.js';
import { generateAccessToken } from '../src/utils/token.js';
import { hashPassword } from '../src/utils/password.js';
import { env } from '../src/config/env.config.js';
import { SessionMode, SessionStatus, TranscriptSpeaker, ToolExecutionStatus } from '@prisma/client';

describe('Prompt 13: Live Multimodal Session & Gemini Live Engine Suite', () => {
  const app = createApp();

  const userEmail = `live_session_tester_${Date.now()}@example.com`;
  let userId: string;
  let userToken: string;
  let createdSessionId: string;

  before(async () => {
    await PrismaService.pingDatabase();

    // 1. Create a test user with verified email
    const passwordHash = await hashPassword('LiveVisionTest123!');
    const user = await PrismaService.client.user.create({
      data: {
        email: userEmail,
        name: 'Alex Live Architect',
        passwordHash,
        authProvider: 'LOCAL',
        accountStatus: 'ACTIVE',
        emailVerified: true,
        role: 'USER',
      },
    });
    userId = user.id;
    userToken = generateAccessToken({
      sub: userId,
      email: userEmail,
      role: 'USER',
    });

    // 2. Grant 100 test credits so user can start sessions
    await CreditService.grantCredits({
      userId,
      amount: 100,
      type: 'GRANT' as any,
      reason: 'Starter test credit grant for live session testing',
    });
  });

  after(async () => {
    // Clean up test records
    if (userId) {
      await PrismaService.client.aISession.deleteMany({ where: { userId } });
      await PrismaService.client.creditReservation.deleteMany({ where: { userId } });
      await PrismaService.client.creditUsage.deleteMany({ where: { userId } });
      await PrismaService.client.creditLedger.deleteMany({ where: { userId } });
      await PrismaService.client.user.delete({ where: { id: userId } });
    }
  });

  it('1. POST /api/v1/sessions — successfully creates live session with Gemini 3.8 Live model routing and escrow hold', async () => {
    const res = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        title: 'Architectural Design Review',
        mode: SessionMode.COMBINED_MULTIMODAL,
        systemPrompt: 'Perceive design mockups and provide feedback.',
        aiVoice: 'Puck',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.session);
    assert.ok(res.body.data.session.id);
    createdSessionId = res.body.data.session.id;

    // Strict model routing verification: Gemini 3.8 Live is sole realtime conversational model
    assert.equal(res.body.data.session.aiModel, 'gemini-3.8-live');
    assert.equal(res.body.data.session.transcriptionModel, 'gemini-3.5-transcribe-live');
    assert.equal(res.body.data.session.mode, SessionMode.COMBINED_MULTIMODAL);
    assert.equal(res.body.data.session.status, SessionStatus.CREATED);

    // Escrow reservation hold verification
    assert.ok(res.body.data.reservationId);
    assert.ok(res.body.data.token);
    assert.ok(res.body.data.websocketUrl.includes(createdSessionId));

    // Verify token is signed with internal secret
    const decoded = jwt.verify(res.body.data.token, env.INTERNAL_SERVICE_KEY) as any;
    assert.equal(decoded.sessionId, createdSessionId);
    assert.equal(decoded.userId, userId);
  });

  it('2. POST /api/v1/sessions/:id/token — generates short-lived WebSocket ticket for authenticated owner', async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${createdSessionId}/token`)
      .set('Authorization', `Bearer ${userToken}`)
      .send();

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.token);
    assert.ok(res.body.data.websocketUrl);
    assert.equal(res.body.data.expiresInSeconds, 900);
  });

  it('3. GET /api/v1/sessions/:id — retrieves session details and linked records', async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${createdSessionId}`)
      .set('Authorization', `Bearer ${userToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.id, createdSessionId);
    assert.equal(res.body.data.aiModel, 'gemini-3.8-live');
    assert.ok(Array.isArray(res.body.data.transcriptSegments));
    assert.ok(Array.isArray(res.body.data.toolExecutions));
  });

  it('4. POST /api/v1/internal/sessions/usage — enforces internal key security', async () => {
    // Missing key -> 401
    const resNoKey = await request(app)
      .post('/api/v1/internal/sessions/usage')
      .send({
        sessionId: createdSessionId,
        userId,
        durationSeconds: 120,
      });
    assert.equal(resNoKey.status, 401);

    // Invalid key -> 401
    const resBadKey = await request(app)
      .post('/api/v1/internal/sessions/usage')
      .set('x-internal-key', 'completely_fake_invalid_key')
      .send({
        sessionId: createdSessionId,
        userId,
        durationSeconds: 120,
      });
    assert.equal(resBadKey.status, 401);
  });

  it('5. POST /api/v1/internal/sessions/usage — settles credit reservation and saves transcript segments and tool executions', async () => {
    const res = await request(app)
      .post('/api/v1/internal/sessions/usage')
      .set('x-internal-key', env.INTERNAL_SERVICE_KEY)
      .send({
        sessionId: createdSessionId,
        userId,
        durationSeconds: 125, // ~3 minutes = 3 credits
        audioInputSeconds: 30,
        audioOutputSeconds: 45,
        videoFramesCount: 20,
        toolCallsCount: 2, // 2 tool executions = 2 credits
        transcriptSegments: [
          {
            speaker: TranscriptSpeaker.USER,
            text: 'નમસ્તે Vision, can you review this architectural schema?',
            is_final: true,
            sequence_number: 1,
            language: 'gu',
            start_time_ms: 1000,
            end_time_ms: 3500,
          },
          {
            speaker: TranscriptSpeaker.AI,
            text: 'I can see the modular PostgreSQL schema. Let me take a snapshot.',
            is_final: true,
            sequence_number: 2,
            language: 'en',
            start_time_ms: 4000,
            end_time_ms: 7200,
          },
        ],
        toolExecutions: [
          {
            tool_name: 'take_snapshot',
            call_id: 'call_snap_test_1',
            arguments: { description: 'PostgreSQL schema diagram' },
            result: { success: true },
            status: 'SUCCESS',
            execution_duration_ms: 45,
          },
        ],
        isFinal: false,
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.sessionId, createdSessionId);
    assert.equal(res.body.status, SessionStatus.ACTIVE);
    assert.ok(res.body.credits_deducted > 0);
    assert.ok(res.body.remaining_balance >= 0);

    // Verify transcript segments were saved in PostgreSQL
    const savedSegments = await PrismaService.client.sessionTranscriptSegment.findMany({
      where: { sessionId: createdSessionId },
    });
    assert.equal(savedSegments.length, 2);
    assert.equal(savedSegments[0].speakerType, TranscriptSpeaker.USER);
    assert.equal(savedSegments[0].language, 'gu');
    assert.equal(savedSegments[1].speakerType, TranscriptSpeaker.AI);
    assert.equal(savedSegments[1].language, 'en');

    // Verify tool execution was saved
    const savedTools = await PrismaService.client.aIToolExecution.findMany({
      where: { sessionId: createdSessionId },
    });
    assert.equal(savedTools.length, 1);
    assert.equal(savedTools[0].toolName, 'take_snapshot');
    assert.equal(savedTools[0].status, ToolExecutionStatus.SUCCESS);
  });

  it('6. POST /api/v1/sessions/:id/end — ends session, releases pending reservations, and updates status', async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${createdSessionId}/end`)
      .set('Authorization', `Bearer ${userToken}`)
      .send();

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, SessionStatus.ENDED);
    assert.ok(res.body.data.endedAt);
  });
});
