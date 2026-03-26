# ============================================================
# Combined Web + API Dockerfile
# ============================================================
# This Dockerfile builds both the Next.js web app and Fastify API
# into a single container image. The API runs on port 3001 and
# the web app runs on port 3000.
#
# Benefits:
# - Single image to build and deploy
# - Reduced image size (shared base layers)
# - Simpler deployment (one container instead of two)
# - Shared node_modules between web and api
#
# Drawbacks:
# - Cannot scale web and api independently
# - If one crashes, both go down
# - Harder to debug (two processes in one container)
#
# Usage:
#   docker build -f Dockerfile.combined -t vpn-manager:combined .
#   docker run -p 3000:3000 -p 3001:3001 vpn-manager:combined
# ============================================================

FROM node:24-alpine AS base
RUN npm install -g pnpm && apk add --no-cache python3 make g++ curl wget

# ============================================================
# Builder Stage - Build both web and api
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

# Build web (Next.js)
ENV NEXT_TELEMETRY_DISABLED=1
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

# ============================================================
# Runner Stage - Run both web and api
# ============================================================
FROM node:24-alpine AS runner
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache curl wget bash supervisor
RUN npm install -g tsx

# Create users
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Copy API files
COPY --from=builder /prod/api /app/api
RUN chmod +x /app/api/start.sh

# Copy Web files
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./web
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./web/apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./web/apps/web/public

# Create data directory for SQLite
RUN mkdir -p /data && chown -R nobody:nogroup /data

# Create supervisor config
RUN mkdir -p /etc/supervisor/conf.d
COPY <<'EOF' /etc/supervisor/conf.d/supervisord.conf
[supervisord]
nodaemon=true
user=root
logfile=/dev/stdout
logfile_maxbytes=0
loglevel=info

[program:api]
command=/app/api/start.sh
directory=/app/api
user=nobody
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
environment=NODE_ENV="production",PORT="3001"

[program:web]
command=node apps/web/server.js
directory=/app/web
user=nextjs
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
environment=NODE_ENV="production",PORT="3000",NEXT_TELEMETRY_DISABLED="1"
EOF

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Expose both ports
EXPOSE 3000 3001

# Health check for both services
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000 && \
      curl -f http://localhost:3001/api/v1/health || exit 1

# Start supervisor to manage both processes
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
