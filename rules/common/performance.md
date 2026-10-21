---
description: Performance rules — measure before optimising, avoid N+1 queries and unbounded work
---

# Performance

- Measure before optimising; report numbers before and after.
- Avoid N+1 queries: batch or join instead of querying inside loops.
- Paginate and bound everything that grows: queries, lists, caches, queues, retries.
- Put timeouts on every network call.
- Do not do expensive work on hot paths that could be done once, cached or moved off the request path.
- Choose the simple fix (an index, a batch, a cache with a clear invalidation rule) over clever code.
