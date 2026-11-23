import { Request, Response } from 'express';
import { env } from '../config/index.js';

export class DocsController {
  public static getDocsJson(_req: Request, res: Response): void {
    const spec = {
      openapi: '3.1.0',
      info: {
        title: 'AI Vision Studio API',
        version: '1.0.0',
        description:
          'Core Backend API for AI Vision Studio ("See. Speak. Understand. In Real Time."). Provides identity, authentication, subscriptions, credit accounting, session tracking, and secure media orchestration.',
        contact: {
          name: 'AI Vision Studio Engineering',
          url: 'https://aivisionstudio.com',
        },
      },
      servers: [
        {
          url: `http://localhost:${env.PORT}`,
          description: 'Local Development Server',
        },
      ],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT bearer token obtained from authentication.',
          },
          InternalKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'x-internal-key',
            description: 'Internal shared key for inter-service communication between Node API and AI service.',
          },
        },
        schemas: {
          ApiResponseMeta: {
            type: 'object',
            properties: {
              timestamp: { type: 'string', format: 'date-time' },
              requestId: { type: 'string' },
            },
            required: ['timestamp'],
          },
          ApiSuccessResponse: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              message: { type: 'string', example: 'Operation completed successfully' },
              data: { type: 'object' },
              meta: { $ref: '#/components/schemas/ApiResponseMeta' },
            },
            required: ['success', 'meta'],
          },
          ApiErrorResponse: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string', example: 'VALIDATION_ERROR' },
                  message: { type: 'string', example: 'Validation failed' },
                  details: { type: 'object' },
                },
                required: ['code', 'message'],
              },
              meta: { $ref: '#/components/schemas/ApiResponseMeta' },
            },
            required: ['success', 'error', 'meta'],
          },
        },
      },
      paths: {
        '/health': {
          get: {
            summary: 'Root System Health Check',
            description: 'Returns overall system health, uptime, memory, and database connectivity status.',
            responses: {
              '200': { description: 'System is healthy' },
              '503': { description: 'System is degraded' },
            },
          },
        },
        '/api/v1/health': {
          get: {
            summary: 'API v1 System Health Check',
            description: 'Returns versioned system health metrics including database latency and system memory.',
            responses: { '200': { description: 'System is operational' } },
          },
        },
        '/api/v1/health/ready': {
          get: {
            summary: 'Kubernetes / Orchestrator Readiness Probe',
            description: 'Returns 200 OK if PostgreSQL database connection is operational, 503 if unavailable.',
            responses: { '200': { description: 'Ready to receive traffic' } },
          },
        },
        '/api/v1/health/live': {
          get: {
            summary: 'Liveness Probe',
            description: 'Returns 200 OK indicating the Express process is running and accepting HTTP requests.',
            responses: { '200': { description: 'Process is alive' } },
          },
        },
        '/api/v1/auth/register': {
          post: {
            summary: 'Local User Registration',
            description: 'Creates a pending verification account, hashes password, and issues an email OTP.',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['name', 'email', 'password', 'confirmPassword', 'acceptTerms'],
                    properties: {
                      name: { type: 'string', example: 'John Doe' },
                      email: { type: 'string', example: 'user@example.com' },
                      password: { type: 'string', example: 'P@ssword123!' },
                      confirmPassword: { type: 'string', example: 'P@ssword123!' },
                      acceptTerms: { type: 'boolean', example: true },
                    },
                  },
                },
              },
            },
            responses: { '201': { description: 'Account registration initiated' } },
          },
        },
        '/api/v1/auth/verify-otp': {
          post: {
            summary: 'Verify Email OTP',
            description: 'Validates 6-digit OTP, verifies email, activates account, grants credits, and issues tokens.',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['email', 'otp'],
                    properties: {
                      email: { type: 'string', example: 'user@example.com' },
                      otp: { type: 'string', example: '123456' },
                    },
                  },
                },
              },
            },
            responses: { '200': { description: 'Account verified successfully' } },
          },
        },
        '/api/v1/auth/resend-otp': {
          post: {
            summary: 'Resend Email OTP',
            description: 'Resends a fresh verification OTP subject to 60-second cooldown and hourly rate limits.',
            responses: { '200': { description: 'Verification code resent' } },
          },
        },
        '/api/v1/auth/login': {
          post: {
            summary: 'Local Email & Password Login',
            description: 'Authenticates user with email and password, enforces email verification, issues JWTs.',
            responses: { '200': { description: 'Logged in successfully' } },
          },
        },
        '/api/v1/auth/google': {
          post: {
            summary: 'Google OAuth Authentication',
            description: 'Authenticates with verified Google ID token, links existing accounts or provisions new users.',
            responses: { '200': { description: 'Authenticated with Google' } },
          },
        },
        '/api/v1/auth/forgot-password': {
          post: {
            summary: 'Forgot Password Request',
            description: 'Initiates password recovery and dispatches reset link with 1-hour expiry.',
            responses: { '200': { description: 'Reset link dispatched' } },
          },
        },
        '/api/v1/auth/reset-password': {
          post: {
            summary: 'Password Reset Confirmation',
            description: 'Validates reset token, validates new password complexity, and updates user password.',
            responses: { '200': { description: 'Password reset completed' } },
          },
        },
        '/api/v1/auth/refresh': {
          post: {
            summary: 'Refresh Access Token',
            description: 'Refreshes expired access tokens using valid refresh token from body or signed cookie.',
            responses: { '200': { description: 'Token refreshed' } },
          },
        },
        '/api/v1/auth/logout': {
          post: {
            summary: 'User Logout',
            description: 'Clears HTTP-only authentication cookies.',
            responses: { '200': { description: 'Logged out successfully' } },
          },
        },
        '/api/v1/auth/me': {
          get: {
            summary: 'Current User Profile',
            description: 'Returns profile, credit balance, and active subscription for the authenticated user.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'User profile retrieved' } },
          },
        },
        '/api/v1/dashboard/summary': {
          get: {
            summary: 'Dashboard Summary & Metrics',
            description: 'Returns real aggregated metrics: credit allowance, consumption, KPIs, session activity trends, mode breakdown, and recent history.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Dashboard metrics retrieved successfully' } },
          },
        },
        '/api/v1/billing/plans': {
          get: {
            summary: 'Subscription Plans & Pricing',
            description: 'Returns available subscription tiers enriched with live Stripe pricing data.',
            responses: { '200': { description: 'Subscription plans retrieved successfully' } },
          },
        },
        '/api/v1/billing/subscription': {
          get: {
            summary: 'Current User Subscription & Balance',
            description: 'Returns authenticated user subscription status, interval, period bounds, and remaining credit ledger balance.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Subscription details retrieved' } },
          },
        },
        '/api/v1/billing/checkout': {
          post: {
            summary: 'Create Stripe Checkout Session',
            description: 'Creates a Stripe hosted checkout session for subscription purchase.',
            security: [{ BearerAuth: [] }],
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      planId: { type: 'string', format: 'uuid' },
                      billingInterval: { type: 'string', enum: ['MONTHLY', 'YEARLY'] },
                      successUrl: { type: 'string', format: 'uri' },
                      cancelUrl: { type: 'string', format: 'uri' },
                    },
                    required: ['planId', 'billingInterval'],
                  },
                },
              },
            },
            responses: { '200': { description: 'Checkout session created' } },
          },
        },
        '/api/v1/billing/portal': {
          post: {
            summary: 'Create Customer Billing Portal Session',
            description: 'Generates a Stripe Customer Portal URL for managing payment methods, invoices, and billing details.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Billing portal URL generated' } },
          },
        },
        '/api/v1/billing/cancel': {
          post: {
            summary: 'Cancel Subscription at Period End',
            description: 'Schedules the active subscription to cancel at the conclusion of the current billing cycle.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Subscription cancellation scheduled' } },
          },
        },
        '/api/v1/billing/webhook': {
          post: {
            summary: 'Stripe Webhook Receiver',
            description: 'Cryptographically verified webhook handler for subscription lifecycle, renewals, and payment failures.',
            responses: { '200': { description: 'Event received and processed' } },
          },
        },
        '/api/v1/credits/balance': {
          get: {
            summary: 'Authoritative Credit Balance & Escrow',
            description: 'Returns total persisted ledger balance, active reservation holds, and available spendable credits.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Credit balance retrieved' } },
          },
        },
        '/api/v1/credits/plan-allowance': {
          get: {
            summary: 'Plan Entitlements & Billing Period Allowance',
            description: 'Returns active plan monthly credit allowance, period consumption, and capability entitlements.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Plan allowance retrieved' } },
          },
        },
        '/api/v1/credits/policy': {
          get: {
            summary: 'Transparent Credit Pricing Policy',
            description: 'Returns official feature pricing schedule, units, and model cost multipliers.',
            responses: { '200': { description: 'Credit policy retrieved' } },
          },
        },
        '/api/v1/credits/ledger': {
          get: {
            summary: 'Auditable Credit Ledger History',
            description: 'Paginated chronological transactions showing grants, usages, refunds, adjustments, and running balance snapshots.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Ledger retrieved' } },
          },
        },
        '/api/v1/credits/usage': {
          get: {
            summary: 'Feature Activity Consumption History',
            description: 'Paginated feature-level activity consumption records with session and model metadata.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Usage history retrieved' } },
          },
        },
        '/api/v1/credits/analytics': {
          get: {
            summary: 'Credit Consumption Analytics',
            description: 'Aggregated analytics breakdown by feature, model, and daily consumption trend for current billing period.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Analytics retrieved' } },
          },
        },
        '/api/v1/credits/consume': {
          post: {
            summary: 'Consume Credits Transactionally',
            description: 'Deducts credits for measured multimodal AI activity with row-level locks and idempotency.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Credits consumed' } },
          },
        },
        '/api/v1/credits/reserve': {
          post: {
            summary: 'Create Credit Reservation Hold',
            description: 'Places a temporary escrow hold on credits before starting an AI job or session to prevent double spending.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Credits reserved' } },
          },
        },
        '/api/v1/credits/settle': {
          post: {
            summary: 'Settle Credit Reservation',
            description: 'Settles actual activity against a reservation hold, releases unused hold, and records usage.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Reservation settled' } },
          },
        },
        '/api/v1/credits/release': {
          post: {
            summary: 'Release/Cancel Reservation Hold',
            description: 'Releases an unconsumed reservation hold back to available balance.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Reservation released' } },
          },
        },
        '/api/v1/credits/stream': {
          get: {
            summary: 'Real-time Server-Sent Events (SSE) Stream',
            description: 'Real-time HTTP event stream pushing live balance updates, reservations, and low-balance warnings during sessions.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'SSE stream established' } },
          },
        },
        '/api/v1/notifications': {
          get: {
            summary: 'User Notifications List',
            description: 'Paginated user notifications and unread count.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Notifications retrieved' } },
          },
        },
        '/api/v1/notifications/unread-count': {
          get: {
            summary: 'Unread Notification Count',
            description: 'Fast count of unread notifications.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Unread count' } },
          },
        },
        '/api/v1/notifications/read-all': {
          patch: {
            summary: 'Mark All Notifications Read',
            description: 'Marks all unread notifications for the authenticated user as read.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'All marked read' } },
          },
        },
        '/api/v1/notifications/{id}/read': {
          patch: {
            summary: 'Mark Single Notification Read',
            description: 'Marks a specific notification as read with ownership validation.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Notification marked read' } },
          },
        },
        '/api/v1/notifications/{id}': {
          delete: {
            summary: 'Delete Notification',
            description: 'Deletes a notification record belonging to the user.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Notification deleted' } },
          },
        },
        '/api/v1/notifications/preferences': {
          get: {
            summary: 'Get Notification Preferences',
            description: 'Retrieves user channel delivery preferences.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Preferences' } },
          },
          patch: {
            summary: 'Update Notification Preferences',
            description: 'Updates notification channel preferences.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Preferences updated' } },
          },
        },
        '/api/v1/notifications/stream': {
          get: {
            summary: 'Real-time Notification SSE Stream',
            description: 'Server-Sent Events stream for instant notification delivery.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'SSE stream established' } },
          },
        },
        '/api/v1/user/profile': {
          get: {
            summary: 'Get Authenticated User Profile',
            description: 'Returns identity, profile details, OAuth accounts, notification preferences, and subscription/credit status.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'User profile retrieved' } },
          },
          patch: {
            summary: 'Update User Profile Details',
            description: 'Updates display name and user profile metadata (headline, bio, company, location, timezone, devices).',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Profile updated' } },
          },
        },
        '/api/v1/user/avatar': {
          patch: {
            summary: 'Update Profile Avatar',
            description: 'Sets avatar URL, invalidating and deleting prior Cloudinary assets.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Avatar updated' } },
          },
        },
        '/api/v1/user/password': {
          patch: {
            summary: 'Change Local Account Password',
            description: 'Updates password for local accounts after verifying current password. Strictly rejected for Google SSO accounts.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Password changed successfully' }, '400': { description: 'Invalid current password or Google SSO account' } },
          },
        },
        '/api/v1/user/connected-accounts': {
          get: {
            summary: 'Get Connected OAuth Accounts',
            description: 'Returns linked third-party authentication identities (e.g. Google profile).',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Connected accounts list' } },
          },
        },
        '/api/v1/upload/signature': {
          post: {
            summary: 'Generate Cloudinary Upload Signature',
            description: 'Generates authenticated SHA-1 signature for direct client-to-Cloudinary media uploads without leaking API secret.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Upload signature payload' } },
          },
        },
        '/api/v1/upload/avatar': {
          post: {
            summary: 'Upload Profile Avatar (Server-side)',
            description: 'Uploads avatar image buffer (JPEG/PNG/WebP, max 5MB) directly to Cloudinary and syncs user profile.',
            security: [{ BearerAuth: [] }],
            responses: { '200': { description: 'Avatar uploaded and profile updated' } },
          },
        },
      },
    };

    res.json(spec);
  }

  public static getDocsHtml(_req: Request, res: Response): void {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Vision Studio — API Documentation</title>
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #F8F9FC;
      --card-bg: #FFFFFF;
      --text: #0F172A;
      --text-muted: #64748B;
      --border: #E2E8F0;
      --accent: #2563EB;
      --code-bg: #F1F5F9;
      --badge-get: #0284C7;
      --badge-post: #16A34A;
      --badge-bg-get: #E0F2FE;
      --badge-bg-post: #DCFCE7;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0B0F19;
        --card-bg: #111827;
        --text: #F8FAFC;
        --text-muted: #94A3B8;
        --border: #1E293B;
        --accent: #38BDF8;
        --code-bg: #1E293B;
        --badge-get: #38BDF8;
        --badge-post: #4ADE80;
        --badge-bg-get: #0C4A6E;
        --badge-bg-post: #064E3B;
      }
    }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Plus Jakarta Sans', sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.6;
    }
    .header {
      border-bottom: 1px solid var(--border);
      background-color: var(--card-bg);
      padding: 24px 40px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .brand h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .brand p { margin: 4px 0 0; font-size: 13px; color: var(--text-muted); }
    .spec-link {
      background-color: var(--accent);
      color: #FFFFFF;
      padding: 8px 16px;
      border-radius: 8px;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
    }
    .container { max-width: 1000px; margin: 40px auto; padding: 0 24px; }
    .section-title { font-size: 18px; font-weight: 700; margin: 32px 0 16px; border-bottom: 2px solid var(--border); padding-bottom: 8px; }
    .endpoint-card {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .endpoint-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
    .badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
    }
    .badge-get { background-color: var(--badge-bg-get); color: var(--badge-get); }
    .badge-post { background-color: var(--badge-bg-post); color: var(--badge-post); }
    .path { font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 600; }
    .summary { font-size: 13px; color: var(--text-muted); margin: 0; }
    .footer { text-align: center; padding: 40px; font-size: 12px; color: var(--text-muted); border-top: 1px solid var(--border); margin-top: 60px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <h1>AI Vision Studio — Developer API</h1>
      <p>See. Speak. Understand. In Real Time. • Version 1.0.0</p>
    </div>
    <a href="/api/docs/spec" target="_blank" class="spec-link">View OpenAPI JSON</a>
  </div>

  <div class="container">
    <div class="section-title">Authentication Endpoints (/api/v1/auth)</div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-post">POST</span>
        <span class="path">/api/v1/auth/register</span>
      </div>
      <p class="summary">Local account registration: hashes password, initiates unverified user, and emails a 6-digit OTP.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-post">POST</span>
        <span class="path">/api/v1/auth/verify-otp</span>
      </div>
      <p class="summary">Verifies 6-digit email OTP with attempt limiting (max 5), activates account, grants starter credits, sets JWT cookies.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-post">POST</span>
        <span class="path">/api/v1/auth/resend-otp</span>
      </div>
      <p class="summary">Resends a fresh OTP code with 60-second cooldown and hourly frequency limits.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-post">POST</span>
        <span class="path">/api/v1/auth/login</span>
      </div>
      <p class="summary">Email & password login: validates bcrypt hash, enforces email verification, issues access & refresh tokens.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-post">POST</span>
        <span class="path">/api/v1/auth/google</span>
      </div>
      <p class="summary">Google OAuth authentication: validates ID token via GoogleAuthLibrary, links accounts, activates unverified emails, issues tokens.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-post">POST</span>
        <span class="path">/api/v1/auth/forgot-password</span>
      </div>
      <p class="summary">Dispatches secure 1-hour password reset link without leaking email existence.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-post">POST</span>
        <span class="path">/api/v1/auth/reset-password</span>
      </div>
      <p class="summary">Consumes password reset token, validates new password complexity, and securely updates password hash.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-post">POST</span>
        <span class="path">/api/v1/auth/refresh</span>
      </div>
      <p class="summary">Rotates / refreshes access token using signed refresh token cookie or request body.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-post">POST</span>
        <span class="path">/api/v1/auth/logout</span>
      </div>
      <p class="summary">Clears HTTP-only access and refresh cookies.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="path">/api/v1/auth/me</span>
      </div>
      <p class="summary">Returns authenticated user profile, real credit balance, and active subscription details.</p>
    </div>

    <div class="section-title">Dashboard & Analytics Endpoints</div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="path">/api/v1/dashboard/summary</span>
      </div>
      <p class="summary">Aggregated database metrics: real credit consumption, allowance progress, KPI counters, 14-day activity trends, mode distribution, and recent activity.</p>
    </div>

    <div class="section-title">Billing & Subscriptions Endpoints (/api/v1/billing)</div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="path">/api/v1/billing/plans</span>
      </div>
      <p class="summary">Returns active subscription plans with live Stripe pricing data (amounts, currencies, intervals, features).</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="path">/api/v1/billing/subscription</span>
      </div>
      <p class="summary">Returns the authenticated user's current subscription, billing interval, renewal dates, cancelAtPeriodEnd status, and credit balance.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-post">POST</span>
        <span class="path">/api/v1/billing/checkout</span>
      </div>
      <p class="summary">Creates a hosted Stripe Checkout session for plan upgrade or purchase with duplicate subscription prevention.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-post">POST</span>
        <span class="path">/api/v1/billing/portal</span>
      </div>
      <p class="summary">Generates a Stripe Customer Billing Portal session for self-serve payment method and invoice management.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-post">POST</span>
        <span class="path">/api/v1/billing/cancel</span>
      </div>
      <p class="summary">Schedules the active subscription for cancellation at the conclusion of the current billing cycle.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-post">POST</span>
        <span class="path">/api/v1/billing/webhook</span>
      </div>
      <p class="summary">Stripe webhook handler with cryptographic signature verification, idempotency tracking, credit renewals, and payment failure alerts.</p>
    </div>

    <div class="section-title">Credit Engine & Metering Endpoints (/api/v1/credits)</div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="path">/api/v1/credits/balance</span>
      </div>
      <p class="summary">Authoritative credit balance snapshot including active reservation holds and available spendable credits.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="path">/api/v1/credits/plan-allowance</span>
      </div>
      <p class="summary">Current billing period credit allowance, consumption against plan ceiling, and capability entitlements.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="path">/api/v1/credits/policy</span>
      </div>
      <p class="summary">Official transparent credit pricing schedule, units of measure, minimum thresholds, and model multipliers.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="path">/api/v1/credits/ledger</span>
      </div>
      <p class="summary">Paginated auditable transactions detailing grants, usages, refunds, adjustments, and running balance snapshots.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="path">/api/v1/credits/usage</span>
      </div>
      <p class="summary">Paginated feature-level activity consumption records with session and model metadata.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="path">/api/v1/credits/analytics</span>
      </div>
      <p class="summary">Consumption analytics breakdown by multimodal feature, model, and daily timeline for current billing period.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-post">POST</span>
        <span class="path">/api/v1/credits/consume</span>
      </div>
      <p class="summary">Transactionally deducts credits for measured AI activity with row-level locks and idempotency.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-post">POST</span>
        <span class="path">/api/v1/credits/reserve</span>
      </div>
      <p class="summary">Places a temporary escrow hold on credits before starting an AI job or session to prevent double spending.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-post">POST</span>
        <span class="path">/api/v1/credits/settle</span>
      </div>
      <p class="summary">Settles actual activity against a reservation hold, releases unused hold, and records usage.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-post">POST</span>
        <span class="path">/api/v1/credits/release</span>
      </div>
      <p class="summary">Releases an unconsumed reservation hold back to available balance.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="path">/api/v1/credits/stream</span>
      </div>
      <p class="summary">Server-Sent Events (SSE) real-time streaming endpoint pushing live balance updates and low-balance warnings during sessions.</p>
    </div>

    <div class="section-title">Notification & Email Endpoints (/api/v1/notifications)</div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="path">/api/v1/notifications</span>
      </div>
      <p class="summary">Paginated list of user notifications, unread counts, and feature filters.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="path">/api/v1/notifications/unread-count</span>
      </div>
      <p class="summary">Fast unread notification count badge lookup.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-patch">PATCH</span>
        <span class="path">/api/v1/notifications/read-all</span>
      </div>
      <p class="summary">Marks all unread notifications as read in a single transactional update.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-patch">PATCH</span>
        <span class="path">/api/v1/notifications/:id/read</span>
      </div>
      <p class="summary">Marks a specific notification as read with ownership validation.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-delete">DELETE</span>
        <span class="path">/api/v1/notifications/:id</span>
      </div>
      <p class="summary">Deletes a specific notification with user ownership validation.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="badge badge-patch">PATCH</span>
        <span class="path">/api/v1/notifications/preferences</span>
      </div>
      <p class="summary">View and update user notification channel preferences (billing, credits, session, security).</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="path">/api/v1/notifications/stream</span>
      </div>
      <p class="summary">Server-Sent Events (SSE) real-time streaming endpoint pushing live notifications instantly.</p>
    </div>

    <div class="section-title">User Profile, Account Settings & Media Storage</div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="badge badge-patch">PATCH</span>
        <span class="path">/api/v1/user/profile</span>
      </div>
      <p class="summary">Retrieve and update authenticated user profile, identity status, headline, bio, and preferences.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-patch">PATCH</span>
        <span class="path">/api/v1/user/avatar</span>
      </div>
      <p class="summary">Update profile avatar URL with automatic Cloudinary storage asset replacement.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-patch">PATCH</span>
        <span class="path">/api/v1/user/password</span>
      </div>
      <p class="summary">Change password for local accounts with current password verification. Strictly blocked for Google SSO.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="path">/api/v1/user/connected-accounts</span>
      </div>
      <p class="summary">Inspect linked Google OAuth identities, connected email, and link timestamps.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-post">POST</span>
        <span class="path">/api/v1/upload/signature</span>
      </div>
      <p class="summary">Generate secure signed parameters for direct browser-to-Cloudinary upload without leaking API secrets.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-post">POST</span>
        <span class="path">/api/v1/upload/avatar</span>
      </div>
      <p class="summary">Server-side avatar upload pipeline validating MIME (JPEG/PNG/WebP), size (&le;5MB), and syncing user record.</p>
    </div>

    <div class="section-title">System & Monitoring Endpoints</div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="path">/api/v1/health</span>
      </div>
      <p class="summary">Versioned system health inspection including database latency and memory footprint.</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="path">/api/v1/health/ready</span>
      </div>
      <p class="summary">Readiness probe for zero-downtime deployment orchestrators (checks database connection).</p>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="path">/api/v1/health/live</span>
      </div>
      <p class="summary">Liveness probe confirming the Express process is active.</p>
    </div>
  </div>

  <div class="footer">
    AI Vision Studio • Enterprise Architecture • Strict Zero-Redis & Zero-Docker Design
  </div>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }
}
