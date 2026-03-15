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

# Strip dev deps (prod only)
RUN pnpm install --prod --frozen-lockfile

# Production runner
FROM node:24-alpine AS runner
# Install curl for docker-compose healthcheck
RUN apk add --no-cache curl

WORKDIR /app
COPY --from=builder /app /app

RUN npm install -g tsx
ENV NODE_ENV=production
RUN mkdir -p /data && chown -R nobody:nobody /data
USER nobody
EXPOSE 3001
CMD ["./start.sh"]
