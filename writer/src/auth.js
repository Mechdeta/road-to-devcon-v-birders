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

const SWARM_ID_IFRAME_ORIGIN = 'https://swarm-id.snaha.net';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** @type {{ identity: object|null, canUpload: boolean }} */
let connectionState = { identity: null, canUpload: false };

/** @type {object|null} SwarmIdClient instance */
let client = null;

/** @type {Array<(state: typeof connectionState) => void>} */
const listeners = [];

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
 * Must be called once at app startup.
 */
export async function initSwarmId() {
  try {
    const { SwarmIdClient } = await import('https://swarm-id.snaha.net/sdk/index.js');

    client = new SwarmIdClient({
      iframeOrigin: SWARM_ID_IFRAME_ORIGIN,
      metadata: {
        name: 'Deccan Birders',
        description: 'Bird sighting recorder — Deccan Birders',
      },
      onConnectionChange: (info) => {
        connectionState = {
          identity: info.identity ?? null,
          canUpload: Boolean(info.canUpload),
        };
        listeners.forEach((fn) => fn(connectionState));
      },
    });

    await client.initialize();
  } catch (err) {
    console.warn('[auth] Swarm ID initialisation failed:', err.message);
    // Swarm ID SDK may not be available in dev/test — fall back to degraded mode.
    // connectionState remains { identity: null, canUpload: false }
  }
}

/**
 * Open the Swarm ID authentication popup.
 * @throws {Error} if Swarm ID client is not initialised
 */
export async function connect() {
  if (!client) {
    throw new Error('Swarm ID is not initialised. Call initSwarmId() first.');
  }
  await client.connect();
}
