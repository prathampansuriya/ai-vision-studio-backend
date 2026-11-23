import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from backend directory or current working directory
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env') });

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  SERVER_HOST: z.string().default('0.0.0.0'),
  CLIENT_URL: z.string().default('http://localhost:5173'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Authentication & Security
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  COOKIE_SECRET: z.string().default('development_cookie_secret'),
  INTERNAL_SERVICE_KEY: z.string().min(16, 'INTERNAL_SERVICE_KEY must be at least 16 characters'),
  AI_SERVICE_URL: z.string().default('http://localhost:8000'),

  // Google OAuth (Optional in dev foundation)
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),

  // Stripe Billing (Optional in dev foundation)
  STRIPE_SECRET_KEY: z.string().optional().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),
  STRIPE_PRO_PRODUCT_ID: z.string().optional().default(''),
  STRIPE_PRO_PRICE_ID: z.string().optional().default(''),
  STRIPE_PRO_YEARLY_PRICE_ID: z.string().optional().default(''),
  STRIPE_BUSINESS_PRODUCT_ID: z.string().optional().default(''),
  STRIPE_BUSINESS_PRICE_ID: z.string().optional().default(''),
  STRIPE_BUSINESS_YEARLY_PRICE_ID: z.string().optional().default(''),
  STRIPE_ENTERPRISE_PRODUCT_ID: z.string().optional().default(''),
  STRIPE_ENTERPRISE_PRICE_ID: z.string().optional().default(''),
  STRIPE_ENTERPRISE_YEARLY_PRICE_ID: z.string().optional().default(''),

  // Cloudinary Storage
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),

  // Email Delivery
  EMAIL_PROVIDER: z.enum(['nodemailer', 'brevo', 'smtp']).default('nodemailer'),
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  EMAIL_FROM: z.string().default('AI Vision Studio <support@aivisionstudio.com>'),
  EMAIL_FROM_NAME: z.string().default('AI Vision Studio'),
  EMAIL_FROM_ADDRESS: z.string().default('AI Vision Studio <support@aivisionstudio.com>'),
  EMAIL_LOGO_URL: z.string().optional().default(''),
  SUPPORT_EMAIL: z.string().default('support@aivisionstudio.com'),

  // Brevo
  BREVO_API_KEY: z.string().optional().default(''),
  BREVO_SENDER_EMAIL: z.string().optional().default(''),
  BREVO_SENDER_NAME: z.string().default('AI Vision Studio'),
});

function validateEnvironment() {
  const parsed = environmentSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Environment validation failed:');
    console.error(JSON.stringify(parsed.error.format(), null, 2));
    process.exit(1);
  }

  // Production email guardrail: never send production emails using development SMTP
  if (parsed.data.NODE_ENV === 'production') {
    if (parsed.data.EMAIL_PROVIDER !== 'brevo') {
      console.warn(
        '⚠️  [SECURITY WARNING] In production, EMAIL_PROVIDER must be configured to "brevo". Development SMTP is strictly prohibited in production.'
      );
    }
  }

  return parsed.data;
}

export const env = validateEnvironment();
export type Environment = z.infer<typeof environmentSchema>;
