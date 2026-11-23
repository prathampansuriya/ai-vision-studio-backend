import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validateBody, validateQuery, validateParams } from '../middleware/validate.js';
import { uuidParamSchema } from '../validators/common.validator.js';
import { InsightController } from '../controllers/insight.controller.js';
import {
  createInsightSchema,
  updateInsightSchema,
  listInsightsQuerySchema,
} from '../validators/insight.validator.js';

const router = Router();

// All insight routes require user authentication
router.use(authenticate);

// List and create insights
router.get('/', validateQuery(listInsightsQuerySchema), InsightController.listInsights);
router.post('/', validateBody(createInsightSchema), InsightController.createInsight);

// Insight stats & category metrics
router.get('/stats', InsightController.getStats);

// Single insight operations
router.get('/:id', validateParams(uuidParamSchema), InsightController.getInsight);
router.patch('/:id', validateParams(uuidParamSchema), validateBody(updateInsightSchema), InsightController.updateInsight);
router.delete('/:id', validateParams(uuidParamSchema), InsightController.deleteInsight);

export const insightRoutes = router;
