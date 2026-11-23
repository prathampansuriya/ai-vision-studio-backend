import { z } from 'zod';
import { CreditTransactionType, CreditFeatureType } from '@prisma/client';

export const consumeCreditsSchema = z.object({
  amount: z.number().int().positive('Credits to consume must be a positive integer'),
  feature: z.nativeEnum(CreditFeatureType, {
    errorMap: () => ({ message: 'Valid feature type is required' }),
  }),
  sessionId: z.string().uuid('Valid session ID is required').optional(),
  modelUsed: z.string().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
  unitsConsumed: z.number().int().nonnegative().optional(),
  reason: z.string().min(3, 'Reason must be at least 3 characters'),
  referenceId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const reserveCreditsSchema = z.object({
  amount: z.number().int().positive('Reserved amount must be a positive integer'),
  feature: z.nativeEnum(CreditFeatureType, {
    errorMap: () => ({ message: 'Valid feature type is required' }),
  }),
  sessionId: z.string().uuid('Valid session ID is required').optional(),
  ttlSeconds: z.number().int().min(30).max(3600).default(600),
  metadata: z.record(z.any()).optional(),
});

export const settleReservationSchema = z.object({
  reservationId: z.string().uuid('Valid reservation ID is required'),
  actualAmount: z.number().int().nonnegative('Actual settled amount must be non-negative'),
  durationSeconds: z.number().int().nonnegative().optional(),
  unitsConsumed: z.number().int().nonnegative().optional(),
  modelUsed: z.string().optional(),
  reason: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const releaseReservationSchema = z.object({
  reservationId: z.string().uuid('Valid reservation ID is required'),
  reason: z.string().optional(),
});

export const grantCreditsSchema = z.object({
  userId: z.string().uuid('Valid user ID is required'),
  amount: z.number().int().positive('Grant amount must be a positive integer'),
  type: z.enum(['GRANT', 'PROMO', 'ADJUSTMENT']).default('GRANT'),
  reason: z.string().min(3, 'Reason must be at least 3 characters'),
  referenceId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const refundCreditsSchema = z.object({
  userId: z.string().uuid('Valid user ID is required'),
  amount: z.number().int().positive('Refund amount must be a positive integer'),
  reason: z.string().min(3, 'Reason must be at least 3 characters'),
  referenceId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const adjustCreditsSchema = z.object({
  userId: z.string().uuid('Valid user ID is required'),
  amount: z.number().int().refine((n) => n !== 0, 'Adjustment amount cannot be zero'),
  reason: z.string().min(3, 'Reason must be at least 3 characters'),
  referenceId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const ledgerQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.nativeEnum(CreditTransactionType).optional(),
  billingPeriod: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Billing period format must be YYYY-MM')
    .optional(),
});

export const usageQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  feature: z.nativeEnum(CreditFeatureType).optional(),
  sessionId: z.string().uuid().optional(),
  billingPeriod: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Billing period format must be YYYY-MM')
    .optional(),
});

export type ConsumeCreditsInput = z.infer<typeof consumeCreditsSchema>;
export type ReserveCreditsInput = z.infer<typeof reserveCreditsSchema>;
export type SettleReservationInput = z.infer<typeof settleReservationSchema>;
export type ReleaseReservationInput = z.infer<typeof releaseReservationSchema>;
export type GrantCreditsInput = z.infer<typeof grantCreditsSchema>;
export type RefundCreditsInput = z.infer<typeof refundCreditsSchema>;
export type AdjustCreditsInput = z.infer<typeof adjustCreditsSchema>;
export type LedgerQueryInput = z.infer<typeof ledgerQuerySchema>;
export type UsageQueryInput = z.infer<typeof usageQuerySchema>;
