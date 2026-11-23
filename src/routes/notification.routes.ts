import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller.js';
import { authenticate, requireAuth } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import {
  getNotificationsQuerySchema,
  notificationIdParamSchema,
  updateNotificationPreferencesSchema,
} from '../validators/notification.validator.js';

const router = Router();

/**
 * @route   GET /api/v1/notifications
 * @desc    Paginated notifications for authenticated user
 * @access  Private
 */
router.get(
  '/',
  authenticate,
  requireAuth,
  validateQuery(getNotificationsQuerySchema),
  NotificationController.getNotifications
);

/**
 * @route   GET /api/v1/notifications/unread-count
 * @desc    Get total count of unread notifications
 * @access  Private
 */
router.get(
  '/unread-count',
  authenticate,
  requireAuth,
  NotificationController.getUnreadCount
);

/**
 * @route   GET /api/v1/notifications/stream
 * @desc    Real-time Server-Sent Events (SSE) notification stream
 * @access  Private
 */
router.get(
  '/stream',
  authenticate,
  requireAuth,
  NotificationController.streamEvents
);

/**
 * @route   PATCH /api/v1/notifications/read-all
 * @desc    Mark all unread notifications as read
 * @access  Private
 */
router.patch(
  '/read-all',
  authenticate,
  requireAuth,
  NotificationController.markAllAsRead
);

/**
 * @route   PATCH /api/v1/notifications/:id/read
 * @desc    Mark a single notification as read
 * @access  Private
 */
router.patch(
  '/:id/read',
  authenticate,
  requireAuth,
  validateParams(notificationIdParamSchema),
  NotificationController.markAsRead
);

/**
 * @route   DELETE /api/v1/notifications/:id
 * @desc    Delete a notification
 * @access  Private
 */
router.delete(
  '/:id',
  authenticate,
  requireAuth,
  validateParams(notificationIdParamSchema),
  NotificationController.deleteNotification
);

/**
 * @route   GET /api/v1/notifications/preferences
 * @desc    Get user notification channel preferences
 * @access  Private
 */
router.get(
  '/preferences',
  authenticate,
  requireAuth,
  NotificationController.getPreferences
);

/**
 * @route   PATCH /api/v1/notifications/preferences
 * @desc    Update user notification channel preferences
 * @access  Private
 */
router.patch(
  '/preferences',
  authenticate,
  requireAuth,
  validateBody(updateNotificationPreferencesSchema),
  NotificationController.updatePreferences
);

export const notificationRoutes = router;
