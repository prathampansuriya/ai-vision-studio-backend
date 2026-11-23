import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller.js';
import { authenticate, requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/v1/dashboard/summary
router.get('/summary', authenticate, requireAuth, DashboardController.getSummary);

export const dashboardRoutes = router;
