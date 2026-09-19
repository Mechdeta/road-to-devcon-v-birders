# Deccan Birders — "Take your records with you"

> Meera files a sighting in one app and opens it in a completely different one,
> and nobody had to export anything.

## Architecture

Two genuinely separate applications sharing a documented, versioned binary
record format (DBIR) stored on the Swarm network.

```
shared/   → @deccan/sighting-format   (standalone format codec + FORMAT.md spec)
writer/   → @deccan/writer            (Swarm ID auth → form → encode → upload)
reader/   → @deccan/reader            (reference input → download → decode → display)
```

The **reader has zero imports from the writer**. Both applications use the
shared format package for encode/decode only.

## Record Discovery

Records are identified by their **Swarm content address** — a 64-character
hex string returned after upload. This is a standard Swarm reference, not an
application-specific URL.

Sharing methods:
- Copy the hex reference
- Share a deep-link URL: `<reader-origin>/?ref=<hex-reference>`

The reader downloads from `GET /bytes/<ref>` on the same gateway.

## Quick Start

```bash
npm install
npm run dev:writer   # http://localhost:5173
npm run dev:reader   # http://localhost:5174
```

## Testing

```bash
npm test             # runs shared + writer tests
```

## Record Format

See [shared/FORMAT.md](shared/FORMAT.md) for the complete DBIR specification.

## Technical Details

- **Swarm gateway**: `https://api.gateway.ethswarm.org/` (subsidised)
- **Swarm ID**: `https://swarm-id.snaha.net` (browser auth via iframe)
- **bee-js**: v13.1.0 (namespace APIs: `bee.data.upload`, `bee.data.download`)
- **Upload**: `POST /bytes` via `bee.data.upload(NULL_STAMP, data)` — no pin, no tag, no ACT
- **Download**: `GET /bytes/:ref` via `bee.data.download(ref)`
- **No Bee node required**
- **No credentials in source code**
