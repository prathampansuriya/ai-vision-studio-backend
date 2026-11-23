import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SessionMode } from '@prisma/client';
import { PrismaService } from '../src/services/prisma.service.js';
import { TemplateService, SYSTEM_TEMPLATES } from '../src/services/template.service.js';
import {
  createTemplateSchema,
  updateTemplateSchema,
  listTemplatesQuerySchema,
  SUPPORTED_TOOLS,
} from '../src/validators/template.validator.js';

describe('Prompt 25 — AI Session Templates & Saved Workflows Suite', () => {
  const testUserId = `test-user-${Date.now()}`;
  const otherUserId = `other-user-${Date.now()}`;
  let createdCustomTemplateId = '';
  let duplicatedTemplateId = '';

  before(async () => {
    // 1. Create real test users in database
    await PrismaService.client.user.create({
      data: {
        id: testUserId,
        email: `template_tester_1_${Date.now()}@example.com`,
        name: 'Template Tester One',
      },
    });
    await PrismaService.client.user.create({
      data: {
        id: otherUserId,
        email: `template_tester_2_${Date.now()}@example.com`,
        name: 'Template Tester Two',
      },
    });

    // 2. Ensure system templates are seeded idempotently
    await TemplateService.seedSystemTemplates();
  });

  after(async () => {
    // Clean up created user test templates and users
    try {
      await PrismaService.client.user.deleteMany({
        where: { id: { in: [testUserId, otherUserId] } },
      });
    } catch {
      // ignore cleanup error
    }
    await PrismaService.disconnect();
  });

  test('SYSTEM_TEMPLATES: contains exactly the 8 canonical built-in templates with valid implemented capabilities', () => {
    assert.equal(SYSTEM_TEMPLATES.length, 8, 'Must define exactly 8 canonical system templates');

    const expectedSlugs = [
      'vision-assistant',
      'developer-assistant',
      'learning-assistant',
      'screen-copilot',
      'presentation-assistant',
      'language-practice',
      'meeting-intelligence',
      'general-ai-assistant',
    ];

    const slugSet = new Set(SYSTEM_TEMPLATES.map((t) => t.slug));
    for (const slug of expectedSlugs) {
      assert.ok(slugSet.has(slug), `Missing canonical template with slug: ${slug}`);
    }

    // Guardrail check: all tools and models must only reference real, implemented capabilities
    for (const t of SYSTEM_TEMPLATES) {
      assert.equal(t.defaultAiModel, 'gemini-3.8-live', 'Realtime conversational model must be gemini-3.8-live');
      assert.ok(t.isSystem, 'Template must be marked as system');
      for (const tool of t.enabledTools) {
        assert.ok(
          SUPPORTED_TOOLS.includes(tool as any),
          `Tool '${tool}' in template '${t.slug}' must be in supported tools list`
        );
      }
    }
  });

  test('TemplateService.listTemplates: retrieves all 8 system templates from PostgreSQL', async () => {
    const result = await TemplateService.listTemplates(testUserId, { limit: 50 });
    assert.ok(result.templates.length >= 8, 'Must return at least the 8 seeded system templates');

    const systemTemplates = result.templates.filter((t) => t.isSystem);
    assert.ok(systemTemplates.length >= 8, 'Must have at least 8 system templates in database');
  });

  test('TemplateService.listTemplates: category filtering works accurately', async () => {
    const devTemplates = await TemplateService.listTemplates(testUserId, { category: 'DEVELOPER' });
    assert.ok(devTemplates.templates.length > 0, 'Must return templates in DEVELOPER category');
    for (const t of devTemplates.templates) {
      assert.equal(t.category, 'DEVELOPER');
    }

    const visionTemplates = await TemplateService.listTemplates(testUserId, { category: 'VISION' });
    assert.ok(visionTemplates.templates.length > 0, 'Must return templates in VISION category');
    for (const t of visionTemplates.templates) {
      assert.equal(t.category, 'VISION');
    }
  });

  test('TemplateService.listTemplates: search filtering matches title and descriptions', async () => {
    const searchRes = await TemplateService.listTemplates(testUserId, { search: 'debugging' });
    assert.ok(searchRes.templates.length > 0, 'Must find Developer Assistant from keyword "debugging"');
    assert.ok(
      searchRes.templates.some((t) => t.slug === 'developer-assistant'),
      'Developer Assistant should be present in search results'
    );
  });

  test('TemplateService.createTemplate: allows authenticated users to create custom templates', async () => {
    const custom = await TemplateService.createTemplate(testUserId, {
      name: 'Custom React Architecture Reviewer',
      description: 'Specialized workflow for evaluating front-end React components and state patterns.',
      category: 'DEVELOPER',
      defaultMode: SessionMode.DEVELOPER,
      systemPrompt: 'You are an expert React architect. Scrutinize React components, hook dependencies, and performance bottlenecks.',
      defaultAiModel: 'gemini-3.8-live',
      preferredLanguage: 'auto',
      responseStyle: 'DETAILED',
      personaTone: 'PROFESSIONAL',
      aiVoice: 'Charon',
      focusInstruction: 'CODE',
      customFocus: 'Focus on hook re-renders and props passing.',
      inputSource: 'screen',
      transcriptPreference: 'dual_isolated',
      enabledTools: ['create_note', 'save_session_insight', 'search_web'],
      isFavorite: false,
    });

    assert.ok(custom.id, 'Must generate template ID');
    assert.equal(custom.userId, testUserId);
    assert.equal(custom.isSystem, false);
    assert.equal(custom.defaultMode, SessionMode.DEVELOPER);
    assert.equal(custom.aiVoice, 'Charon');

    createdCustomTemplateId = custom.id;
  });

  test('TemplateService.updateTemplate: updates custom template fields', async () => {
    assert.ok(createdCustomTemplateId, 'Need existing custom template');

    const updated = await TemplateService.updateTemplate(testUserId, createdCustomTemplateId, {
      name: 'Updated React Reviewer',
      responseStyle: 'CONCISE',
      isFavorite: true,
    });

    assert.equal(updated.name, 'Updated React Reviewer');
    assert.equal(updated.responseStyle, 'CONCISE');
    assert.equal(updated.isFavorite, true);
  });

  test('TemplateService.updateTemplate: guards system templates from direct mutation', async () => {
    const systemTpl = await PrismaService.client.sessionTemplate.findFirst({
      where: { slug: 'vision-assistant' },
    });
    assert.ok(systemTpl, 'System template must exist');

    await assert.rejects(
      async () => {
        await TemplateService.updateTemplate(testUserId, systemTpl.id, {
          name: 'Hacked Vision Assistant',
        });
      },
      (err: any) => {
        return err.statusCode === 400 && err.message.includes('System built-in templates cannot be modified directly');
      }
    );
  });

  test('TemplateService.updateTemplate: prevents unauthorized user from editing another user template', async () => {
    assert.ok(createdCustomTemplateId, 'Need existing custom template');

    await assert.rejects(
      async () => {
        await TemplateService.updateTemplate(otherUserId, createdCustomTemplateId, {
          name: 'Unauthorized Rename',
        });
      },
      (err: any) => {
        return err.statusCode === 403;
      }
    );
  });

  test('TemplateService.duplicateTemplate: duplicates system template into an editable user copy', async () => {
    const systemTpl = await PrismaService.client.sessionTemplate.findFirst({
      where: { slug: 'meeting-intelligence' },
    });
    assert.ok(systemTpl, 'System template must exist');

    const clone = await TemplateService.duplicateTemplate(testUserId, systemTpl.id);
    assert.ok(clone.id);
    assert.equal(clone.userId, testUserId);
    assert.equal(clone.isSystem, false);
    assert.equal(clone.name, 'Meeting Intelligence (Copy)');
    assert.equal(clone.defaultMode, systemTpl.defaultMode);
    assert.equal(clone.aiVoice, systemTpl.aiVoice);

    duplicatedTemplateId = clone.id;
  });

  test('TemplateService.toggleFavorite: toggles favorite flag correctly', async () => {
    assert.ok(createdCustomTemplateId, 'Need existing custom template');

    const before = await TemplateService.getTemplateById(testUserId, createdCustomTemplateId);
    const toggled = await TemplateService.toggleFavorite(testUserId, createdCustomTemplateId);
    assert.equal(toggled.isFavorite, !before.isFavorite);
  });

  test('TemplateService.deleteTemplate: guards system templates from deletion', async () => {
    const systemTpl = await PrismaService.client.sessionTemplate.findFirst({
      where: { slug: 'learning-assistant' },
    });
    assert.ok(systemTpl, 'System template must exist');

    await assert.rejects(
      async () => {
        await TemplateService.deleteTemplate(testUserId, systemTpl.id);
      },
      (err: any) => {
        return err.statusCode === 400 && err.message.includes('System built-in templates cannot be deleted');
      }
    );
  });

  test('TemplateService.deleteTemplate: allows user to delete their custom template', async () => {
    assert.ok(duplicatedTemplateId, 'Need duplicated template to delete');

    const res = await TemplateService.deleteTemplate(testUserId, duplicatedTemplateId);
    assert.ok(res.success);

    // Verify it is no longer found
    await assert.rejects(
      async () => {
        await TemplateService.getTemplateById(testUserId, duplicatedTemplateId);
      },
      (err: any) => err.statusCode === 404
    );

    duplicatedTemplateId = '';
  });

  test('createTemplateSchema & updateTemplateSchema: validates inputs properly', () => {
    // Valid input
    const valid = createTemplateSchema.safeParse({
      name: 'Valid Template',
      description: 'A valid testing template description',
      category: 'GENERAL',
      defaultMode: 'VISION',
      systemPrompt: 'You are a test assistant.',
      responseStyle: 'BALANCED',
      personaTone: 'FRIENDLY',
      aiVoice: 'Puck',
      focusInstruction: 'TASK',
      inputSource: 'both',
      transcriptPreference: 'dual_isolated',
      enabledTools: ['calculator', 'search_web'],
      isFavorite: false,
    });
    assert.ok(valid.success, 'Valid schema parse should succeed');

    // Invalid short name
    const invalidName = createTemplateSchema.safeParse({
      name: 'A',
      description: 'Too short name',
      systemPrompt: 'Valid prompt here',
    });
    assert.ok(!invalidName.success, 'Name < 2 chars should fail');

    // Invalid unsupported response style
    const invalidStyle = createTemplateSchema.safeParse({
      name: 'Valid Name',
      description: 'Valid description',
      systemPrompt: 'Valid prompt here',
      responseStyle: 'INVALID_STYLE_XYZ',
    });
    assert.ok(!invalidStyle.success, 'Unsupported responseStyle must fail');
  });

  test('Session Initialization from Template: associates template configuration with session', async () => {
    const devTpl = await PrismaService.client.sessionTemplate.findFirst({
      where: { slug: 'developer-assistant' },
    });
    assert.ok(devTpl, 'Developer Assistant template must exist');

    // Create session referencing template
    const session = await PrismaService.client.aISession.create({
      data: {
        userId: testUserId,
        templateId: devTpl.id,
        title: 'Developer Live Session',
        mode: devTpl.defaultMode,
        inputSource: 'SCREEN',
        aiModel: 'gemini-3.8-live',
        transcriptionModel: 'gemini-3.5-transcribe-live',
        userConfig: {
          templateId: devTpl.id,
          templateName: devTpl.name,
          focusInstruction: devTpl.focusInstruction,
          responseStyle: devTpl.responseStyle,
          aiVoice: devTpl.aiVoice,
          enabledTools: devTpl.enabledTools as any,
          systemPrompt: devTpl.systemPrompt,
        },
      },
      include: {
        template: true,
      },
    });

    assert.ok(session.id);
    assert.equal(session.templateId, devTpl.id);
    assert.equal(session.template?.name, 'Developer Assistant');
    assert.equal(session.mode, SessionMode.DEVELOPER);
    assert.equal((session.userConfig as any).focusInstruction, 'CODE');
    assert.equal((session.userConfig as any).aiVoice, 'Charon');

    // Clean up session
    await PrismaService.client.aISession.delete({ where: { id: session.id } });
  });
});
