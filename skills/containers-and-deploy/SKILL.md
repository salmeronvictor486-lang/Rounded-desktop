---
name: containers-and-deploy
description: Building small, secure container images and deploying them safely — multi-stage Dockerfiles, non-root users, configuration through the environment, health checks, rollouts and rollbacks. Use when writing Dockerfiles or compose files, preparing a service for production, or planning a deployment.
---

# Containers and deployment

## Dockerfile

```dockerfile
# Build stage
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# Runtime stage
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK CMD node dist/healthcheck.js || exit 1
CMD ["node", "dist/server.js"]
```

Principles:
- **Multi-stage builds:** compilers and dev dependencies stay out of the final image.
- **Small, pinned base images** (slim or distroless), updated regularly; pin by digest for reproducibility.
- **Order layers for caching:** dependency manifests before source code.
- **Non-root user**, read-only file system where possible, no secrets in layers or build args.
- **`.dockerignore`** for `.git`, `node_modules`, local env files and build outputs.
- **Exec-form `CMD`** so the process receives signals; handle `SIGTERM` for graceful shutdown.

## Configuration

Twelve-factor style: configuration from environment variables, validated at startup (fail fast on missing or invalid values). Secrets come from the platform's secret store, never baked into images.

## Health and lifecycle

- Liveness: process alive. Readiness: ready for traffic (dependencies reachable, migrations done).
- Graceful shutdown: stop accepting new requests, finish in-flight ones within a timeout, close connections.
- Resource requests and limits set from measurements.

## Deploying

- Immutable artefacts: build once, promote the same image through environments.
- Rolling or blue-green deploys with automatic rollback on failing health checks or error-rate alerts; canary for risky changes.
- Database migrations run as a separate, backwards-compatible step (see `database-migrations`).
- Feature flags decouple deploy from release.
- Know your rollback command before you deploy.

## Image security

Scan images (Trivy, Grype) in CI; fail on critical vulnerabilities with available fixes; generate an SBOM for releases.
