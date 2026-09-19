# DBIR — Deccan Birders Interchange Record Format

**Version**: 1  
**Status**: Stable  
**Magic**: `0x44 0x42 0x49 0x52` (ASCII "DBIR")

---

## 1. Purpose

DBIR is a self-describing binary envelope for bird sighting records. Every
stored record carries its own format identifier and version so that **any
reader** — regardless of programming language or framework — can validate,
parse, and render sighting data without access to the writing application's
source code.

Records are stored as raw bytes on the Swarm network via the `/bytes` endpoint
family. The Swarm content-address (a 64-character hex reference) is the only
information needed to retrieve a record. There is no application-specific URL
scheme; any reader that can access `GET /bytes/<reference>` on a Swarm gateway
can download and decode the record.

---

## 2. Binary Envelope

All multi-byte integers are encoded in **big-endian** (network byte order).

| Offset | Length | Type         | Field               | Description                           |
|--------|--------|--------------|---------------------|---------------------------------------|
| 0      | 4      | `uint8[4]`   | Magic bytes         | Always `0x44 0x42 0x49 0x52` ("DBIR") |
| 4      | 2      | `uint16 BE`  | Format version      | Currently `0x0001`                    |
| 6      | 4      | `uint32 BE`  | JSON payload length | Byte length of the UTF-8 JSON payload |
| 10     | N      | `uint8[N]`   | JSON payload        | UTF-8 encoded JSON (see §3)           |

**Total record size** = 10 + N bytes.

No trailing data is expected. A conforming reader MUST ignore any bytes after
offset 10 + N (reserved for future extension).

---

## 3. JSON Payload (Version 1)

The payload is a single UTF-8–encoded JSON object. The JSON text MUST be valid
per [RFC 8259](https://datatracker.ietf.org/doc/html/rfc8259). It MUST NOT
contain a leading BOM.

### 3.1 Field Definitions

| Field          | Type     | Required | Description                                           |
|----------------|----------|----------|-------------------------------------------------------|
| `species`      | string   | **yes**  | Common or scientific name of the observed species      |
| `location`     | object   | **yes**  | Geographic location of the observation                 |
| `location.lat` | number   | **yes**  | Decimal latitude (WGS 84, −90 to +90)                 |
| `location.lng` | number   | **yes**  | Decimal longitude (WGS 84, −180 to +180)              |
| `location.name`| string   | no       | Human-readable place name                              |
| `observedAt`   | string   | **yes**  | ISO 8601 date-time with timezone (e.g. `2025-06-15T07:30:00+05:30`) |
| `count`        | integer  | no       | Number of individuals observed (defaults to 1)         |
| `notes`        | string   | no       | Free-text observation notes                            |
| `observer`     | string   | no       | Name or identifier of the observer                     |

### 3.2 String Encoding

All string values MUST be valid UTF-8. JSON string escaping rules from
RFC 8259 §7 apply.

### 3.3 Number Encoding

`lat` and `lng` are JSON numbers (IEEE 754 double). Precision beyond 6 decimal
places is not guaranteed to be meaningful for geographic coordinates.

`count`, if present, MUST be a non-negative integer.

---

## 4. Validation Rules

A conforming reader MUST perform these checks, in order:

1. **Length check**: The record must be at least 10 bytes.
2. **Magic check**: Bytes 0–3 must be `0x44 0x42 0x49 0x52`.
   - If not: reject with "Not a DBIR record".
3. **Version check**: Read uint16 BE at bytes 4–5.
   - If the version is `0`: reject with "Invalid version".
   - If the version is greater than the reader's maximum supported version:
     reject with "Unsupported DBIR version: <N>".
   - For version `1`: proceed to step 4.
4. **Payload length check**: Read uint32 BE at bytes 6–9. The value N must
   satisfy `10 + N <= total record length`.
   - If not: reject with "Payload length exceeds record size".
5. **JSON parse**: Decode bytes 10 through 10+N−1 as UTF-8, then parse as JSON.
   - If parsing fails: reject with "Invalid JSON payload".
6. **Required fields**: The parsed object must contain `species` (string),
   `location` (object with `lat` number and `lng` number), and `observedAt`
   (string).
   - If any required field is missing or has the wrong type: reject with
     "Missing or invalid required field: <name>".

---

## 5. Handling Unsupported Versions

When a reader encounters a version higher than it supports:

- It MUST NOT attempt to parse the payload.
- It MUST report the unsupported version number to the user.
- It SHOULD suggest updating the reader software.

This allows the format to evolve while maintaining backward-incompatible safety.

---

## 6. Reference Representation

After a record is uploaded to Swarm via `POST /bytes`, the gateway returns a
**Swarm reference** — a 64-character lowercase hexadecimal string representing
the content hash.

### 6.1 Sharing a Reference

To share a record, publish the reference as:
- A plain 64-character hex string: `a1b2c3d4...` (64 chars)
- A deep-link URL: `<reader-origin>/?ref=<hex-reference>`

### 6.2 Retrieving a Record

Any application can retrieve the record by issuing:

```
GET https://<swarm-gateway>/bytes/<hex-reference>
```

The response body is the raw DBIR binary record.

### 6.3 No Application-Specific URLs

The reference is a **standard Swarm content address**. It is not an
application-specific internal URL. Any Swarm client or HTTP client can retrieve
the record using any Swarm gateway.

---

## 7. Example

### 7.1 JSON Payload

```json
{
  "species": "Indian Peafowl",
  "location": {
    "lat": 18.5204,
    "lng": 73.8567,
    "name": "Pashan Lake, Pune"
  },
  "observedAt": "2025-06-15T07:30:00+05:30",
  "count": 3,
  "notes": "Male displaying plumage near the eastern shore",
  "observer": "Meera"
}
```

### 7.2 Binary Representation (hex dump)

```
44 42 49 52          — Magic ("DBIR")
00 01                — Version 1
00 00 00 C6          — Payload length: 198 bytes
7B 22 73 70 ...      — UTF-8 JSON payload
```

---

## 8. Versioning Policy

- The magic bytes `DBIR` will never change.
- The version number is incremented for breaking changes to the payload schema.
- Additive (non-breaking) changes (new optional fields) do not require a
  version bump — readers MUST ignore unknown fields.
- A version bump is required if: a required field is added, a field type
  changes, the binary envelope structure changes, or the payload encoding
  changes from JSON.
