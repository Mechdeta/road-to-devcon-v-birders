/**
 * @module @deccan/sighting-format
 *
 * Self-describing binary codec for Deccan Birders sighting records (DBIR).
 *
 * See FORMAT.md for the full specification. This module is standalone —
 * it has no application dependencies, no Swarm client, no UI code.
 *
 * Binary envelope:
 *   Offset 0:  4 bytes — magic  (0x44 0x42 0x49 0x52 = "DBIR")
 *   Offset 4:  2 bytes — uint16 BE version
 *   Offset 6:  4 bytes — uint32 BE JSON payload length (N)
 *   Offset 10: N bytes — UTF-8 JSON payload
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Magic bytes identifying a DBIR record: ASCII "DBIR" */
export const MAGIC = new Uint8Array([0x44, 0x42, 0x49, 0x52]);

/** Current format version */
export const FORMAT_VERSION = 1;

/** Maximum format version this codec can decode */
export const MAX_SUPPORTED_VERSION = 1;

/** Minimum valid record size: 4 (magic) + 2 (version) + 4 (length) = 10 */
export const HEADER_SIZE = 10;

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class FormatError extends Error {
  /**
   * @param {string} code    Machine-readable error code
   * @param {string} message Human-readable message
   */
  constructor(code, message) {
    super(message);
    this.name = 'FormatError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Encoder
// ---------------------------------------------------------------------------

/**
 * Encode a sighting object into the DBIR binary format.
 *
 * @param {object} sighting
 * @param {string} sighting.species          — required
 * @param {object} sighting.location         — required
 * @param {number} sighting.location.lat     — required
 * @param {number} sighting.location.lng     — required
 * @param {string} [sighting.location.name]  — optional
 * @param {string} sighting.observedAt       — required (ISO 8601)
 * @param {number} [sighting.count]          — optional (non-negative integer)
 * @param {string} [sighting.notes]          — optional
 * @param {string} [sighting.observer]       — optional
 * @returns {Uint8Array} The DBIR binary record
 * @throws {FormatError} If required fields are missing or invalid
 */
export function encode(sighting) {
  // Validate required fields before encoding
  validateSighting(sighting);

  const jsonStr = JSON.stringify(sighting);
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(jsonStr);

  const buffer = new ArrayBuffer(HEADER_SIZE + jsonBytes.length);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Write magic bytes
  bytes.set(MAGIC, 0);

  // Write version (uint16 BE)
  view.setUint16(4, FORMAT_VERSION, false);

  // Write JSON payload length (uint32 BE)
  view.setUint32(6, jsonBytes.length, false);

  // Write JSON payload
  bytes.set(jsonBytes, HEADER_SIZE);

  return bytes;
}

// ---------------------------------------------------------------------------
// Decoder
// ---------------------------------------------------------------------------

/**
 * Decode a DBIR binary record into a sighting object.
 *
 * Performs all validation steps defined in FORMAT.md §4.
 *
 * @param {Uint8Array} data — raw DBIR binary record
 * @returns {object} The parsed sighting object
 * @throws {FormatError} If the record is invalid
 */
export function decode(data) {
  // Step 1: Length check
  if (!data || data.length < HEADER_SIZE) {
    throw new FormatError(
      'RECORD_TOO_SHORT',
      `Record is too short (${data ? data.length : 0} bytes, minimum ${HEADER_SIZE})`
    );
  }

  // Step 2: Magic check
  for (let i = 0; i < MAGIC.length; i++) {
    if (data[i] !== MAGIC[i]) {
      throw new FormatError(
        'INVALID_MAGIC',
        'Not a DBIR record — magic bytes do not match'
      );
    }
  }

  // Step 3: Version check
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const version = view.getUint16(4, false);

  if (version === 0) {
    throw new FormatError('INVALID_VERSION', 'Invalid DBIR version: 0');
  }

  if (version > MAX_SUPPORTED_VERSION) {
    throw new FormatError(
      'UNSUPPORTED_VERSION',
      `Unsupported DBIR version: ${version}. This reader supports up to version ${MAX_SUPPORTED_VERSION}. Please update your reader.`
    );
  }

  // Step 4: Payload length check
  const payloadLength = view.getUint32(6, false);

  if (HEADER_SIZE + payloadLength > data.length) {
    throw new FormatError(
      'PAYLOAD_OVERFLOW',
      `Payload length (${payloadLength}) exceeds record size (${data.length - HEADER_SIZE} available bytes)`
    );
  }

  // Step 5: JSON parse
  const decoder = new TextDecoder('utf-8');
  const jsonStr = decoder.decode(data.slice(HEADER_SIZE, HEADER_SIZE + payloadLength));

  let sighting;
  try {
    sighting = JSON.parse(jsonStr);
  } catch (err) {
    throw new FormatError('INVALID_JSON', `Invalid JSON payload: ${err.message}`);
  }

  // Step 6: Required field validation
  validateSighting(sighting);

  return sighting;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that a sighting object contains all required fields
 * with correct types, as defined in FORMAT.md §3.1.
 *
 * @param {object} sighting
 * @throws {FormatError} if validation fails
 */
export function validateSighting(sighting) {
  if (typeof sighting !== 'object' || sighting === null) {
    throw new FormatError('INVALID_SIGHTING', 'Sighting must be a non-null object');
  }

  if (typeof sighting.species !== 'string' || sighting.species.length === 0) {
    throw new FormatError('MISSING_FIELD', 'Missing or invalid required field: species');
  }

  if (typeof sighting.location !== 'object' || sighting.location === null) {
    throw new FormatError('MISSING_FIELD', 'Missing or invalid required field: location');
  }

  if (typeof sighting.location.lat !== 'number' || !isFinite(sighting.location.lat)) {
    throw new FormatError('MISSING_FIELD', 'Missing or invalid required field: location.lat');
  }

  if (typeof sighting.location.lng !== 'number' || !isFinite(sighting.location.lng)) {
    throw new FormatError('MISSING_FIELD', 'Missing or invalid required field: location.lng');
  }

  if (typeof sighting.observedAt !== 'string' || sighting.observedAt.length === 0) {
    throw new FormatError('MISSING_FIELD', 'Missing or invalid required field: observedAt');
  }

  // Optional field type checks
  if (sighting.count !== undefined) {
    if (typeof sighting.count !== 'number' || !Number.isInteger(sighting.count) || sighting.count < 0) {
      throw new FormatError('INVALID_FIELD', 'Field "count" must be a non-negative integer');
    }
  }

  if (sighting.notes !== undefined && typeof sighting.notes !== 'string') {
    throw new FormatError('INVALID_FIELD', 'Field "notes" must be a string');
  }

  if (sighting.observer !== undefined && typeof sighting.observer !== 'string') {
    throw new FormatError('INVALID_FIELD', 'Field "observer" must be a string');
  }

  if (sighting.location.name !== undefined && typeof sighting.location.name !== 'string') {
    throw new FormatError('INVALID_FIELD', 'Field "location.name" must be a string');
  }
}
