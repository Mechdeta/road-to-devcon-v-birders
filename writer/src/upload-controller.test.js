/**
 * writer/src/upload-controller.test.js
 *
 * Tests for the upload controller's capability gate and error handling.
 * Uses mock state to verify behavior without real Swarm connections.
 *
 * Uses Node.js built-in test runner (node --test).
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Production imports
// ---------------------------------------------------------------------------

import {
  createUploadController,
  uploadSighting,
  UploadError,
  MESSAGES,
  statusOf,
  classifyUploadError,
  isDeviceOffline,
} from './upload-controller.js';
import { BeeResponseError } from '@ethersphere/bee-js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const VALID_SIGHTING = {
  species: 'Indian Peafowl',
  location: { lat: 18.5204, lng: 73.8567 },
  observedAt: '2025-06-15T07:30:00+05:30',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MESSAGES table and Error copy', () => {
  it('every code has a non-empty title, message, and next action', () => {
    const codes = Object.keys(MESSAGES);
    assert.ok(codes.length >= 10, `Expected at least 10 error codes, got ${codes.length}`);

    for (const code of codes) {
      const entry = MESSAGES[code];
      assert.ok(entry, `Missing entry for code: ${code}`);
      assert.strictEqual(typeof entry.title, 'string', `${code} title must be string`);
      assert.ok(entry.title.trim().length > 0, `${code} title must not be empty`);
      assert.strictEqual(typeof entry.message, 'string', `${code} message must be string`);
      assert.ok(entry.message.trim().length > 0, `${code} message must not be empty`);
      assert.strictEqual(typeof entry.next, 'string', `${code} next must be string`);
      assert.ok(entry.next.trim().length > 0, `${code} next must not be empty`);
    }
  });

  it('no two failures share the same title', () => {
    const titlesSeen = new Map();

    for (const [code, entry] of Object.entries(MESSAGES)) {
      const normalized = entry.title.trim().toLowerCase();
      assert.ok(
        !titlesSeen.has(normalized),
        `Duplicate title "${entry.title}" found for codes "${titlesSeen.get(normalized)}" and "${code}"`
      );
      titlesSeen.set(normalized, code);
    }
  });

  it('UploadError instance populates title, message, next, and copy', () => {
    const err = new UploadError('OFFLINE');
    assert.strictEqual(err.reason, 'OFFLINE');
    assert.strictEqual(err.code, 'OFFLINE');
    assert.strictEqual(err.title, MESSAGES.OFFLINE.title);
    assert.strictEqual(err.message, MESSAGES.OFFLINE.message);
    assert.strictEqual(err.next, MESSAGES.OFFLINE.next);
    assert.deepStrictEqual(err.copy, MESSAGES.OFFLINE);
  });
});

describe('statusOf helper', () => {
  it('extracts status code from direct err.status property', () => {
    assert.strictEqual(statusOf({ status: 402 }), 402);
    assert.strictEqual(statusOf({ status: 500 }), 500);
  });

  it('extracts status code from nested err.response.status property', () => {
    assert.strictEqual(statusOf({ response: { status: 429 } }), 429);
    assert.strictEqual(statusOf({ response: { status: 503 } }), 503);
  });

  it('extracts status code from message string regex with HTTP context', () => {
    assert.strictEqual(
      statusOf(new Error('Subsidised chunk upload failed: 413 Payload Too Large - body')),
      413
    );
    assert.strictEqual(statusOf(new Error('error 429 too many requests')), 429);
    assert.strictEqual(statusOf(new Error('Internal Server Error (500)')), 500);
    assert.strictEqual(statusOf(new Error('HTTP 502 Bad Gateway')), 502);
    assert.strictEqual(statusOf(new Error('Request failed with status code 402')), 402);
  });

  it('does NOT classify non-HTTP numbers (e.g. "took 503 ms" or 64-hex hashes containing 502)', () => {
    assert.strictEqual(statusOf(new Error('Operation took 503 ms')), undefined);
    assert.strictEqual(
      statusOf(new Error('Stored at d2eb98083a7f9ce0f7e782727496e2ef3051c359643f587331abf1918ce3a6e4')),
      undefined
    );
    assert.strictEqual(
      statusOf(new Error('Reference 50298083a7f9ce0f7e782727496e2ef3051c359643f587331abf1918ce3a6e4 created')),
      undefined
    );
    assert.strictEqual(statusOf(new Error('Found 404 birds across 500 locations')), undefined);
  });

  it('classifies a real BeeResponseError instance from bee-js 13.1.0', () => {
    const realBeeErr = new BeeResponseError(
      'POST',
      'https://api.gateway.ethswarm.org/bytes',
      'Payment required',
      null,
      402,
      'Payment Required'
    );
    assert.strictEqual(statusOf(realBeeErr), 402);

    const classified = classifyUploadError(realBeeErr, () => true);
    assert.strictEqual(classified.reason, 'GATEWAY_PAYMENT_REQUIRED');
    assert.strictEqual(classified.title, MESSAGES.GATEWAY_PAYMENT_REQUIRED.title);
  });

  it('returns undefined when no status code is present', () => {
    assert.strictEqual(statusOf(new Error('Failed to fetch')), undefined);
    assert.strictEqual(statusOf(new TypeError('NetworkError')), undefined);
    assert.strictEqual(statusOf(null), undefined);
    assert.strictEqual(statusOf(undefined), undefined);
  });
});

describe('Upload Controller — capability gate', () => {
  it('throws OFFLINE when offline before checking Swarm ID', async () => {
    const { uploadSighting, UploadError } = createUploadController({
      isOffline: () => true,
      getConnectionInfo: () => ({ identity: { name: 'Meera' }, canUpload: true }),
      uploadBytes: mock.fn(),
    });

    await assert.rejects(
      () => uploadSighting(VALID_SIGHTING),
      (err) => err instanceof UploadError && err.reason === 'OFFLINE'
    );
  });

  it('throws SWARM_ID_UNAVAILABLE when reading connectionInfo throws before initialize completes', async () => {
    const { uploadSighting, UploadError } = createUploadController({
      getConnectionInfo: () => {
        throw new Error('Swarm ID is not initialised.');
      },
      uploadBytes: mock.fn(),
    });

    await assert.rejects(
      () => uploadSighting(VALID_SIGHTING),
      (err) => err instanceof UploadError &&
               err.reason === 'SWARM_ID_UNAVAILABLE' &&
               err.title === MESSAGES.SWARM_ID_UNAVAILABLE.title
    );
  });

  it('throws NOT_AUTHENTICATED when identity is null', async () => {
    const { uploadSighting, UploadError } = createUploadController({
      getConnectionInfo: () => ({ identity: null, canUpload: false }),
      uploadBytes: mock.fn(),
    });

    await assert.rejects(
      () => uploadSighting(VALID_SIGHTING),
      (err) => err instanceof UploadError && err.reason === 'NOT_AUTHENTICATED'
    );
  });

  it('throws NO_UPLOAD_CAPABILITY when canUpload is false (generic)', async () => {
    const { uploadSighting, UploadError } = createUploadController({
      getConnectionInfo: () => ({ identity: { name: 'Meera' }, canUpload: false }),
      uploadBytes: mock.fn(),
    });

    await assert.rejects(
      () => uploadSighting(VALID_SIGHTING),
      (err) => err instanceof UploadError && err.reason === 'NO_UPLOAD_CAPABILITY'
    );
  });

  it('throws specific NO_UPLOAD_CAPABILITY message when uploadUnavailableReason is no-stamp', async () => {
    const { uploadSighting, UploadError } = createUploadController({
      getConnectionInfo: () => ({
        identity: { name: 'Meera' },
        canUpload: false,
        uploadUnavailableReason: 'no-stamp',
      }),
      uploadBytes: mock.fn(),
    });

    await assert.rejects(
      () => uploadSighting(VALID_SIGHTING),
      (err) => err instanceof UploadError &&
               err.reason === 'NO_UPLOAD_CAPABILITY' &&
               err.message.includes('lacks a postage stamp')
    );
  });

  it('throws specific NO_UPLOAD_CAPABILITY message when uploadUnavailableReason is stamper-failed', async () => {
    const { uploadSighting, UploadError } = createUploadController({
      getConnectionInfo: () => ({
        identity: { name: 'Meera' },
        canUpload: false,
        uploadUnavailableReason: 'stamper-failed',
      }),
      uploadBytes: mock.fn(),
    });

    await assert.rejects(
      () => uploadSighting(VALID_SIGHTING),
      (err) => err instanceof UploadError &&
               err.reason === 'NO_UPLOAD_CAPABILITY' &&
               err.message.includes('stamper could not be prepared')
    );
  });

  it('detects stale cached state: cached state was canUpload=true but fresh client is canUpload=false', async () => {
    const mockUpload = mock.fn();
    const { uploadSighting, UploadError } = createUploadController({
      // Stale cached state
      getConnectionState: () => ({ identity: { name: 'Meera' }, canUpload: true }),
      // Fresh client reading
      getClient: () => ({
        connectionInfo: {
          identity: { name: 'Meera' },
          canUpload: false,
          uploadUnavailableReason: 'no-stamp',
        },
      }),
      uploadBytes: mockUpload,
    });

    await assert.rejects(
      () => uploadSighting(VALID_SIGHTING),
      (err) => err instanceof UploadError && err.reason === 'NO_UPLOAD_CAPABILITY'
    );
    assert.strictEqual(mockUpload.mock.callCount(), 0);
  });

  it('gate runs BEFORE encode() and BEFORE any upload call', async () => {
    const mockUpload = mock.fn();
    const { uploadSighting, UploadError } = createUploadController({
      getConnectionInfo: () => ({ identity: null, canUpload: false }),
      uploadBytes: mockUpload,
    });

    // Pass invalid sighting data (missing species, etc.)
    // If gate runs before encode, it must throw NOT_AUTHENTICATED, NOT SERIALISATION_FAILED!
    await assert.rejects(
      () => uploadSighting({ species: '' }),
      (err) => err instanceof UploadError && err.reason === 'NOT_AUTHENTICATED'
    );
    assert.strictEqual(mockUpload.mock.callCount(), 0);
  });

  it('does NOT call uploadBytes when canUpload is false', async () => {
    const mockUpload = mock.fn();
    const { uploadSighting } = createUploadController({
      getConnectionInfo: () => ({ identity: { name: 'Meera' }, canUpload: false }),
      uploadBytes: mockUpload,
    });

    try { await uploadSighting(VALID_SIGHTING); } catch {}

    assert.strictEqual(mockUpload.mock.callCount(), 0);
  });

  it('calls uploadBytes when authenticated and canUpload is true', async () => {
    const mockUpload = mock.fn(async () => 'abc123');
    const { uploadSighting } = createUploadController({
      getConnectionInfo: () => ({ identity: { name: 'Meera' }, canUpload: true }),
      uploadBytes: mockUpload,
    });

    const ref = await uploadSighting(VALID_SIGHTING);

    assert.strictEqual(mockUpload.mock.callCount(), 1);
    assert.strictEqual(ref, 'abc123');
  });

  it('default export uploadSighting throws NOT_AUTHENTICATED when unauthenticated', async () => {
    await assert.rejects(
      () => uploadSighting(VALID_SIGHTING),
      (err) => err instanceof UploadError &&
               (err.reason === 'NOT_AUTHENTICATED' || err.reason === 'SWARM_ID_UNAVAILABLE')
    );
  });
});

describe('Upload Controller — error mapping', () => {
  it('maps to OFFLINE when device is offline', async () => {
    const { uploadSighting, UploadError } = createUploadController({
      getConnectionState: () => ({ identity: { name: 'Meera' }, canUpload: true }),
      uploadBytes: async () => { throw new TypeError('Failed to fetch'); },
      isOnline: () => false,
    });

    await assert.rejects(
      () => uploadSighting(VALID_SIGHTING),
      (err) => err instanceof UploadError && err.reason === 'OFFLINE'
    );
  });

  it('maps TypeError "Failed to fetch" with onLine=true to GATEWAY_UNREACHABLE', async () => {
    const { uploadSighting, UploadError } = createUploadController({
      getConnectionState: () => ({ identity: { name: 'Meera' }, canUpload: true }),
      uploadBytes: async () => { throw new TypeError('Failed to fetch'); },
      isOnline: () => true,
    });

    await assert.rejects(
      () => uploadSighting(VALID_SIGHTING),
      (err) => err instanceof UploadError && err.reason === 'GATEWAY_UNREACHABLE'
    );
  });

  it('maps HTTP 402 to GATEWAY_PAYMENT_REQUIRED', async () => {
    const err402 = new Error('Payment required');
    err402.status = 402;

    const { uploadSighting, UploadError } = createUploadController({
      getConnectionState: () => ({ identity: { name: 'Meera' }, canUpload: true }),
      uploadBytes: async () => { throw err402; },
      isOnline: () => true,
    });

    await assert.rejects(
      () => uploadSighting(VALID_SIGHTING),
      (err) => err instanceof UploadError && err.reason === 'GATEWAY_PAYMENT_REQUIRED'
    );
  });

  it('maps HTTP 403 to GATEWAY_FORBIDDEN', async () => {
    const err403 = new Error('Forbidden');
    err403.status = 403;

    const { uploadSighting, UploadError } = createUploadController({
      getConnectionState: () => ({ identity: { name: 'Meera' }, canUpload: true }),
      uploadBytes: async () => { throw err403; },
      isOnline: () => true,
    });

    await assert.rejects(
      () => uploadSighting(VALID_SIGHTING),
      (err) => err instanceof UploadError && err.reason === 'GATEWAY_FORBIDDEN'
    );
  });

  it('maps HTTP 413 to PAYLOAD_TOO_LARGE', async () => {
    const err413 = new Error('Payload Too Large');
    err413.status = 413;

    const { uploadSighting, UploadError } = createUploadController({
      getConnectionState: () => ({ identity: { name: 'Meera' }, canUpload: true }),
      uploadBytes: async () => { throw err413; },
      isOnline: () => true,
    });

    await assert.rejects(
      () => uploadSighting(VALID_SIGHTING),
      (err) => err instanceof UploadError && err.reason === 'PAYLOAD_TOO_LARGE'
    );
  });

  it('maps HTTP 429 to RATE_LIMITED', async () => {
    const err429 = new Error('Too many requests');
    err429.status = 429;

    const { uploadSighting, UploadError } = createUploadController({
      getConnectionState: () => ({ identity: { name: 'Meera' }, canUpload: true }),
      uploadBytes: async () => { throw err429; },
      isOnline: () => true,
    });

    await assert.rejects(
      () => uploadSighting(VALID_SIGHTING),
      (err) => err instanceof UploadError && err.reason === 'RATE_LIMITED'
    );
  });

  it('maps HTTP 5xx to GATEWAY_5XX', async () => {
    const err500 = new Error('Internal Server Error: 500');

    const { uploadSighting, UploadError } = createUploadController({
      getConnectionState: () => ({ identity: { name: 'Meera' }, canUpload: true }),
      uploadBytes: async () => { throw err500; },
      isOnline: () => true,
    });

    await assert.rejects(
      () => uploadSighting(VALID_SIGHTING),
      (err) => err instanceof UploadError && err.reason === 'GATEWAY_5XX'
    );
  });

  it('maps timeout or abort errors to TIMEOUT', async () => {
    const errTimeout = new Error('Gateway request timed out');
    errTimeout.name = 'TimeoutError';

    const { uploadSighting, UploadError } = createUploadController({
      getConnectionState: () => ({ identity: { name: 'Meera' }, canUpload: true }),
      uploadBytes: async () => { throw errTimeout; },
      isOnline: () => true,
    });

    await assert.rejects(
      () => uploadSighting(VALID_SIGHTING),
      (err) => err instanceof UploadError && err.reason === 'TIMEOUT'
    );
  });

  it('maps unknown errors to UPLOAD_FAILED with message', async () => {
    const { uploadSighting, UploadError } = createUploadController({
      getConnectionState: () => ({ identity: { name: 'Meera' }, canUpload: true }),
      uploadBytes: async () => { throw new Error('Weird gateway issue'); },
      isOnline: () => true,
    });

    await assert.rejects(
      () => uploadSighting(VALID_SIGHTING),
      (err) => err instanceof UploadError &&
               err.reason === 'UPLOAD_FAILED' &&
               err.message.includes('Weird gateway issue')
    );
  });

  it('maps invalid sighting data to SERIALISATION_FAILED', async () => {
    const { uploadSighting, UploadError } = createUploadController({
      getConnectionState: () => ({ identity: { name: 'Meera' }, canUpload: true }),
      uploadBytes: mock.fn(),
    });

    await assert.rejects(
      () => uploadSighting({ species: '' }), // missing required fields
      (err) => err instanceof UploadError && err.reason === 'SERIALISATION_FAILED'
    );
  });
});
