import { env } from '../config/env.config.js';

export interface BaseEmailLayoutOptions {
  title: string;
  previewText?: string;
  contentHtml: string;
  logoUrl?: string;
  supportEmail?: string;
  clientUrl?: string;
}

/**
 * Universal premium email layout wrapper
 * Clean white background, responsive table markup, premium neutral palette, mobile-friendly
 */
export function renderBaseEmailLayout(options: BaseEmailLayoutOptions): string {
  const currentYear = new Date().getFullYear();
  const clientUrl = options.clientUrl || env.CLIENT_URL;
  const supportEmail = options.supportEmail || env.SUPPORT_EMAIL || 'support@aivisionstudio.com';
  const logoUrl = options.logoUrl || env.EMAIL_LOGO_URL;

  const headerLogoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="AI Vision Studio" width="160" style="display: block; margin: 0 auto; border: 0; outline: none; text-decoration: none; max-width: 180px; height: auto;" />`
    : `<div style="font-size: 20px; font-weight: 700; color: #FFFFFF; letter-spacing: -0.02em; line-height: 1.2;">AI Vision Studio</div>
       <div style="font-size: 12px; color: #94A3B8; margin-top: 4px; letter-spacing: 0.02em;">See. Speak. Understand. In Real Time.</div>`;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>${options.title}</title>
  ${options.previewText ? `<div style="display: none; max-height: 0px; overflow: hidden; font-size: 1px; line-height: 1px; color: #fff; opacity: 0;">${options.previewText}</div>` : ''}
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0F172A; }
    a { color: #2563EB; text-decoration: none; }
    @media screen and (max-width: 600px) {
      .container-table { width: 100% !important; max-width: 100% !important; }
      .content-cell { padding: 24px 20px !important; }
      .header-cell { padding: 24px 20px !important; }
      .footer-cell { padding: 20px !important; }
      .btn { display: block !important; width: 100% !important; text-align: center !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F8FAFC;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <!-- Email Container Card -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="container-table" style="max-width: 580px; background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);">
          <!-- Header Banner -->
          <tr>
            <td align="center" class="header-cell" style="background-color: #0F172A; padding: 32px 36px; text-align: center;">
              ${headerLogoHtml}
            </td>
          </tr>

          <!-- Main Content Area -->
          <tr>
            <td class="content-cell" style="padding: 36px 36px 28px 36px; background-color: #FFFFFF;">
              ${options.contentHtml}
            </td>
          </tr>

          <!-- Footer Area -->
          <tr>
            <td class="footer-cell" style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 24px 36px; text-align: center; font-size: 12px; line-height: 1.6; color: #64748B;">
              <p style="margin: 0 0 8px 0; font-weight: 500; color: #475569;">
                &copy; ${currentYear} AI Vision Studio. All rights reserved.
              </p>
              <p style="margin: 0 0 12px 0;">
                Questions or support? Visit <a href="${clientUrl}" style="color: #2563EB; font-weight: 500;">Studio Help</a> or contact <a href="mailto:${supportEmail}" style="color: #2563EB; font-weight: 500;">${supportEmail}</a>.
              </p>
              <p style="margin: 0; font-size: 11px; color: #94A3B8;">
                This is a required transactional service notification related to your AI Vision Studio account.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ==============================================================================
// 1. Email Verification OTP
// ==============================================================================

export interface VerificationOtpOptions {
  name: string;
  otp: string;
  expiryMinutes?: number;
}

export function renderVerificationOtpEmail(opts: VerificationOtpOptions): { subject: string; html: string } {
  const subject = 'Verify your AI Vision Studio account';
  const expiry = opts.expiryMinutes || 15;

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #0F172A; letter-spacing: -0.01em;">
      Verify your email address
    </h2>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      Hi ${opts.name || 'there'},
    </p>
    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      Welcome to <strong>AI Vision Studio</strong>! Use the 6-digit confirmation code below to verify your email address and activate your multimodal studio workspace:
    </p>

    <!-- OTP Display Box -->
    <div style="text-align: center; margin: 28px 0;">
      <div style="display: inline-block; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 34px; font-weight: 700; letter-spacing: 8px; color: #2563EB; background-color: #EFF6FF; border: 1px solid #BFDBFE; padding: 16px 32px; border-radius: 8px; box-shadow: inset 0 1px 2px rgba(37, 99, 235, 0.08);">
        ${opts.otp}
      </div>
    </div>

    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px 18px; margin-top: 24px;">
      <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748B;">
        ⏱️ This code will expire in <strong>${expiry} minutes</strong> for security reasons. If you did not sign up for AI Vision Studio, you can safely discard this email.
      </p>
    </div>
  `;

  return {
    subject,
    html: renderBaseEmailLayout({
      title: subject,
      previewText: `Your verification code is ${opts.otp}. Expires in ${expiry} minutes.`,
      contentHtml,
    }),
  };
}

// ==============================================================================
// 2. Welcome Email
// ==============================================================================

export interface WelcomeEmailOptions {
  name: string;
  loginUrl?: string;
  starterCredits?: number;
}

export function renderWelcomeEmail(opts: WelcomeEmailOptions): { subject: string; html: string } {
  const subject = 'Welcome to AI Vision Studio — Your Workspace Is Active';
  const loginUrl = opts.loginUrl || env.CLIENT_URL;
  const credits = opts.starterCredits ?? 100;

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #0F172A; letter-spacing: -0.01em;">
      Your studio workspace is ready!
    </h2>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      Hi ${opts.name || 'there'},
    </p>
    <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      Your email has been verified and your <strong>AI Vision Studio</strong> account is active. We have granted <strong>${credits} complimentary starter credits</strong> to your balance so you can immediately begin streaming real-time multimodal intelligence.
    </p>

    <!-- Key Capabilities List -->
    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <p style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #0F172A;">What you can do right now:</p>
      <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #475569;">
        <li><strong>Live Camera Vision:</strong> Inspect real-world physical objects, diagrams, and hardware.</li>
        <li><strong>Screen Share Analysis:</strong> Collaborate on UI designs, codebases, and terminal workflows.</li>
        <li><strong>Low-Latency Voice:</strong> Converse naturally with real-time speech response.</li>
        <li><strong>Saved Insights:</strong> Collect architectural takeaways, executive summaries, and action items.</li>
      </ul>
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin: 32px 0 16px 0;">
      <a href="${loginUrl}" class="btn" style="display: inline-block; background-color: #2563EB; color: #FFFFFF !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);">
        Open Studio Dashboard
      </a>
    </div>
  `;

  return {
    subject,
    html: renderBaseEmailLayout({
      title: subject,
      previewText: `Welcome to AI Vision Studio! Your ${credits} starter credits are available.`,
      contentHtml,
    }),
  };
}

// ==============================================================================
// 3. Password Reset
// ==============================================================================

export interface PasswordResetOptions {
  name: string;
  resetUrl: string;
  expiryHours?: number;
}

export function renderPasswordResetEmail(opts: PasswordResetOptions): { subject: string; html: string } {
  const subject = 'Reset your AI Vision Studio password';
  const expiry = opts.expiryHours || 1;

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #0F172A; letter-spacing: -0.01em;">
      Password Reset Request
    </h2>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      Hi ${opts.name || 'there'},
    </p>
    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      We received a request to reset the password for your AI Vision Studio account. Click the button below to choose a secure new password:
    </p>

    <!-- Reset Button -->
    <div style="text-align: center; margin: 32px 0;">
      <a href="${opts.resetUrl}" class="btn" style="display: inline-block; background-color: #2563EB; color: #FFFFFF !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);">
        Reset Password
      </a>
    </div>

    <!-- Plain Link Fallback -->
    <p style="margin: 24px 0 8px 0; font-size: 12px; color: #64748B;">
      If the button does not work, copy and paste this link into your browser:
    </p>
    <p style="margin: 0 0 24px 0; font-size: 12px; color: #2563EB; word-break: break-all;">
      <a href="${opts.resetUrl}" style="color: #2563EB;">${opts.resetUrl}</a>
    </p>

    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px 18px;">
      <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748B;">
        🔒 This link is valid for <strong>${expiry} hour</strong>. If you did not request a password reset, you can safely ignore this email — your existing password remains completely secure.
      </p>
    </div>
  `;

  return {
    subject,
    html: renderBaseEmailLayout({
      title: subject,
      previewText: 'Password reset link for your AI Vision Studio account.',
      contentHtml,
    }),
  };
}

// ==============================================================================
// 4. Password Changed Security Alert
// ==============================================================================

export interface PasswordChangedOptions {
  name: string;
  timestamp?: string;
  supportEmail?: string;
}

export function renderPasswordChangedEmail(opts: PasswordChangedOptions): { subject: string; html: string } {
  const subject = 'Security Alert: Your password was changed';
  const changeTime = opts.timestamp || new Date().toUTCString();
  const supportEmail = opts.supportEmail || env.SUPPORT_EMAIL || 'support@aivisionstudio.com';

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #0F172A; letter-spacing: -0.01em;">
      Your password has been updated
    </h2>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      Hi ${opts.name || 'there'},
    </p>
    <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      This email confirms that the password for your AI Vision Studio account was successfully changed at <strong>${changeTime}</strong>.
    </p>

    <div style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #991B1B;">
        ⚠️ Did not authorize this change?
      </p>
      <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #B91C1C;">
        If you did not initiate this password update, please immediately reset your password using the forgot-password flow or contact our security team at <a href="mailto:${supportEmail}" style="color: #991B1B; font-weight: 600; text-decoration: underline;">${supportEmail}</a>.
      </p>
    </div>
  `;

  return {
    subject,
    html: renderBaseEmailLayout({
      title: subject,
      previewText: 'Your AI Vision Studio account password was recently changed.',
      contentHtml,
    }),
  };
}

// ==============================================================================
// 5. Subscription Confirmation
// ==============================================================================

export interface SubscriptionConfirmationOptions {
  name: string;
  planName: string;
  monthlyCredits: number;
  billingInterval: string;
  nextBillingDate?: string;
  dashboardUrl?: string;
}

export function renderSubscriptionConfirmationEmail(opts: SubscriptionConfirmationOptions): { subject: string; html: string } {
  const subject = `Subscription Confirmed: Welcome to ${opts.planName}`;
  const dashboardUrl = opts.dashboardUrl || `${env.CLIENT_URL}/dashboard`;

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #0F172A; letter-spacing: -0.01em;">
      Your ${opts.planName} subscription is active!
    </h2>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      Hi ${opts.name || 'there'},
    </p>
    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      Thank you for subscribing to <strong>AI Vision Studio ${opts.planName}</strong>. Your payment was processed successfully and your elevated capabilities are now unlocked.
    </p>

    <!-- Plan Summary Card -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; margin: 24px 0;">
      <tr>
        <td style="padding: 16px 20px; border-bottom: 1px solid #E2E8F0; font-size: 14px; color: #64748B;">Plan Tier</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #E2E8F0; font-size: 14px; font-weight: 600; color: #0F172A; text-align: right;">${opts.planName}</td>
      </tr>
      <tr>
        <td style="padding: 16px 20px; border-bottom: 1px solid #E2E8F0; font-size: 14px; color: #64748B;">Monthly Credit Allowance</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #E2E8F0; font-size: 14px; font-weight: 600; color: #2563EB; text-align: right;">${opts.monthlyCredits.toLocaleString()} Credits</td>
      </tr>
      <tr>
        <td style="padding: 16px 20px; border-bottom: 1px solid #E2E8F0; font-size: 14px; color: #64748B;">Billing Interval</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #E2E8F0; font-size: 14px; font-weight: 600; color: #0F172A; text-align: right; text-transform: capitalize;">${opts.billingInterval.toLowerCase()}</td>
      </tr>
      ${opts.nextBillingDate ? `
      <tr>
        <td style="padding: 16px 20px; font-size: 14px; color: #64748B;">Next Renewal Date</td>
        <td style="padding: 16px 20px; font-size: 14px; font-weight: 600; color: #0F172A; text-align: right;">${opts.nextBillingDate}</td>
      </tr>` : ''}
    </table>

    <div style="text-align: center; margin: 32px 0 16px 0;">
      <a href="${dashboardUrl}" class="btn" style="display: inline-block; background-color: #2563EB; color: #FFFFFF !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);">
        Go to Studio Dashboard
      </a>
    </div>
  `;

  return {
    subject,
    html: renderBaseEmailLayout({
      title: subject,
      previewText: `Your ${opts.planName} subscription is active with ${opts.monthlyCredits} monthly credits.`,
      contentHtml,
    }),
  };
}

// ==============================================================================
// 6. Subscription Cancellation
// ==============================================================================

export interface SubscriptionCancellationOptions {
  name: string;
  planName: string;
  accessUntilDate?: string;
  renewUrl?: string;
}

export function renderSubscriptionCancellationEmail(opts: SubscriptionCancellationOptions): { subject: string; html: string } {
  const subject = `Subscription Update: ${opts.planName} Cancellation Scheduled`;
  const renewUrl = opts.renewUrl || `${env.CLIENT_URL}/billing`;

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #0F172A; letter-spacing: -0.01em;">
      Your subscription cancellation has been scheduled
    </h2>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      Hi ${opts.name || 'there'},
    </p>
    <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      We have received your request to cancel your <strong>AI Vision Studio ${opts.planName}</strong> subscription.
    </p>

    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #0F172A;">
        What happens next:
      </p>
      <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #475569;">
        You will retain full access to your ${opts.planName} features and remaining credit balance until the end of your current billing period${opts.accessUntilDate ? ` on <strong>${opts.accessUntilDate}</strong>` : ''}. After that date, your account will smoothly transition to the Starter Free tier.
      </p>
    </div>

    <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #475569;">
      Changed your mind? You can resume your subscription at any time before the cycle concludes with zero interruption:
    </p>

    <div style="text-align: center; margin: 28px 0 16px 0;">
      <a href="${renewUrl}" class="btn" style="display: inline-block; background-color: #0F172A; color: #FFFFFF !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px;">
        Manage Subscription
      </a>
    </div>
  `;

  return {
    subject,
    html: renderBaseEmailLayout({
      title: subject,
      previewText: `Your ${opts.planName} subscription cancellation is scheduled.`,
      contentHtml,
    }),
  };
}

// ==============================================================================
// 7. Payment Failed Urgent Alert
// ==============================================================================

export interface PaymentFailedOptions {
  name: string;
  planName: string;
  amount?: string;
  updatePaymentUrl?: string;
}

export function renderPaymentFailedEmail(opts: PaymentFailedOptions): { subject: string; html: string } {
  const subject = 'Urgent: Payment failed for your AI Vision Studio subscription';
  const updateUrl = opts.updatePaymentUrl || `${env.CLIENT_URL}/billing`;

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #B91C1C; letter-spacing: -0.01em;">
      Action Required: Payment Failed
    </h2>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      Hi ${opts.name || 'there'},
    </p>
    <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      We were unable to process your recurring payment for your <strong>AI Vision Studio ${opts.planName}</strong> subscription${opts.amount ? ` (${opts.amount})` : ''}.
    </p>

    <div style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 18px; margin: 24px 0;">
      <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #991B1B;">
        Prevent service suspension
      </p>
      <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #B91C1C;">
        Please update your payment method to ensure uninterrupted access to real-time multimodal AI sessions, screen analysis, and voice channels. Stripe will automatically retry the charge in the coming days.
      </p>
    </div>

    <div style="text-align: center; margin: 32px 0 16px 0;">
      <a href="${updateUrl}" class="btn" style="display: inline-block; background-color: #DC2626; color: #FFFFFF !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; box-shadow: 0 2px 4px rgba(220, 38, 38, 0.2);">
        Update Payment Method
      </a>
    </div>
  `;

  return {
    subject,
    html: renderBaseEmailLayout({
      title: subject,
      previewText: `Action required: payment failed for your AI Vision Studio ${opts.planName} plan.`,
      contentHtml,
    }),
  };
}

// ==============================================================================
// 8. Credits Granted Notification
// ==============================================================================

export interface CreditsGrantedOptions {
  name: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  dashboardUrl?: string;
}

export function renderCreditsGrantedEmail(opts: CreditsGrantedOptions): { subject: string; html: string } {
  const subject = `Credits Added: +${opts.amount.toLocaleString()} credits to your account`;
  const dashboardUrl = opts.dashboardUrl || `${env.CLIENT_URL}/dashboard`;

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #0F172A; letter-spacing: -0.01em;">
      Credits Added To Your Balance
    </h2>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      Hi ${opts.name || 'there'},
    </p>
    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      We have deposited credits into your AI Vision Studio account.
    </p>

    <!-- Credit Badge Box -->
    <div style="text-align: center; margin: 28px 0;">
      <div style="display: inline-block; font-size: 32px; font-weight: 700; color: #16A34A; background-color: #F0FDF4; border: 1px solid #BBF7D0; padding: 14px 32px; border-radius: 8px;">
        +${opts.amount.toLocaleString()} Credits
      </div>
    </div>

    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; margin: 24px 0;">
      <tr>
        <td style="padding: 14px 20px; border-bottom: 1px solid #E2E8F0; font-size: 14px; color: #64748B;">Reason</td>
        <td style="padding: 14px 20px; border-bottom: 1px solid #E2E8F0; font-size: 14px; font-weight: 600; color: #0F172A; text-align: right;">${opts.reason}</td>
      </tr>
      <tr>
        <td style="padding: 14px 20px; font-size: 14px; color: #64748B;">New Available Balance</td>
        <td style="padding: 14px 20px; font-size: 14px; font-weight: 700; color: #2563EB; text-align: right;">${opts.balanceAfter.toLocaleString()} Credits</td>
      </tr>
    </table>

    <div style="text-align: center; margin: 28px 0 16px 0;">
      <a href="${dashboardUrl}" class="btn" style="display: inline-block; background-color: #2563EB; color: #FFFFFF !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px;">
        View Credit Balance
      </a>
    </div>
  `;

  return {
    subject,
    html: renderBaseEmailLayout({
      title: subject,
      previewText: `+${opts.amount} credits added to your account. New balance: ${opts.balanceAfter}.`,
      contentHtml,
    }),
  };
}

// ==============================================================================
// 9. Important Account Notification
// ==============================================================================

export interface AccountNotificationEmailOptions {
  name: string;
  title: string;
  message: string;
  badgeType?: 'info' | 'warning' | 'security' | 'billing';
  actionLabel?: string;
  actionUrl?: string;
}

export function renderAccountNotificationEmail(opts: AccountNotificationEmailOptions): { subject: string; html: string } {
  const subject = `Account Notification: ${opts.title}`;
  const actionUrl = opts.actionUrl || env.CLIENT_URL;

  const isWarning = opts.badgeType === 'warning' || opts.badgeType === 'security';
  const badgeColor = isWarning ? '#DC2626' : '#2563EB';
  const badgeBg = isWarning ? '#FEF2F2' : '#EFF6FF';
  const badgeBorder = isWarning ? '#FECACA' : '#BFDBFE';

  const contentHtml = `
    <div style="display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: ${badgeColor}; background-color: ${badgeBg}; border: 1px solid ${badgeBorder}; padding: 4px 10px; border-radius: 9999px; margin-bottom: 16px;">
      ${opts.badgeType || 'Notice'}
    </div>
    <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #0F172A; letter-spacing: -0.01em;">
      ${opts.title}
    </h2>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      Hi ${opts.name || 'there'},
    </p>
    <div style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 24px;">
      ${opts.message}
    </div>

    ${opts.actionLabel ? `
    <div style="text-align: center; margin: 28px 0 16px 0;">
      <a href="${actionUrl}" class="btn" style="display: inline-block; background-color: #2563EB; color: #FFFFFF !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px;">
        ${opts.actionLabel}
      </a>
    </div>` : ''}
  `;

  return {
    subject,
    html: renderBaseEmailLayout({
      title: subject,
      previewText: opts.title,
      contentHtml,
    }),
  };
}

// ==============================================================================
// CONTACT & SUPPORT INQUIRY EMAIL TEMPLATES
// ==============================================================================

export interface ContactInquiryEmailOptions {
  referenceId: string;
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
}

export function renderContactInquiryAdminEmail(opts: ContactInquiryEmailOptions): { subject: string; html: string } {
  const subject = `[Inquiry #${opts.referenceId}] ${opts.category}: ${opts.subject}`;
  const contentHtml = `
    <div style="display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #0284C7; background-color: #E0F2FE; border: 1px solid #BAE6FD; padding: 4px 10px; border-radius: 9999px; margin-bottom: 16px;">
      ${opts.category}
    </div>
    <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #0F172A; letter-spacing: -0.01em;">
      New Support & Sales Inquiry
    </h2>
    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <p style="margin: 0 0 8px 0; font-size: 14px; color: #475569;"><strong>Reference ID:</strong> <code style="font-family: monospace; background: #E2E8F0; padding: 2px 6px; border-radius: 4px;">${opts.referenceId}</code></p>
      <p style="margin: 0 0 8px 0; font-size: 14px; color: #475569;"><strong>Sender:</strong> ${opts.name} (&lt;<a href="mailto:${opts.email}" style="color: #0284C7;">${opts.email}</a>&gt;)</p>
      <p style="margin: 0 0 8px 0; font-size: 14px; color: #475569;"><strong>Subject:</strong> ${opts.subject}</p>
      <p style="margin: 0; font-size: 14px; color: #475569;"><strong>Category:</strong> ${opts.category}</p>
    </div>
    <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #0F172A;">Inquiry Message:</h3>
    <div style="background-color: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 8px; padding: 16px; font-size: 14px; line-height: 1.6; color: #334155; white-space: pre-wrap;">${opts.message}</div>
  `;

  return {
    subject,
    html: renderBaseEmailLayout({
      title: subject,
      previewText: `New message from ${opts.name}: ${opts.subject}`,
      contentHtml,
    }),
  };
}

export function renderContactInquiryAcknowledgementEmail(opts: ContactInquiryEmailOptions): { subject: string; html: string } {
  const subject = `We received your inquiry [#${opts.referenceId}] — AI Vision Studio`;
  const contentHtml = `
    <div style="display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #10B981; background-color: #ECFDF5; border: 1px solid #A7F3D0; padding: 4px 10px; border-radius: 9999px; margin-bottom: 16px;">
      Inquiry Received
    </div>
    <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #0F172A; letter-spacing: -0.01em;">
      Thank You for Contacting AI Vision Studio
    </h2>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      Hi ${opts.name},
    </p>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      We have received your message regarding <strong>"${opts.subject}"</strong>. Our engineering and technical support team has been notified and is reviewing your inquiry.
    </p>
    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <p style="margin: 0 0 6px 0; font-size: 13px; color: #64748B;">Tracking Reference:</p>
      <p style="margin: 0; font-size: 16px; font-weight: 700; font-family: monospace; color: #0284C7;">${opts.referenceId}</p>
    </div>
    <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #64748B;">
      Our standard response time is within 24 business hours. If you have urgent account or security needs, please reply directly to this email with any additional details.
    </p>
    <div style="text-align: center; margin: 28px 0 16px 0;">
      <a href="${env.CLIENT_URL}/faq" class="btn" style="display: inline-block; background-color: #0284C7; color: #FFFFFF !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
        Browse Knowledge Base
      </a>
    </div>
  `;

  return {
    subject,
    html: renderBaseEmailLayout({
      title: subject,
      previewText: `Your AI Vision Studio inquiry #${opts.referenceId} has been received`,
      contentHtml,
    }),
  };
}
