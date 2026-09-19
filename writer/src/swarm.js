/**
 * writer/src/swarm.js
 *
 * Swarm gateway upload module.
 *
 * Uploads raw bytes to the subsidised gateway via bee-js v13 namespace API.
 *
 * Key constraints enforced here:
 *   - Uses /bytes endpoint (bee.data.upload)
 *   - Uses NULL_STAMP (no user postage batch required)
 *   - Never sends Swarm-Pin, Swarm-Tag, or ACT headers
 *   - All uploads go through the subsidised gateway only
 */

import { Bee, NULL_STAMP } from '@ethersphere/bee-js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Subsidised gateway URL.
 * This is a public gateway that accepts uploads with NULL_STAMP —
 * users do not need their own postage batch.
 */
const GATEWAY_URL = 'https://api.gateway.ethswarm.org/';

/** Bee client pointed at the subsidised gateway */
const bee = new Bee(GATEWAY_URL);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Upload raw bytes to Swarm via the subsidised gateway /bytes endpoint.
 *
 * The upload uses NULL_STAMP and passes NO options — ensuring that
 * Swarm-Pin, Swarm-Tag, and ACT headers are never sent.
 *
 * @param {Uint8Array} data — the raw bytes to upload
 * @returns {Promise<string>} the Swarm reference as a hex string
 * @throws {Error} if the gateway rejects the upload or is unreachable
 */
export async function uploadBytes(data) {
  // bee.data.upload maps to POST /bytes
  // NULL_STAMP tells the gateway to use its subsidised postage batch
  // No options object → no pin, no tag, no ACT headers
  const result = await bee.data.upload(NULL_STAMP, data);
  return referenceToHex(result.reference);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a bee-js Reference to a 64-char lowercase hex string.
 * Handles both string references and Reference objects with toHex().
 *
 * @param {string|object} ref
 * @returns {string} 64-char hex string
 */
function referenceToHex(ref) {
  if (typeof ref === 'string') return ref.toLowerCase();
  if (typeof ref?.toHex === 'function') return ref.toHex().toLowerCase();
  return String(ref).toLowerCase();
}
