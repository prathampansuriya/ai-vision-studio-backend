import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SessionMode } from '@prisma/client';
import { PrismaService } from '../src/services/prisma.service.js';
import { PresetService } from '../src/services/preset.service.js';
import { createPresetSchema, switchSessionModeSchema } from '../src/validators/preset.validator.js';

describe('Prompt 18 — AI Modes, Focus Instructions & Presets Suite', () => {
  const testUserId = `test-user-${Date.now()}`;
  let createdPresetId = '';

  before(async () => {
    // Ensure database client is active and seed system presets
    await PresetService.ensureSystemPresets();
  });

  after(async () => {
    // Clean up created user preset if any
    if (createdPresetId) {
      try {
        await PrismaService.client.sessionPreset.delete({
          where: { id: createdPresetId },
        });
      } catch {
        // ignore
      }
    }
    await PrismaService.disconnect();
  });

  test('PresetService.listPresets: includes presets for all 8 operational AI modes', async () => {
    const presets = await PresetService.listPresets();
    assert.ok(presets.length >= 8, 'Must return at least the 8 system presets');

    const modes = new Set(presets.map((p) => p.mode));
    const requiredModes: SessionMode[] = [
      SessionMode.VISION,
      SessionMode.DEVELOPER,
      SessionMode.LEARNING,
      SessionMode.PRODUCTIVITY,
      SessionMode.PRESENTATION,
      SessionMode.LANGUAGE,
      SessionMode.MEETING,
      SessionMode.CUSTOM,
    ];

    for (const reqMode of requiredModes) {
      assert.ok(modes.has(reqMode), `Preset list must contain system preset for ${reqMode}`);
    }
  });

  test('PresetService.getPresetById: retrieves preset by slug or ID', async () => {
    const devPreset = await PresetService.getPresetById('senior-developer-architect');
    assert.ok(devPreset, 'Must find developer preset by slug');
    assert.equal(devPreset.mode, SessionMode.DEVELOPER);
    assert.equal(devPreset.focusInstruction, 'CODE');
    assert.equal(devPreset.isSystem, true);
  });

  test('createPresetSchema: validates focus instructions and response styles', () => {
    // Valid input
    const valid = createPresetSchema.safeParse({
      name: 'Frontend Performance Auditor',
      description: 'Audit React re-renders and Web Vitals',
      mode: SessionMode.DEVELOPER,
      focusInstruction: 'UI',
      responseStyle: 'CONCISE',
      inputSource: 'screen',
    });
    assert.ok(valid.success, 'Valid preset configuration should pass schema validation');

    // Invalid focus instruction
    const invalidFocus = createPresetSchema.safeParse({
      name: 'Invalid Focus Preset',
      description: 'Testing validation failure',
      mode: SessionMode.DEVELOPER,
      focusInstruction: 'INVALID_FOCUS',
    });
    assert.equal(invalidFocus.success, false, 'Invalid focus instruction must be rejected');

    // Invalid response style
    const invalidStyle = createPresetSchema.safeParse({
      name: 'Invalid Style Preset',
      description: 'Testing validation failure',
      mode: SessionMode.DEVELOPER,
      responseStyle: 'HYPER_VERBOSE',
    });
    assert.equal(invalidStyle.success, false, 'Invalid response style must be rejected');
  });

  test('PresetService.createPreset: creates, stores, and associates user custom preset', async () => {
    // Create temporary user first so foreign key is valid
    const user = await PrismaService.client.user.create({
      data: {
        id: testUserId,
        email: `preset-tester-${Date.now()}@example.com`,
        name: 'Preset Tester',
      },
    });

    const customPreset = await PresetService.createPreset(user.id, {
      name: 'Custom WebGPU Profiler',
      description: 'Inspect WebGPU shader pipeline buffers and compute shaders',
      mode: SessionMode.CUSTOM,
      focusInstruction: 'CUSTOM',
      customFocus: 'Focus on WGSL shader code and buffer bindings',
      responseStyle: 'DETAILED',
      language: 'en',
      aiVoice: 'Puck',
      enabledTools: ['calculator', 'save_session_insight'],
      inputSource: 'screen',
      customPrompt: 'You are a specialized WebGPU and graphics pipeline expert.',
      isDefault: false,
    });

    assert.ok(customPreset.id, 'Must return created preset ID');
    assert.equal(customPreset.userId, user.id);
    assert.equal(customPreset.mode, SessionMode.CUSTOM);
    assert.equal(customPreset.customFocus, 'Focus on WGSL shader code and buffer bindings');
    assert.equal(customPreset.isSystem, false);

    createdPresetId = customPreset.id;

    // Verify it appears in user's list
    const userPresets = await PresetService.listPresets(user.id);
    const found = userPresets.find((p) => p.id === customPreset.id);
    assert.ok(found, 'Created preset must appear in user presets list');
  });

  test('PresetService.updatePreset: updates user preset but prevents modifying system presets', async () => {
    // 1. Update user preset
    const updated = await PresetService.updatePreset(createdPresetId, testUserId, {
      description: 'Updated WebGPU shader profiling directives',
      responseStyle: 'EXECUTIVE',
    });
    assert.equal(updated.description, 'Updated WebGPU shader profiling directives');
    assert.equal(updated.responseStyle, 'EXECUTIVE');

    // 2. Reject modifying system presets
    const systemPreset = await PresetService.getPresetById('vision-scene-explorer');
    await assert.rejects(
      async () => {
        await PresetService.updatePreset(systemPreset.id, testUserId, {
          name: 'Hacked Preset Name',
        });
      },
      /Cannot modify system presets/
    );
  });

  test('PresetService.deletePreset: deletes user preset but protects system presets', async () => {
    const systemPreset = await PresetService.getPresetById('vision-scene-explorer');
    await assert.rejects(
      async () => {
        await PresetService.deletePreset(systemPreset.id, testUserId);
      },
      /System presets cannot be deleted/
    );

    // Clean up test user & custom preset
    if (createdPresetId) {
      const delResult = await PresetService.deletePreset(createdPresetId, testUserId);
      assert.equal(delResult.success, true);
      createdPresetId = '';
    }

    try {
      await PrismaService.client.user.delete({ where: { id: testUserId } });
    } catch {
      // ignore
    }
  });

  test('switchSessionModeSchema: validates in-flight mode shift payloads', () => {
    const valid = switchSessionModeSchema.safeParse({
      mode: SessionMode.DEVELOPER,
      focusInstruction: 'CODE',
      responseStyle: 'CONCISE',
    });
    assert.ok(valid.success, 'Valid mode shift payload should pass');

    const invalid = switchSessionModeSchema.safeParse({
      mode: 'NON_EXISTENT_MODE',
    });
    assert.equal(invalid.success, false, 'Invalid mode should fail validation');
  });
});
