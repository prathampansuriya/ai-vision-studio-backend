import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service.js';
import { AppError } from '../utils/appError.js';
import { logger } from '../utils/logger.js';
import { notificationEvents, NotificationPayload } from '../events/notification.events.js';
import { emailService } from '../integrations/email.service.js';
import {
  GetNotificationsQueryInput,
  UpdateNotificationPreferencesInput,
} from '../validators/notification.validator.js';

export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  sendEmail?: boolean;
}

export class NotificationService {
  /**
   * Persists a notification for a user, enforces preferences, sends transactional email if entitled,
   * and broadcasts real-time SSE event
   */
  public static async createNotification(
    userId: string,
    input: CreateNotificationInput
  ) {
    const prisma = PrismaService.client;

    // 1. Fetch user and preferences in parallel
    const [user, preferences] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, accountStatus: true },
      }),
      NotificationService.getPreferences(userId),
    ]);

    if (!user) {
      throw AppError.notFound('Target user for notification not found');
    }

    // 2. Persist notification in database
    const notification = await prisma.notification.create({
      data: {
        userId,
        type: input.type,
        title: input.title,
        message: input.message,
        actionUrl: input.actionUrl || null,
        relatedEntityType: input.relatedEntityType || null,
        relatedEntityId: input.relatedEntityId || null,
        isRead: false,
      },
    });

    const payload: NotificationPayload = {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      isRead: notification.isRead,
      readAt: notification.readAt ? notification.readAt.toISOString() : null,
      actionUrl: notification.actionUrl,
      relatedEntityType: notification.relatedEntityType,
      relatedEntityId: notification.relatedEntityId,
      createdAt: notification.createdAt.toISOString(),
    };

    // 3. Broadcast real-time SSE event to active connected clients
    notificationEvents.emitNewNotification(payload);

    // 4. Check user notification preferences for transactional email delivery
    let shouldSendEmail = input.sendEmail ?? false;

    if (!input.sendEmail) {
      switch (input.type) {
        case NotificationType.BILLING:
          shouldSendEmail = preferences.emailBillingAlerts;
          break;
        case NotificationType.CREDIT:
          shouldSendEmail = preferences.emailCreditLowAlerts;
          break;
        case NotificationType.SECURITY:
          shouldSendEmail = preferences.inAppSecurityAlerts;
          break;
        case NotificationType.SESSION:
          shouldSendEmail = preferences.emailSessionSummaries;
          break;
        default:
          shouldSendEmail = false;
      }
    }

    if (shouldSendEmail && user.email) {
      emailService
        .sendAccountNotification(user.email, user.name || 'there', {
          title: input.title,
          message: input.message,
          badgeType:
            input.type === NotificationType.SECURITY
              ? 'security'
              : input.type === NotificationType.BILLING
              ? 'billing'
              : 'info',
          actionLabel: input.actionUrl ? 'Open Notification' : undefined,
          actionUrl: input.actionUrl || undefined,
        })
        .catch((err) => {
          logger.warn(`Failed to dispatch email for notification ${notification.id}:`, err);
        });
    }

    return notification;
  }

  /**
   * Retrieves paginated notifications and total unread count
   */
  public static async getNotifications(
    userId: string,
    query: GetNotificationsQueryInput
  ) {
    const prisma = PrismaService.client;
    const { page, limit, unreadOnly, type } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(unreadOnly ? { isRead: false } : {}),
      ...(type ? { type } : {}),
    };

    const [items, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { userId, isRead: false },
      }),
    ]);

    return {
      items,
      total,
      unreadCount,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Fast unread count lookup
   */
  public static async getUnreadCount(userId: string): Promise<number> {
    const prisma = PrismaService.client;
    return await prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  /**
   * Marks a single notification as read with ownership validation
   */
  public static async markAsRead(userId: string, notificationId: string) {
    const prisma = PrismaService.client;

    const existing = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!existing || existing.userId !== userId) {
      throw AppError.notFound('Notification not found or access denied');
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    notificationEvents.emitNotificationRead(userId, notificationId);

    return updated;
  }

  /**
   * Marks all unread notifications for the user as read
   */
  public static async markAllAsRead(userId: string) {
    const prisma = PrismaService.client;

    const result = await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    notificationEvents.emitAllRead(userId);

    return {
      markedCount: result.count,
    };
  }

  /**
   * Deletes a notification with user ownership validation
   */
  public static async deleteNotification(userId: string, notificationId: string) {
    const prisma = PrismaService.client;

    const existing = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!existing || existing.userId !== userId) {
      throw AppError.notFound('Notification not found or access denied');
    }

    await prisma.notification.delete({
      where: { id: notificationId },
    });

    notificationEvents.emitNotificationDeleted(userId, notificationId);

    return { success: true, deletedId: notificationId };
  }

  /**
   * Retrieves or creates default notification preferences for a user
   */
  public static async getPreferences(userId: string) {
    const prisma = PrismaService.client;

    let prefs = await prisma.userNotificationPreferences.findUnique({
      where: { userId },
    });

    if (!prefs) {
      prefs = await prisma.userNotificationPreferences.create({
        data: {
          userId,
          emailSessionSummaries: true,
          emailBillingAlerts: true,
          emailCreditLowAlerts: true,
          inAppSessionAlerts: true,
          inAppSecurityAlerts: true,
          creditThresholdAlert: 50,
        },
      });
    }

    return prefs;
  }

  /**
   * Updates notification channel preferences
   */
  public static async updatePreferences(
    userId: string,
    input: UpdateNotificationPreferencesInput
  ) {
    const prisma = PrismaService.client;

    return await prisma.userNotificationPreferences.upsert({
      where: { userId },
      create: {
        userId,
        emailSessionSummaries: input.emailSessionSummaries ?? true,
        emailBillingAlerts: input.emailBillingAlerts ?? true,
        emailCreditLowAlerts: input.emailCreditLowAlerts ?? true,
        inAppSessionAlerts: input.inAppSessionAlerts ?? true,
        inAppSecurityAlerts: input.inAppSecurityAlerts ?? true,
        creditThresholdAlert: input.creditThresholdAlert ?? 50,
      },
      update: {
        ...(input.emailSessionSummaries !== undefined ? { emailSessionSummaries: input.emailSessionSummaries } : {}),
        ...(input.emailBillingAlerts !== undefined ? { emailBillingAlerts: input.emailBillingAlerts } : {}),
        ...(input.emailCreditLowAlerts !== undefined ? { emailCreditLowAlerts: input.emailCreditLowAlerts } : {}),
        ...(input.inAppSessionAlerts !== undefined ? { inAppSessionAlerts: input.inAppSessionAlerts } : {}),
        ...(input.inAppSecurityAlerts !== undefined ? { inAppSecurityAlerts: input.inAppSecurityAlerts } : {}),
        ...(input.creditThresholdAlert !== undefined ? { creditThresholdAlert: input.creditThresholdAlert } : {}),
      },
    });
  }
}
