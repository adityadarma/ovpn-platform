FROM node:24-alpine AS base
RUN npm install -g pnpm && apk add --no-cache python3 make g++ curl

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY apps/api ./apps/api
COPY apps/api/start.sh ./start.sh
COPY apps/api/tsup.config.ts ./apps/api/tsup.config.ts

# Build the bundled Javascript code via tsup
RUN pnpm --filter @ovpn/api build

# Isolate app with only its required production dependencies
RUN pnpm deploy --filter @ovpn/api --prod /prod/api

# Copy tsup bundle into the deployed payload
RUN cp -r /app/apps/api/dist /prod/api/dist
# Copy start.sh into the deployed payload
RUN cp /app/start.sh /prod/api/start.sh

# Production runner
FROM node:24-alpine AS runner
# Install curl for docker-compose healthcheck
RUN apk add --no-cache curl

WORKDIR /app
COPY --from=builder /prod/api /app
# tsx is only needed for migrations at boot (Knex dynamic TS loading)
RUN npm install -g tsx
ENV NODE_ENV=production
RUN mkdir -p /data && chown -R nobody:nogroup /data
RUN chmod +x /app/start.sh
USER nobody
EXPOSE 3001
CMD ["/app/start.sh"]
