# ============================================================
# Combined Web + API Dockerfile (CSR static + Fastify)
# ============================================================
# Next.js is built as static files (CSR, output: 'export').
# Fastify serves both the API and the static web files.
# Single process, single port (3001).
# ============================================================

FROM node:24-alpine AS base
RUN npm install -g pnpm && apk add --no-cache python3 make g++ curl wget

# ============================================================
# Builder Stage
# ============================================================
FROM base AS builder
WORKDIR /app

# Copy dependency files for better caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/
COPY packages/db/package.json ./packages/db/
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/

# Install all dependencies
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/ui ./packages/ui
COPY packages/db ./packages/db
COPY apps/web ./apps/web
COPY apps/api ./apps/api

# Build web (Vite static export -> /app/apps/web/dist)
RUN pnpm --filter @vpn/web build

# Build api (Fastify with tsup)
RUN pnpm --filter @vpn/api build

# Deploy production dependencies for API
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  pnpm deploy --filter @vpn/api --prod /prod/api

# Copy built API bundle
RUN cp -r /app/apps/api/dist /prod/api/dist
RUN cp /app/apps/api/start.sh /prod/api/start.sh

# Copy packages/db (workspace local package, not included by pnpm deploy --prod)
RUN mkdir -p /prod/api/node_modules/@vpn/db
RUN cp -r /app/packages/db/src /prod/api/node_modules/@vpn/db/src
RUN cp -r /app/packages/db/node_modules /prod/api/node_modules/@vpn/db/node_modules 2>/dev/null || true

# Copy Vite static output -> will be served by Fastify
RUN cp -r /app/apps/web/dist /prod/web

# ============================================================
# Runner Stage
# ============================================================
FROM node:24-alpine AS runner
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache curl wget bash
RUN npm install -g tsx

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S apiuser -u 1001

# Copy API files
COPY --from=builder --chown=apiuser:nodejs /prod/api /app/api
RUN chmod +x /app/api/start.sh

# Copy Next.js static build (served by Fastify via @fastify/static)
COPY --from=builder --chown=apiuser:nodejs /prod/web /app/web

# Create data directory for SQLite
RUN mkdir -p /data && chown -R apiuser:nodejs /data

USER apiuser

ENV NODE_ENV=production
# Tell Fastify's static plugin where to find the web files
ENV WEB_STATIC_PATH=/app/web

# Expose single port — Fastify serves both API and web
EXPOSE 3001

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/v1/health || exit 1

# Single entrypoint — the start.sh runs migrations then starts Fastify
CMD ["/app/api/start.sh"]
