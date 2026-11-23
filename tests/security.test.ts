import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express, { Express } from 'express';
import { createApp } from '../src/app.js';
import { hashPassword, comparePassword, passwordComplexitySchema } from '../src/utils/password.js';
import { generateAccessToken, verifyAccessToken } from '../src/utils/token.js';
import { requireInternalKey, requireRole, requireAuth } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { env } from '../src/config/index.js';
import { sendSuccess } from '../src/utils/response.js';

describe('Security & Authentication Infrastructure', () => {
  const app = createApp();

  describe('Security Headers & Request ID', () => {
    it('sets security headers via Helmet', async () => {
      const res = await request(app).get('/health');
      assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
      assert.ok(res.headers['referrer-policy']);
    });

    it('generates X-Request-Id when caller does not supply one', async () => {
      const res = await request(app).get('/health');
      assert.ok(res.headers['x-request-id']);
      assert.ok(res.body.meta?.requestId);
      assert.strictEqual(res.headers['x-request-id'], res.body.meta.requestId);
    });

    it('preserves incoming X-Request-Id header', async () => {
      const customId = 'client-trace-123456';
      const res = await request(app).get('/health').set('X-Request-Id', customId);
      assert.strictEqual(res.headers['x-request-id'], customId);
      assert.strictEqual(res.body.meta?.requestId, customId);
    });
  });

  describe('Password Security Infrastructure', () => {
    it('hashes passwords securely and verifies matching hashes', async () => {
      const plain = 'P@ssword123!Secure';
      const hash = await hashPassword(plain);

      assert.ok(hash.startsWith('$2'));
      assert.strictEqual(await comparePassword(plain, hash), true);
      assert.strictEqual(await comparePassword('WrongPassword1!', hash), false);
    });

    it('validates password complexity with Zod schema', () => {
      assert.strictEqual(passwordComplexitySchema.safeParse('Str0ng!Pass').success, true);
      assert.strictEqual(passwordComplexitySchema.safeParse('alllowercase1!').success, false);
      assert.strictEqual(passwordComplexitySchema.safeParse('NOLOWERCASE1!').success, false);
      assert.strictEqual(passwordComplexitySchema.safeParse('NoSpecialChar123').success, false);
      assert.strictEqual(passwordComplexitySchema.safeParse('Sh0rt!').success, false);
    });
  });

  describe('Token Security Infrastructure', () => {
    it('generates and verifies JWT tokens', () => {
      const payload = { sub: 'user-uuid-123', email: 'user@example.com', role: 'USER' };
      const token = generateAccessToken(payload, '1h');
      const verified = verifyAccessToken<typeof payload>(token);

      assert.strictEqual(verified.sub, payload.sub);
      assert.strictEqual(verified.email, payload.email);
    });
  });

  describe('Inter-Service & Auth Guards', () => {
    const testApp: Express = express();
    testApp.use(express.json());

    testApp.get('/test-internal', requireInternalKey, (_req, res) => {
      sendSuccess(res, { internal: true });
    });

    testApp.get('/test-auth', requireAuth, (_req, res) => {
      sendSuccess(res, { authenticated: true });
    });

    testApp.get('/test-admin', (req, _res, next) => {
      req.user = {
        id: 'user-1',
        email: 'user@example.com',
        role: 'USER',
        accountStatus: 'ACTIVE',
        creditBalance: 100,
      };
      next();
    }, requireRole('ADMIN'), (_req, res) => {
      sendSuccess(res, { admin: true });
    });

    testApp.use(errorHandler);

    it('rejects internal endpoint when x-internal-key is missing', async () => {
      const res = await request(testApp).get('/test-internal');
      assert.strictEqual(res.status, 403);
    });

    it('allows internal endpoint when x-internal-key is valid', async () => {
      const res = await request(testApp)
        .get('/test-internal')
        .set('x-internal-key', env.INTERNAL_SERVICE_KEY);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
    });

    it('rejects unauthenticated requests to requireAuth route with 401', async () => {
      const res = await request(testApp).get('/test-auth');
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
    });

    it('rejects non-admin users to requireRole(ADMIN) with 403', async () => {
      const res = await request(testApp).get('/test-admin');
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error.code, 'FORBIDDEN');
    });
  });
});
