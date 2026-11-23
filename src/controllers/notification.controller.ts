import { Request, Response, NextFunction } from 'express';
import { NotificationService } from '../services/notification.service.js';
import { sendSuccess } from '../utils/response.js';
import { AppError } from '../utils/appError.js';
import { notificationEvents } from '../events/notification.events.js';
import {
  GetNotificationsQueryInput,
  UpdateNotificationPreferencesInput,
} from '../validators/notification.validator.js';

export class NotificationController {
  /**
   * GET /api/v1/notifications
   * Paginated list of user notifications and unread count
   */
  public static async getNotifications(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw AppError.unauthorized('Authentication required to view notifications');
      }

      const query = req.query as unknown as GetNotificationsQueryInput;
      const data = await NotificationService.getNotifications(req.user.id, query);

      sendSuccess(res, data, 'Notifications retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/notifications/unread-count
   * Quick unread count lookup
   */
  public static async getUnreadCount(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw AppError.unauthorized('Authentication required to view unread count');
      }

      const unreadCount = await NotificationService.getUnreadCount(req.user.id);
      sendSuccess(res, { unreadCount }, 'Unread notification count retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/notifications/:id/read
   * Marks a specific notification as read
   */
  public static async markAsRead(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw AppError.unauthorized('Authentication required');
      }

      const updated = await NotificationService.markAsRead(req.user.id, req.params.id);
      sendSuccess(res, updated, 'Notification marked as read');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/notifications/read-all
   * Marks all user notifications as read
   */
  public static async markAllAsRead(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw AppError.unauthorized('Authentication required');
      }

      const result = await NotificationService.markAllAsRead(req.user.id);
      sendSuccess(res, result, 'All notifications marked as read');
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/notifications/:id
   * Deletes a specific notification
   */
  public static async deleteNotification(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw AppError.unauthorized('Authentication required');
      }

      const result = await NotificationService.deleteNotification(req.user.id, req.params.id);
      sendSuccess(res, result, 'Notification deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/notifications/preferences
   * Retrieves notification channel preferences
   */
  public static async getPreferences(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw AppError.unauthorized('Authentication required');
      }

      const preferences = await NotificationService.getPreferences(req.user.id);
      sendSuccess(res, preferences, 'Notification preferences retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/notifications/preferences
   * Updates notification channel preferences
   */
  public static async updatePreferences(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw AppError.unauthorized('Authentication required');
      }

      const input = req.body as UpdateNotificationPreferencesInput;
      const updated = await NotificationService.updatePreferences(req.user.id, input);
      sendSuccess(res, updated, 'Notification preferences updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/notifications/stream
   * Real-time Server-Sent Events (SSE) notification stream
   */
  public static async streamEvents(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw AppError.unauthorized('Authentication required for real-time notifications stream');
      }

      // Configure SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      // Send initial unread count
      const initialUnread = await NotificationService.getUnreadCount(userId);
      res.write(`event: initial_state\ndata: ${JSON.stringify({ unreadCount: initialUnread })}\n\n`);

      // Register SSE client
      const unregister = notificationEvents.registerSseClient(userId, res);

      // Keep-alive heartbeat every 25 seconds
      const heartbeatTimer = setInterval(() => {
        try {
          res.write(': heartbeat\n\n');
        } catch {
          clearInterval(heartbeatTimer);
        }
      }, 25000);

      req.on('close', () => {
        clearInterval(heartbeatTimer);
        unregister();
      });
    } catch (error) {
      next(error);
    }
  }
}
