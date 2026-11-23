import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import { sendSuccess, sendPaginated, sendError } from '../src/utils/response.js';
import { calculateSkipTake, createPaginationMeta, buildPaginatedResult } from '../src/utils/pagination.js';
import { sanitizeSearchQuery, parseDateRange, parseSortOrder } from '../src/utils/queryFilter.js';

describe('API Response & Pagination Utilities', () => {
  const app = express();

  app.get('/test-success', (_req, res) => {
    sendSuccess(res, { name: 'AI Vision Studio' }, 'Fetched successfully', 200);
  });

  app.get('/test-paginated', (_req, res) => {
    const items = [{ id: '1' }, { id: '2' }];
    sendPaginated(res, items, 50, 2, 10, 'Paginated list');
  });

  app.get('/test-error', (_req, res) => {
    sendError(res, 'Custom error message', 400, 'CUSTOM_ERROR', { field: 'email' });
  });

  it('formats standard success response correctly', async () => {
    const res = await request(app).get('/test-success');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.message, 'Fetched successfully');
    assert.strictEqual(res.body.data.name, 'AI Vision Studio');
    assert.ok(res.body.meta?.timestamp);
  });

  it('formats paginated response with comprehensive pagination metadata', async () => {
    const res = await request(app).get('/test-paginated');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.items.length, 2);
    assert.strictEqual(res.body.data.total, 50);
    assert.strictEqual(res.body.data.page, 2);
    assert.strictEqual(res.body.data.limit, 10);
    assert.strictEqual(res.body.data.totalPages, 5);
    assert.strictEqual(res.body.data.hasNextPage, true);
    assert.strictEqual(res.body.data.hasPrevPage, true);
  });

  it('calculates skip/take accurately', () => {
    const p1 = calculateSkipTake(1, 20);
    assert.strictEqual(p1.skip, 0);
    assert.strictEqual(p1.take, 20);

    const p3 = calculateSkipTake(3, 15);
    assert.strictEqual(p3.skip, 30);
    assert.strictEqual(p3.take, 15);
  });

  it('sanitizes search queries and parses date ranges', () => {
    assert.strictEqual(sanitizeSearchQuery('   multimodal AI   '), 'multimodal AI');
    assert.strictEqual(sanitizeSearchQuery(''), undefined);

    const range = parseDateRange('2026-01-01T00:00:00.000Z', '2026-01-31T23:59:59.999Z');
    assert.ok(range?.gte instanceof Date);
    assert.ok(range?.lte instanceof Date);

    assert.strictEqual(parseSortOrder('asc'), 'asc');
    assert.strictEqual(parseSortOrder('invalid'), 'desc');
  });
});
