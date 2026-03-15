FROM node:24-alpine AS base
RUN npm install -g pnpm

# Builder stage
FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json turbo.json* ./
COPY apps/agent/package.json ./apps/agent/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

COPY apps/agent ./apps/agent
COPY packages/shared ./packages/shared

# Run production pruning
RUN pnpm install --prod --frozen-lockfile

# Final minimal runner stage
FROM node:24-alpine AS runner
WORKDIR /app
COPY --from=builder /app /app
RUN npm install -g tsx
ENV NODE_ENV=production
CMD ["tsx", "apps/agent/src/index.ts"]
