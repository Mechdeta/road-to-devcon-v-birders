/**
 * reader/src/sighting-viewer.js
 *
 * Renders a decoded sighting object into the DOM.
 *
 * This module imports ONLY from @deccan/sighting-format (the shared package).
 * It does NOT import any code from the writer application.
 */

import { decode, FormatError } from '@deccan/sighting-format';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Decode raw DBIR bytes and render the sighting into the DOM.
 *
 * @param {Uint8Array} rawBytes — the raw DBIR record from Swarm
 * @param {string} reference — the Swarm reference (for display)
 * @throws {FormatError} if the record is invalid
 * @throws {Error} if DOM elements are missing
 */
export function displaySighting(rawBytes, reference) {
  // Decode using the shared format — validates magic, version, required fields
  const sighting = decode(rawBytes);

  // Render into DOM
  setText('sighting-species', `🐦 ${sighting.species}`);

  // Location
  const locationName = sighting.location.name || 'Unknown location';
  setText('sighting-location', locationName);
  setText('sighting-coords', `${sighting.location.lat.toFixed(4)}°, ${sighting.location.lng.toFixed(4)}°`);

  // Date
  const date = new Date(sighting.observedAt);
  const dateStr = date.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  setText('sighting-date', `${dateStr} at ${timeStr}`);

  // Count (optional)
  const countGroup = document.getElementById('detail-count-group');
  if (sighting.count !== undefined && sighting.count !== null) {
    setText('sighting-count', `${sighting.count} individual${sighting.count !== 1 ? 's' : ''}`);
    countGroup?.classList.remove('hidden');
  } else {
    countGroup?.classList.add('hidden');
  }

  // Observer (optional)
  const observerGroup = document.getElementById('detail-observer-group');
  if (sighting.observer) {
    setText('sighting-observer', sighting.observer);
    observerGroup?.classList.remove('hidden');
  } else {
    observerGroup?.classList.add('hidden');
  }

  // Notes (optional)
  const notesGroup = document.getElementById('detail-notes-group');
  if (sighting.notes) {
    setText('sighting-notes', sighting.notes);
    notesGroup?.classList.remove('hidden');
  } else {
    notesGroup?.classList.add('hidden');
  }

  // Reference
  setText('sighting-ref', reference);

  // Show the sighting section
  document.getElementById('sighting-section')?.classList.remove('hidden');
}

/**
 * Format a FormatError or generic Error into a user-friendly message.
 *
 * @param {Error} err
 * @returns {string}
 */
export function formatFetchError(err) {
  if (err instanceof FormatError) {
    switch (err.code) {
      case 'INVALID_MAGIC':
        return 'This reference does not contain a Deccan Birders sighting record.';
      case 'UNSUPPORTED_VERSION':
        return err.message; // Already user-friendly
      case 'INVALID_JSON':
        return 'The record data is corrupted and cannot be read.';
      case 'MISSING_FIELD':
        return `The record is incomplete: ${err.message}`;
      default:
        return `Invalid record: ${err.message}`;
    }
  }

  if (err.message?.includes('Invalid Swarm reference')) {
    return 'Please enter a valid 64-character hex reference.';
  }

  if (err.message?.includes('404') || err.message?.includes('not found')) {
    return 'No record found for this reference. It may have expired or the reference may be incorrect.';
  }

  if (err.message?.includes('fetch') || err.name === 'TypeError') {
    return 'Could not reach the Swarm gateway. Please check your internet connection.';
  }

  return `Could not fetch the sighting: ${err.message}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @param {string} id
 * @param {string} text
 */
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
