import { z } from 'zod';
import { BillingInterval } from '@prisma/client';

export const createCheckoutSessionSchema = z
  .object({
    planId: z.string().uuid('Valid plan ID is required').optional(),
    billingInterval: z
      .nativeEnum(BillingInterval, {
        errorMap: () => ({ message: 'billingInterval must be either MONTHLY or YEARLY' }),
      })
      .optional(),
    priceId: z.string().min(1, 'Valid Stripe price ID is required').optional(),
    successUrl: z.string().url('successUrl must be a valid URL').optional(),
    cancelUrl: z.string().url('cancelUrl must be a valid URL').optional(),
  })
  .refine(
    (data) => (data.planId && data.billingInterval) || data.priceId,
    {
      message: 'Either (planId and billingInterval) or priceId must be provided',
    }
  );

export const createPortalSessionSchema = z.object({
  returnUrl: z.string().url('returnUrl must be a valid URL').optional(),
});

export type CreateCheckoutSessionInput = z.infer<typeof createCheckoutSessionSchema>;
export type CreatePortalSessionInput = z.infer<typeof createPortalSessionSchema>;
