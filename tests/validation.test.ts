import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express, { Express } from 'express';
import { z } from 'zod';
import { validateRequest, validateWebSocketHandshake } from '../src/middleware/validate.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { paginationQuerySchema, uuidParamSchema } from '../src/validators/common.validator.js';
import { sendSuccess } from '../src/utils/response.js';

describe('Validation Middleware & Schemas', () => {
  const createTestApp = (): Express => {
    const app = express();
    app.use(express.json());

    const bodySchema = z.object({
      title: z.string().min(3, 'Title must be at least 3 characters'),
      count: z.number().int().positive('Count must be positive'),
    });

    app.post(
      '/test-validate/:id',
      validateRequest({
        params: uuidParamSchema,
        body: bodySchema,
        query: paginationQuerySchema,
      }),
      (req, res) => {
        sendSuccess(res, { body: req.body, query: req.query, params: req.params });
      }
    );

    app.use(errorHandler);
    return app;
  };

  const app = createTestApp();
  const validUuid = '123e4567-e89b-12d3-a456-426614174000';

  it('passes validation when body, query, and params are valid', async () => {
    const res = await request(app)
      .post(`/test-validate/${validUuid}?page=2&limit=10`)
      .send({ title: 'Multimodal Session', count: 5 });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.body.title, 'Multimodal Session');
    assert.strictEqual(res.body.data.query.page, 2);
    assert.strictEqual(res.body.data.query.limit, 10);
    assert.strictEqual(res.body.data.params.id, validUuid);
  });

  it('returns 422 with structured issues when body validation fails', async () => {
    const res = await request(app)
      .post(`/test-validate/${validUuid}`)
      .send({ title: 'No', count: -1 });

    assert.strictEqual(res.status, 422);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(Array.isArray(res.body.error.details));
    assert.strictEqual(res.body.error.details.length, 2);
  });

  it('returns 422 when UUID parameter is malformed', async () => {
    const res = await request(app)
      .post('/test-validate/not-a-valid-uuid')
      .send({ title: 'Valid Title', count: 1 });

    assert.strictEqual(res.status, 422);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
    const fieldIssue = res.body.error.details.find((d: { field: string }) => d.field === 'id');
    assert.ok(fieldIssue);
  });

  it('validates WebSocket handshake parameters correctly', () => {
    const handshakeSchema = z.object({
      token: z.string().min(10),
      mode: z.enum(['camera', 'screen']),
    });

    const validHandshake = validateWebSocketHandshake<{ token: string; mode: string }>(
      { token: 'valid-token-string-12345', mode: 'camera' },
      handshakeSchema
    );
    assert.strictEqual(validHandshake.success, true);

    const invalidHandshake = validateWebSocketHandshake(
      { token: 'short', mode: 'invalid' },
      handshakeSchema
    );
    assert.strictEqual(invalidHandshake.success, false);
  });
});
