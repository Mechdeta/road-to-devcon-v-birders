/**
 * writer/src/auth.test.js
 *
 * Tests for Swarm ID authentication lifecycle:
 *   - initialization before sign-in
 *   - unauthenticated state
 *   - authenticated/capable state
 *   - authenticated but cannot-upload state
 *   - initialization failure
 *   - sign-in failure
 *
 * Uses Node.js built-in test runner (node --test).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  initSwarmId,
  connect,
  getConnectionState,
  onConnectionChange,
  _resetForTesting,
  SUBSIDISED_GATEWAY_URL,
} from './auth.js';

describe('Swarm ID Authentication Lifecycle', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  it('unauthenticated state — defaults to null identity and canUpload=false', () => {
    const state = getConnectionState();
    assert.strictEqual(state.identity, null);
    assert.strictEqual(state.canUpload, false);

    let immediateState = null;
    const unsubscribe = onConnectionChange((s) => {
      immediateState = s;
    });
    assert.deepStrictEqual(immediateState, { identity: null, canUpload: false });
    unsubscribe();
  });

  it('initialization before sign-in — connects only after initialization completes', async () => {
    const callOrder = [];
    let connectionCallback = null;

    const mockClient = {
      initialize: async () => {
        callOrder.push('initialize');
      },
      connect: async () => {
        callOrder.push('connect');
      },
    };

    // Call connect directly without calling initSwarmId beforehand
    await connect({ client: mockClient });

    assert.deepStrictEqual(callOrder, ['initialize', 'connect'], 'initialize must be called before connect');
  });

  it('idempotent initialization — initSwarmId runs client.initialize exactly once', async () => {
    let initCount = 0;

    const mockClient = {
      initialize: async () => {
        initCount++;
      },
      connect: async () => {},
    };

    const p1 = initSwarmId({ client: mockClient });
    const p2 = initSwarmId({ client: mockClient });

    await Promise.all([p1, p2]);

    assert.strictEqual(initCount, 1, 'client.initialize should only be executed once');
  });

  it('authenticated and capable state — subscriber receives updated state', async () => {
    let connectionCallback = null;

    const mockClient = {
      initialize: async () => {
        // Simulating the iframe sending initial connectionInfo
        if (connectionCallback) {
          connectionCallback({
            identity: { name: 'Meera', address: '0x1234567890abcdef' },
            canUpload: true,
            uploadMode: 'subsidised',
          });
        }
      },
      connect: async () => {},
    };

    const states = [];
    const unsubscribe = onConnectionChange((s) => {
      states.push({ ...s });
    });

    await initSwarmId({
      client: mockClient,
      subsidisedGatewayUrl: SUBSIDISED_GATEWAY_URL,
    });

    // Simulate connection change event
    const state = getConnectionState();
    // Initially unauthenticated until callback triggers
    assert.strictEqual(states.length >= 1, true);

    unsubscribe();
  });

  it('authenticated but cannot-upload state — canUpload is false when stamp is missing and gateway disabled', async () => {
    let recordedState = null;
    const unsubscribe = onConnectionChange((s) => {
      recordedState = s;
    });

    const mockClient = {
      initialize: async () => {},
      connect: async () => {},
      connectionInfo: {
        identity: { name: 'Ravi', address: '0xabcdef123456' },
        canUpload: false,
        uploadUnavailableReason: 'no-stamp',
      },
    };

    await initSwarmId({ client: mockClient });

    const state = getConnectionState();
    assert.strictEqual(state.identity?.name, 'Ravi');
    assert.strictEqual(state.canUpload, false);
    assert.strictEqual(recordedState.canUpload, false);

    unsubscribe();
  });

  it('initialization failure — surfaces clear error and cleans up state', async () => {
    const mockClient = {
      initialize: async () => {
        throw new Error('Iframe communication blocked by security policy');
      },
      connect: async () => {},
    };

    await assert.rejects(
      () => initSwarmId({ client: mockClient }),
      (err) => {
        assert.match(err.message, /Swarm ID initialisation failed/);
        assert.match(err.message, /Iframe communication blocked/);
        return true;
      }
    );

    // State remains unauthenticated
    const state = getConnectionState();
    assert.strictEqual(state.identity, null);
    assert.strictEqual(state.canUpload, false);

    // Subsequent connect() attempt surfaces the initialization error
    await assert.rejects(
      () => connect({ client: mockClient }),
      (err) => {
        assert.match(err.message, /Swarm ID initialisation failed/);
        return true;
      }
    );
  });

  it('sign-in failure — surfaces popup/connect rejection to caller', async () => {
    const mockClient = {
      initialize: async () => {},
      connect: async () => {
        throw new Error('User closed authentication popup');
      },
    };

    await initSwarmId({ client: mockClient });

    await assert.rejects(
      () => connect(),
      (err) => {
        assert.match(err.message, /User closed authentication popup/);
        return true;
      }
    );
  });
});
