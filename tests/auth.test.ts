import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../src/app.js';
import { PrismaService } from '../src/services/prisma.service.js';
import { generateAccessToken } from '../src/utils/token.js';

describe('Complete Authentication Suite', () => {
  const app = createApp();

  const testEmail = `testuser_${Date.now()}@example.com`;
  const testPassword = 'P@ssword123!Secure';
  const testName = 'Multimodal Tester';

  let createdUserId: string;
  let activeAccessToken: string;
  let activeRefreshToken: string;

  before(async () => {
    // Ensure test database is ready
    await PrismaService.pingDatabase();
  });

  after(async () => {
    // Clean up test users
    try {
      await PrismaService.client.user.deleteMany({
        where: {
          email: {
            in: [
              testEmail,
              'newgoogle@example.com',
              'linkme@example.com',
              'unverified@example.com',
            ],
          },
        },
      });
    } catch {
      // Ignore cleanup error
    }
  });

  // 1. Local Registration
  it('registers a new unverified user and issues email OTP', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: testName,
        email: testEmail,
        password: testPassword,
        confirmPassword: testPassword,
        acceptTerms: true,
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.email, testEmail);
    assert.strictEqual(res.body.data.requiresVerification, true);
    assert.ok(res.body.data.userId);

    createdUserId = res.body.data.userId;

    // Verify user record in DB
    const dbUser = await PrismaService.client.user.findUnique({
      where: { id: createdUserId },
    });
    assert.ok(dbUser);
    assert.strictEqual(dbUser.emailVerified, false);
    assert.strictEqual(dbUser.accountStatus, 'PENDING_VERIFICATION');
    assert.notStrictEqual(dbUser.passwordHash, testPassword);
    assert.ok(dbUser.passwordHash?.startsWith('$2')); // Bcrypt hash
  });

  // 2. Unverified Login
  it('blocks unverified local user from logging in', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'EMAIL_NOT_VERIFIED');
  });

  // 3. OTP Invalid
  it('rejects an incorrect OTP code with remaining attempts', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({
        email: testEmail,
        otp: '000000',
      });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'INVALID_OTP');
    assert.ok(typeof res.body.error.details?.remainingAttempts === 'number');
  });

  // 4. OTP Resend Cooldown
  it('enforces 60-second cooldown on OTP resend requests', async () => {
    const res = await request(app)
      .post('/api/v1/auth/resend-otp')
      .send({
        email: testEmail,
      });

    assert.strictEqual(res.status, 429);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'COOLDOWN_ACTIVE');
  });

  // 5. OTP Expiry
  it('rejects expired OTP codes', async () => {
    // Manually expire the current OTP record in DB
    await PrismaService.client.emailVerification.updateMany({
      where: { userId: createdUserId, consumedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({
        email: testEmail,
        otp: '123456',
      });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'OTP_EXPIRED');
  });

  // 6. OTP Successful Verification
  it('verifies correct OTP, activates account, grants credits, and issues tokens', async () => {
    // Generate a known OTP and inject into DB for deterministic verification
    const knownOtp = '789123';
    const hashedKnownOtp = crypto.createHash('sha256').update(`${createdUserId}:${knownOtp}`).digest('hex');

    await PrismaService.client.emailVerification.create({
      data: {
        userId: createdUserId,
        token: hashedKnownOtp,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        attempts: 0,
      },
    });

    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({
        email: testEmail,
        otp: knownOtp,
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.user.emailVerified, true);
    assert.strictEqual(res.body.data.user.creditBalance, 100);
    assert.ok(res.body.data.tokens.accessToken);
    assert.ok(res.body.data.tokens.refreshToken);

    activeAccessToken = res.body.data.tokens.accessToken;
    activeRefreshToken = res.body.data.tokens.refreshToken;

    // Check DB state
    const dbUser = await PrismaService.client.user.findUnique({
      where: { id: createdUserId },
    });
    assert.strictEqual(dbUser?.emailVerified, true);
    assert.strictEqual(dbUser?.accountStatus, 'ACTIVE');

    // Check credit ledger
    const ledger = await PrismaService.client.creditLedger.findFirst({
      where: { userId: createdUserId },
    });
    assert.strictEqual(ledger?.amount, 100);
    assert.strictEqual(ledger?.balanceAfter, 100);
  });

  // 7. Duplicate Email Registration
  it('rejects registration with an already verified email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Another Name',
        email: testEmail,
        password: testPassword,
        confirmPassword: testPassword,
        acceptTerms: true,
      });

    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'CONFLICT');
  });

  // 8. Local Login
  it('logs in successfully with verified email and password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.tokens.accessToken);
    assert.strictEqual(res.body.data.user.email, testEmail);
    assert.strictEqual(res.body.data.user.creditBalance, 100);

    // Verify cookies set
    const cookies = res.headers['set-cookie'];
    assert.ok(cookies);
    assert.ok(cookies.some((c: string) => c.includes('access_token')));
    assert.ok(cookies.some((c: string) => c.includes('refresh_token')));
  });

  // 9. Protected Me Endpoint
  it('returns authenticated user profile and credit balance on /api/v1/auth/me', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${activeAccessToken}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.id, createdUserId);
    assert.strictEqual(res.body.data.email, testEmail);
    assert.strictEqual(res.body.data.creditBalance, 100);
  });

  // 10. Google Authentication (New User)
  it('registers and authenticates new user via Google OAuth token', async () => {
    const googleEmail = 'newgoogle@example.com';
    const mockGoogleToken = `mock-google-token:${googleEmail}:Google Explorer:sub-999888:verified`;

    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({
        credential: mockGoogleToken,
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.user.email, googleEmail);
    assert.strictEqual(res.body.data.user.emailVerified, true);
    assert.strictEqual(res.body.data.user.creditBalance, 100);

    // Check DB that OAuthAccount was created
    const user = await PrismaService.client.user.findUnique({
      where: { email: googleEmail },
      include: { oauthAccounts: true },
    });
    assert.ok(user);
    assert.strictEqual(user.oauthAccounts.length, 1);
    assert.strictEqual(user.oauthAccounts[0].provider, 'google');
    assert.strictEqual(user.oauthAccounts[0].providerAccountId, 'sub-999888');
  });

  // 11. Google Account Linking (Existing User)
  it('links Google OAuth identity to existing local account without duplicate user', async () => {
    const localEmail = 'linkme@example.com';

    // Create local user
    const localUser = await PrismaService.client.user.create({
      data: {
        email: localEmail,
        name: 'Link User',
        emailVerified: true,
        accountStatus: 'ACTIVE',
        authProvider: 'LOCAL',
      },
    });

    const mockGoogleToken = `mock-google-token:${localEmail}:Link User:sub-link-777:verified`;

    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({
        credential: mockGoogleToken,
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.user.id, localUser.id); // Same user ID!

    // Verify linked OAuth record
    const oauth = await PrismaService.client.oAuthAccount.findFirst({
      where: { userId: localUser.id, provider: 'google' },
    });
    assert.ok(oauth);
    assert.strictEqual(oauth.providerAccountId, 'sub-link-777');
  });

  // 12. Forgot Password Request
  it('handles forgot password request without leaking email existence', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({
        email: testEmail,
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);

    // Verify reset record created in DB
    const resetRecord = await PrismaService.client.passwordReset.findFirst({
      where: { userId: createdUserId, consumedAt: null },
    });
    assert.ok(resetRecord);
    assert.ok(resetRecord.expiresAt > new Date());
  });

  // 13. Reset Password Confirmation
  it('resets password with valid reset token and allows login with new password', async () => {
    const rawResetToken = 'mock-reset-token-abcdef1234567890';
    const hashedResetToken = crypto.createHash('sha256').update(rawResetToken).digest('hex');

    await PrismaService.client.passwordReset.create({
      data: {
        userId: createdUserId,
        token: hashedResetToken,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const newPassword = 'BrandNewP@ssword999!';

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({
        token: rawResetToken,
        newPassword,
        confirmPassword: newPassword,
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);

    // Verify old password fails
    const oldLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      });
    assert.strictEqual(oldLoginRes.status, 401);

    // Verify new password succeeds
    const newLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: newPassword,
      });
    assert.strictEqual(newLoginRes.status, 200);
    assert.strictEqual(newLoginRes.body.success, true);
  });

  // 14. Token Expiration & Refresh
  it('rejects expired access token and refreshes with valid refresh token', async () => {
    // Create an expired access token (expired 10 seconds ago)
    const expiredToken = generateAccessToken(
      { sub: createdUserId, email: testEmail, role: 'USER' },
      '-10s'
    );

    const expiredRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    assert.strictEqual(expiredRes.status, 401);
    assert.strictEqual(expiredRes.body.error.code, 'TOKEN_EXPIRED');

    // Refresh token
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken: activeRefreshToken,
      });

    assert.strictEqual(refreshRes.status, 200);
    assert.strictEqual(refreshRes.body.success, true);
    assert.ok(refreshRes.body.data.accessToken);

    // Use refreshed token on protected route
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${refreshRes.body.data.accessToken}`);

    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.body.data.id, createdUserId);
  });

  // 15. Logout
  it('clears cookies on logout', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.loggedOut, true);

    const cookies = res.headers['set-cookie'];
    assert.ok(cookies);
    // Ensure access_token and refresh_token are cleared
    assert.ok(cookies.some((c: string) => c.includes('access_token=') && (c.includes('1970') || c.includes('Max-Age=0'))));
    assert.ok(cookies.some((c: string) => c.includes('refresh_token=') && (c.includes('1970') || c.includes('Max-Age=0'))));
  });
});
