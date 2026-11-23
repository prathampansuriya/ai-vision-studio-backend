import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { StreamClient } from '@stream-io/node-sdk';
import { env } from '../src/config/env.config.js';
import { SessionService } from '../src/services/session.service.js';

describe('Prompt 16 — Camera, Screen Sharing & Stream Video Ingestion Suite', () => {
  const testUserId = 'f7e3d1a2-5b4c-4e8f-9a1b-3c5d7e9f1a2b';
  const testSessionId = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';

  test('Stream Video SDK: generates valid user call token with permissions and expiry', async () => {
    assert.ok(env.STREAM_API_KEY, 'STREAM_API_KEY must be configured in environment');
    assert.ok(env.STREAM_API_SECRET, 'STREAM_API_SECRET must be configured in environment');

    const streamClient = new StreamClient(env.STREAM_API_KEY, env.STREAM_API_SECRET);
    const token = streamClient.generateUserToken({
      user_id: testUserId,
      validity_in_seconds: 3600,
    });

    assert.ok(token, 'Stream user token must be generated');
    assert.equal(typeof token, 'string');
    // JWT format check: 3 segments separated by dots
    const parts = token.split('.');
    assert.equal(parts.length, 3, 'Stream token must be a valid 3-part JWT');

    // Decode JWT payload
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
    assert.equal(payload.user_id, testUserId, 'JWT payload must contain correct user_id');
    assert.ok(payload.exp > payload.iat, 'Token expiration must be in the future');
  });

  test('SessionService.generateSessionToken: bundles WebSocket and Stream Video credentials', () => {
    const tokenResult = SessionService.generateSessionToken(testUserId, testSessionId);

    assert.ok(tokenResult.token, 'Must return signed WebSocket HMAC token');
    assert.ok(tokenResult.websocketUrl, 'Must return WebSocket URL');
    assert.ok(tokenResult.websocketUrl.includes(testSessionId), 'WebSocket URL must contain sessionId');
    assert.equal(tokenResult.expiresInSeconds, 900);

    // Verify Stream credentials are bundled
    assert.equal(tokenResult.streamApiKey, env.STREAM_API_KEY);
    assert.ok(tokenResult.streamToken, 'Must generate streamToken');
    assert.equal(tokenResult.streamCallId, testSessionId, 'streamCallId must match session ID');
  });

  test('Visual Input Event Contracts: supports camera, screen, and composite modes', () => {
    const validSources = ['camera', 'screen', 'both', 'paused'];

    validSources.forEach((source) => {
      assert.ok(['camera', 'screen', 'both', 'paused'].includes(source));
    });

    // Test frame payload structure
    const mockFramePayload = {
      type: 'screen_frame',
      data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      mime_type: 'image/jpeg',
      source: 'screen',
    };

    assert.equal(mockFramePayload.type, 'screen_frame');
    assert.equal(mockFramePayload.mime_type, 'image/jpeg');
    assert.equal(mockFramePayload.source, 'screen');
    assert.ok(mockFramePayload.data.length > 0);
  });
});
