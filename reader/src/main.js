/**
 * reader/src/main.js
 *
 * Application entry point for the Reader.
 *
 * This is a completely independent application from the writer.
 * It imports ONLY from:
 *   - @ethersphere/bee-js (via ./swarm.js)
 *   - @deccan/sighting-format (via ./sighting-viewer.js)
 *
 * NO imports from the writer application exist anywhere in this codebase.
 *
 * Record discovery:
 *   The reader receives the Swarm reference via:
 *   1. URL query parameter: ?ref=<64-char-hex>
 *   2. Manual paste into the reference input field
 *
 *   The reference is a standard Swarm content address — not an application-
 *   specific internal writer URL. Any Swarm client can use it.
 */

import { downloadBytes } from './swarm.js';
import { displaySighting, formatFetchError } from './sighting-viewer.js';

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const refForm = document.getElementById('ref-form');
const fieldReference = document.getElementById('field-reference');
const btnFetch = document.getElementById('btn-fetch');
const fetchSpinner = document.getElementById('fetch-spinner');
const statusBanner = document.getElementById('status-banner');
const sightingSection = document.getElementById('sighting-section');

// ---------------------------------------------------------------------------
// Auto-load from URL query parameter
// ---------------------------------------------------------------------------

const urlParams = new URLSearchParams(window.location.search);
const refFromUrl = urlParams.get('ref');

if (refFromUrl && /^[a-fA-F0-9]{64}$/.test(refFromUrl)) {
  fieldReference.value = refFromUrl;
  // Auto-fetch on page load
  fetchAndDisplay(refFromUrl);
}

// ---------------------------------------------------------------------------
// Form submission
// ---------------------------------------------------------------------------

refForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const ref = fieldReference.value.trim().toLowerCase();
  fetchAndDisplay(ref);
});

// ---------------------------------------------------------------------------
// Core fetch + display flow
// ---------------------------------------------------------------------------

/**
 * Fetch a sighting record from Swarm and display it.
 *
 * Downloads via GET /bytes/:ref (the same endpoint family used by the writer
 * for uploads), then decodes the DBIR binary record and renders it.
 *
 * @param {string} reference — 64-char hex Swarm reference
 */
async function fetchAndDisplay(reference) {
  setLoading(true);
  hideBanner();
  sightingSection.classList.add('hidden');

  try {
    // Download raw bytes from Swarm via /bytes endpoint
    const rawBytes = await downloadBytes(reference);

    // Decode DBIR format and render
    displaySighting(rawBytes, reference);

    showBanner('success', 'Sighting loaded from Swarm!');
  } catch (err) {
    const message = formatFetchError(err);
    showBanner('error', message);
  } finally {
    setLoading(false);
  }
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function setLoading(loading) {
  btnFetch.disabled = loading;
  fetchSpinner.classList.toggle('hidden', !loading);
  btnFetch.querySelector('.btn-text').textContent = loading
    ? 'Fetching...'
    : 'Fetch Sighting';
}

function showBanner(type, message) {
  statusBanner.textContent = message;
  statusBanner.className = `status-banner banner-${type}`;
  statusBanner.classList.remove('hidden');
}

function hideBanner() {
  statusBanner.classList.add('hidden');
}
