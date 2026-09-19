/**
 * writer/src/sighting-form.js
 *
 * Handles form interaction — reading values, validation, state management.
 * Pure DOM interaction; does not import Swarm or auth code.
 */

// ---------------------------------------------------------------------------
// Read form data
// ---------------------------------------------------------------------------

/**
 * Read the sighting form fields and return a sighting object.
 *
 * @returns {object} sighting data matching the DBIR v1 payload schema
 * @throws {Error} if required fields are empty (should not happen with HTML validation)
 */
export function readFormData() {
  const species = getVal('field-species');
  const lat = parseFloat(getVal('field-lat'));
  const lng = parseFloat(getVal('field-lng'));
  const locationName = getVal('field-location-name');
  const observedAt = getVal('field-observed-at');
  const countRaw = getVal('field-count');
  const observer = getVal('field-observer');
  const notes = getVal('field-notes');

  if (!species) throw new Error('Species is required');
  if (isNaN(lat)) throw new Error('Latitude is required');
  if (isNaN(lng)) throw new Error('Longitude is required');
  if (!observedAt) throw new Error('Date/time is required');

  /** @type {object} */
  const sighting = {
    species,
    location: { lat, lng },
    observedAt: new Date(observedAt).toISOString(),
  };

  if (locationName) sighting.location.name = locationName;
  if (countRaw !== '') sighting.count = parseInt(countRaw, 10);
  if (observer) sighting.observer = observer;
  if (notes) sighting.notes = notes;

  return sighting;
}

/**
 * Reset the form to its initial state.
 */
export function resetForm() {
  /** @type {HTMLFormElement} */
  const form = document.getElementById('sighting-form');
  if (form) form.reset();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @param {string} id
 * @returns {string}
 */
function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}
