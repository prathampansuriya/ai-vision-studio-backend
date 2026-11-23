import { Router } from 'express';
import { CreditFeatureType, PlanTier } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { validateBody, validateQuery, validateParams } from '../middleware/validate.js';
import { uuidParamSchema } from '../validators/common.validator.js';
import { SessionController } from '../controllers/session.controller.js';
import { ReportController } from '../controllers/report.controller.js';
import { MemoryController } from '../controllers/memory.controller.js';
import {
  createSessionSchema,
  listSessionsSchema,
  updateSessionSchema,
  continueSessionSchema,
  exportTranscriptQuerySchema,
  updateSessionControlsSchema,
} from '../validators/session.validator.js';
import { switchSessionModeSchema } from '../validators/preset.validator.js';
import { generateReportSchema, exportReportQuerySchema } from '../validators/report.validator.js';
import {
  createMemorySchema,
  updateMemorySchema,
  listMemoriesQuerySchema,
  generateMemoriesSchema,
} from '../validators/memory.validator.js';

const router = Router();

// All session routes require user authentication
router.use(authenticate);

// Initialize a new live multimodal session
router.post(
  '/',
  validateBody(createSessionSchema),
  requireEntitlement({ feature: CreditFeatureType.MULTIMODAL_STREAM, minCredits: 1, checkSessionConcurrency: true }),
  SessionController.create
);

// List user's sessions with pagination, filtering, search, and sorting
router.get('/', validateQuery(listSessionsSchema), SessionController.list);

// Retrieve session details, transcripts, snapshots, and tool executions
router.get('/:id', validateParams(uuidParamSchema), SessionController.getById);

// Update session metadata (title, archive, favorite)
router.patch('/:id', validateParams(uuidParamSchema), validateBody(updateSessionSchema), SessionController.update);

// Delete session and associated records
router.delete('/:id', validateParams(uuidParamSchema), SessionController.delete);

// Continue past session with restored context
router.post(
  '/:id/continue',
  validateParams(uuidParamSchema),
  validateBody(continueSessionSchema),
  requireEntitlement({ feature: CreditFeatureType.MULTIMODAL_STREAM, minCredits: 1, checkSessionConcurrency: true }),
  SessionController.continue
);

// Export session transcripts (TXT, Markdown, JSON)
router.get('/:id/export', validateParams(uuidParamSchema), validateQuery(exportTranscriptQuerySchema), SessionController.export);

// Issue a short-lived WebSocket access ticket for live streaming
router.post('/:id/token', validateParams(uuidParamSchema), SessionController.generateToken);

// Dynamically shift session mode and focus instructions during live run
router.patch('/:id/mode', validateParams(uuidParamSchema), validateBody(switchSessionModeSchema), SessionController.switchMode);

// Advanced session settings & runtime controls
router.patch('/:id/controls', validateParams(uuidParamSchema), validateBody(updateSessionControlsSchema), SessionController.updateControls);
router.post('/:id/reset-context', validateParams(uuidParamSchema), SessionController.resetContext);
router.post('/:id/interrupt', validateParams(uuidParamSchema), SessionController.interrupt);

// Gracefully end and settle a session
router.post('/:id/end', validateParams(uuidParamSchema), SessionController.end);

// ==============================================================================
// PROMPT 21: SESSION INTELLIGENCE REPORTS
// ==============================================================================
// Retrieve saved session intelligence report
router.get('/:id/report', validateParams(uuidParamSchema), ReportController.getReport);

// Generate or regenerate session intelligence report using Gemini 2.5 Flash
router.post(
  '/:id/report/generate',
  validateParams(uuidParamSchema),
  validateBody(generateReportSchema),
  requireEntitlement({ minCredits: 5, requiresPlanTier: PlanTier.PRO }),
  ReportController.generateReport
);

// Export session report (Markdown, PDF printable HTML, Plain Text, JSON)
router.get(
  '/:id/report/export',
  validateParams(uuidParamSchema),
  validateQuery(exportReportQuerySchema),
  ReportController.exportReport
);

// ==============================================================================
// PROMPT 22: VISUAL MEMORY & CONTEXT MANAGEMENT
// ==============================================================================
// List memories with metrics and filtering
router.get(
  '/:id/memories',
  validateParams(uuidParamSchema),
  validateQuery(listMemoriesQuerySchema),
  MemoryController.listMemories
);

// Create a new memory item manually or from tool
router.post(
  '/:id/memories',
  validateParams(uuidParamSchema),
  validateBody(createMemorySchema),
  MemoryController.createMemory
);

// Retrieve compact context envelope for session continuity
router.get(
  '/:id/memories/context',
  validateParams(uuidParamSchema),
  MemoryController.getContextEnvelope
);

// Trigger AI memory extraction and context compression (Gemini 2.5 Flash / grounded fallback)
router.post(
  '/:id/memories/generate',
  validateParams(uuidParamSchema),
  validateBody(generateMemoriesSchema),
  requireEntitlement({ minCredits: 1 }),
  MemoryController.generateMemories
);

// Clear memories (unpinned by default)
router.delete(
  '/:id/memories',
  validateParams(uuidParamSchema),
  MemoryController.clearMemories
);

// Update a memory item
router.patch(
  '/:id/memories/:memoryId',
  validateParams(uuidParamSchema),
  validateBody(updateMemorySchema),
  MemoryController.updateMemory
);

// Delete a single memory item
router.delete(
  '/:id/memories/:memoryId',
  validateParams(uuidParamSchema),
  MemoryController.deleteMemory
);

// Toggle pin on a memory item
router.post(
  '/:id/memories/:memoryId/pin',
  validateParams(uuidParamSchema),
  MemoryController.togglePin
);

export const sessionRoutes = router;
