import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { PrismaService } from '../src/services/prisma.service.js';
import { SessionService } from '../src/services/session.service.js';
import { UserService } from '../src/services/user.service.js';
import { SessionMode, SessionStatus } from '@prisma/client';

describe('Prompt 24 — Session Control Center & Preferences Suite', () => {
  let user1Id: string;
  let user2Id: string;
  let user1SessionId: string;
  let user2SessionId: string;

  before(async () => {
    const prisma = PrismaService.client;

    // 1. Create User 1
    const user1 = await prisma.user.create({
      data: {
        email: `controls_tester_1_${Date.now()}@example.com`,
        name: 'Controls Tester One',
      },
    });
    user1Id = user1.id;

    // 2. Create User 2
    const user2 = await prisma.user.create({
      data: {
        email: `controls_tester_2_${Date.now()}@example.com`,
        name: 'Controls Tester Two',
      },
    });
    user2Id = user2.id;

    // 3. Create Active Session for User 1
    const session1 = await prisma.aISession.create({
      data: {
        userId: user1Id,
        title: 'Developer Deep Dive Session',
        mode: SessionMode.DEVELOPER,
        status: SessionStatus.ACTIVE,
        durationSeconds: 120,
        creditsConsumed: 2,
        contextMetadata: {
          focus: 'CODE',
          responseStyle: 'CONCISE',
          personaTone: 'PROFESSIONAL',
        },
        transcriptSegments: {
          createMany: {
            data: [
              {
                speakerType: 'USER',
                speakerName: 'User',
                text: 'Can you inspect my React hook state flow?',
                sequenceNumber: 1,
              },
              {
                speakerType: 'AI',
                speakerName: 'Gemini',
                text: 'Inspecting your useEffect cleanup function. It appears a memory leak occurs during unmount.',
                sequenceNumber: 2,
              },
            ],
          },
        },
      },
    });
    user1SessionId = session1.id;

    // 4. Create Active Session for User 2
    const session2 = await prisma.aISession.create({
      data: {
        userId: user2Id,
        title: 'User Two Protected Session',
        mode: SessionMode.VISION,
        status: SessionStatus.ACTIVE,
        durationSeconds: 60,
      },
    });
    user2SessionId = session2.id;
  });

  after(async () => {
    const prisma = PrismaService.client;
    // Clean up test entities
    await prisma.aISession.deleteMany({
      where: { id: { in: [user1SessionId, user2SessionId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [user1Id, user2Id] } },
    });
  });

  // =========================================================================
  // 1. Session Controls Updates (PATCH /api/v1/sessions/:id/controls)
  // =========================================================================

  it('1. Updates session controls with valid focus, persona tone, and response style', async () => {
    const updateInput = {
      mode: 'DEVELOPER' as any,
      focusInstruction: 'CODE' as any,
      customFocus: 'Check useEffect cleanup and event listeners',
      responseStyle: 'DETAILED' as any,
      personaTone: 'TUTOR' as any,
      language: 'en',
      isVisualPaused: true,
    };

    const result = await SessionService.updateControls(user1Id, user1SessionId, updateInput);
    assert.ok(result);
    assert.ok(result.session);
    assert.strictEqual(result.session.id, user1SessionId);
    assert.strictEqual(result.controls.focusInstruction, 'CODE');
    assert.strictEqual(result.controls.customFocus, 'Check useEffect cleanup and event listeners');
    assert.strictEqual(result.controls.responseStyle, 'DETAILED');
    assert.strictEqual(result.controls.personaTone, 'TUTOR');
    assert.strictEqual(result.controls.language, 'en');
    assert.strictEqual(result.controls.isVisualPaused, true);

    // Verify DB persistence
    const prisma = PrismaService.client;
    const session = await prisma.aISession.findUnique({ where: { id: user1SessionId } });
    assert.ok(session);
    const config = (session.userConfig as any) || {};
    assert.strictEqual(config.focusInstruction, 'CODE');
    assert.strictEqual(config.personaTone, 'TUTOR');
    assert.strictEqual(config.responseStyle, 'DETAILED');
    assert.strictEqual(config.isVisualPaused, true);
  });

  it('2. Prevents unauthorized users from modifying another user session controls', async () => {
    await assert.rejects(
      async () => {
        await SessionService.updateControls(user2Id, user1SessionId, {
          focusInstruction: 'UI' as any,
        });
      },
      /Unauthorized access to session/
    );
  });

  // =========================================================================
  // 2. Context Reset (POST /api/v1/sessions/:id/reset-context)
  // =========================================================================

  it('3. Resets conversational context while keeping the session active', async () => {
    const result = await SessionService.resetContext(user1Id, user1SessionId);
    assert.ok(result);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.sessionId, user1SessionId);
    assert.ok(result.contextMetadata);
    assert.strictEqual(result.contextMetadata.contextSummary, '');

    // Verify DB state
    const prisma = PrismaService.client;
    const session = await prisma.aISession.findUnique({
      where: { id: user1SessionId },
    });
    assert.ok(session);
    assert.strictEqual(session.status, SessionStatus.ACTIVE); // Session remains active
    const meta = (session.contextMetadata as any) || {};
    assert.strictEqual(meta.contextSummary, '');
    assert.ok(meta.lastResetAt);
  });

  it('4. Rejects context reset from unauthorized user', async () => {
    await assert.rejects(
      async () => {
        await SessionService.resetContext(user2Id, user1SessionId);
      },
      /Unauthorized access to session/
    );
  });

  // =========================================================================
  // 3. AI Interruption (POST /api/v1/sessions/:id/interrupt)
  // =========================================================================

  it('5. Successfully handles AI interruption signal', async () => {
    const result = await SessionService.interrupt(user1Id, user1SessionId);
    assert.ok(result);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.sessionId, user1SessionId);
    assert.ok(result.interruptedAt);
  });

  it('6. Rejects AI interruption from unauthorized user', async () => {
    await assert.rejects(
      async () => {
        await SessionService.interrupt(user2Id, user1SessionId);
      },
      /Unauthorized access to session/
    );
  });

  // =========================================================================
  // 4. User Session Preferences Persistence (UserProfile)
  // =========================================================================

  it('7. Saves user-wide default session preferences in UserProfile', async () => {
    const preferences = {
      aiVoice: 'Aoede',
      responseStyle: 'BALANCED',
      personaTone: 'FRIENDLY',
      volume: 85,
      autoPlayAudio: true,
      interruptSensitivity: 'HIGH',
      playbackSpeed: 1.25,
      focusInstruction: 'UI',
    };

    const updated = await UserService.updateProfile(user1Id, preferences);
    assert.ok(updated);
    assert.strictEqual(updated.profile.aiVoice, 'Aoede');
    assert.strictEqual(updated.profile.responseStyle, 'BALANCED');
    assert.strictEqual(updated.profile.personaTone, 'FRIENDLY');
    assert.strictEqual(updated.profile.volume, 85);
    assert.strictEqual(updated.profile.autoPlayAudio, true);
    assert.strictEqual(updated.profile.interruptSensitivity, 'HIGH');
    assert.strictEqual(updated.profile.playbackSpeed, 1.25);
    assert.strictEqual(updated.profile.focusInstruction, 'UI');
  });

  it('8. Retrieves persisted user session preferences in profile query', async () => {
    const profile = await UserService.getProfile(user1Id);
    assert.ok(profile);
    assert.strictEqual(profile.profile.aiVoice, 'Aoede');
    assert.strictEqual(profile.profile.responseStyle, 'BALANCED');
    assert.strictEqual(profile.profile.personaTone, 'FRIENDLY');
    assert.strictEqual(profile.profile.volume, 85);
    assert.strictEqual(profile.profile.autoPlayAudio, true);
    assert.strictEqual(profile.profile.interruptSensitivity, 'HIGH');
    assert.strictEqual(profile.profile.playbackSpeed, 1.25);
    assert.strictEqual(profile.profile.focusInstruction, 'UI');
  });

  it('9. Returns standard fallback defaults for users without customized preferences', async () => {
    const profile = await UserService.getProfile(user2Id);
    assert.ok(profile);
    assert.strictEqual(profile.profile.aiVoice, 'Puck');
    assert.strictEqual(profile.profile.responseStyle, 'CONCISE');
    assert.strictEqual(profile.profile.personaTone, 'PROFESSIONAL');
    assert.strictEqual(profile.profile.volume, 100);
    assert.strictEqual(profile.profile.autoPlayAudio, true);
    assert.strictEqual(profile.profile.interruptSensitivity, 'BALANCED');
    assert.strictEqual(profile.profile.playbackSpeed, 1.0);
    assert.strictEqual(profile.profile.focusInstruction, 'TASK');
  });
});
