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
// Production imports
// ---------------------------------------------------------------------------

import {
  createUploadController,
  uploadSighting,
  UploadError,
} from './upload-controller.js';

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

  it('default export uploadSighting throws NOT_AUTHENTICATED when unauthenticated', async () => {
    await assert.rejects(
      () => uploadSighting(VALID_SIGHTING),
      (err) => err instanceof UploadError && err.reason === 'NOT_AUTHENTICATED'
    );
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
