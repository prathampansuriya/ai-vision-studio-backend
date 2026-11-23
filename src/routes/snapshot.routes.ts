import { Router } from 'express';
import { PlanTier } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { validateBody, validateQuery, validateParams } from '../middleware/validate.js';
import { uuidParamSchema } from '../validators/common.validator.js';
import { SnapshotController } from '../controllers/snapshot.controller.js';
import {
  captureSnapshotSchema,
  updateSnapshotSchema,
  analyzeSnapshotSchema,
  askSnapshotSchema,
  compareSnapshotsSchema,
  listSnapshotsQuerySchema,
} from '../validators/snapshot.validator.js';

const router = Router();

// All snapshot routes require authentication
router.use(authenticate);

// List & capture snapshots
router.get('/', validateQuery(listSnapshotsQuerySchema), SnapshotController.list);
router.post(
  '/',
  validateBody(captureSnapshotSchema),
  requireEntitlement({ minCredits: 1 }),
  SnapshotController.capture
);

// Comparisons (requires Pro plan and 2 credits)
router.get('/comparisons', SnapshotController.listComparisons);
router.post(
  '/compare',
  validateBody(compareSnapshotsSchema),
  requireEntitlement({ minCredits: 2, requiresPlanTier: PlanTier.PRO }),
  SnapshotController.compare
);

// Single snapshot operations
router.get('/:id', validateParams(uuidParamSchema), SnapshotController.getById);
router.patch('/:id', validateParams(uuidParamSchema), validateBody(updateSnapshotSchema), SnapshotController.update);
router.delete('/:id', validateParams(uuidParamSchema), SnapshotController.delete);

// Focused AI tasks (require available credit balance)
router.post(
  '/:id/analyze',
  validateParams(uuidParamSchema),
  validateBody(analyzeSnapshotSchema),
  requireEntitlement({ minCredits: 1 }),
  SnapshotController.analyze
);
router.post(
  '/:id/ask',
  validateParams(uuidParamSchema),
  validateBody(askSnapshotSchema),
  requireEntitlement({ minCredits: 1 }),
  SnapshotController.askQuestion
);

export const snapshotRoutes = router;
