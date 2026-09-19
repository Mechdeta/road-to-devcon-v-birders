/**
 * Tests for @deccan/sighting-format
 *
 * Uses Node.js built-in test runner (node --test).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encode,
  decode,
  validateSighting,
  MAGIC,
  FORMAT_VERSION,
  MAX_SUPPORTED_VERSION,
  HEADER_SIZE,
  FormatError,
} from './sighting-format.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const VALID_SIGHTING = {
  species: 'Indian Peafowl',
  location: {
    lat: 18.5204,
    lng: 73.8567,
    name: 'Pashan Lake, Pune',
  },
  observedAt: '2025-06-15T07:30:00+05:30',
  count: 3,
  notes: 'Male displaying plumage near the eastern shore',
  observer: 'Meera',
};

const MINIMAL_SIGHTING = {
  species: 'House Sparrow',
  location: { lat: 12.9716, lng: 77.5946 },
  observedAt: '2025-01-01T06:00:00Z',
};

// ---------------------------------------------------------------------------
// Encode / Decode roundtrip
// ---------------------------------------------------------------------------

describe('encode() + decode() roundtrip', () => {
  it('round-trips a full sighting', () => {
    const bytes = encode(VALID_SIGHTING);
    const result = decode(bytes);

    assert.deepStrictEqual(result, VALID_SIGHTING);
  });

  it('round-trips a minimal sighting (required fields only)', () => {
    const bytes = encode(MINIMAL_SIGHTING);
    const result = decode(bytes);

    assert.deepStrictEqual(result, MINIMAL_SIGHTING);
  });
});

// ---------------------------------------------------------------------------
// Binary envelope structure
// ---------------------------------------------------------------------------

describe('binary envelope', () => {
  it('starts with DBIR magic bytes', () => {
    const bytes = encode(VALID_SIGHTING);

    assert.strictEqual(bytes[0], 0x44); // D
    assert.strictEqual(bytes[1], 0x42); // B
    assert.strictEqual(bytes[2], 0x49); // I
    assert.strictEqual(bytes[3], 0x52); // R
  });

  it('contains version 1 at offset 4 (uint16 BE)', () => {
    const bytes = encode(VALID_SIGHTING);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const version = view.getUint16(4, false);

    assert.strictEqual(version, 1);
  });

  it('contains the JSON payload length at offset 6 (uint32 BE)', () => {
    const bytes = encode(VALID_SIGHTING);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const payloadLen = view.getUint32(6, false);

    const jsonStr = JSON.stringify(VALID_SIGHTING);
    const expectedLen = new TextEncoder().encode(jsonStr).length;

    assert.strictEqual(payloadLen, expectedLen);
  });

  it('total size = HEADER_SIZE + JSON payload byte length', () => {
    const bytes = encode(VALID_SIGHTING);

    const jsonStr = JSON.stringify(VALID_SIGHTING);
    const jsonByteLen = new TextEncoder().encode(jsonStr).length;

    assert.strictEqual(bytes.length, HEADER_SIZE + jsonByteLen);
  });

  it('JSON payload at offset 10 decodes correctly', () => {
    const bytes = encode(VALID_SIGHTING);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const payloadLen = view.getUint32(6, false);
    const payload = new TextDecoder().decode(bytes.slice(HEADER_SIZE, HEADER_SIZE + payloadLen));
    const parsed = JSON.parse(payload);

    assert.deepStrictEqual(parsed, VALID_SIGHTING);
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('MAGIC is the bytes for "DBIR"', () => {
    assert.deepStrictEqual(MAGIC, new Uint8Array([0x44, 0x42, 0x49, 0x52]));
  });

  it('FORMAT_VERSION is 1', () => {
    assert.strictEqual(FORMAT_VERSION, 1);
  });

  it('MAX_SUPPORTED_VERSION is 1', () => {
    assert.strictEqual(MAX_SUPPORTED_VERSION, 1);
  });

  it('HEADER_SIZE is 10', () => {
    assert.strictEqual(HEADER_SIZE, 10);
  });
});

// ---------------------------------------------------------------------------
// Decode validation: magic
// ---------------------------------------------------------------------------

describe('decode() — magic validation', () => {
  it('rejects data shorter than HEADER_SIZE', () => {
    assert.throws(
      () => decode(new Uint8Array(5)),
      (err) => err instanceof FormatError && err.code === 'RECORD_TOO_SHORT'
    );
  });

  it('rejects null/undefined input', () => {
    assert.throws(
      () => decode(null),
      (err) => err instanceof FormatError && err.code === 'RECORD_TOO_SHORT'
    );
  });

  it('rejects wrong magic bytes', () => {
    const bytes = encode(VALID_SIGHTING);
    bytes[0] = 0xFF; // corrupt magic
    assert.throws(
      () => decode(bytes),
      (err) => err instanceof FormatError && err.code === 'INVALID_MAGIC'
    );
  });
});

// ---------------------------------------------------------------------------
// Decode validation: version
// ---------------------------------------------------------------------------

describe('decode() — version validation', () => {
  it('rejects version 0', () => {
    const bytes = encode(VALID_SIGHTING);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setUint16(4, 0, false);

    assert.throws(
      () => decode(bytes),
      (err) => err instanceof FormatError && err.code === 'INVALID_VERSION'
    );
  });

  it('rejects version higher than MAX_SUPPORTED_VERSION', () => {
    const bytes = encode(VALID_SIGHTING);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setUint16(4, 999, false);

    assert.throws(
      () => decode(bytes),
      (err) => err instanceof FormatError && err.code === 'UNSUPPORTED_VERSION'
    );
  });

  it('unsupported version error includes the version number', () => {
    const bytes = encode(VALID_SIGHTING);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setUint16(4, 42, false);

    assert.throws(
      () => decode(bytes),
      (err) => err.message.includes('42')
    );
  });
});

// ---------------------------------------------------------------------------
// Decode validation: payload length
// ---------------------------------------------------------------------------

describe('decode() — payload length validation', () => {
  it('rejects payload length that exceeds record size', () => {
    const bytes = encode(VALID_SIGHTING);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // Set payload length to something huge
    view.setUint32(6, 999999, false);

    assert.throws(
      () => decode(bytes),
      (err) => err instanceof FormatError && err.code === 'PAYLOAD_OVERFLOW'
    );
  });
});

// ---------------------------------------------------------------------------
// Decode validation: JSON
// ---------------------------------------------------------------------------

describe('decode() — JSON validation', () => {
  it('rejects invalid JSON', () => {
    const invalid = new Uint8Array([
      ...MAGIC,
      0x00, 0x01,       // version 1
      0x00, 0x00, 0x00, 0x03, // payload length 3
      0x7B, 0x7B, 0x7D, // "{{}"  — invalid JSON
    ]);

    assert.throws(
      () => decode(invalid),
      (err) => err instanceof FormatError && err.code === 'INVALID_JSON'
    );
  });
});

// ---------------------------------------------------------------------------
// Decode validation: required fields
// ---------------------------------------------------------------------------

describe('decode() — required field validation', () => {
  it('rejects missing species', () => {
    const bad = { location: { lat: 1, lng: 2 }, observedAt: '2025-01-01T00:00:00Z' };
    const jsonBytes = new TextEncoder().encode(JSON.stringify(bad));
    const buf = new ArrayBuffer(HEADER_SIZE + jsonBytes.length);
    const view = new DataView(buf);
    const arr = new Uint8Array(buf);
    arr.set(MAGIC, 0);
    view.setUint16(4, 1, false);
    view.setUint32(6, jsonBytes.length, false);
    arr.set(jsonBytes, HEADER_SIZE);

    assert.throws(
      () => decode(arr),
      (err) => err instanceof FormatError && err.code === 'MISSING_FIELD' && err.message.includes('species')
    );
  });

  it('rejects missing location', () => {
    const bad = { species: 'Crow', observedAt: '2025-01-01T00:00:00Z' };
    const jsonBytes = new TextEncoder().encode(JSON.stringify(bad));
    const buf = new ArrayBuffer(HEADER_SIZE + jsonBytes.length);
    const view = new DataView(buf);
    const arr = new Uint8Array(buf);
    arr.set(MAGIC, 0);
    view.setUint16(4, 1, false);
    view.setUint32(6, jsonBytes.length, false);
    arr.set(jsonBytes, HEADER_SIZE);

    assert.throws(
      () => decode(arr),
      (err) => err instanceof FormatError && err.code === 'MISSING_FIELD' && err.message.includes('location')
    );
  });

  it('rejects missing observedAt', () => {
    const bad = { species: 'Crow', location: { lat: 1, lng: 2 } };
    const jsonBytes = new TextEncoder().encode(JSON.stringify(bad));
    const buf = new ArrayBuffer(HEADER_SIZE + jsonBytes.length);
    const view = new DataView(buf);
    const arr = new Uint8Array(buf);
    arr.set(MAGIC, 0);
    view.setUint16(4, 1, false);
    view.setUint32(6, jsonBytes.length, false);
    arr.set(jsonBytes, HEADER_SIZE);

    assert.throws(
      () => decode(arr),
      (err) => err instanceof FormatError && err.code === 'MISSING_FIELD' && err.message.includes('observedAt')
    );
  });
});

// ---------------------------------------------------------------------------
// Encode validation
// ---------------------------------------------------------------------------

describe('encode() — input validation', () => {
  it('rejects null', () => {
    assert.throws(() => encode(null), FormatError);
  });

  it('rejects missing species', () => {
    assert.throws(
      () => encode({ location: { lat: 1, lng: 2 }, observedAt: '2025-01-01T00:00:00Z' }),
      (err) => err instanceof FormatError && err.message.includes('species')
    );
  });

  it('rejects non-finite lat', () => {
    assert.throws(
      () => encode({ species: 'X', location: { lat: NaN, lng: 1 }, observedAt: '2025-01-01T00:00:00Z' }),
      (err) => err instanceof FormatError && err.message.includes('lat')
    );
  });

  it('rejects negative count', () => {
    assert.throws(
      () => encode({ species: 'X', location: { lat: 1, lng: 1 }, observedAt: '2025-01-01T00:00:00Z', count: -1 }),
      (err) => err instanceof FormatError && err.message.includes('count')
    );
  });

  it('rejects non-integer count', () => {
    assert.throws(
      () => encode({ species: 'X', location: { lat: 1, lng: 1 }, observedAt: '2025-01-01T00:00:00Z', count: 1.5 }),
      (err) => err instanceof FormatError && err.message.includes('count')
    );
  });
});

// ---------------------------------------------------------------------------
// UTF-8 support
// ---------------------------------------------------------------------------

describe('UTF-8 support', () => {
  it('round-trips a sighting with Unicode characters', () => {
    const sighting = {
      species: 'मोर (Indian Peafowl)',
      location: { lat: 18.52, lng: 73.86, name: 'पुणे' },
      observedAt: '2025-06-15T07:30:00+05:30',
      notes: '🦚 Beautiful display',
      observer: 'मीरा',
    };

    const bytes = encode(sighting);
    const result = decode(bytes);

    assert.deepStrictEqual(result, sighting);
  });
});

// ---------------------------------------------------------------------------
// Unknown fields passthrough
// ---------------------------------------------------------------------------

describe('unknown fields', () => {
  it('preserves unknown fields during roundtrip (forward compatibility)', () => {
    const sighting = {
      species: 'House Sparrow',
      location: { lat: 12.97, lng: 77.59 },
      observedAt: '2025-01-01T06:00:00Z',
      futureField: 'some new data',
    };

    const bytes = encode(sighting);
    const result = decode(bytes);

    assert.strictEqual(result.futureField, 'some new data');
  });
});
