---
name: logging-and-observability
description: How to make software observable with structured logs, metrics and traces — what to log at which level, correlation IDs, golden-signal metrics, alerting and keeping personal data out of telemetry. Use when adding logging, instrumenting a service, setting up alerts, or investigating production behaviour.
---

# Logging and observability

You cannot fix what you cannot see. Instrument code so that an on-call engineer can answer "what is broken, for whom, since when, and why" without deploying new code.

## Structured logs

- Log JSON (or key–value) events, not prose: `{"level":"info","msg":"order placed","order_id":"o_123","amount_cents":4200,"request_id":"r_9"}`.
- Use stable message strings and put variable data in fields, so logs can be grouped and searched.
- Attach a request or correlation ID to every log line in a request, and propagate it across services (`traceparent` header).

## Levels

| Level | Meaning |
|---|---|
| error | something failed and needs attention (a request failed, data could not be saved) |
| warn | unexpected but handled (retry succeeded, fallback used, deprecated input) |
| info | significant business or lifecycle events (started, order placed, job finished) |
| debug | detail for diagnosing; off in production by default |

Log an error once, where it is handled, with context and the cause.

## Never log

Passwords, tokens, API keys, session cookies, full card numbers, secrets in URLs, or personal data beyond what is necessary. Mask or hash identifiers where possible. Treat logs as data that can leak.

## Metrics

For every service, the golden signals:
- **Latency** (histograms, p50/p95/p99, split success/failure)
- **Traffic** (requests per second by route)
- **Errors** (rate and ratio by type)
- **Saturation** (CPU, memory, queue depth, connection pool usage)

Plus business metrics that show whether the product works (sign-ups, orders, failed payments). Keep label cardinality low: never use user IDs or raw URLs as metric labels.

## Traces

Use OpenTelemetry to trace requests across services, databases and queues. Add spans around expensive or remote operations, with attributes that help diagnosis (route, status, row counts).

## Alerts

- Alert on symptoms users feel (error rate, latency, SLO burn rate), not on every cause (CPU at 80%).
- Every alert is actionable and links to a runbook.
- If an alert fires and nobody needs to act, fix or delete the alert.

## Health checks

Separate liveness (process is running) from readiness (can serve traffic: dependencies reachable). Keep them cheap.
