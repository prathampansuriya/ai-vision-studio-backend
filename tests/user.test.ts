import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { PrismaService } from '../src/services/prisma.service.js';
import { generateAccessToken } from '../src/utils/token.js';
import { hashPassword } from '../src/utils/password.js';

describe('User Profile, Account Settings & Media Upload Suite', () => {
  const app = createApp();

  const localUserEmail = `local_profile_${Date.now()}@example.com`;
  const googleUserEmail = `google_profile_${Date.now()}@example.com`;

  let localUserId: string;
  let localUserToken: string;
  let googleUserId: string;
  let googleUserToken: string;

  before(async () => {
    await PrismaService.pingDatabase();

    // 1. Create a local password user
    const initialPasswordHash = await hashPassword('LocalPass123!@#');
    const localUser = await PrismaService.client.user.create({
      data: {
        email: localUserEmail,
        name: 'Morgan Local',
        passwordHash: initialPasswordHash,
        authProvider: 'LOCAL',
        accountStatus: 'ACTIVE',
        emailVerified: true,
        role: 'USER',
        profile: {
          create: {
            headline: 'Senior Vision Architect',
            bio: 'Multimodal AI systems engineer',
            company: 'Visionary Labs',
            location: 'San Francisco, CA',
            timezone: 'America/Los_Angeles',
            preferredLanguage: 'en',
            theme: 'dark',
          },
        },
      },
    });
    localUserId = localUser.id;
    localUserToken = generateAccessToken({
      sub: localUserId,
      email: localUserEmail,
      role: 'USER',
    });

    // 2. Create a Google-only SSO user (authProvider: GOOGLE, passwordHash: null)
    const googleUser = await PrismaService.client.user.create({
      data: {
        email: googleUserEmail,
        name: 'Riley Google SSO',
        passwordHash: null,
        authProvider: 'GOOGLE',
        accountStatus: 'ACTIVE',
        emailVerified: true,
        role: 'USER',
        profile: {
          create: {
            theme: 'system',
            preferredLanguage: 'en',
          },
        },
        oauthAccounts: {
          create: {
            provider: 'google',
            providerAccountId: `google_sub_${Date.now()}`,
            email: googleUserEmail,
            profilePicture: 'https://lh3.googleusercontent.com/a/mock-pic',
          },
        },
      },
    });
    googleUserId = googleUser.id;
    googleUserToken = generateAccessToken({
      sub: googleUserId,
      email: googleUserEmail,
      role: 'USER',
    });
  });

  after(async () => {
    // Clean up created test accounts
    if (localUserId) {
      await PrismaService.client.user.delete({ where: { id: localUserId } }).catch(() => {});
    }
    if (googleUserId) {
      await PrismaService.client.user.delete({ where: { id: googleUserId } }).catch(() => {});
    }
  });

  // ==============================================================================
  // 1. Profile Retrieval & Data Privacy
  // ==============================================================================
  describe('GET /api/v1/user/profile', () => {
    it('should return 401 Unauthorized when missing access token', async () => {
      const res = await request(app).get('/api/v1/user/profile');
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
    });

    it('should retrieve full user profile and omit passwordHash', async () => {
      const res = await request(app)
        .get('/api/v1/user/profile')
        .set('Authorization', `Bearer ${localUserToken}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      const data = res.body.data;

      assert.strictEqual(data.id, localUserId);
      assert.strictEqual(data.email, localUserEmail);
      assert.strictEqual(data.name, 'Morgan Local');
      assert.strictEqual(data.authProvider, 'LOCAL');
      assert.strictEqual(data.emailVerified, true);
      assert.strictEqual(data.profile.headline, 'Senior Vision Architect');
      assert.strictEqual(data.profile.company, 'Visionary Labs');
      assert.strictEqual(data.profile.location, 'San Francisco, CA');
      assert.strictEqual(data.profile.theme, 'dark');

      // CRITICAL SECURITY ASSERTION: passwordHash must NEVER be exposed
      assert.strictEqual(data.passwordHash, undefined);
      assert.strictEqual((res.body as any).passwordHash, undefined);
    });
  });

  // ==============================================================================
  // 2. Profile Details Update
  // ==============================================================================
  describe('PATCH /api/v1/user/profile', () => {
    it('should update user name and profile metadata successfully', async () => {
      const updatePayload = {
        name: 'Morgan Visionary Updated',
        headline: 'Lead Multimodal Engineer',
        bio: 'Updated bio testing real-time pipelines',
        company: 'Autonomous Systems Inc.',
        location: 'Seattle, WA',
        timezone: 'America/Los_Angeles',
        theme: 'light',
        preferredLanguage: 'en',
      };

      const res = await request(app)
        .patch('/api/v1/user/profile')
        .set('Authorization', `Bearer ${localUserToken}`)
        .send(updatePayload);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      const data = res.body.data;

      assert.strictEqual(data.name, 'Morgan Visionary Updated');
      assert.strictEqual(data.profile.headline, 'Lead Multimodal Engineer');
      assert.strictEqual(data.profile.bio, 'Updated bio testing real-time pipelines');
      assert.strictEqual(data.profile.company, 'Autonomous Systems Inc.');
      assert.strictEqual(data.profile.location, 'Seattle, WA');
      assert.strictEqual(data.profile.theme, 'light');
    });

    it('should reject invalid profile data failing zod schema', async () => {
      const res = await request(app)
        .patch('/api/v1/user/profile')
        .set('Authorization', `Bearer ${localUserToken}`)
        .send({
          name: 'A', // Too short (min 2)
          theme: 'invalid-theme-variant',
        });

      assert.strictEqual(res.status, 422);
      assert.strictEqual(res.body.success, false);
    });
  });

  // ==============================================================================
  // 3. Avatar Update & Cloudinary Signature Endpoints
  // ==============================================================================
  describe('Avatar & Media Upload Infrastructure', () => {
    it('should generate a validated upload signature without exposing API secret', async () => {
      const res = await request(app)
        .post('/api/v1/upload/signature')
        .set('Authorization', `Bearer ${localUserToken}`)
        .send({ folder: 'ai-vision-studio/avatars' });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      const signatureData = res.body.data;

      assert.ok(signatureData.timestamp);
      assert.ok(signatureData.signature);
      assert.ok(signatureData.apiKey);
      assert.ok(signatureData.cloudName);
      assert.strictEqual(signatureData.folder, 'ai-vision-studio/avatars');

      // Ensure secret is never returned
      assert.strictEqual(signatureData.apiSecret, undefined);
      assert.strictEqual(signatureData.CLOUDINARY_API_SECRET, undefined);
    });

    it('should upload avatar via server-side pipeline and update user profile', async () => {
      // 1x1 transparent PNG data URI
      const validPngDataUri =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

      const res = await request(app)
        .post('/api/v1/upload/avatar')
        .set('Authorization', `Bearer ${localUserToken}`)
        .send({ image: validPngDataUri });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.url);
      assert.ok(res.body.data.publicId);
      assert.ok(res.body.data.profile);
      assert.strictEqual(res.body.data.profile.avatarUrl, res.body.data.url);
    });

    it('should reject invalid image format on server-side upload', async () => {
      const invalidDataUri = 'data:text/plain;base64,SGVsbG8gV29ybGQ=';

      const res = await request(app)
        .post('/api/v1/upload/avatar')
        .set('Authorization', `Bearer ${localUserToken}`)
        .send({ image: invalidDataUri });

      assert.strictEqual(res.status, 422);
      assert.strictEqual(res.body.success, false);
    });

    it('should update avatar URL directly via PATCH /api/v1/user/avatar', async () => {
      const newAvatarUrl = 'https://res.cloudinary.com/demo/image/upload/v1/custom-avatar.webp';

      const res = await request(app)
        .patch('/api/v1/user/avatar')
        .set('Authorization', `Bearer ${localUserToken}`)
        .send({ avatarUrl: newAvatarUrl });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.avatarUrl, newAvatarUrl);
    });
  });

  // ==============================================================================
  // 4. Password Change & Google SSO Guardrails
  // ==============================================================================
  describe('PATCH /api/v1/user/password', () => {
    it('should fail when current password is incorrect', async () => {
      const res = await request(app)
        .patch('/api/v1/user/password')
        .set('Authorization', `Bearer ${localUserToken}`)
        .send({
          currentPassword: 'WrongPassword123!@#',
          newPassword: 'BrandNewPassword456!@#',
          confirmPassword: 'BrandNewPassword456!@#',
        });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.error.message, /current password entered is incorrect/i);
    });

    it('should fail when new password does not meet complexity requirements', async () => {
      const res = await request(app)
        .patch('/api/v1/user/password')
        .set('Authorization', `Bearer ${localUserToken}`)
        .send({
          currentPassword: 'LocalPass123!@#',
          newPassword: 'simple', // Fails complexity
          confirmPassword: 'simple',
        });

      assert.strictEqual(res.status, 422);
      assert.strictEqual(res.body.success, false);
    });

    it('should fail when new password is the same as current password', async () => {
      const res = await request(app)
        .patch('/api/v1/user/password')
        .set('Authorization', `Bearer ${localUserToken}`)
        .send({
          currentPassword: 'LocalPass123!@#',
          newPassword: 'LocalPass123!@#',
          confirmPassword: 'LocalPass123!@#',
        });

      assert.strictEqual(res.status, 422);
      assert.strictEqual(res.body.success, false);
      assert.match(JSON.stringify(res.body.error), /different from current password/i);
    });

    it('should successfully update password for local account with valid credentials', async () => {
      const res = await request(app)
        .patch('/api/v1/user/password')
        .set('Authorization', `Bearer ${localUserToken}`)
        .send({
          currentPassword: 'LocalPass123!@#',
          newPassword: 'BrandNewPassword456!@#',
          confirmPassword: 'BrandNewPassword456!@#',
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);

      // Verify the new password allows login
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: localUserEmail,
          password: 'BrandNewPassword456!@#',
        });

      assert.strictEqual(loginRes.status, 200);
      assert.strictEqual(loginRes.body.success, true);
    });

    it('CRITICAL GUARDRAIL: should reject password change for Google-only SSO accounts', async () => {
      const res = await request(app)
        .patch('/api/v1/user/password')
        .set('Authorization', `Bearer ${googleUserToken}`)
        .send({
          currentPassword: 'AnyPassword123!@#',
          newPassword: 'NewGooglePassword456!@#',
          confirmPassword: 'NewGooglePassword456!@#',
        });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(
        res.body.error.message,
        /authenticated via Google\. Password management is not applicable/i
      );
    });
  });

  // ==============================================================================
  // 5. Connected Accounts Endpoint
  // ==============================================================================
  describe('GET /api/v1/user/connected-accounts', () => {
    it('should return empty list for local-only account', async () => {
      const res = await request(app)
        .get('/api/v1/user/connected-accounts')
        .set('Authorization', `Bearer ${localUserToken}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.strictEqual(res.body.data.length, 0);
    });

    it('should return Google OAuth account details for linked SSO account', async () => {
      const res = await request(app)
        .get('/api/v1/user/connected-accounts')
        .set('Authorization', `Bearer ${googleUserToken}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.strictEqual(res.body.data.length, 1);

      const linkedAccount = res.body.data[0];
      assert.strictEqual(linkedAccount.provider, 'google');
      assert.strictEqual(linkedAccount.email, googleUserEmail);
      assert.strictEqual(linkedAccount.profilePicture, 'https://lh3.googleusercontent.com/a/mock-pic');
    });
  });
});
