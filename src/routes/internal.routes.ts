import { Router } from 'express';
import { validateBody } from '../middleware/validate.js';
import { InternalController } from '../controllers/internal.controller.js';
import { internalUsageSchema } from '../validators/session.validator.js';

const router = Router();

// Internal service-to-service RPC route: settle session credit usage and telemetry
router.post(
  '/sessions/usage',
  validateBody(internalUsageSchema),
  InternalController.settleSessionUsage
);

// Internal service-to-service RPC route: capture and persist live visual frame from AI service
router.post(
  '/snapshots',
  InternalController.createSnapshot
);

// Internal service-to-service RPC route: record real-time AI tool execution
router.post(
  '/sessions/tool-execution',
  InternalController.recordToolExecution
);

export const internalRoutes = router;

