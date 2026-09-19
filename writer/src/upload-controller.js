/**
 * writer/src/upload-controller.js
 *
 * Orchestrates the upload flow:
 *   1. Capability check (canUpload gate — BEFORE any upload attempt)
 *   2. Serialise sighting to DBIR format
 *   3. Upload to Swarm gateway /bytes
 *   4. Return reference or throw with a specific reason
 *
 * Every failure path produces an UploadError with:
 *   - reason: machine-readable code
 *   - message: human-readable explanation
 */

import { encode } from '@deccan/sighting-format';
import { getConnectionState } from './auth.js';
import { uploadBytes } from './swarm.js';

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class UploadError extends Error {
  /**
   * @param {string} reason  Machine-readable reason code
   * @param {string} message Human-readable message for the user
   */
  constructor(reason, message) {
    super(message);
    this.name = 'UploadError';
    this.reason = reason;
  }
}

// ---------------------------------------------------------------------------
// Upload flow
// ---------------------------------------------------------------------------

/**
 * Upload a sighting record to Swarm.
 *
 * IMPORTANT: capability is checked BEFORE any upload is attempted.
 * This is the single entry point for all uploads in the writer app.
 *
 * @param {object} sightingData — the sighting object (species, location, etc.)
 * @returns {Promise<string>} the Swarm reference (64-char hex)
 * @throws {UploadError} with a specific reason for every failure mode
 */
export async function uploadSighting(sightingData) {
  // ── Gate 1: Authentication check ─────────────────────────────────────
  const state = getConnectionState();

  if (!state.identity) {
    throw new UploadError(
      'NOT_AUTHENTICATED',
      'You must sign in with Swarm ID before uploading.'
    );
  }

  // ── Gate 2: Upload capability check ──────────────────────────────────
  // This runs BEFORE any upload attempt, satisfying acceptance test 1.
  if (!state.canUpload) {
    throw new UploadError(
      'NO_UPLOAD_CAPABILITY',
      'Upload is not available. The subsidised gateway may be down or your session lacks upload permission.'
    );
  }

  // ── Step 3: Serialise to DBIR format ─────────────────────────────────
  let bytes;
  try {
    bytes = encode(sightingData);
  } catch (err) {
    throw new UploadError(
      'SERIALISATION_FAILED',
      `Could not serialise the sighting: ${err.message}`
    );
  }

  // ── Step 4: Upload to Swarm ──────────────────────────────────────────
  try {
    const reference = await uploadBytes(bytes);
    return reference;
  } catch (err) {
    // Map specific HTTP / network errors to user-visible reasons
    if (err?.status === 402 || err?.message?.includes('402')) {
      throw new UploadError(
        'GATEWAY_PAYMENT_REQUIRED',
        'The subsidised gateway rejected the upload — postage budget may be exhausted. Try again later.'
      );
    }

    if (err?.status === 403 || err?.message?.includes('403')) {
      throw new UploadError(
        'GATEWAY_FORBIDDEN',
        'The gateway denied the upload. Your session may have expired — try signing in again.'
      );
    }

    if (err?.status === 413 || err?.message?.includes('413')) {
      throw new UploadError(
        'PAYLOAD_TOO_LARGE',
        'The sighting record is too large for the gateway to accept.'
      );
    }

    if (
      err?.message?.includes('fetch') ||
      err?.message?.includes('network') ||
      err?.message?.includes('Failed') ||
      err?.name === 'TypeError'
    ) {
      throw new UploadError(
        'NETWORK_ERROR',
        'Could not reach the Swarm gateway. Please check your internet connection and try again.'
      );
    }

    throw new UploadError(
      'UPLOAD_FAILED',
      `Upload failed: ${err?.message || 'Unknown error'}`
    );
  }
}
