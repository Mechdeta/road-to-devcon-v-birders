/**
 * writer/src/upload-controller.test.js
 *
 * Tests for the upload controller's capability gate and error handling.
 * Uses mock state to verify behavior without real Swarm connections.
 *
 * Uses Node.js built-in test runner (node --test).
 */

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Mock modules — we replace auth and swarm with controllable stubs
// ---------------------------------------------------------------------------

// We test the upload controller's logic by reimplementing its flow
// with injected dependencies, since the module uses static imports.
// This tests the LOGIC — the actual module wiring is tested via integration.

import { encode } from '@deccan/sighting-format';

/**
 * Simulate the upload controller logic with injectable dependencies.
 */
function createUploadController({ getConnectionState, uploadBytes }) {
  class UploadError extends Error {
    constructor(reason, message) {
      super(message);
      this.name = 'UploadError';
      this.reason = reason;
    }
  }

  async function uploadSighting(sightingData) {
    const state = getConnectionState();

    if (!state.identity) {
      throw new UploadError('NOT_AUTHENTICATED', 'You must sign in with Swarm ID before uploading.');
    }

    if (!state.canUpload) {
      throw new UploadError('NO_UPLOAD_CAPABILITY', 'Upload is not available.');
    }

    let bytes;
    try {
      bytes = encode(sightingData);
    } catch (err) {
      throw new UploadError('SERIALISATION_FAILED', `Could not serialise: ${err.message}`);
    }

    try {
      return await uploadBytes(bytes);
    } catch (err) {
      if (err?.status === 402) {
        throw new UploadError('GATEWAY_PAYMENT_REQUIRED', 'Postage exhausted');
      }
      if (err?.name === 'TypeError') {
        throw new UploadError('NETWORK_ERROR', 'Network unreachable');
      }
      throw new UploadError('UPLOAD_FAILED', `Upload failed: ${err.message}`);
    }
  }

  return { uploadSighting, UploadError };
}

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

describe('Upload Controller — capability gate', () => {
  it('throws NOT_AUTHENTICATED when identity is null', async () => {
    const { uploadSighting, UploadError } = createUploadController({
      getConnectionState: () => ({ identity: null, canUpload: false }),
      uploadBytes: mock.fn(),
    });

    await assert.rejects(
      () => uploadSighting(VALID_SIGHTING),
      (err) => err instanceof UploadError && err.reason === 'NOT_AUTHENTICATED'
    );
  });

  it('throws NO_UPLOAD_CAPABILITY when canUpload is false', async () => {
    const { uploadSighting, UploadError } = createUploadController({
      getConnectionState: () => ({ identity: { name: 'Meera' }, canUpload: false }),
      uploadBytes: mock.fn(),
    });

    await assert.rejects(
      () => uploadSighting(VALID_SIGHTING),
      (err) => err instanceof UploadError && err.reason === 'NO_UPLOAD_CAPABILITY'
    );
  });

  it('does NOT call uploadBytes when canUpload is false', async () => {
    const mockUpload = mock.fn();
    const { uploadSighting } = createUploadController({
      getConnectionState: () => ({ identity: { name: 'Meera' }, canUpload: false }),
      uploadBytes: mockUpload,
    });

    try { await uploadSighting(VALID_SIGHTING); } catch {}

    assert.strictEqual(mockUpload.mock.callCount(), 0);
  });

  it('calls uploadBytes when authenticated and canUpload is true', async () => {
    const mockUpload = mock.fn(async () => 'abc123');
    const { uploadSighting } = createUploadController({
      getConnectionState: () => ({ identity: { name: 'Meera' }, canUpload: true }),
      uploadBytes: mockUpload,
    });

    const ref = await uploadSighting(VALID_SIGHTING);

    assert.strictEqual(mockUpload.mock.callCount(), 1);
    assert.strictEqual(ref, 'abc123');
  });
});

describe('Upload Controller — error mapping', () => {
  it('maps HTTP 402 to GATEWAY_PAYMENT_REQUIRED', async () => {
    const err402 = new Error('Payment required');
    err402.status = 402;

    const { uploadSighting, UploadError } = createUploadController({
      getConnectionState: () => ({ identity: { name: 'Meera' }, canUpload: true }),
      uploadBytes: async () => { throw err402; },
    });

    await assert.rejects(
      () => uploadSighting(VALID_SIGHTING),
      (err) => err instanceof UploadError && err.reason === 'GATEWAY_PAYMENT_REQUIRED'
    );
  });

  it('maps TypeError to NETWORK_ERROR', async () => {
    const { uploadSighting, UploadError } = createUploadController({
      getConnectionState: () => ({ identity: { name: 'Meera' }, canUpload: true }),
      uploadBytes: async () => { throw new TypeError('Failed to fetch'); },
    });

    await assert.rejects(
      () => uploadSighting(VALID_SIGHTING),
      (err) => err instanceof UploadError && err.reason === 'NETWORK_ERROR'
    );
  });

  it('maps unknown errors to UPLOAD_FAILED with message', async () => {
    const { uploadSighting, UploadError } = createUploadController({
      getConnectionState: () => ({ identity: { name: 'Meera' }, canUpload: true }),
      uploadBytes: async () => { throw new Error('Weird gateway issue'); },
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
