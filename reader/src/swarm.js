/**
 * reader/src/swarm.js
 *
 * Swarm gateway download module for the reader.
 *
 * Downloads raw bytes from the same /bytes endpoint family used by the writer.
 * Uses bee.data.download which maps to GET /bytes/:reference.
 *
 * This module has NO dependency on the writer application.
 * It imports only from @ethersphere/bee-js.
 */

import { Bee } from '@ethersphere/bee-js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Gateway URL — same subsidised gateway used by the writer.
 * Reading from Swarm is permissionless; no authentication or postage needed.
 */
const GATEWAY_URL = 'https://api.gateway.ethswarm.org/';

/** Bee client pointed at the gateway */
const bee = new Bee(GATEWAY_URL);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Download raw bytes from Swarm using the /bytes endpoint family.
 *
 * This is the same endpoint family used by the writer for uploads:
 *   Writer:  POST /bytes  (bee.data.upload)
 *   Reader:  GET  /bytes/:ref  (bee.data.download)
 *
 * @param {string} reference — 64-character hex Swarm reference
 * @returns {Promise<Uint8Array>} the raw bytes
 * @throws {Error} if the reference is invalid or the download fails
 */
export async function downloadBytes(reference) {
  // Validate reference format before making the request
  if (!reference || !/^[a-fA-F0-9]{64}$/.test(reference)) {
    throw new Error(`Invalid Swarm reference: expected 64-character hex string, got "${reference}"`);
  }

  // bee.data.download maps to GET /bytes/:reference
  const data = await bee.data.download(reference);

  // bee-js v13 returns a _Bytes wrapper object with a .toUint8Array() method.
  // It is NOT a plain Uint8Array — iterating it directly yields zeroes.
  if (typeof data?.toUint8Array === 'function') {
    return data.toUint8Array();
  }

  // Fallback for plain Uint8Array (future versions or mocks)
  if (data instanceof Uint8Array) {
    return data;
  }

  // Convert ArrayBuffer to Uint8Array if needed
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  throw new Error('Unexpected response type from bee.data.download');
}
