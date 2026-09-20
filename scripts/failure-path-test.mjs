/**
 * Failure-path verification script.
 * Tests that distinct user-visible reasons are produced for each failure mode
 * using the production upload controller.
 *
 * Refactored to comprehensively test all major failure modes handled by the
 * production upload controller, matching the coverage in upload-controller.test.js.
 */

import { createUploadController, UploadError, MESSAGES } from '../writer/src/upload-controller.js';

const VALID = {
  species: 'Crow',
  location: { lat: 18.5, lng: 73.8 },
  observedAt: '2025-01-01T00:00:00Z',
};

async function main() {
  console.log('=== Failure Path Verification ===\n');

  const reasons = [];

  // Test 1: OFFLINE
  console.log('[1] OFFLINE (device is offline)...');
  const ctrlOffline = createUploadController({
    isOffline: () => true,
    getConnectionInfo: () => ({ identity: { name: 'Meera' }, canUpload: true }),
    uploadBytes: async () => 'ref',
  });
  try {
    await ctrlOffline.uploadSighting(VALID);
    console.log('    ❌ Should have thrown');
  } catch (err) {
    reasons.push(err.reason);
    console.log(`    reason: ${err.reason}`);
    console.log(`    title: ${err.title}`);
    console.log(`    message: ${err.message}`);
    console.log(`    next: ${err.next}`);
    console.log(`    ✅ ${err.reason === 'OFFLINE' ? 'PASS' : 'FAIL'}\n`);
  }

  // Test 2: SWARM_ID_UNAVAILABLE
  console.log('[2] SWARM_ID_UNAVAILABLE (client throws before initialize)...');
  const ctrlSwarmId = createUploadController({
    isOffline: () => false,
    getConnectionInfo: () => { throw new Error('Client not ready'); },
    uploadBytes: async () => 'ref',
  });
  try {
    await ctrlSwarmId.uploadSighting(VALID);
    console.log('    ❌ Should have thrown');
  } catch (err) {
    reasons.push(err.reason);
    console.log(`    reason: ${err.reason}`);
    console.log(`    title: ${err.title}`);
    console.log(`    message: ${err.message}`);
    console.log(`    next: ${err.next}`);
    console.log(`    ✅ ${err.reason === 'SWARM_ID_UNAVAILABLE' ? 'PASS' : 'FAIL'}\n`);
  }

  // Test 3: NOT_AUTHENTICATED
  console.log('[3] NOT_AUTHENTICATED (identity is null)...');
  const ctrlAuth = createUploadController({
    isOffline: () => false,
    getConnectionInfo: () => ({ identity: null, canUpload: false }),
    uploadBytes: async () => 'ref',
  });
  try {
    await ctrlAuth.uploadSighting(VALID);
    console.log('    ❌ Should have thrown');
  } catch (err) {
    reasons.push(err.reason);
    console.log(`    reason: ${err.reason}`);
    console.log(`    title: ${err.title}`);
    console.log(`    message: ${err.message}`);
    console.log(`    next: ${err.next}`);
    console.log(`    ✅ ${err.reason === 'NOT_AUTHENTICATED' ? 'PASS' : 'FAIL'}\n`);
  }

  // Test 4: NO_UPLOAD_CAPABILITY (canUpload is false with no-stamp reason)
  console.log('[4] NO_UPLOAD_CAPABILITY (canUpload=false, no-stamp)...');
  const ctrlCap = createUploadController({
    isOffline: () => false,
    getConnectionInfo: () => ({
      identity: { name: 'Meera' },
      canUpload: false,
      uploadUnavailableReason: 'no-stamp',
    }),
    uploadBytes: async () => 'ref',
  });
  try {
    await ctrlCap.uploadSighting(VALID);
    console.log('    ❌ Should have thrown');
  } catch (err) {
    reasons.push(err.reason);
    console.log(`    reason: ${err.reason}`);
    console.log(`    title: ${err.title}`);
    console.log(`    message: ${err.message}`);
    console.log(`    next: ${err.next}`);
    console.log(`    ✅ ${err.reason === 'NO_UPLOAD_CAPABILITY' ? 'PASS' : 'FAIL'}\n`);
  }

  // Test 5: GATEWAY_UNREACHABLE (fetch TypeError when online)
  console.log('[5] GATEWAY_UNREACHABLE (fetch TypeError while online)...');
  const ctrlUnreach = createUploadController({
    isOffline: () => false,
    getConnectionInfo: () => ({ identity: { name: 'Meera' }, canUpload: true }),
    uploadBytes: async () => { throw new TypeError('Failed to fetch'); },
  });
  try {
    await ctrlUnreach.uploadSighting(VALID);
    console.log('    ❌ Should have thrown');
  } catch (err) {
    reasons.push(err.reason);
    console.log(`    reason: ${err.reason}`);
    console.log(`    title: ${err.title}`);
    console.log(`    message: ${err.message}`);
    console.log(`    next: ${err.next}`);
    console.log(`    ✅ ${err.reason === 'GATEWAY_UNREACHABLE' ? 'PASS' : 'FAIL'}\n`);
  }

  // Test 6: GATEWAY_PAYMENT_REQUIRED (HTTP 402)
  console.log('[6] GATEWAY_PAYMENT_REQUIRED (HTTP 402)...');
  const ctrl402 = createUploadController({
    isOffline: () => false,
    getConnectionInfo: () => ({ identity: { name: 'Meera' }, canUpload: true }),
    uploadBytes: async () => {
      const err = new Error('Payment Required');
      err.status = 402;
      throw err;
    },
  });
  try {
    await ctrl402.uploadSighting(VALID);
    console.log('    ❌ Should have thrown');
  } catch (err) {
    reasons.push(err.reason);
    console.log(`    reason: ${err.reason}`);
    console.log(`    title: ${err.title}`);
    console.log(`    message: ${err.message}`);
    console.log(`    next: ${err.next}`);
    console.log(`    ✅ ${err.reason === 'GATEWAY_PAYMENT_REQUIRED' ? 'PASS' : 'FAIL'}\n`);
  }

  // Test 7: GATEWAY_FORBIDDEN (HTTP 403)
  console.log('[7] GATEWAY_FORBIDDEN (HTTP 403)...');
  const ctrl403 = createUploadController({
    isOffline: () => false,
    getConnectionInfo: () => ({ identity: { name: 'Meera' }, canUpload: true }),
    uploadBytes: async () => {
      const err = new Error('Forbidden');
      err.status = 403;
      throw err;
    },
  });
  try {
    await ctrl403.uploadSighting(VALID);
    console.log('    ❌ Should have thrown');
  } catch (err) {
    reasons.push(err.reason);
    console.log(`    reason: ${err.reason}`);
    console.log(`    title: ${err.title}`);
    console.log(`    message: ${err.message}`);
    console.log(`    next: ${err.next}`);
    console.log(`    ✅ ${err.reason === 'GATEWAY_FORBIDDEN' ? 'PASS' : 'FAIL'}\n`);
  }

  // Test 8: PAYLOAD_TOO_LARGE (HTTP 413)
  console.log('[8] PAYLOAD_TOO_LARGE (HTTP 413)...');
  const ctrl413 = createUploadController({
    isOffline: () => false,
    getConnectionInfo: () => ({ identity: { name: 'Meera' }, canUpload: true }),
    uploadBytes: async () => {
      const err = new Error('Payload Too Large');
      err.status = 413;
      throw err;
    },
  });
  try {
    await ctrl413.uploadSighting(VALID);
    console.log('    ❌ Should have thrown');
  } catch (err) {
    reasons.push(err.reason);
    console.log(`    reason: ${err.reason}`);
    console.log(`    title: ${err.title}`);
    console.log(`    message: ${err.message}`);
    console.log(`    next: ${err.next}`);
    console.log(`    ✅ ${err.reason === 'PAYLOAD_TOO_LARGE' ? 'PASS' : 'FAIL'}\n`);
  }

  // Test 9: RATE_LIMITED (HTTP 429)
  console.log('[9] RATE_LIMITED (HTTP 429)...');
  const ctrl429 = createUploadController({
    isOffline: () => false,
    getConnectionInfo: () => ({ identity: { name: 'Meera' }, canUpload: true }),
    uploadBytes: async () => {
      const err = new Error('Too many requests');
      err.status = 429;
      throw err;
    },
  });
  try {
    await ctrl429.uploadSighting(VALID);
    console.log('    ❌ Should have thrown');
  } catch (err) {
    reasons.push(err.reason);
    console.log(`    reason: ${err.reason}`);
    console.log(`    title: ${err.title}`);
    console.log(`    message: ${err.message}`);
    console.log(`    next: ${err.next}`);
    console.log(`    ✅ ${err.reason === 'RATE_LIMITED' ? 'PASS' : 'FAIL'}\n`);
  }

  // Test 10: GATEWAY_5XX (HTTP 5xx)
  console.log('[10] GATEWAY_5XX (HTTP 500)...');
  const ctrl5xx = createUploadController({
    isOffline: () => false,
    getConnectionInfo: () => ({ identity: { name: 'Meera' }, canUpload: true }),
    uploadBytes: async () => {
      const err = new Error('Internal Server Error: 500');
      err.status = 500;
      throw err;
    },
  });
  try {
    await ctrl5xx.uploadSighting(VALID);
    console.log('    ❌ Should have thrown');
  } catch (err) {
    reasons.push(err.reason);
    console.log(`    reason: ${err.reason}`);
    console.log(`    title: ${err.title}`);
    console.log(`    message: ${err.message}`);
    console.log(`    next: ${err.next}`);
    console.log(`    ✅ ${err.reason === 'GATEWAY_5XX' ? 'PASS' : 'FAIL'}\n`);
  }

  // Test 11: TIMEOUT
  console.log('[11] TIMEOUT (gateway request timed out)...');
  const ctrlTimeout = createUploadController({
    isOffline: () => false,
    getConnectionInfo: () => ({ identity: { name: 'Meera' }, canUpload: true }),
    uploadBytes: async () => {
      const err = new Error('Gateway request timed out');
      err.name = 'TimeoutError';
      throw err;
    },
  });
  try {
    await ctrlTimeout.uploadSighting(VALID);
    console.log('    ❌ Should have thrown');
  } catch (err) {
    reasons.push(err.reason);
    console.log(`    reason: ${err.reason}`);
    console.log(`    title: ${err.title}`);
    console.log(`    message: ${err.message}`);
    console.log(`    next: ${err.next}`);
    console.log(`    ✅ ${err.reason === 'TIMEOUT' ? 'PASS' : 'FAIL'}\n`);
  }

  // Test 12: UPLOAD_FAILED (unknown error with message)
  console.log('[12] UPLOAD_FAILED (unknown gateway error)...');
  const ctrlUploadFailed = createUploadController({
    isOffline: () => false,
    getConnectionInfo: () => ({ identity: { name: 'Meera' }, canUpload: true }),
    uploadBytes: async () => { throw new Error('Weird gateway issue'); },
  });
  try {
    await ctrlUploadFailed.uploadSighting(VALID);
    console.log('    ❌ Should have thrown');
  } catch (err) {
    reasons.push(err.reason);
    console.log(`    reason: ${err.reason}`);
    console.log(`    title: ${err.title}`);
    console.log(`    message: ${err.message}`);
    console.log(`    next: ${err.next}`);
    console.log(`    ✅ ${err.reason === 'UPLOAD_FAILED' ? 'PASS' : 'FAIL'}\n`);
  }

  // Test 13: SERIALISATION_FAILED (invalid sighting data)
  console.log('[13] SERIALISATION_FAILED (invalid sighting data)...');
  const ctrlSerialization = createUploadController({
    isOffline: () => false,
    getConnectionInfo: () => ({ identity: { name: 'Meera' }, canUpload: true }),
    uploadBytes: async () => 'ref',
  });
  try {
    await ctrlSerialization.uploadSighting({ species: '' }); // missing required fields
    console.log('    ❌ Should have thrown');
  } catch (err) {
    reasons.push(err.reason);
    console.log(`    reason: ${err.reason}`);
    console.log(`    title: ${err.title}`);
    console.log(`    message: ${err.message}`);
    console.log(`    next: ${err.next}`);
    console.log(`    ✅ ${err.reason === 'SERIALISATION_FAILED' ? 'PASS' : 'FAIL'}\n`);
  }

  // Test 14: Verify each produces a DISTINCT reason
  console.log('[14] Distinctness check...');
  const unique = new Set(reasons);
  console.log(`    Reasons: ${reasons.join(', ')}`);
  console.log(`    Unique count: ${unique.size} / ${reasons.length}`);
  console.log(`    ✅ ${unique.size === reasons.length ? 'All distinct — PASS' : 'FAIL'}\n`);

  console.log('=== Failure Path Verification COMPLETE ===');
}

main().catch(console.error);
