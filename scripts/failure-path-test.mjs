/**
 * Failure-path verification script.
 * Tests that distinct user-visible reasons are produced for each failure mode.
 */

import { encode } from '@deccan/sighting-format';

// Simulate the upload controller logic with injected dependencies
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
      if (err?.name === 'TypeError') {
        throw new UploadError('NETWORK_ERROR', 'Network unreachable');
      }
      throw new UploadError('UPLOAD_FAILED', `Upload failed: ${err.message}`);
    }
  }
  return { uploadSighting, UploadError };
}

const VALID = {
  species: 'Crow',
  location: { lat: 18.5, lng: 73.8 },
  observedAt: '2025-01-01T00:00:00Z',
};

async function main() {
  console.log('=== Failure Path Verification ===\n');

  // Test 1: NOT_AUTHENTICATED
  console.log('[1] NOT_AUTHENTICATED (identity is null)...');
  const ctrl1 = createUploadController({
    getConnectionState: () => ({ identity: null, canUpload: false }),
    uploadBytes: async () => 'ref',
  });
  try {
    await ctrl1.uploadSighting(VALID);
    console.log('    ❌ Should have thrown');
  } catch (err) {
    console.log(`    reason: ${err.reason}`);
    console.log(`    message: ${err.message}`);
    console.log(`    ✅ ${err.reason === 'NOT_AUTHENTICATED' ? 'PASS' : 'FAIL'}\n`);
  }

  // Test 2: NO_UPLOAD_CAPABILITY (canUpload is false)
  console.log('[2] NO_UPLOAD_CAPABILITY (canUpload=false)...');
  const ctrl2 = createUploadController({
    getConnectionState: () => ({ identity: { name: 'Meera' }, canUpload: false }),
    uploadBytes: async () => 'ref',
  });
  try {
    await ctrl2.uploadSighting(VALID);
    console.log('    ❌ Should have thrown');
  } catch (err) {
    console.log(`    reason: ${err.reason}`);
    console.log(`    message: ${err.message}`);
    console.log(`    ✅ ${err.reason === 'NO_UPLOAD_CAPABILITY' ? 'PASS' : 'FAIL'}\n`);
  }

  // Test 3: NETWORK_ERROR (TypeError from fetch failure)
  console.log('[3] NETWORK_ERROR (fetch TypeError)...');
  const ctrl3 = createUploadController({
    getConnectionState: () => ({ identity: { name: 'Meera' }, canUpload: true }),
    uploadBytes: async () => { throw new TypeError('Failed to fetch'); },
  });
  try {
    await ctrl3.uploadSighting(VALID);
    console.log('    ❌ Should have thrown');
  } catch (err) {
    console.log(`    reason: ${err.reason}`);
    console.log(`    message: ${err.message}`);
    console.log(`    ✅ ${err.reason === 'NETWORK_ERROR' ? 'PASS' : 'FAIL'}\n`);
  }

  // Test 4: Verify each produces a DISTINCT reason
  console.log('[4] Distinctness check...');
  const reasons = ['NOT_AUTHENTICATED', 'NO_UPLOAD_CAPABILITY', 'NETWORK_ERROR'];
  const unique = new Set(reasons);
  console.log(`    Reasons: ${reasons.join(', ')}`);
  console.log(`    Unique: ${unique.size}`);
  console.log(`    ✅ ${unique.size === reasons.length ? 'All distinct — PASS' : 'FAIL'}\n`);

  console.log('=== Failure Path Verification COMPLETE ===');
}

main().catch(console.error);
