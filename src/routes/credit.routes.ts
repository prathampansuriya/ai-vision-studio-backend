import { Router } from 'express';
import { CreditController } from '../controllers/credit.controller.js';
import { authenticate, requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { env } from '../config/env.config.js';
import { AppError } from '../utils/appError.js';
import {
  adjustCreditsSchema,
  consumeCreditsSchema,
  grantCreditsSchema,
  ledgerQuerySchema,
  refundCreditsSchema,
  releaseReservationSchema,
  reserveCreditsSchema,
  settleReservationSchema,
  usageQuerySchema,
} from '../validators/credit.validator.js';

const router = Router();

/**
 * Middleware: permits either admin JWT or valid internal service key
 */
function requireAdminOrInternal(req: any, _res: any, next: any) {
  const internalKey = req.headers['x-internal-key'];
  if (internalKey && internalKey === env.INTERNAL_SERVICE_KEY) {
    return next();
  }
  if (req.user && req.user.role === 'ADMIN') {
    return next();
  }
  return next(AppError.forbidden('Admin authorization or internal service key required'));
}

/**
 * @route   GET /api/v1/credits/balance
 * @desc    Get current user's authoritative balance and active reservations
 * @access  Private
 */
router.get('/balance', authenticate, requireAuth, CreditController.getBalance);

/**
 * @route   GET /api/v1/credits/plan-allowance
 * @desc    Get plan allowance, consumption, and entitlement limits for billing period
 * @access  Private
 */
router.get('/plan-allowance', authenticate, requireAuth, CreditController.getPlanAllowance);

/**
 * @route   GET /api/v1/credits/policy
 * @desc    Transparent credit policy and pricing schedules
 * @access  Public
 */
router.get('/policy', CreditController.getPolicy);

/**
 * @route   GET /api/v1/credits/ledger
 * @desc    Paginated auditable credit transactions
 * @access  Private
 */
router.get(
  '/ledger',
  authenticate,
  requireAuth,
  validateQuery(ledgerQuerySchema),
  CreditController.getLedger
);

/**
 * @route   GET /api/v1/credits/usage
 * @desc    Paginated feature-level activity consumption history
 * @access  Private
 */
router.get(
  '/usage',
  authenticate,
  requireAuth,
  validateQuery(usageQuerySchema),
  CreditController.getUsage
);

/**
 * @route   GET /api/v1/credits/analytics
 * @desc    Usage analytics breakdown by feature and model
 * @access  Private
 */
router.get('/analytics', authenticate, requireAuth, CreditController.getAnalytics);

/**
 * @route   GET /api/v1/credits/stream
 * @desc    Real-time Server-Sent Events (SSE) stream for live balance updates
 * @access  Private
 */
router.get('/stream', authenticate, requireAuth, CreditController.streamEvents);

/**
 * @route   POST /api/v1/credits/consume
 * @desc    Transactionally deduct credits for measured multimodal AI activity
 * @access  Private
 */
router.post(
  '/consume',
  authenticate,
  requireAuth,
  validateBody(consumeCreditsSchema),
  requireEntitlement(),
  CreditController.consume
);

/**
 * @route   POST /api/v1/credits/reserve
 * @desc    Create temporary credit reservation hold in escrow before session or job
 * @access  Private
 */
router.post(
  '/reserve',
  authenticate,
  requireAuth,
  validateBody(reserveCreditsSchema),
  requireEntitlement(),
  CreditController.reserve
);

/**
 * @route   POST /api/v1/credits/settle
 * @desc    Settle reservation hold with actual measured activity
 * @access  Private
 */
router.post(
  '/settle',
  authenticate,
  requireAuth,
  validateBody(settleReservationSchema),
  CreditController.settle
);

/**
 * @route   POST /api/v1/credits/release
 * @desc    Cancel/release reservation hold back to available balance
 * @access  Private
 */
router.post(
  '/release',
  authenticate,
  requireAuth,
  validateBody(releaseReservationSchema),
  CreditController.release
);

/**
 * @route   POST /api/v1/credits/grant
 * @desc    Administrative or internal webhook credit grant
 * @access  Admin or Internal Key
 */
router.post(
  '/grant',
  authenticate,
  requireAdminOrInternal,
  validateBody(grantCreditsSchema),
  CreditController.grant
);

/**
 * @route   POST /api/v1/credits/refund
 * @desc    Administrative or internal refund of consumed credits
 * @access  Admin or Internal Key
 */
router.post(
  '/refund',
  authenticate,
  requireAdminOrInternal,
  validateBody(refundCreditsSchema),
  CreditController.refund
);

/**
 * @route   POST /api/v1/credits/adjust
 * @desc    Administrative credit adjustment
 * @access  Admin or Internal Key
 */
router.post(
  '/adjust',
  authenticate,
  requireAdminOrInternal,
  validateBody(adjustCreditsSchema),
  CreditController.adjust
);

export const creditRoutes = router;
