import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('API Documentation Endpoints', () => {
  const app = createApp();

  it('GET /api/docs returns 200 with HTML documentation page', async () => {
    const res = await request(app).get('/api/docs');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/html'));
    assert.ok(res.text.includes('AI Vision Studio — Developer API'));
    assert.ok(res.text.includes('/api/v1/health'));
  });

  it('GET /api/docs/spec returns OpenAPI 3.1 JSON document', async () => {
    const res = await request(app).get('/api/docs/spec');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.openapi, '3.1.0');
    assert.strictEqual(res.body.info.title, 'AI Vision Studio API');
    assert.ok(res.body.paths['/api/v1/health']);
    assert.ok(res.body.paths['/api/v1/health/ready']);
  });
});
