import { z } from 'zod';
import { NotificationType } from '@prisma/client';

export const getNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') return val.toLowerCase() === 'true';
      return false;
    }),
  type: z.nativeEnum(NotificationType).optional(),
});

export const notificationIdParamSchema = z.object({
  id: z.string().uuid('Invalid notification identifier: must be a valid UUID'),
});

export const updateNotificationPreferencesSchema = z.object({
  emailSessionSummaries: z.boolean().optional(),
  emailBillingAlerts: z.boolean().optional(),
  emailCreditLowAlerts: z.boolean().optional(),
  inAppSessionAlerts: z.boolean().optional(),
  inAppSecurityAlerts: z.boolean().optional(),
  creditThresholdAlert: z.number().int().min(0).max(10000).optional(),
});

export type GetNotificationsQueryInput = z.infer<typeof getNotificationsQuerySchema>;
export type UpdateNotificationPreferencesInput = z.infer<typeof updateNotificationPreferencesSchema>;
