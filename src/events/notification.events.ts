import { EventEmitter } from 'events';
import { Response } from 'express';
import { NotificationType } from '@prisma/client';
import { logger } from '../utils/logger.js';

export interface NotificationPayload {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  readAt: string | null;
  actionUrl?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  createdAt: string;
}

export type NotificationEventType =
  | 'new_notification'
  | 'notification_read'
  | 'all_read'
  | 'notification_deleted';

class NotificationEventBroadcaster extends EventEmitter {
  private sseClients: Map<string, Set<Response>> = new Map();

  constructor() {
    super();
    this.setMaxListeners(200);
  }

  /**
   * Registers an active Server-Sent Events (SSE) client response
   */
  public registerSseClient(userId: string, res: Response): () => void {
    if (!this.sseClients.has(userId)) {
      this.sseClients.set(userId, new Set());
    }

    const userClients = this.sseClients.get(userId)!;
    userClients.add(res);

    logger.debug(`Registered Notification SSE client for user ${userId}. Active: ${userClients.size}`);

    return () => {
      userClients.delete(res);
      if (userClients.size === 0) {
        this.sseClients.delete(userId);
      }
      logger.debug(`Unregistered Notification SSE client for user ${userId}. Remaining: ${userClients.size}`);
    };
  }

  /**
   * Dispatches typed notification events to EventEmitter subscribers and SSE clients
   */
  public broadcastToUser(userId: string, eventType: NotificationEventType, payload: unknown): void {
    this.emit(`notification:${userId}`, { event: eventType, data: payload });

    const clients = this.sseClients.get(userId);
    if (clients && clients.size > 0) {
      const message = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
      clients.forEach((res) => {
        try {
          res.write(message);
        } catch (err) {
          logger.warn(`Failed to push notification SSE event to user ${userId}:`, err);
        }
      });
    }
  }

  public emitNewNotification(notification: NotificationPayload): void {
    this.broadcastToUser(notification.userId, 'new_notification', notification);
  }

  public emitNotificationRead(userId: string, notificationId: string): void {
    this.broadcastToUser(userId, 'notification_read', { notificationId, isRead: true });
  }

  public emitAllRead(userId: string): void {
    this.broadcastToUser(userId, 'all_read', { userId, allRead: true });
  }

  public emitNotificationDeleted(userId: string, notificationId: string): void {
    this.broadcastToUser(userId, 'notification_deleted', { notificationId, deleted: true });
  }
}

export const notificationEvents = new NotificationEventBroadcaster();
