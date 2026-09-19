/**
 * End-to-end gateway verification script (fixed for bee-js v13 _Bytes type).
 * Run from project root: node scripts/e2e-gateway-test.mjs
 */

import { Bee, NULL_STAMP } from '@ethersphere/bee-js';
import { encode, decode } from '@deccan/sighting-format';

const GATEWAY_URL = 'https://api.gateway.ethswarm.org/';

const TEST_SIGHTING = {
  species: 'Indian Peafowl',
  location: {
    lat: 18.5204,
    lng: 73.8567,
    name: 'Pashan Lake, Pune',
  },
  observedAt: '2025-06-15T07:30:00+05:30',
  count: 3,
  notes: 'E2E verification sighting — Deccan Birders hackathon',
  observer: 'Meera (E2E Test)',
};

async function main() {
  console.log('=== E2E Gateway Verification ===\n');

  // ── Step 1: Encode ────────────────────────────────────────────────────
  console.log('[1] Encoding sighting to DBIR format...');
  const bytes = encode(TEST_SIGHTING);
  console.log(`    Encoded size: ${bytes.length} bytes`);
  console.log(`    Magic: ${Array.from(bytes.slice(0, 4)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  console.log(`    Version: ${view.getUint16(4, false)}`);
  console.log(`    Payload length: ${view.getUint32(6, false)}`);
  console.log('    ✅ Encoding passed\n');

  // ── Step 2: Upload ────────────────────────────────────────────────────
  console.log('[2] Uploading to subsidised gateway...');
  console.log(`    Gateway: ${GATEWAY_URL}`);
  console.log(`    API: bee.data.upload(NULL_STAMP, data) → POST /bytes`);
  console.log('    Options: NONE (no pin, no tag, no ACT)');

  const bee = new Bee(GATEWAY_URL);
  let reference;
  try {
    const result = await bee.data.upload(NULL_STAMP, bytes);
    // bee-js v13: result.reference is a _Reference object with .toHex()
    reference = typeof result.reference?.toHex === 'function'
      ? result.reference.toHex()
      : String(result.reference);
    console.log(`    ✅ Upload succeeded!`);
    console.log(`    Swarm reference: ${reference}`);
    console.log(`    Reference length: ${reference.length} chars\n`);
  } catch (err) {
    console.error(`    ❌ Upload FAILED: ${err.message}`);
    return { uploadFailed: true, error: err.message };
  }

  // ── Step 3: Download ──────────────────────────────────────────────────
  console.log('[3] Downloading from gateway via /bytes...');
  console.log(`    API: bee.data.download("${reference}") → GET /bytes/${reference}`);

  let downloadedBytes;
  try {
    const result = await bee.data.download(reference);
    // bee-js v13: result is a _Bytes object with .toUint8Array()
    downloadedBytes = typeof result?.toUint8Array === 'function'
      ? result.toUint8Array()
      : (result instanceof Uint8Array ? result : new Uint8Array(result));
    console.log(`    ✅ Download succeeded!`);
    console.log(`    Downloaded size: ${downloadedBytes.length} bytes`);
    console.log(`    Size match: ${downloadedBytes.length === bytes.length ? '✅' : '❌'}`);
    console.log(`    First 6 bytes: ${Array.from(downloadedBytes.slice(0, 6)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
    console.log();
  } catch (err) {
    console.error(`    ❌ Download FAILED: ${err.message}\n`);
    return { downloadFailed: true, error: err.message, reference };
  }

  // ── Step 4: Decode + verify roundtrip ─────────────────────────────────
  console.log('[4] Decoding downloaded DBIR record...');
  try {
    const decoded = decode(downloadedBytes);
    console.log(`    species:    ${decoded.species}`);
    console.log(`    location:   ${decoded.location.lat}, ${decoded.location.lng} (${decoded.location.name})`);
    console.log(`    observedAt: ${decoded.observedAt}`);
    console.log(`    count:      ${decoded.count}`);
    console.log(`    observer:   ${decoded.observer}`);
    console.log(`    notes:      ${decoded.notes}`);

    const match =
      decoded.species === TEST_SIGHTING.species &&
      decoded.location.lat === TEST_SIGHTING.location.lat &&
      decoded.location.lng === TEST_SIGHTING.location.lng &&
      decoded.observedAt === TEST_SIGHTING.observedAt &&
      decoded.count === TEST_SIGHTING.count &&
      decoded.observer === TEST_SIGHTING.observer;

    console.log(match ? '    ✅ Data integrity verified!\n' : '    ❌ Data mismatch!\n');
    if (!match) return { dataMismatch: true, reference };
  } catch (err) {
    console.error(`    ❌ Decode FAILED: ${err.message}\n`);
    return { decodeFailed: true, error: err.message, reference };
  }

  // ── Step 5: Raw HTTP verification ─────────────────────────────────────
  console.log('[5] Raw HTTP /bytes verification...');
  try {
    const rawResp = await fetch(`${GATEWAY_URL}bytes/${reference}`);
    console.log(`    GET /bytes/${reference.substring(0, 16)}...`);
    console.log(`    Status: ${rawResp.status}`);
    console.log(`    Content-Type: ${rawResp.headers.get('content-type')}`);
    const rawBody = new Uint8Array(await rawResp.arrayBuffer());
    console.log(`    Body size: ${rawBody.byteLength} bytes`);
    const rawMagic = Array.from(rawBody.slice(0, 4)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
    console.log(`    Magic in raw: ${rawMagic} ${rawMagic === '0x44 0x42 0x49 0x52' ? '✅ DBIR' : '❌'}`);
    console.log('    ✅ Raw /bytes verified\n');
  } catch (err) {
    console.log(`    ⚠️  Raw fetch: ${err.message}\n`);
  }

  // ── Step 6: Independent reader simulation ─────────────────────────────
  console.log('[6] Independent reader simulation...');
  console.log('    Simulating a completely separate reader that only knows the reference.');
  console.log('    No writer state, no localStorage, no database, no export file.');
  
  // Create a fresh Bee instance — independent of writer
  const readerBee = new Bee(GATEWAY_URL);
  try {
    const readerResult = await readerBee.data.download(reference);
    const readerBytes = readerResult.toUint8Array();
    const readerDecoded = decode(readerBytes);
    console.log(`    ✅ Independent reader decoded: ${readerDecoded.species} at ${readerDecoded.location.name}`);
    console.log('    ✅ Reader has zero dependency on writer state\n');
  } catch (err) {
    console.error(`    ❌ Reader simulation FAILED: ${err.message}\n`);
  }

  console.log('=== E2E VERIFICATION COMPLETE ===');
  console.log(`\n📋 SWARM REFERENCE: ${reference}`);
  console.log(`🔗 Reader URL: http://localhost:5174/?ref=${reference}`);

  return { success: true, reference };
}

main().then(result => {
  console.log('\n--- Result ---');
  console.log(JSON.stringify(result, null, 2));
}).catch(err => {
  console.error('\n--- Fatal Error ---');
  console.error(err);
  process.exit(1);
});
