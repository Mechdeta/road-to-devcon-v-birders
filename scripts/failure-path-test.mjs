/**
 * Failure-path verification script.
 * Tests that distinct user-visible reasons are produced for each failure mode
 * using the production upload controller.
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

  // Test 7: Verify each produces a DISTINCT reason
  console.log('[7] Distinctness check...');
  const unique = new Set(reasons);
  console.log(`    Reasons: ${reasons.join(', ')}`);
  console.log(`    Unique count: ${unique.size} / ${reasons.length}`);
  console.log(`    ✅ ${unique.size === reasons.length ? 'All distinct — PASS' : 'FAIL'}\n`);

  console.log('=== Failure Path Verification COMPLETE ===');
}

main().catch(console.error);
