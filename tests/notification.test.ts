import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { PrismaService } from '../src/services/prisma.service.js';
import { generateAccessToken } from '../src/utils/token.js';
import { emailService } from '../src/integrations/email.service.js';
import { NotificationService } from '../src/services/notification.service.js';
import { NotificationType } from '@prisma/client';
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
} from '../src/templates/email.templates.js';

describe('Email Delivery & Notification Infrastructure Suite', () => {
  const app = createApp();

  const userAEmail = `notif_user_a_${Date.now()}@example.com`;
  const userBEmail = `notif_user_b_${Date.now()}@example.com`;

  let userAId: string;
  let userBId: string;
  let userAToken: string;
  let userBToken: string;

  before(async () => {
    await PrismaService.pingDatabase();

    // 1. Create User A
    const userA = await PrismaService.client.user.create({
      data: {
        email: userAEmail,
        name: 'Jordan Notifications',
        passwordHash: '$2b$12$e8YkYcK012345678901234567890123456789012345678901234',
        emailVerified: true,
        accountStatus: 'ACTIVE',
        role: 'USER',
        profile: {
          create: {
            theme: 'dark',
            preferredLanguage: 'en',
          },
        },
      },
    });
    userAId = userA.id;
    userAToken = generateAccessToken({ sub: userAId, email: userAEmail, role: 'USER' });

    // 2. Create User B for cross-tenant isolation testing
    const userB = await PrismaService.client.user.create({
      data: {
        email: userBEmail,
        name: 'Alex Isolation',
        passwordHash: '$2b$12$e8YkYcK012345678901234567890123456789012345678901234',
        emailVerified: true,
        accountStatus: 'ACTIVE',
        role: 'USER',
        profile: {
          create: {
            theme: 'system',
            preferredLanguage: 'en',
          },
        },
      },
    });
    userBId = userB.id;
    userBToken = generateAccessToken({ sub: userBId, email: userBEmail, role: 'USER' });
  });

  after(async () => {
    const prisma = PrismaService.client;
    await prisma.notification.deleteMany({
      where: { userId: { in: [userAId, userBId] } },
    });
    await prisma.userNotificationPreferences.deleteMany({
      where: { userId: { in: [userAId, userBId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userAId, userBId] } },
    });
  });

  // ==============================================================================
  // 1. Email Provider Selection & Guardrails
  // ==============================================================================

  describe('1. Email Provider Selection & Guardrails', () => {
    it('initializes email delivery engine with configured provider info without exposing credentials', () => {
      const info = emailService.getProviderInfo();
      assert.ok(['nodemailer', 'brevo', 'smtp'].includes(info.provider));
      assert.equal(typeof info.isConfigured, 'boolean');
      assert.equal(typeof info.isProduction, 'boolean');

      // Ensure credentials are never leaked
      const keys = Object.keys(info);
      assert.ok(!keys.includes('password'));
      assert.ok(!keys.includes('apiKey'));
      assert.ok(!keys.includes('secret'));
    });

    it('successfully dispatches a development email via Nodemailer stream transport', async () => {
      const result = await emailService.sendMail(
        'recipient@example.com',
        'Test Multimodal Email',
        '<p>Test message content</p>'
      );
      assert.equal(result, true);
    });
  });

  // ==============================================================================
  // 2. Reusable Premium Email Template Renderers
  // ==============================================================================

  describe('2. Reusable Premium Email Template Renderers (All 9 Required Templates)', () => {
    it('renders Email Verification OTP template with 6-digit code and expiry', () => {
      const { subject, html } = renderVerificationOtpEmail({
        name: 'Jordan',
        otp: '849201',
        expiryMinutes: 15,
      });

      assert.equal(subject, 'Verify your AI Vision Studio account');
      assert.ok(html.includes('849201'));
      assert.ok(html.includes('15 minutes'));
      assert.ok(html.includes('AI Vision Studio'));
      assert.ok(html.includes('table')); // Responsive table layout
      assert.ok(html.includes('All rights reserved'));
    });

    it('renders Welcome Email template with starter credit notice and CTA', () => {
      const { subject, html } = renderWelcomeEmail({
        name: 'Jordan',
        starterCredits: 100,
      });

      assert.ok(subject.includes('Welcome to AI Vision Studio'));
      assert.ok(html.includes('100 complimentary starter credits'));
      assert.ok(html.includes('Live Camera Vision'));
      assert.ok(html.includes('Open Studio Dashboard'));
    });

    it('renders Password Reset template with secure CTA link and expiry', () => {
      const resetUrl = 'https://app.aivisionstudio.com/reset-password?token=xyz123';
      const { subject, html } = renderPasswordResetEmail({
        name: 'Jordan',
        resetUrl,
        expiryHours: 1,
      });

      assert.equal(subject, 'Reset your AI Vision Studio password');
      assert.ok(html.includes(resetUrl));
      assert.ok(html.includes('1 hour'));
      assert.ok(html.includes('Reset Password'));
    });

    it('renders Password Changed Security Alert template with timestamp and support notice', () => {
      const { subject, html } = renderPasswordChangedEmail({
        name: 'Jordan',
        timestamp: '2026-11-21 20:30:00 UTC',
      });

      assert.ok(subject.includes('Security Alert'));
      assert.ok(html.includes('2026-11-21 20:30:00 UTC'));
      assert.ok(html.includes('Did not authorize this change?'));
    });

    it('renders Subscription Confirmation template with plan name, credits, and renewal', () => {
      const { subject, html } = renderSubscriptionConfirmationEmail({
        name: 'Jordan',
        planName: 'Professional',
        monthlyCredits: 2000,
        billingInterval: 'monthly',
        nextBillingDate: 'December 21, 2026',
      });

      assert.ok(subject.includes('Subscription Confirmed'));
      assert.ok(html.includes('Professional'));
      assert.ok(html.includes('2,000 Credits'));
      assert.ok(html.includes('December 21, 2026'));
      assert.ok(html.includes('Go to Studio Dashboard'));
    });

    it('renders Subscription Cancellation template with transition date and reactivate CTA', () => {
      const { subject, html } = renderSubscriptionCancellationEmail({
        name: 'Jordan',
        planName: 'Professional',
        accessUntilDate: 'December 21, 2026',
      });

      assert.ok(subject.includes('Cancellation Scheduled'));
      assert.ok(html.includes('December 21, 2026'));
      assert.ok(html.includes('Manage Subscription'));
    });

    it('renders Payment Failed Urgent Alert template with plan and update payment CTA', () => {
      const { subject, html } = renderPaymentFailedEmail({
        name: 'Jordan',
        planName: 'Professional',
        amount: '$29.00',
      });

      assert.ok(subject.includes('Payment failed'));
      assert.ok(html.includes('Action Required: Payment Failed'));
      assert.ok(html.includes('Update Payment Method'));
    });

    it('renders Credits Granted template with amount badge, new balance, and reason', () => {
      const { subject, html } = renderCreditsGrantedEmail({
        name: 'Jordan',
        amount: 500,
        balanceAfter: 600,
        reason: 'Monthly Subscription Cycle Refresh',
      });

      assert.ok(subject.includes('+500 credits'));
      assert.ok(html.includes('+500 Credits'));
      assert.ok(html.includes('600 Credits'));
      assert.ok(html.includes('Monthly Subscription Cycle Refresh'));
    });

    it('renders Important Account Notification template with badge and dynamic message', () => {
      const { subject, html } = renderAccountNotificationEmail({
        name: 'Jordan',
        title: 'Low Credit Warning',
        message: 'Your spendable credit balance has fallen below 20 credits.',
        badgeType: 'warning',
        actionLabel: 'Top Up Credits',
        actionUrl: 'https://app.aivisionstudio.com/billing',
      });

      assert.ok(subject.includes('Low Credit Warning'));
      assert.ok(html.includes('Low Credit Warning'));
      assert.ok(html.includes('below 20 credits'));
      assert.ok(html.includes('Top Up Credits'));
    });
  });

  // ==============================================================================
  // 3. Persisted User Notification Creation & Retrieval
  // ==============================================================================

  describe('3. Persisted User Notification Creation & Retrieval', () => {
    let createdNotificationId: string;

    it('creates and persists a notification in the database with user ownership', async () => {
      const notification = await NotificationService.createNotification(userAId, {
        type: NotificationType.BILLING,
        title: 'Invoice Paid Successfully',
        message: 'Your monthly invoice of $29.00 was successfully processed.',
        actionUrl: '/billing',
      });

      assert.ok(notification.id);
      assert.equal(notification.userId, userAId);
      assert.equal(notification.type, NotificationType.BILLING);
      assert.equal(notification.isRead, false);
      createdNotificationId = notification.id;
    });

    it('retrieves paginated notifications for the authenticated user on GET /api/v1/notifications', async () => {
      const res = await request(app)
        .get('/api/v1/notifications?page=1&limit=10')
        .set('Authorization', `Bearer ${userAToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data.items));
      assert.ok(res.body.data.total >= 1);
      assert.ok(res.body.data.unreadCount >= 1);

      const found = res.body.data.items.find((n: any) => n.id === createdNotificationId);
      assert.ok(found);
      assert.equal(found.title, 'Invoice Paid Successfully');
      assert.equal(found.isRead, false);
    });

    it('retrieves accurate unread notification count on GET /api/v1/notifications/unread-count', async () => {
      const res = await request(app)
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${userAToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.unreadCount >= 1);
    });

    it('filters unread notifications with unreadOnly=true query parameter', async () => {
      const res = await request(app)
        .get('/api/v1/notifications?unreadOnly=true')
        .set('Authorization', `Bearer ${userAToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.items.every((n: any) => n.isRead === false));
    });
  });

  // ==============================================================================
  // 4. Cross-Tenant Isolation & Ownership Protection
  // ==============================================================================

  describe('4. Cross-Tenant Isolation & Ownership Protection', () => {
    let userANotifId: string;

    before(async () => {
      const notif = await NotificationService.createNotification(userAId, {
        type: NotificationType.SECURITY,
        title: 'New Login Detected',
        message: 'A new session was initiated from Chrome on Windows.',
      });
      userANotifId = notif.id;
    });

    it('rejects unauthenticated requests to notifications endpoints with 401', async () => {
      const res = await request(app).get('/api/v1/notifications');
      assert.equal(res.status, 401);
    });

    it('prevents User B from viewing or marking read User A notification (returns 404/Access Denied)', async () => {
      // User B attempts to mark User A's notification as read
      const res = await request(app)
        .patch(`/api/v1/notifications/${userANotifId}/read`)
        .set('Authorization', `Bearer ${userBToken}`);

      assert.equal(res.status, 404);
      assert.ok(res.body.error.message.includes('Notification not found or access denied'));
    });

    it('prevents User B from deleting User A notification', async () => {
      // User B attempts to delete User A's notification
      const res = await request(app)
        .delete(`/api/v1/notifications/${userANotifId}`)
        .set('Authorization', `Bearer ${userBToken}`);

      assert.equal(res.status, 404);
      assert.ok(res.body.error.message.includes('Notification not found or access denied'));
    });
  });

  // ==============================================================================
  // 5. Read State Transitions & Deletion Lifecycle
  // ==============================================================================

  describe('5. Read State Transitions & Deletion Lifecycle', () => {
    let notif1Id: string;
    let notif2Id: string;

    before(async () => {
      const n1 = await NotificationService.createNotification(userAId, {
        type: NotificationType.CREDIT,
        title: 'Welcome Bonus Credited',
        message: '100 credits granted upon registration.',
      });
      const n2 = await NotificationService.createNotification(userAId, {
        type: NotificationType.SESSION,
        title: 'Session Summary Ready',
        message: 'Executive summary generated for Live Camera Session #1.',
        actionUrl: '/sessions',
      });
      notif1Id = n1.id;
      notif2Id = n2.id;
    });

    it('marks a single notification as read on PATCH /api/v1/notifications/:id/read', async () => {
      const res = await request(app)
        .patch(`/api/v1/notifications/${notif1Id}/read`)
        .set('Authorization', `Bearer ${userAToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.id, notif1Id);
      assert.equal(res.body.data.isRead, true);
      assert.ok(res.body.data.readAt !== null);
    });

    it('marks all remaining unread notifications as read on PATCH /api/v1/notifications/read-all', async () => {
      const res = await request(app)
        .patch('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${userAToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.markedCount >= 1);

      // Verify unread count is now 0
      const countRes = await request(app)
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${userAToken}`);
      assert.equal(countRes.body.data.unreadCount, 0);
    });

    it('deletes a notification on DELETE /api/v1/notifications/:id', async () => {
      const res = await request(app)
        .delete(`/api/v1/notifications/${notif2Id}`)
        .set('Authorization', `Bearer ${userAToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.deletedId, notif2Id);

      // Verify notification is no longer in list
      const listRes = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${userAToken}`);
      const found = listRes.body.data.items.find((n: any) => n.id === notif2Id);
      assert.equal(found, undefined);
    });
  });

  // ==============================================================================
  // 6. User Notification Channel Preferences
  // ==============================================================================

  describe('6. User Notification Channel Preferences', () => {
    it('retrieves default notification preferences on GET /api/v1/notifications/preferences', async () => {
      const res = await request(app)
        .get('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${userAToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.emailBillingAlerts, true);
      assert.equal(res.body.data.emailCreditLowAlerts, true);
      assert.equal(res.body.data.inAppSecurityAlerts, true);
      assert.equal(res.body.data.creditThresholdAlert, 50);
    });

    it('updates notification channel preferences on PATCH /api/v1/notifications/preferences', async () => {
      const res = await request(app)
        .patch('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          emailBillingAlerts: false,
          creditThresholdAlert: 75,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.emailBillingAlerts, false);
      assert.equal(res.body.data.creditThresholdAlert, 75);
      // Other flags remain unmodified
      assert.equal(res.body.data.emailCreditLowAlerts, true);
    });
  });

  // ==============================================================================
  // 7. Real-Time Notification Server-Sent Events (SSE) Stream
  // ==============================================================================

  describe('7. Real-Time Notification Server-Sent Events (SSE) Stream', () => {
    it('establishes SSE stream and streams initial unread count state', async () => {
      const server = app.listen(0);
      const address = server.address() as any;
      const port = address.port;

      const abortController = new AbortController();

      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/v1/notifications/stream`, {
          headers: {
            Authorization: `Bearer ${userAToken}`,
            Accept: 'text/event-stream',
          },
          signal: abortController.signal,
        });

        assert.equal(response.status, 200);
        assert.ok(response.headers.get('content-type')?.includes('text/event-stream'));

        const reader = response.body?.getReader();
        assert.ok(reader);

        const decoder = new TextDecoder();
        let received = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          received += decoder.decode(value, { stream: true });
          if (received.includes('event: initial_state')) {
            assert.ok(received.includes('unreadCount'));
            break;
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          throw err;
        }
      } finally {
        abortController.abort();
        server.close();
      }
    });
  });
});
