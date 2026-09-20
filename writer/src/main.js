/**
 * writer/src/main.js
 *
 * Application entry point for the Writer.
 *
 * Wires together: auth (Swarm ID), form (DOM), upload-controller (orchestration).
 */

import { initSwarmId, connect, onConnectionChange } from './auth.js';
import { readFormData, resetForm } from './sighting-form.js';
import { uploadSighting, UploadError } from './upload-controller.js';

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const btnConnect = document.getElementById('btn-connect');
const btnSubmit = document.getElementById('btn-submit');
const submitSpinner = document.getElementById('submit-spinner');
const userInfo = document.getElementById('user-info');
const userName = document.getElementById('user-name');
const capabilityBadge = document.getElementById('capability-badge');
const statusBanner = document.getElementById('status-banner');
const resultSection = document.getElementById('result-section');
const resultReference = document.getElementById('result-reference');
const resultReaderLink = document.getElementById('result-reader-link');
const btnCopyRef = document.getElementById('btn-copy-ref');
const sightingForm = document.getElementById('sighting-form');

// ---------------------------------------------------------------------------
// Reader URL configuration
// ---------------------------------------------------------------------------

/**
 * Base URL for the reader application.
 * In production this would be the deployed reader origin.
 * In dev, the reader runs on port 5174.
 */
const READER_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:5174'
  : 'https://road-to-devcon-v-birders-reader.vercel.app';

// ---------------------------------------------------------------------------
// Auth state → UI binding
// ---------------------------------------------------------------------------

onConnectionChange((state) => {
  if (state.identity) {
    // Authenticated
    btnConnect.classList.add('hidden');
    userInfo.classList.remove('hidden');
    userName.textContent = state.identity.name || 'Connected';

    if (state.canUpload) {
      capabilityBadge.textContent = '✓ Can upload';
      capabilityBadge.className = 'capability-badge cap-ok';
      btnSubmit.disabled = false;
      hideBanner();
    } else {
      capabilityBadge.textContent = '✗ No upload capability';
      capabilityBadge.className = 'capability-badge cap-no';
      btnSubmit.disabled = true;
      showBanner('warning', 'Upload is not available. The subsidised gateway may be unavailable or your session lacks upload permission.');
    }
  } else {
    // Not authenticated
    btnConnect.classList.remove('hidden');
    userInfo.classList.add('hidden');
    btnSubmit.disabled = true;
  }
});

// ---------------------------------------------------------------------------
// Connect button
// ---------------------------------------------------------------------------

btnConnect.addEventListener('click', async () => {
  const originalText = btnConnect.textContent;
  btnConnect.disabled = true;
  btnConnect.textContent = 'Connecting...';
  hideBanner();

  try {
    await connect();
  } catch (err) {
    showBanner('error', `Sign-in failed: ${err.message}`);
  } finally {
    btnConnect.disabled = false;
    btnConnect.textContent = originalText;
  }
});

// ---------------------------------------------------------------------------
// Form submission
// ---------------------------------------------------------------------------

sightingForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Read form data
  let sightingData;
  try {
    sightingData = readFormData();
  } catch (err) {
    showBanner('error', err.message);
    return;
  }

  // Show loading state
  setLoading(true);
  hideBanner();
  resultSection.classList.add('hidden');

  try {
    // uploadSighting checks capability BEFORE attempting upload
    const reference = await uploadSighting(sightingData);

    // Display result
    resultReference.textContent = reference;

    const readerUrl = `${READER_BASE_URL}/?ref=${reference}`;
    resultReaderLink.href = readerUrl;
    resultReaderLink.textContent = readerUrl;

    resultSection.classList.remove('hidden');
    showBanner('success', 'Sighting uploaded successfully to Swarm!');
    resetForm();
  } catch (err) {
    if (err instanceof UploadError) {
      // Show title, message, next, and reason code from the upload controller
      showBanner('error', `${err.title}: ${err.message}`, {
        title: err.title,
        message: err.message,
        next: err.next,
        reason: err.reason,
      });
    } else {
      showBanner('error', `Unexpected error: ${err.message}`);
    }
  } finally {
    setLoading(false);
  }
});

// ---------------------------------------------------------------------------
// Copy reference button
// ---------------------------------------------------------------------------

btnCopyRef.addEventListener('click', () => {
  const ref = resultReference.textContent;
  navigator.clipboard.writeText(ref).then(
    () => showBanner('success', 'Reference copied to clipboard!'),
    () => showBanner('error', 'Could not copy to clipboard')
  );
});

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

/**
 * @param {boolean} loading
 */
function setLoading(loading) {
  btnSubmit.disabled = loading;
  submitSpinner.classList.toggle('hidden', !loading);
  btnSubmit.querySelector('.btn-text').textContent = loading
    ? 'Uploading...'
    : 'Upload Sighting';
}

/**
 * @param {'success'|'error'|'warning'} type
 * @param {string} message
 * @param {{ title?: string, message?: string, next?: string, reason?: string } | null} [details]
 */
function showBanner(type, message, details = null) {
  statusBanner.className = `status-banner banner-${type}`;
  statusBanner.replaceChildren();

  if (details) {
    if (details.title) {
      const titleEl = document.createElement('div');
      titleEl.style.fontWeight = '600';
      titleEl.style.marginBottom = '0.25rem';
      titleEl.textContent = details.title;
      statusBanner.appendChild(titleEl);
    }
    if (details.message) {
      const msgEl = document.createElement('div');
      msgEl.textContent = details.message;
      statusBanner.appendChild(msgEl);
    }
    if (details.next) {
      const nextEl = document.createElement('div');
      nextEl.style.marginTop = '0.35rem';
      nextEl.textContent = details.next;
      statusBanner.appendChild(nextEl);
    }
    if (details.reason) {
      const reasonEl = document.createElement('small');
      reasonEl.style.display = 'block';
      reasonEl.style.marginTop = '0.35rem';
      reasonEl.style.opacity = '0.75';
      reasonEl.textContent = `Error: ${details.reason}`;
      statusBanner.appendChild(reasonEl);
    }
  } else {
    statusBanner.textContent = message;
  }

  statusBanner.classList.remove('hidden');
}

function hideBanner() {
  statusBanner.classList.add('hidden');
}

// ---------------------------------------------------------------------------
// Initialise
// ---------------------------------------------------------------------------

initSwarmId().catch((err) => {
  console.warn('[main] Swarm ID background initialization notice:', err.message);
});

// Set default date/time to now
const observedAtInput = document.getElementById('field-observed-at');
if (observedAtInput) {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  observedAtInput.value = local.toISOString().slice(0, 16);
}
