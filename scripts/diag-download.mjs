/**
 * Diagnostic: inspect what bee.data.download actually returns.
 */
import { Bee, NULL_STAMP } from '@ethersphere/bee-js';
import { encode, decode } from '@deccan/sighting-format';

const GATEWAY_URL = 'https://api.gateway.ethswarm.org/';
const REF = '712ebc4946c416c39b1e76d4888b7da656bef9abfdfca510340bca61fe5e8230';

async function main() {
  const bee = new Bee(GATEWAY_URL);
  
  console.log('--- bee.data.download result inspection ---');
  const result = await bee.data.download(REF);
  
  console.log('Type:', typeof result);
  console.log('Constructor:', result?.constructor?.name);
  console.log('Is Uint8Array:', result instanceof Uint8Array);
  console.log('Has .data:', typeof result?.data);
  console.log('Has .text:', typeof result?.text);
  console.log('Has .json:', typeof result?.json);
  console.log('Has .arrayBuffer:', typeof result?.arrayBuffer);
  console.log('Has .toUtf8:', typeof result?.toUtf8);
  console.log('Has .toJSON:', typeof result?.toJSON);
  
  // Get the raw bytes
  let rawBytes;
  if (result instanceof Uint8Array) {
    rawBytes = result;
  } else if (result?.data instanceof Uint8Array) {
    rawBytes = result.data;
  } else if (typeof result?.arrayBuffer === 'function') {
    rawBytes = new Uint8Array(await result.arrayBuffer());
  } else {
    // Try to iterate
    rawBytes = new Uint8Array(result);
  }
  
  console.log('\nRaw bytes first 20:', Array.from(rawBytes.slice(0, 20)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
  console.log('Raw bytes length:', rawBytes.length);
  
  // Expected magic: 0x44 0x42 0x49 0x52
  console.log('\nExpected magic: 0x44 0x42 0x49 0x52');
  console.log('Actual first 4:', Array.from(rawBytes.slice(0, 4)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
  
  // Also try raw fetch
  console.log('\n--- Raw fetch comparison ---');
  const resp = await fetch(`${GATEWAY_URL}bytes/${REF}`);
  const fetchBytes = new Uint8Array(await resp.arrayBuffer());
  console.log('Fetch first 20:', Array.from(fetchBytes.slice(0, 20)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
  console.log('Fetch length:', fetchBytes.length);
  
  // Check if result has properties that wrap the data
  console.log('\n--- Object keys ---');
  const keys = Object.getOwnPropertyNames(Object.getPrototypeOf(result));
  console.log('Prototype keys:', keys);
  
  // Try to access underlying buffer
  if (result.buffer) {
    console.log('result.buffer type:', result.buffer.constructor.name);
    console.log('result.byteOffset:', result.byteOffset);
    console.log('result.byteLength:', result.byteLength);
  }
}

main().catch(err => console.error(err));
