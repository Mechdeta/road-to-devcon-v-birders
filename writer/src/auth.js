/**
 * writer/src/auth.js
 *
 * Swarm ID authentication module.
 *
 * Manages the SwarmIdClient lifecycle: initialise the iframe proxy,
 * connect via popup, and track connection state (identity + canUpload).
 *
 * The subsidised gateway (api.gateway.ethswarm.org) is configured through
 * Swarm ID so that users who hold no personal postage stamp can still upload.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const SWARM_ID_IFRAME_ORIGIN = 'https://swarm-id.snaha.net';
export const SUBSIDISED_GATEWAY_URL = 'https://api.gateway.ethswarm.org/';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** @type {{ identity: object|null, canUpload: boolean }} */
let connectionState = { identity: null, canUpload: false };

/** @type {object|null} SwarmIdClient instance */
let client = null;

/** @type {Promise<object>|null} In-flight or completed initialization promise */
let initPromise = null;

/** @type {Array<(state: typeof connectionState) => void>} */
const listeners = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Update internal connection state and notify all registered listeners.
 * @param {object|null} info
 */
function updateConnectionState(info) {
  connectionState = {
    identity: info?.identity ?? null,
    canUpload: Boolean(info?.canUpload),
  };
  listeners.forEach((fn) => fn(connectionState));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Subscribe to connection state changes.
 * @param {(state: { identity: object|null, canUpload: boolean }) => void} fn
 * @returns {() => void} unsubscribe function
 */
export function onConnectionChange(fn) {
  listeners.push(fn);
  // Immediately fire with current state
  fn(connectionState);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

/**
 * Get the current connection state (snapshot).
 * @returns {{ identity: object|null, canUpload: boolean }}
 */
export function getConnectionState() {
  return { ...connectionState };
}

/**
 * Initialise the Swarm ID client (embeds hidden iframe).
 * Ensures initialization happens exactly once (idempotent).
 *
 * @param {object} [config] Optional configuration overrides or client injection
 * @returns {Promise<object>} resolves with the initialized SwarmIdClient instance
 */
export async function initSwarmId(config = {}) {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      if (config.client) {
        client = config.client;
      } else {
        const { SwarmIdClient } = await import('@snaha/swarm-id');

        client = new SwarmIdClient({
          iframeOrigin: config.iframeOrigin || SWARM_ID_IFRAME_ORIGIN,
          subsidisedGatewayUrl: config.subsidisedGatewayUrl || SUBSIDISED_GATEWAY_URL,
          metadata: {
            name: 'Deccan Birders',
            description: 'Bird sighting recorder — Deccan Birders',
          },
          onConnectionChange: (info) => {
            updateConnectionState(info);
          },
        });
      }

      if (typeof client.initialize === 'function') {
        await client.initialize();
      }

      if (client.connectionInfo) {
        updateConnectionState(client.connectionInfo);
      }

      return client;
    } catch (err) {
      initPromise = null;
      client = null;
      throw new Error(`Swarm ID initialisation failed: ${err.message}`);
    }
  })();

  return initPromise;
}

/**
 * Open the Swarm ID authentication popup.
 * Guarantees the Swarm ID client is initialized BEFORE connect is called.
 *
 * @param {object} [options]
 * @returns {Promise<void>}
 */
export async function connect(options) {
  if (!client) {
    await initSwarmId(options);
  }

  if (!client || typeof client.connect !== 'function') {
    throw new Error('Swarm ID is not initialised.');
  }

  await client.connect(options);
}

/**
 * Test helper to reset internal state between tests.
 * @private
 */
export function _resetForTesting() {
  connectionState = { identity: null, canUpload: false };
  client = null;
  initPromise = null;
  listeners.length = 0;
}
