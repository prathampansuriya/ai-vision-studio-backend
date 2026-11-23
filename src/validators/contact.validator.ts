import { z } from 'zod';

export const CONTACT_CATEGORIES = [
  'General Question',
  'Account Support',
  'Billing & Subscriptions',
  'Technical Issue',
  'Product Feedback',
  'Enterprise Inquiry',
  'Other',
] as const;

export const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be under 100 characters'),
  email: z
    .string()
    .trim()
    .email('Please provide a valid email address')
    .max(120, 'Email must be under 120 characters'),
  subject: z
    .string()
    .trim()
    .min(3, 'Subject must be at least 3 characters')
    .max(150, 'Subject must be under 150 characters'),
  category: z
    .enum(CONTACT_CATEGORIES, {
      errorMap: () => ({ message: 'Please select a valid topic category' }),
    })
    .default('General Question'),
  message: z
    .string()
    .trim()
    .min(10, 'Message must be at least 10 characters')
    .max(3000, 'Message cannot exceed 3000 characters'),
});

export type ContactInput = z.infer<typeof contactSchema>;
