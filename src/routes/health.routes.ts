import { Router } from 'express';
import { HealthController } from '../controllers/health.controller.js';

const router = Router();

// Detailed system health
router.get('/', HealthController.getHealth);

// Readiness probe for Kubernetes / cloud orchestrator / load balancers
router.get('/ready', HealthController.getReadiness);

// Liveness probe
router.get('/live', HealthController.getLiveness);

// Ping-pong probe
router.get('/ping', HealthController.getPing);

export const healthRoutes = router;
