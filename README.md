# Deccan Birders — Decentralized Bird Sightings

> **Road To Devcon V — Problem 2: "Take your records with you"**

A decentralized bird-sighting record system built on the **Swarm decentralized storage network**.

A birder can create a sighting in the Writer application, store it directly on Swarm, receive a content-addressed reference, and share that reference with anyone.

A completely separate Reader application can retrieve and display the record directly from Swarm — **without the original Writer application, without an export/import step, and without a Swarm ID account.**

---

## 🎯 Challenge

The core requirement is:

> **"Meera files a sighting in one app and opens it in a completely different one, and nobody had to export anything."**

This project implements that workflow using:

- Swarm decentralized storage
- Swarm ID authentication
- Swarm's subsidized gateway
- Content-addressed records
- A documented self-describing binary format
- Completely independent Writer and Reader applications

---

## 🚀 Live Demo

## Writer

Create and upload bird sightings.

**Live:**  
https://road-to-devcon-v-birders-writer.vercel.app/

The Writer requires Swarm ID authentication before uploading.

---

## Independent Reader

Retrieve a sighting directly from Swarm using its content reference.

**Live:**  
https://road-to-devcon-v-birders-reader.vercel.app/

No account is required to read a record.

---

## 🌐 Public Example Record

Here is a real record uploaded to Swarm through the production Writer.

### Peacock — Koradi Lake, Nagpur

**Open directly in the Reader:**

https://road-to-devcon-v-birders-reader.vercel.app/?ref=d2eb98083a7f9ce0f7e782727496e2ef3051c359643f587331abf1918ce3a6e4

**Swarm reference:**

```text
d2eb98083a7f9ce0f7e782727496e2ef3051c359643f587331abf1918ce3a6e4
```

## ✅ Acceptance Criteria Matrix

This section maps the Problem 2 acceptance criteria ("Take your records with you") to requirements, implementation, and verifiable evidence.

### Problem 2 Acceptance Criteria
> **"Meera files a sighting in one app and opens it in a completely different one, and nobody had to export anything."**

| Acceptance Criterion | Requirement | Implementation | Evidence |
|----------------------|-------------|----------------|----------|
| **Files sighting in one app** | Writer application for creating bird sightings | Writer package (`/writer`) with form input, Swarm ID auth, and upload controller | [Writer tests](writer/src/upload-controller.test.js): Valid sighting creation and upload workflow<br>[Live Writer](https://road-to-devcon-v-birders-writer.vercel.app/) |
| **Opens in completely different app** | Reader application for viewing sightings | Reader package (`/reader`) that independently reads and displays DBIR records from Swarm | [Reader tests](shared/sighting-format.test.js): Decoding and rendering validation<br>[Live Reader](https://road-to-devcon-v-birders-reader.vercel.app/) |
| **Nobody had to export anything** | Direct Swarm storage with content addressing | Records written directly to Swarm via `/bytes` endpoint; Reader reads via same endpoint | [FORMAT.md](shared/FORMAT.md): Specifies Swarm `/bytes` endpoint usage<br>[Audit Check 1](scripts/audit-checks.mjs): Verifies no writer-specific imports in reader |
| **Completely independent applications** | Zero shared state or code between Writer and Reader | Separate Vite apps; Reader imports ONLY `@deccan/sighting-format` and `bee-js`; zero Writer imports | [CLAUDE.md](CLAUDE.md): "The reader may import only bee-js and /shared, never anything from /writer"<br>[Audit Check 4](scripts/audit-checks.mjs): Validates reader dependencies and imports |
| **Uses Swarm decentralized storage** | Storage on Swarm network via `bee-js` | Writer uploads via `uploadBytes()` to Swarm; Reader downloads via `downloadBytes()` from Swarm | [Writer upload-controller](writer/src/upload-controller.js): Uses bee-js client<br>[Reader swarm helper](reader/src/swarm.js): Bee-js download function |
| **Content-addressed records** | 64-character hex Swarm references | Records addressed by content hash; Reference format: 64 lowercase hex chars | [Public example](#-public-example-record): Reference `d2eb98083a7f9ce0f7e782727496e2ef3051c359643f587331abf1918ce3a6e4`<br>[FORMAT.md §6](shared/FORMAT.md): Defines Swarm reference representation |
| **Reader works without original Writer** | Reader functions without Writer code or state | Reader deployed independently; only requires Swarm gateway access | [Live Reader](https://road-to-devcon-v-birders-reader.vercel.app/): Works with production Swarm gateway<br>[Audit Check 4](scripts/audit-checks.mjs): Confirms no writer imports |
| **Reader works without export/import step** | Direct database-to-database transfer via Swarm | Writer → Swarm `/bytes` → Reader → Swarm `/bytes` (same API family) | [FORMAT.md §1](shared/FORMAT.md): "Records are stored as raw bytes on the Swarm network via the `/bytes` endpoint family"<br>[Writer upload-controller](writer/src/upload-controller.js): Uses `/bytes` endpoint<br>[Reader swarm helper](reader/src/swarm.js): Uses `/bytes` endpoint |
| **Reader works without Swarm ID account** | No authentication required for reading | Reader makes unauthenticated GET requests to Swarm gateway | [Live Reader](https://road-to-devcon-v-birders-reader.vercel.app/): Functions without wallet connection<br>[Reader swarm helper](reader/src/swarm.js): No auth parameters in download request |
| **Documented self-describing binary format** | DBIR format with magic bytes, version, length, JSON | Binary envelope: `DBIR` + uint16 version + uint32 length + JSON payload | [FORMAT.md](shared/FORMAT.md): Complete DBIR specification<br>[Shared sighting-format](shared/sighting-format.js): Encoder/decoder implementation<br>[Shared tests](shared/sighting-format.test.js): Validates envelope structure and parsing |

### Verification Methods

1. **Run the full test suite**: `npm test`
   - Validates encoding/decoding, error handling, and upload controller logic

2. **Run audit checks**: `npm run audit:checks`
   - Verifies architectural independence and security constraints

3. **Full verification**: `npm run check`
   - Runs both test suite and audit checks

4. **Live demonstration**:
   - Create a sighting at [Writer](https://road-to-devcon-v-birders-writer.vercel.app/)
   - Open the resulting reference directly in [Reader](https://road-to-devcon-v-birders-reader.vercel.app/)
   - Confirm no export/import steps were needed

### Notes on Independence
- The Reader application ([`reader/src/main.js`](reader/src/main.js)) imports ONLY:
  - `./swarm.js` (ethersphere/bee-js wrapper)
  - `./sighting-viewer.js` (which imports `@deccan/sighting-format`)
- Zero imports from the `/writer` package
- This satisfies the strict separation requirement in [CLAUDE.md](CLAUDE.md)

### Backward Compatibility
- All existing records on Swarm (e.g. `d2eb98083a7f9ce0f7e782727496e2ef3051c359643f587331abf1918ce3a6e4`) must still decode
- New fields must be optional and additive (per [CLAUDE.md](CLAUDE.md))
- Format version only changes for breaking changes (see [FORMAT.md §8](shared/FORMAT.md))