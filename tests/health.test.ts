import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('Health & Database Readiness Endpoints', () => {
  const app = createApp();

  it('GET /health returns 200 with system health report and database checks', async () => {
    const res = await request(app).get('/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.service, 'ai-vision-studio-server');
    assert.ok(res.body.data.checks?.database);
    assert.strictEqual(res.body.data.checks.database.status, 'healthy');
    assert.ok(typeof res.body.data.checks.database.latencyMs === 'number');
  });

  it('GET /api/v1/health returns versioned system health', async () => {
    const res = await request(app).get('/api/v1/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.version, '1.0.0');
    assert.ok(res.body.data.system?.memoryUsageMb);
  });

  it('GET /api/v1/health/ready returns 200 with connected database readiness', async () => {
    const res = await request(app).get('/api/v1/health/ready');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.status, 'ready');
    assert.strictEqual(res.body.data.database, 'connected');
    assert.ok(typeof res.body.data.latencyMs === 'number');
  });

  it('GET /api/v1/health/live returns 200 liveness signal', async () => {
    const res = await request(app).get('/api/v1/health/live');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.status, 'alive');
    assert.ok(typeof res.body.data.uptime === 'number');
  });

  it('GET /api/v1/health/ping returns pong', async () => {
    const res = await request(app).get('/api/v1/health/ping');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.ping, 'pong');
  });
});
