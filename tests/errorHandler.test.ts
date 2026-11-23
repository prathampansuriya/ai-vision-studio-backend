import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express, { Express } from 'express';
import { createApp } from '../src/app.js';
import { AppError } from '../src/utils/appError.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

describe('Centralized Error Handling', () => {
  const app = createApp();

  it('returns 404 with NOT_FOUND code for non-existent routes', async () => {
    const res = await request(app).get('/api/v1/unknown-endpoint-route');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'NOT_FOUND');
    assert.ok(res.body.meta?.timestamp);
  });

  it('returns 400 Bad Request when JSON payload is malformed', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{ "broken": json-payload');

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'BAD_REQUEST');
  });

  it('handles custom AppError operational exceptions cleanly', async () => {
    const testApp: Express = express();
    testApp.get('/test-error', () => {
      throw AppError.conflict('A session with this identifier already exists');
    });
    testApp.use(errorHandler);

    const res = await request(testApp).get('/test-error');
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'CONFLICT');
    assert.strictEqual(res.body.error.message, 'A session with this identifier already exists');
  });
});
