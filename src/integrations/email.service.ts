import nodemailer from 'nodemailer';
import { env } from '../config/env.config.js';
import { logger } from '../utils/logger.js';
import * as brevo from '@getbrevo/brevo';
import {
  renderVerificationOtpEmail,
  renderWelcomeEmail,
  renderPasswordResetEmail,
  renderPasswordChangedEmail,
  renderSubscriptionConfirmationEmail,
  renderSubscriptionCancellationEmail,
  renderPaymentFailedEmail,
  renderCreditsGrantedEmail,
  renderAccountNotificationEmail,
  SubscriptionConfirmationOptions,
  SubscriptionCancellationOptions,
  PaymentFailedOptions,
  CreditsGrantedOptions,
  AccountNotificationEmailOptions,
} from '../templates/email.templates.js';

export type EmailProviderType = 'nodemailer' | 'brevo' | 'smtp';

export type SubscriptionConfirmationInput = Omit<SubscriptionConfirmationOptions, 'name'>;
export type SubscriptionCancellationInput = Omit<SubscriptionCancellationOptions, 'name'>;
export type PaymentFailedInput = Omit<PaymentFailedOptions, 'name'>;
export type CreditsGrantedInput = Omit<CreditsGrantedOptions, 'name'>;
export type AccountNotificationInput = Omit<AccountNotificationEmailOptions, 'name'>;

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  provider: EmailProviderType;
  error?: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private brevoClient: brevo.TransactionalEmailsApi | null = null;
  private activeProvider: EmailProviderType = 'nodemailer';

  constructor() {
    this.initProvider();
  }

  /**
   * Initializes the appropriate email delivery engine based on environment rules:
   * - Development / Test: Uses Nodemailer (SMTP or mock stream transport)
   * - Production: Uses Brevo API exclusively. Strictly prohibits dev SMTP in production.
   */
  public initProvider(): void {
    const isProduction = env.NODE_ENV === 'production';

    if (isProduction || env.EMAIL_PROVIDER === 'brevo') {
      if (!env.BREVO_API_KEY) {
        if (isProduction) {
          logger.error(
            '🚨 [PRODUCTION EMAIL ERROR] BREVO_API_KEY is required for production email delivery. Development SMTP is strictly prohibited in production.'
          );
        } else {
          logger.warn('EMAIL_PROVIDER set to brevo, but BREVO_API_KEY is missing. Falling back to Nodemailer.');
          this.initNodemailer();
          return;
        }
      } else {
        this.brevoClient = new brevo.TransactionalEmailsApi();
        this.brevoClient.setApiKey(
          brevo.TransactionalEmailsApiApiKeys.apiKey,
          env.BREVO_API_KEY
        );
        this.activeProvider = 'brevo';
        logger.info('Email service initialized with Brevo Transactional API');
        return;
      }
    }

    // Default development transport: Nodemailer
    this.initNodemailer();
  }

  private initNodemailer(): void {
    this.activeProvider = 'nodemailer';

    if (env.SMTP_USER && env.SMTP_PASS) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        requireTLS: env.SMTP_PORT === 587,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });

      logger.info(
        `Email service initialized with SMTP (${env.SMTP_HOST}:${env.SMTP_PORT})`
      );
    } else {
      this.transporter = nodemailer.createTransport({
        streamTransport: true,
        newline: 'windows',
      });

      logger.info(
        'Email service initialized with Nodemailer stream/mock transport'
      );
    }
  }

  /**
   * Returns current active delivery provider without exposing credentials
   */
  public getProviderInfo(): { provider: EmailProviderType; isConfigured: boolean; isProduction: boolean } {
    return {
      provider: this.activeProvider,
      isConfigured: this.activeProvider === 'brevo' ? !!this.brevoClient : !!this.transporter,
      isProduction: env.NODE_ENV === 'production',
    };
  }

  // ==============================================================================
  // Transactional Email Dispatchers
  // ==============================================================================

  public async sendVerificationOtp(to: string, name: string, otp: string, expiryMinutes?: number): Promise<boolean> {
    const { subject, html } = renderVerificationOtpEmail({ name, otp, expiryMinutes });
    return this.sendMail(to, subject, html);
  }

  public async sendWelcomeNotification(to: string, name: string, starterCredits?: number): Promise<boolean> {
    const { subject, html } = renderWelcomeEmail({ name, starterCredits });
    return this.sendMail(to, subject, html);
  }

  public async sendPasswordResetLink(to: string, name: string, resetLink: string, expiryHours?: number): Promise<boolean> {
    const { subject, html } = renderPasswordResetEmail({ name, resetUrl: resetLink, expiryHours });
    return this.sendMail(to, subject, html);
  }

  public async sendPasswordChangedAlert(to: string, name: string, timestamp?: string): Promise<boolean> {
    const { subject, html } = renderPasswordChangedEmail({ name, timestamp });
    return this.sendMail(to, subject, html);
  }

  public async sendSubscriptionConfirmation(to: string, name: string, details: SubscriptionConfirmationInput): Promise<boolean> {
    const { subject, html } = renderSubscriptionConfirmationEmail({ ...details, name });
    return this.sendMail(to, subject, html);
  }

  public async sendSubscriptionCancellation(to: string, name: string, details: SubscriptionCancellationInput): Promise<boolean> {
    const { subject, html } = renderSubscriptionCancellationEmail({ ...details, name });
    return this.sendMail(to, subject, html);
  }

  public async sendPaymentFailedAlert(to: string, name: string, details: PaymentFailedInput): Promise<boolean> {
    const { subject, html } = renderPaymentFailedEmail({ ...details, name });
    return this.sendMail(to, subject, html);
  }

  public async sendCreditsGrantedNotification(to: string, name: string, details: CreditsGrantedInput): Promise<boolean> {
    const { subject, html } = renderCreditsGrantedEmail({ ...details, name });
    return this.sendMail(to, subject, html);
  }

  public async sendAccountNotification(to: string, name: string, details: AccountNotificationInput): Promise<boolean> {
    const { subject, html } = renderAccountNotificationEmail({ ...details, name });
    return this.sendMail(to, subject, html);
  }

  // ==============================================================================
  // Core Dispatch Engine
  // ==============================================================================

  public async sendMail(to: string, subject: string, htmlContent: string): Promise<boolean> {
    try {
      // 1. Guardrail: In production, verify we never use development SMTP
      if (env.NODE_ENV === 'production' && this.activeProvider !== 'brevo') {
        const errorMsg = 'CRITICAL: Refusing to send production email using development SMTP transport.';
        logger.error(errorMsg);
        return false;
      }

      // 2. Dispatch via Brevo API in production (or configured mode)
      if (this.activeProvider === 'brevo' && this.brevoClient) {
        const sendSmtpEmail = new brevo.SendSmtpEmail();
        sendSmtpEmail.subject = subject;
        sendSmtpEmail.htmlContent = htmlContent;
        sendSmtpEmail.sender = {
          name: env.BREVO_SENDER_NAME || env.EMAIL_FROM_NAME,
          email: env.BREVO_SENDER_EMAIL || env.EMAIL_FROM,
        };
        sendSmtpEmail.to = [{ email: to }];

        await this.brevoClient.sendTransacEmail(sendSmtpEmail);
        logger.info(`Transactional email dispatched to ${to} via Brevo API (Subject: "${subject}")`);
        return true;
      }

      // 3. Dispatch via Nodemailer in development/testing
      if (this.transporter) {
        const info = await this.transporter.sendMail({
          from: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`,
          to,
          subject,
          html: htmlContent,
        });

        if (env.NODE_ENV !== 'production') {
          logger.info(`Transactional email dispatched to ${to} via Nodemailer (Subject: "${subject}") [id: ${info.messageId || 'local'}]`);
        }
        return true;
      }

      logger.warn(`No email delivery provider available to send email to ${to}`);
      return false;
    } catch (error: any) {
      logger.error(`Failed to send email to ${to} (Subject: "${subject}"):`, error?.message || error);
      // In development/test mode, do not fail parent workflow if external SMTP or network is down
      if (env.NODE_ENV !== 'production') {
        logger.warn('Non-fatal: email send failed in development/test environment');
        return true;
      }
      return false;
    }
  }
}

export const emailService = new EmailService();
