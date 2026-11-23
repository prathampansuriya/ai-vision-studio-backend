import { Request, Response, NextFunction } from 'express';
import { contactSchema } from '../validators/contact.validator.js';
import { emailService } from '../integrations/email.service.js';
import {
  renderContactInquiryAdminEmail,
  renderContactInquiryAcknowledgementEmail,
} from '../templates/email.templates.js';
import { PrismaService } from '../services/prisma.service.js';
import { sendSuccess } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.config.js';

export class ContactController {
  public static async submit(req: Request, res: Response, next: NextFunction) {
    try {
      const input = contactSchema.parse(req.body);
      const referenceId = `REQ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      logger.info(
        `Contact message received from ${input.email} (${input.name}) regarding '${input.subject}' [Category: ${input.category}, Ref: ${referenceId}]`
      );

      // 1. Persist submission into PostgreSQL database
      let dbRecord = null;
      try {
        dbRecord = await PrismaService.client.contactInquiry.create({
          data: {
            referenceId,
            name: input.name,
            email: input.email,
            category: input.category,
            subject: input.subject,
            message: input.message,
            ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null,
            userAgent: req.headers['user-agent'] || null,
          },
        });
      } catch (dbError) {
        logger.error('Failed to persist contact inquiry to database:', dbError);
      }

      // 2. Dispatch notification email to internal support inbox
      try {
        const supportRecipient = env.SUPPORT_EMAIL || env.SMTP_USER || 'support@aivisionstudio.com';
        const adminEmail = renderContactInquiryAdminEmail({
          referenceId,
          name: input.name,
          email: input.email,
          category: input.category,
          subject: input.subject,
          message: input.message,
        });

        await emailService.sendMail(supportRecipient, adminEmail.subject, adminEmail.html);
      } catch (adminMailError) {
        logger.warn('Non-fatal: could not dispatch admin notification email for contact form', adminMailError);
      }

      // 3. Dispatch confirmation acknowledgement email to sender
      try {
        const ackEmail = renderContactInquiryAcknowledgementEmail({
          referenceId,
          name: input.name,
          email: input.email,
          category: input.category,
          subject: input.subject,
          message: input.message,
        });

        await emailService.sendMail(input.email, ackEmail.subject, ackEmail.html);
      } catch (userMailError) {
        logger.warn('Non-fatal: could not dispatch acknowledgement email to user', userMailError);
      }

      return sendSuccess(
        res,
        {
          submitted: true,
          referenceId,
          inquiryId: dbRecord?.id || null,
        },
        'Thank you for contacting AI Vision Studio. Your message has been received, and our team will get back to you shortly.',
        200
      );
    } catch (error) {
      next(error);
    }
  }
}
