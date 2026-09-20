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
import { getConnectionState, getClient, getConnectionInfo } from './auth.js';
import { uploadBytes } from './swarm.js';

// ---------------------------------------------------------------------------
// Error messages table
// Approach adapted from p2-birders (MIT)
// ---------------------------------------------------------------------------

export const MESSAGES = {
  SWARM_ID_UNAVAILABLE: {
    title: 'Swarm ID unavailable',
    message: 'Swarm ID is not initialised yet. Please wait for initialisation to finish or reload the page.',
    next: 'Wait for Swarm ID to connect, or reload the page.',
  },
  NOT_AUTHENTICATED: {
    title: 'Sign in required',
    message: 'You must sign in with Swarm ID before uploading.',
    next: 'Sign in with Swarm ID and try again.',
  },
  NO_UPLOAD_CAPABILITY: {
    title: 'Upload permission unavailable',
    message: 'Upload is not available. The subsidised gateway may be down or your session lacks upload permission.',
    next: 'Check your Swarm ID account or reconnect to the gateway.',
  },
  SERIALISATION_FAILED: {
    title: 'Sighting data format invalid',
    message: 'Could not serialise the sighting into DBIR binary format.',
    next: 'Verify all required sighting fields are filled correctly.',
  },
  GATEWAY_PAYMENT_REQUIRED: {
    title: 'Postage budget exhausted',
    message: 'The subsidised gateway rejected the upload — postage budget may be exhausted. Try again later.',
    next: 'Try again later or use a funded Swarm account.',
  },
  GATEWAY_FORBIDDEN: {
    title: 'Gateway access denied',
    message: 'The gateway denied the upload. Your session may have expired — try signing in again.',
    next: 'Sign in again to refresh your session.',
  },
  PAYLOAD_TOO_LARGE: {
    title: 'Sighting record exceeds size limit',
    message: 'The sighting record is too large for the gateway to accept.',
    next: 'Reduce the size of attached data and try again.',
  },
  RATE_LIMITED: {
    title: 'Gateway rate limit reached',
    message: 'Too many upload requests were sent to the gateway in a short time (HTTP 429).',
    next: 'Wait a moment before submitting your sighting again.',
  },
  GATEWAY_5XX: {
    title: 'Gateway server error',
    message: 'The storage gateway encountered an internal server error while processing the upload.',
    next: 'Wait a moment for the gateway service to recover and try again.',
  },
  TIMEOUT: {
    title: 'Upload request timed out',
    message: 'The upload request took too long and timed out.',
    next: 'Check your network connection and retry the upload.',
  },
  OFFLINE: {
    title: 'Device is offline',
    message: 'This device has no active network connection right now.',
    next: 'Connect your device to the internet and retry.',
  },
  GATEWAY_UNREACHABLE: {
    title: 'Gateway unreachable',
    message: 'Could not reach the Swarm gateway. Please check your internet connection and try again.',
    next: 'Verify the gateway is operational and your network is connected.',
  },
  NETWORK_ERROR: {
    title: 'Network transmission failed',
    message: 'A network transmission error interrupted the communication with the Swarm gateway.',
    next: 'Check your network connection and try again.',
  },
  UPLOAD_FAILED: {
    title: 'Upload could not be completed',
    message: 'An unexpected error prevented the sighting from being uploaded.',
    next: 'Check the error details and try again.',
  },
};

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class UploadError extends Error {
  /**
   * @param {string} reason  Machine-readable reason code
   * @param {string} [customMessage] Human-readable message for the user
   * @param {object} [options]
   * @param {string} [options.title]
   * @param {string} [options.next]
   * @param {string} [options.detail]
   * @param {unknown} [options.cause]
   */
  constructor(reason, customMessage, options = {}) {
    const copy = MESSAGES[reason];
    const message = customMessage || copy?.message || 'An unexpected error occurred.';
    super(message);
    this.name = 'UploadError';
    this.reason = reason;
    this.code = reason;
    this.title = options.title || copy?.title || 'Upload error';
    this.next = options.next || copy?.next || 'Please try again.';
    this.detail = options.detail;
    if (options.cause) {
      this.cause = options.cause;
    }
  }

  get copy() {
    return {
      title: this.title,
      message: this.message,
      next: this.next,
    };
  }
}

// ---------------------------------------------------------------------------
// Error classifiers
// Approach adapted from p2-birders (MIT)
// ---------------------------------------------------------------------------

/**
 * Checks if the device is offline.
 * Guarded against Node environments: Node defines `navigator` but not `navigator.onLine`.
 * Only reports offline when `navigator.onLine === false` strictly.
 *
 * @returns {boolean}
 */
export function isDeviceOffline() {
  if (typeof navigator === 'undefined') {
    return false;
  }
  return navigator.onLine === false;
}

/**
 * Extracts HTTP status code from an error by inspecting:
 * 1. err.status (direct property on BeeResponseError)
 * 2. err.response?.status (nested response property)
 * 3. Context-anchored regex on err.message matching 4xx/5xx codes with word boundaries
 *    and a nearby "status" / "failed" / "http" style context.
 *
 * @param {unknown} err
 * @returns {number | undefined}
 */
export function statusOf(err) {
  if (typeof err === 'object' && err !== null) {
    if (typeof err.status === 'number') {
      return err.status;
    }
    if (typeof err.response?.status === 'number') {
      return err.response.status;
    }
  }

  const msg = err instanceof Error ? err.message : (typeof err === 'string' ? err : '');
  if (!msg) return undefined;

  // Context-anchored regex: 4xx/5xx codes with word boundaries and nearby HTTP-style context
  const match =
    /\b(?:status(?:\s*code)?|failed|failure|error|http)[^\w\d\n]{0,15}\b([45]\d{2})\b/i.exec(msg) ||
    /\b([45]\d{2})\b[^\w\d\n]{0,15}\b(?:error|status|failed|failure|internal server error|bad gateway|service unavailable|gateway timeout|too many requests|not found|forbidden|unauthorized|payload too large|payment required)\b/i.exec(msg);

  return match ? Number(match[1]) : undefined;
}

/**
 * Maps any error thrown during upload to an UploadError with a specific reason.
 * Approach adapted from p2-birders (MIT).
 *
 * @param {unknown} err
 * @param {() => boolean} [isOnline]
 * @returns {UploadError}
 */
export function classifyUploadError(err, isOnline = () => !isDeviceOffline()) {
  if (err instanceof UploadError) {
    return err;
  }

  // 1. Offline check
  if (!isOnline()) {
    return new UploadError('OFFLINE', undefined, { cause: err });
  }

  const msg = err instanceof Error ? err.message : String(err || '');

  // 2. Timeout / Abort
  if (
    err?.name === 'TimeoutError' ||
    err?.name === 'AbortError' ||
    /timeout|timed out|aborted|ETIMEDOUT/i.test(msg)
  ) {
    return new UploadError('TIMEOUT', undefined, { cause: err, detail: msg });
  }

  // 3. HTTP status check via statusOf
  const status = statusOf(err);
  if (status === 402) {
    return new UploadError('GATEWAY_PAYMENT_REQUIRED', undefined, { cause: err, detail: msg });
  }
  if (status === 403) {
    return new UploadError('GATEWAY_FORBIDDEN', undefined, { cause: err, detail: msg });
  }
  if (status === 413) {
    return new UploadError('PAYLOAD_TOO_LARGE', undefined, { cause: err, detail: msg });
  }
  if (status === 429) {
    return new UploadError('RATE_LIMITED', undefined, { cause: err, detail: msg });
  }
  if (status !== undefined && status >= 500) {
    return new UploadError('GATEWAY_5XX', undefined, { cause: err, detail: msg });
  }

  // 4. Failed to fetch / network unreachable when online -> GATEWAY_UNREACHABLE
  if (
    /failed to fetch|fetch failed|networkerror|load failed|econnrefused|enetunreach/i.test(msg) ||
    err?.name === 'TypeError'
  ) {
    return new UploadError('GATEWAY_UNREACHABLE', undefined, { cause: err, detail: msg });
  }

  // 5. Generic network error if explicitly mentioned
  if (/network/i.test(msg)) {
    return new UploadError('NETWORK_ERROR', undefined, { cause: err, detail: msg });
  }

  // 6. Generic upload failure
  return new UploadError('UPLOAD_FAILED', `Upload failed: ${msg || 'Unknown error'}`, { cause: err, detail: msg });
}

// ---------------------------------------------------------------------------
// Upload flow
// ---------------------------------------------------------------------------

/**
 * Factory creating an upload controller with injectable dependencies.
 * Used for testing with mock state / gateway stubs, or defaults to production modules.
 *
 * @param {object} [deps]
 * @param {() => object} [deps.getConnectionInfo]
 * @param {() => object|null} [deps.getClient]
 * @param {() => { identity: object|null, canUpload: boolean }} [deps.getConnectionState]
 * @param {(data: Uint8Array) => Promise<string>} [deps.uploadBytes]
 * @param {() => boolean} [deps.isOnline]
 * @param {() => boolean} [deps.isOffline]
 * @returns {{ uploadSighting: (sightingData: object) => Promise<string>, UploadError: typeof UploadError }}
 */
export function createUploadController(deps = {}) {
  const getFreshConnectionInfo = () => {
    if (typeof deps.getConnectionInfo === 'function') {
      return deps.getConnectionInfo();
    }
    if (typeof deps.getClient === 'function') {
      const client = deps.getClient();
      if (!client) {
        throw new Error('Swarm ID client is not available.');
      }
      return client.connectionInfo;
    }
    if (typeof deps.getConnectionState === 'function') {
      return deps.getConnectionState();
    }
    const client = getClient();
    if (client) {
      return client.connectionInfo;
    }
    return getConnectionInfo();
  };

  const upload = deps.uploadBytes || uploadBytes;
  const checkIsOffline = () => {
    if (typeof deps.isOffline === 'function') {
      return deps.isOffline();
    }
    if (typeof deps.isOnline === 'function') {
      return !deps.isOnline();
    }
    return isDeviceOffline();
  };

  async function uploadSighting(sightingData) {
    // ── Gate 0: Network / offline check ──────────────────────────────────
    if (checkIsOffline()) {
      throw new UploadError('OFFLINE');
    }

    // ── Gate 1: Re-read connection info fresh at upload time ─────────────
    let conn;
    try {
      conn = getFreshConnectionInfo();
    } catch (err) {
      throw new UploadError(
        'SWARM_ID_UNAVAILABLE',
        `Swarm ID connection unavailable: ${err.message}`,
        { cause: err }
      );
    }

    // ── Gate 2: Authentication check ─────────────────────────────────────
    if (!conn || !conn.identity) {
      throw new UploadError('NOT_AUTHENTICATED');
    }

    // ── Gate 3: Upload mode check ───────────────────────────────────────
    // Treat uploadMode === 'unavailable' as a failure regardless of canUpload.
    if (conn.uploadMode === 'unavailable') {
      throw new UploadError(
        'NO_UPLOAD_CAPABILITY',
        'Upload is unavailable because the Swarm ID upload mode is unavailable.'
      );
    }

    // ── Gate 4: Upload capability check ──────────────────────────────────
    // Runs BEFORE encode and BEFORE any upload attempt.
    if (!conn.canUpload) {
      if (conn.uploadUnavailableReason === 'no-stamp') {
        throw new UploadError(
          'NO_UPLOAD_CAPABILITY',
          'Upload is unavailable because your Swarm ID account lacks a postage stamp and no subsidised gateway is available.'
        );
      }
      if (conn.uploadUnavailableReason === 'stamper-failed') {
        throw new UploadError(
          'NO_UPLOAD_CAPABILITY',
          'Upload is unavailable because the Swarm ID stamper could not be prepared.'
        );
      }
      throw new UploadError('NO_UPLOAD_CAPABILITY');
    }

    // ── Step 4: Serialise to DBIR format ─────────────────────────────────
    let bytes;
    try {
      bytes = encode(sightingData);
    } catch (err) {
      throw new UploadError(
        'SERIALISATION_FAILED',
        `Could not serialise the sighting: ${err.message}`
      );
    }

    // ── Step 5: Upload to Swarm ──────────────────────────────────────────
    try {
      const reference = await upload(bytes);
      return reference;
    } catch (err) {
      throw classifyUploadError(err, () => !checkIsOffline());
    }
  }

  return { uploadSighting, UploadError };
}

/**
 * Upload a sighting record to Swarm.
 *
 * IMPORTANT: capability is checked BEFORE any upload is attempted.
 * This is the single entry point for all uploads in the writer app.
 *
 * @param {object} sightingData — the sighting object (species, location, etc.)
 * @param {object} [deps] — optional dependency overrides (for testing)
 * @returns {Promise<string>} the Swarm reference (64-char hex)
 * @throws {UploadError} with a specific reason for every failure mode
 */
export async function uploadSighting(sightingData, deps = {}) {
  const controller = createUploadController(deps);
  return controller.uploadSighting(sightingData);
}

