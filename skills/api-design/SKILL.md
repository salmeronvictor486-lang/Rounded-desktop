---
name: api-design
description: Conventions for designing HTTP/JSON APIs that are consistent, evolvable and hard to misuse — resources, status codes, errors, pagination, versioning, idempotency and documentation. Use when adding or changing endpoints, designing a public API, or reviewing API changes.
---

# API design

## Resources and methods

- Nouns for resources, plural: `/users`, `/users/{id}/orders`. Verbs only for genuine actions that are not CRUD: `POST /orders/{id}/cancel`.
- `GET` reads (safe, cacheable), `POST` creates or triggers actions, `PUT` replaces, `PATCH` partially updates, `DELETE` removes.
- Keep nesting shallow (one level). Use filters instead: `/orders?customer_id=42`.

## Status codes

| Code | When |
|---|---|
| 200 / 201 / 204 | success / created (with `Location`) / no body |
| 400 | malformed request, validation failed |
| 401 | not authenticated |
| 403 | authenticated but not allowed |
| 404 | not found (also for resources the caller may not know exist) |
| 409 | conflict with current state (duplicate, version mismatch) |
| 422 | well-formed but semantically invalid (if you distinguish it from 400) |
| 429 | rate limited (with `Retry-After`) |
| 5xx | server faults only — never for client mistakes |

## Errors

One consistent shape everywhere, for example RFC 9457 problem details:

```json
{
  "type": "https://example.com/errors/validation",
  "title": "Invalid request",
  "status": 400,
  "detail": "email must be a valid address",
  "errors": [{ "field": "email", "message": "must be a valid address" }],
  "request_id": "req_8f2c"
}
```

Machine-readable codes, human-readable messages, no stack traces or internal details.

## Pagination, filtering, sorting

- Cursor (keyset) pagination for large or changing collections: `?limit=50&cursor=...`, response includes `next_cursor`. Offset pagination only for small, stable sets.
- Enforce a maximum `limit`.
- Explicit, documented filter and sort parameters; reject unknown ones.

## Evolution

- Additive changes (new optional fields, new endpoints) are safe. Removing or renaming fields, changing types or meanings are breaking.
- Version when you must break: URL prefix (`/v2`) or header. Support the old version for a published deprecation period, announced with `Deprecation`/`Sunset` headers.
- Clients must ignore unknown fields; servers must not require new fields from old clients.

## Safety

- Idempotency keys (`Idempotency-Key` header) for `POST` operations that create or charge.
- Optimistic concurrency with `ETag`/`If-Match` or a version field to prevent lost updates.
- Timeouts and rate limits documented.
- Validate request bodies against a schema; reject unknown fields on write endpoints to catch client bugs.

## Data formats

- `camelCase` or `snake_case` — pick one for the whole API.
- Timestamps in ISO 8601 UTC (`2026-01-31T12:00:00Z`); money as integer minor units plus currency code, or decimal strings.
- IDs as opaque strings.

## Documentation

Maintain an OpenAPI (or equivalent) description generated from or validated against the code, with an example for every endpoint and error.
