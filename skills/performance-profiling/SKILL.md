---
name: performance-profiling
description: Measurement-driven performance work for backends, frontends and build pipelines — setting budgets, profiling CPU and memory, analysing queries, and common fixes with their trade-offs. Use when something is slow or memory-hungry, when setting performance budgets, or before optimising.
---

# Performance profiling

Measure, find the bottleneck, fix it, measure again. Optimising without a profile is guessing.

## 1. Define the target

Pick a user-visible metric and a target: "p95 of `GET /search` under 300 ms at 50 req/s", "Largest Contentful Paint under 2.5 s on mid-range mobile", "CI build under 8 minutes". Record the baseline under reproducible conditions.

## 2. Profile

| Problem | Tools |
|---|---|
| CPU (Node) | `node --cpu-prof`, `clinic flame`, Chrome DevTools |
| CPU (Python) | `py-spy record`, `cProfile` + `snakeviz` |
| CPU (Go) | `pprof` (`go test -cpuprofile`, `net/http/pprof`) |
| CPU (Rust) | `cargo flamegraph`, `perf` |
| Memory | heap snapshots, `tracemalloc`, `pprof -alloc_space`, `heaptrack` |
| Database | `EXPLAIN (ANALYZE, BUFFERS)`, slow query log, `pg_stat_statements` |
| Frontend | Lighthouse, Performance panel, Web Vitals in the field, bundle analyser |
| Distributed | tracing (OpenTelemetry) to find which hop is slow |

Profile production-like data and load. A query that is fast on 100 rows can be slow on 10 million.

## 3. Common fixes

**Data access**
- N+1 queries → eager load or batch with `IN (...)`.
- Missing index → add one matching the filter and sort (check with `EXPLAIN`).
- Selecting everything → select needed columns; paginate.
- Chatty services → batch requests, cache stable responses.

**Computation**
- Repeated work in loops → hoist it out or memoise.
- Quadratic algorithms on growing inputs → use maps/sets, sort once, stream.
- Serial independent I/O → run concurrently with a bound.

**Memory**
- Unbounded caches or maps → size limits and eviction.
- Event listeners and timers never removed → clean up.
- Loading whole files → stream.

**Frontend**
- Large bundles → code-split by route, lazy-load heavy components, remove unused dependencies.
- Images → modern formats, correct sizes, lazy loading.
- Re-render storms → memoise expensive components and selectors; virtualise long lists.

## 4. Verify and protect

Re-measure with the same method; report before/after numbers. Add a benchmark, load test or budget check in CI so the improvement does not silently regress.

## Trade-offs to state

Caching trades freshness for speed; denormalisation trades write complexity for read speed; concurrency trades simplicity for throughput. Write down which one you chose and why.
